import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { JobRun } from '../models/JobRun.js';
import { jobRunsQuery } from '../schemas/jobs.js';

/**
 * Mounted under /api/admin/jobs, after the admin-only guard.
 *   GET /       every job: its timetable, when it runs next, and how it last went
 *   GET /runs   recent run history, newest first
 * `scheduler` is the app scheduler, or null when this server does not run jobs.
 */
export function createAdminJobsRouter({ scheduler = null, store }) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const states = new Map((await store.list()).map((state) => [state.name, state]));
    const planned = scheduler?.describe() ?? [];

    const jobs = planned.map((job) => {
      const state = states.get(job.name);
      return {
        name: job.name,
        schedule: job.schedule,
        nextRunAt: job.nextRunAt,
        timeoutMs: job.timeoutMs,
        running: Boolean(state?.lockedUntil && state.lockedUntil > new Date()),
        lastStartedAt: state?.lastStartedAt ?? null,
        lastFinishedAt: state?.lastFinishedAt ?? null,
        lastStatus: state?.lastStatus ?? null,
        lastDurationMs: state?.lastDurationMs ?? null,
        lastError: state?.lastError ?? null,
      };
    });
    res.json({ schedulerRunsHere: scheduler !== null, jobs });
  });

  router.get('/runs', validate(jobRunsQuery, 'query'), async (req, res) => {
    const { name, status, limit } = req.valid.query;
    const filter = { ...(name && { name }), ...(status && { status }) };
    const runs = await JobRun.find(filter).sort({ startedAt: -1 }).limit(limit);
    res.json({ runs });
  });

  return router;
}
