import os from 'node:os';
import { JOB_NAME_PATTERN, JOB_STATUS } from '../constants/jobs.js';
import { randomCode } from '../utils/ids.js';
import { describeSchedule, latestSlot, nextSlot, parseSchedule } from './schedule.js';

const GRACE_MS = 30_000; // extra time a claim lasts beyond the job's own timeout
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;

const truncate = (message = '') => String(message).slice(0, 300);

class JobTimeout extends Error {}

/** Check a list of job definitions. Throws RangeError on the first mistake. */
export function validateJobs(jobs) {
  const names = new Set();
  for (const job of jobs) {
    if (!JOB_NAME_PATTERN.test(job?.name ?? ''))
      throw new RangeError(`invalid job name "${job?.name}"`);
    if (names.has(job.name)) throw new RangeError(`duplicate job "${job.name}"`);
    names.add(job.name);
    parseSchedule(job.schedule);
    if (
      !Number.isInteger(job.timeoutMs) ||
      job.timeoutMs < MIN_TIMEOUT_MS ||
      job.timeoutMs > MAX_TIMEOUT_MS
    ) {
      throw new RangeError(`job "${job.name}": timeoutMs must be between 1 second and 30 minutes`);
    }
    if (typeof job.run !== 'function')
      throw new RangeError(`job "${job.name}": run must be a function`);
  }
}

const defaultInstanceId = () => `${os.hostname()}-${process.pid}-${randomCode('I', 6)}`;

/**
 * Runs scheduled jobs. Each job is { name, schedule, timeoutMs, run({ now, logger, signal }) }
 * where run returns an optional summary object. Whatever a job or the database does, the
 * scheduler itself never throws: problems are logged and the next job still runs.
 */
export function createScheduler({
  jobs,
  store,
  logger,
  instanceId = defaultInstanceId(),
  now = () => new Date(),
  tickMs = 15_000,
}) {
  validateJobs(jobs);

  let timer = null;
  let inFlight = null;

  async function runJob(job) {
    const slot = latestSlot(job.schedule, now());
    const startedAt = now();
    const claimed = await store.claim({
      name: job.name,
      slot,
      now: startedAt,
      instanceId,
      lockMs: job.timeoutMs + GRACE_MS,
    });
    if (!claimed) return { name: job.name, outcome: 'skipped' };

    const controller = new AbortController();
    let timeoutTimer;
    const timeout = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => reject(new JobTimeout()), job.timeoutMs);
    });

    let status = JOB_STATUS.SUCCEEDED;
    let error;
    let summary;
    try {
      const result = await Promise.race([
        Promise.resolve().then(() =>
          job.run({ now: startedAt, logger, signal: controller.signal }),
        ),
        timeout,
      ]);
      if (result && typeof result === 'object') summary = result;
    } catch (err) {
      if (err instanceof JobTimeout) {
        status = JOB_STATUS.TIMED_OUT;
        error = `timed out after ${job.timeoutMs} ms`;
        controller.abort();
      } else {
        status = JOB_STATUS.FAILED;
        error = truncate(err?.message);
      }
      logger.error({ err, job: job.name }, `job ${status}`);
    } finally {
      clearTimeout(timeoutTimer);
    }

    const finishedAt = now();
    try {
      await store.finish({
        name: job.name,
        instanceId,
        startedAt,
        finishedAt,
        status,
        error,
        summary,
      });
    } catch (err) {
      logger.error({ err, job: job.name }, 'could not record the job result');
    }
    if (status === JOB_STATUS.SUCCEEDED) {
      logger.info({ job: job.name, summary }, 'job finished');
    }
    return {
      name: job.name,
      outcome: status,
      ...(summary && { summary }),
      ...(error && { error }),
    };
  }

  /**
   * Run every job that is due, one after another. If a previous call is still running in
   * this process it returns [] straight away, so passes never overlap. Never throws.
   */
  async function runDue() {
    if (inFlight) return [];
    inFlight = (async () => {
      const results = [];
      for (const job of jobs) {
        try {
          results.push(await runJob(job));
        } catch (err) {
          logger.error({ err, job: job.name }, 'scheduler could not run the job');
          results.push({ name: job.name, outcome: 'error' });
        }
      }
      return results;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  return {
    instanceId,
    runDue,

    /** Check for due jobs every `tickMs`, and once straight away unless told not to. */
    start({ immediate = true } = {}) {
      if (timer) return;
      timer = setInterval(() => runDue(), tickMs);
      timer.unref?.();
      if (immediate) runDue();
    },

    /** Stop checking, and wait for a job that is running right now to finish. */
    async stop() {
      clearInterval(timer);
      timer = null;
      if (inFlight) await inFlight.catch(() => {});
    },

    /** The jobs, in words, with when each runs next. */
    describe() {
      const at = now();
      return jobs.map((job) => ({
        name: job.name,
        schedule: describeSchedule(job.schedule),
        nextRunAt: nextSlot(job.schedule, at).toISOString(),
        timeoutMs: job.timeoutMs,
      }));
    },
  };
}
