import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { createAppScheduler } from '../../src/jobs/index.js';
import { JobRun } from '../../src/models/JobRun.js';
import { JobState } from '../../src/models/JobState.js';

const logger = { info() {}, warn() {}, error() {} };

beforeAll(async () => {
  await startTestDb();
  await Promise.all([JobState.init(), JobRun.init()]);
});
afterAll(stopTestDb);
beforeEach(async () => {
  await setUpShelf();
  await Promise.all([JobState.deleteMany({}), JobRun.deleteMany({})]);
});

describe('createAppScheduler', () => {
  it('describes the five jobs and when each runs next', () => {
    const scheduler = createAppScheduler({ logger, payments: null });
    const described = scheduler.describe();
    expect(described.map((job) => job.name)).toEqual([
      'shelf-morning',
      'shelf-refresh',
      'lot-upkeep',
      'payment-upkeep',
      'earnings-backfill',
    ]);
    expect(described[0].schedule).toBe('every day at 05:30 (Bangladesh time)');
    expect(described[1].schedule).toBe('every 15 minutes');
    for (const job of described) expect(Date.parse(job.nextRunAt)).toBeGreaterThan(Date.now());
  });

  it('starts, runs the due jobs right away, and stops cleanly', async () => {
    const scheduler = createAppScheduler({ logger, payments: null });
    scheduler.start();
    await scheduler.stop(); // waits for the first pass to finish

    expect(await JobRun.countDocuments()).toBe(5);
    expect(await JobRun.countDocuments({ status: 'succeeded' })).toBe(5);
  });

  it('can be started with no immediate run, leaving the database untouched', async () => {
    const scheduler = createAppScheduler({ logger, payments: null });
    scheduler.start({ immediate: false });
    await scheduler.stop();
    expect(await JobRun.countDocuments()).toBe(0);
  });

  it('gives each scheduler instance its own identity', () => {
    const a = createAppScheduler({ logger, payments: null });
    const b = createAppScheduler({ logger, payments: null });
    expect(a.instanceId).not.toBe(b.instanceId);
  });
});
