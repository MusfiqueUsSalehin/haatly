import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler } from '../../src/jobs/scheduler.js';
import { createMemoryJobStore } from '../helpers/memoryJobStore.js';

const T0 = new Date('2026-10-20T06:00:00Z'); // 12:00 in Bangladesh
const MIN = 60_000;
let clock;
const now = () => clock;

const makeLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const job = (name, run, overrides = {}) => ({
  name,
  schedule: { everyMinutes: 5 },
  timeoutMs: 1000,
  run,
  ...overrides,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const build = (jobs, { store = createMemoryJobStore(), logger = makeLogger(), ...rest } = {}) => ({
  store,
  logger,
  scheduler: createScheduler({ jobs, store, logger, now, instanceId: 'A', ...rest }),
});

beforeEach(() => {
  clock = new Date(T0);
});
afterEach(() => vi.useRealTimers());

describe('running due jobs', () => {
  it('runs a due job once per slot, and again in the next slot', async () => {
    const run = vi.fn().mockResolvedValue({ done: 1 });
    const { scheduler } = build([job('alpha', run)]);

    expect(await scheduler.runDue()).toEqual([
      { name: 'alpha', outcome: 'succeeded', summary: { done: 1 } },
    ]);
    expect(await scheduler.runDue()).toEqual([{ name: 'alpha', outcome: 'skipped' }]);
    clock = new Date(T0.getTime() + 4 * MIN + 59_000);
    expect(await scheduler.runDue()).toEqual([{ name: 'alpha', outcome: 'skipped' }]);
    expect(run).toHaveBeenCalledTimes(1);

    clock = new Date(T0.getTime() + 5 * MIN);
    expect((await scheduler.runDue())[0].outcome).toBe('succeeded');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('catches up once after downtime, not once per missed slot', async () => {
    const run = vi.fn().mockResolvedValue({});
    const { scheduler } = build([job('alpha', run)]);
    await scheduler.runDue();

    clock = new Date(T0.getTime() + 65 * MIN); // an hour of missed slots
    await scheduler.runDue();
    await scheduler.runDue();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('runs a daily job once a day, at its time', async () => {
    const run = vi.fn().mockResolvedValue({});
    const { scheduler } = build([job('daily', run, { schedule: { dailyAt: '05:30' } })]);

    await scheduler.runDue(); // 12:00: today's 05:30 slot has passed
    clock = new Date('2026-10-20T23:29:59Z'); // 05:29:59 the next morning
    await scheduler.runDue();
    expect(run).toHaveBeenCalledTimes(1);

    clock = new Date('2026-10-20T23:30:00Z'); // 05:30:00
    await scheduler.runDue();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('gives each job the time, the logger and a signal, and records the run', async () => {
    const run = vi.fn().mockResolvedValue({ n: 1 });
    const { scheduler, store, logger } = build([job('alpha', run)]);
    await scheduler.runDue();

    const arg = run.mock.calls[0][0];
    expect(arg.now).toEqual(T0);
    expect(arg.logger).toBe(logger);
    expect(arg.signal.aborted).toBe(false);

    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({
      name: 'alpha',
      instance: 'A',
      status: 'succeeded',
      summary: { n: 1 },
    });
    expect(store.states.get('alpha')).toMatchObject({
      lockedBy: null,
      lockedUntil: null,
      lastStatus: 'succeeded',
    });
  });

  it('holds the claim for the job timeout plus a grace period', async () => {
    const { scheduler, store } = build([job('alpha', vi.fn().mockResolvedValue({}))]);
    store.claim = vi.fn(store.claim);
    await scheduler.runDue();
    expect(store.claim).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'alpha', slot: T0, instanceId: 'A', lockMs: 31_000 }),
    );
  });

  it('runs the jobs in the order given', async () => {
    const order = [];
    const { scheduler } = build([
      job('first', async () => order.push('first')),
      job('second', async () => order.push('second')),
    ]);
    await scheduler.runDue();
    expect(order).toEqual(['first', 'second']);
  });
});

describe('when things go wrong', () => {
  it('records a failure and carries on with the next job', async () => {
    const { scheduler, store, logger } = build([
      job('broken', async () => {
        throw new Error('boom');
      }),
      job('fine', async () => ({ ok: true })),
    ]);
    const results = await scheduler.runDue();

    expect(results).toMatchObject([
      { name: 'broken', outcome: 'failed', error: 'boom' },
      { name: 'fine', outcome: 'succeeded' },
    ]);
    expect(store.states.get('broken')).toMatchObject({
      lastStatus: 'failed',
      lastError: 'boom',
      lockedBy: null,
    });
    expect(logger.error).toHaveBeenCalled();
  });

  it('copes with a job that is not even an async function', async () => {
    const { scheduler } = build([
      job('sync', () => {
        throw new Error('sync boom');
      }),
    ]);
    expect((await scheduler.runDue())[0]).toMatchObject({ outcome: 'failed', error: 'sync boom' });
  });

  it('times out a job that never finishes, tells it to stop, and carries on', async () => {
    vi.useFakeTimers();
    let seen;
    const { scheduler, store } = build([
      job('slow', ({ signal }) => {
        seen = signal;
        return new Promise(() => {});
      }),
      job('fast', async () => ({ ok: true })),
    ]);

    const pending = scheduler.runDue();
    await vi.advanceTimersByTimeAsync(1000);
    const results = await pending;

    expect(results).toMatchObject([
      { name: 'slow', outcome: 'timed_out', error: 'timed out after 1000 ms' },
      { name: 'fast', outcome: 'succeeded' },
    ]);
    expect(seen.aborted).toBe(true);
    expect(store.states.get('slow')).toMatchObject({ lastStatus: 'timed_out', lockedBy: null });
  });

  it('skips a job another server is running, until its claim expires', async () => {
    const run = vi.fn().mockResolvedValue({});
    const store = createMemoryJobStore();
    store.states.set('alpha', {
      name: 'alpha',
      lockedBy: 'OTHER',
      lockedUntil: new Date(T0.getTime() + 10 * MIN),
      lastStartedAt: new Date(T0.getTime() - 20 * MIN),
    });
    const { scheduler } = build([job('alpha', run)], { store });

    expect(await scheduler.runDue()).toEqual([{ name: 'alpha', outcome: 'skipped' }]);
    expect(run).not.toHaveBeenCalled();

    clock = new Date(T0.getTime() + 11 * MIN); // the other server must have died
    expect((await scheduler.runDue())[0].outcome).toBe('succeeded');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('survives the database failing, and still runs the other jobs', async () => {
    const store = createMemoryJobStore();
    const claim = store.claim;
    store.claim = vi.fn(claim).mockRejectedValueOnce(new Error('db down'));
    const run = vi.fn().mockResolvedValue({});
    const { scheduler, logger } = build([job('one', run), job('two', run)], { store });

    const results = await scheduler.runDue();
    expect(results.map((r) => r.outcome)).toEqual(['error', 'succeeded']);
    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('still reports success when the result cannot be recorded', async () => {
    const store = createMemoryJobStore();
    store.finish = vi.fn().mockRejectedValue(new Error('db down'));
    const { scheduler, logger } = build([job('alpha', vi.fn().mockResolvedValue({}))], { store });

    expect((await scheduler.runDue())[0].outcome).toBe('succeeded');
    expect(logger.error).toHaveBeenCalledWith(expect.anything(), 'could not record the job result');
  });

  it('truncates long error messages', async () => {
    const { scheduler } = build([
      job('alpha', async () => {
        throw new Error('x'.repeat(1000));
      }),
    ]);
    expect((await scheduler.runDue())[0].error).toHaveLength(300);
  });
});

describe('overlap and lifecycle', () => {
  it('does not start a second pass while one is still running', async () => {
    const gate = deferred();
    const run = vi.fn(() => gate.promise);
    const { scheduler } = build([job('alpha', run)]);

    const first = scheduler.runDue();
    expect(await scheduler.runDue()).toEqual([]);
    gate.resolve({});
    expect((await first)[0].outcome).toBe('succeeded');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('checks for due jobs on a timer, and stops when told to', async () => {
    vi.useFakeTimers();
    const { scheduler, store } = build([job('alpha', vi.fn().mockResolvedValue({}))], {
      tickMs: 1000,
    });
    store.claim = vi.fn(store.claim);

    scheduler.start({ immediate: false });
    expect(store.claim).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(store.claim).toHaveBeenCalledTimes(3);

    await scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.claim).toHaveBeenCalledTimes(3);
  });

  it('runs straight away on start, and only starts one timer', async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockResolvedValue({});
    const { scheduler } = build([job('alpha', run)], { tickMs: 1000 });

    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await scheduler.stop();
  });

  it('waits for a running job to finish when stopping', async () => {
    const gate = deferred();
    const { scheduler, store } = build([job('alpha', () => gate.promise)]);
    const pass = scheduler.runDue();

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    gate.resolve({});
    await stopping;
    await pass;
    expect(stopped).toBe(true);
    expect(store.runs).toHaveLength(1);
  });

  it('describes its jobs and when they run next', () => {
    const { scheduler } = build([
      job('alpha', async () => {}),
      job('daily', async () => {}, { schedule: { dailyAt: '05:30' } }),
    ]);
    expect(scheduler.describe()).toEqual([
      {
        name: 'alpha',
        schedule: 'every 5 minutes',
        nextRunAt: '2026-10-20T06:05:00.000Z',
        timeoutMs: 1000,
      },
      {
        name: 'daily',
        schedule: 'every day at 05:30 (Bangladesh time)',
        nextRunAt: '2026-10-20T23:30:00.000Z',
        timeoutMs: 1000,
      },
    ]);
  });
});

describe('job definitions', () => {
  const fine = () => job('alpha', async () => {});
  const make = (jobs) => () =>
    createScheduler({ jobs, store: createMemoryJobStore(), logger: makeLogger() });

  it('accepts valid definitions', () => {
    expect(make([fine()])).not.toThrow();
  });

  it.each([
    ['a bad name', { name: 'Alpha Job' }],
    ['a missing name', { name: undefined }],
    ['a bad schedule', { schedule: { everyMinutes: 0 } }],
    ['a timeout under a second', { timeoutMs: 500 }],
    ['a timeout over thirty minutes', { timeoutMs: 31 * 60 * 1000 }],
    ['a timeout that is not a number', { timeoutMs: '1000' }],
    ['no run function', { run: undefined }],
  ])('rejects %s', (_label, change) => {
    expect(make([{ ...fine(), ...change }])).toThrow(RangeError);
  });

  it('rejects two jobs with the same name', () => {
    expect(make([fine(), fine()])).toThrow(/duplicate/);
  });
});
