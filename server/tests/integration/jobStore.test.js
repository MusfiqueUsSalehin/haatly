import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { createJobStore } from '../../src/jobs/jobStore.js';
import { JobRun } from '../../src/models/JobRun.js';
import { JobState } from '../../src/models/JobState.js';

const store = createJobStore();
const MIN = 60_000;
const T0 = new Date('2026-10-20T06:00:00Z');
const later = (minutes) => new Date(T0.getTime() + minutes * MIN);

const claim = (overrides = {}) =>
  store.claim({
    name: 'alpha',
    slot: T0,
    now: T0,
    instanceId: 'A',
    lockMs: 10 * MIN,
    ...overrides,
  });
const finish = (overrides = {}) =>
  store.finish({
    name: 'alpha',
    instanceId: 'A',
    startedAt: T0,
    finishedAt: later(0.025),
    status: 'succeeded',
    summary: { expired: 2 },
    ...overrides,
  });
const state = () => JobState.findOne({ name: 'alpha' }).lean();

beforeAll(async () => {
  await startTestDb();
  await Promise.all([JobState.init(), JobRun.init()]);
});
afterAll(stopTestDb);
beforeEach(async () => {
  await Promise.all([JobState.deleteMany({}), JobRun.deleteMany({})]);
});

describe('claim', () => {
  it('lets the first server claim a job, and records who holds it', async () => {
    expect(await claim()).toBe(true);
    expect(await state()).toMatchObject({
      name: 'alpha',
      lockedBy: 'A',
      lockedUntil: later(10),
      lastStartedAt: T0,
    });
  });

  it('refuses a second claim for the same slot, even after the first run finished', async () => {
    expect(await claim()).toBe(true);
    await finish();
    expect(await claim({ instanceId: 'B', now: later(1) })).toBe(false);
  });

  it('refuses a claim while another server holds an unexpired one', async () => {
    await claim();
    expect(await claim({ instanceId: 'B', slot: later(5), now: later(5) })).toBe(false);
    expect((await state()).lockedBy).toBe('A');
  });

  it('lets another server take over once the claim has expired (the first server died)', async () => {
    await claim();
    expect(await claim({ instanceId: 'B', slot: later(10), now: later(11) })).toBe(true);
    expect(await state()).toMatchObject({ lockedBy: 'B', lastStartedAt: later(11) });
  });

  it('lets the next slot be claimed once the previous run released its claim', async () => {
    await claim();
    await finish();
    expect(await claim({ instanceId: 'B', slot: later(5), now: later(5) })).toBe(true);
  });

  it('keeps different jobs independent', async () => {
    expect(await claim({ name: 'alpha' })).toBe(true);
    expect(await claim({ name: 'beta' })).toBe(true);
    expect(await JobState.countDocuments()).toBe(2);
  });

  it('lets exactly one of many servers win a simultaneous first claim', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => claim({ instanceId: `S${i}` })),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await JobState.countDocuments()).toBe(1);
  });

  it('lets exactly one of many servers win a simultaneous claim of a later slot', async () => {
    await claim();
    await finish();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        claim({ instanceId: `S${i}`, slot: later(5), now: later(5) }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('finish', () => {
  it('releases the claim, records the result and writes the history', async () => {
    await claim();
    await finish();

    expect(await state()).toMatchObject({
      lockedBy: null,
      lockedUntil: null,
      lastStatus: 'succeeded',
      lastFinishedAt: later(0.025),
      lastDurationMs: 1500,
    });
    const runs = await JobRun.find({ name: 'alpha' }).lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      instance: 'A',
      status: 'succeeded',
      durationMs: 1500,
      summary: { expired: 2 },
    });
  });

  it('records an error, and clears it after the next success', async () => {
    await claim();
    await finish({ status: 'failed', error: 'boom', summary: undefined });
    expect(await state()).toMatchObject({ lastStatus: 'failed', lastError: 'boom' });
    expect((await JobRun.findOne({ name: 'alpha' }).lean()).error).toBe('boom');

    await claim({ slot: later(5), now: later(5) });
    await finish({ startedAt: later(5), finishedAt: later(5.01) });
    const after = await state();
    expect(after.lastStatus).toBe('succeeded');
    expect(after.lastError).toBeUndefined();
  });

  it('does not overwrite a newer claim when a late run finishes', async () => {
    await claim(); // server A starts, then stalls
    await claim({ instanceId: 'B', slot: later(10), now: later(11) }); // its claim expires, B takes over

    await finish({ instanceId: 'A', startedAt: T0, finishedAt: later(12) }); // A finally finishes

    expect(await state()).toMatchObject({ lockedBy: 'B', lastStartedAt: later(11) });
    expect(await JobRun.countDocuments({ name: 'alpha', instance: 'A' })).toBe(1); // still in the history
  });
});

describe('list', () => {
  it('lists the job states by name', async () => {
    await claim({ name: 'beta' });
    await claim({ name: 'alpha' });
    const states = await store.list();
    expect(states.map((s) => s.name)).toEqual(['alpha', 'beta']);
  });
});
