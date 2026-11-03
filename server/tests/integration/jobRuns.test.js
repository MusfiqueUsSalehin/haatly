import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser, placeOrderFor } from '../helpers/deliveryFixture.js';
import { makeLot } from '../helpers/lotFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { createJobs } from '../../src/jobs/definitions.js';
import { createJobStore } from '../../src/jobs/jobStore.js';
import { createScheduler } from '../../src/jobs/scheduler.js';
import { Box } from '../../src/models/Box.js';
import { JobRun } from '../../src/models/JobRun.js';
import { JobState } from '../../src/models/JobState.js';
import { Lot } from '../../src/models/Lot.js';
import { Order } from '../../src/models/Order.js';
import { Payment } from '../../src/models/Payment.js';
import { User } from '../../src/models/User.js';
import { createSandboxProvider } from '../../src/services/payments/sandbox.js';

const logger = { info() {}, warn() {}, error() {} };
const gateway = createSandboxProvider({ webhookSecret: 'job-runs-secret-job-runs-secret-12345' });
const farmer = new mongoose.Types.ObjectId();

let clock = new Date();
const scheduler = (payments = null) =>
  createScheduler({
    jobs: createJobs({ payments }),
    store: createJobStore(),
    logger,
    now: () => clock,
    instanceId: 'test',
  });
const resultOf = (results, name) => results.find((result) => result.name === name);

let customer;
let today;

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), JobState.init(), JobRun.init()]);
  customer = await makeUser(1, 'customer');
});
afterAll(stopTestDb);
beforeEach(async () => {
  clock = new Date();
  ({ today } = await setUpShelf({ now: clock }));
  await Promise.all([JobState.deleteMany({}), JobRun.deleteMany({})]);
});

describe('the real jobs', () => {
  it('run every job once and record each result', async () => {
    const results = await scheduler().runDue();

    expect(results.map((r) => [r.name, r.outcome])).toEqual([
      ['shelf-morning', 'succeeded'],
      ['shelf-refresh', 'succeeded'],
      ['lot-upkeep', 'succeeded'],
      ['payment-upkeep', 'succeeded'],
      ['earnings-backfill', 'succeeded'],
    ]);
    expect(await JobRun.countDocuments()).toBe(5);
    expect(await JobState.countDocuments()).toBe(5);
    expect(resultOf(results, 'payment-upkeep').summary).toEqual({
      expired: 0,
      retried: 0,
      refunded: 0,
    });
  });

  it('run only once per slot, however often the scheduler checks', async () => {
    const s = scheduler();
    await s.runDue();
    const again = await s.runDue();
    expect(again.every((r) => r.outcome === 'skipped')).toBe(true);
    expect(await JobRun.countDocuments()).toBe(5);
  });

  it('let two servers run the same timetable, each job running once between them', async () => {
    const a = scheduler();
    const b = scheduler();
    const [first, second] = await Promise.all([a.runDue(), b.runDue()]);

    const ran = [...first, ...second].filter((r) => r.outcome === 'succeeded');
    expect(ran).toHaveLength(5);
    expect(await JobRun.countDocuments()).toBe(5);
  });

  it('rebuild the shelf so new lots become boxes', async () => {
    await Box.deleteMany({});
    await scheduler().runDue();
    expect(await Box.countDocuments({ status: 'live' })).toBe(3);
  });

  it('expire finished lots and mark prices down', async () => {
    const old = await makeLot({
      farmer,
      code: 'LOT-ZZZZZZZZ',
      hubCode: 'savar',
      produceSlug: 'tomato',
      now: clock,
      listedHoursAgo: 200,
    });
    const results = await scheduler().runDue();

    expect(resultOf(results, 'lot-upkeep').summary.expired).toBe(1);
    expect((await Lot.findOne({ code: old.code })).status).toBe('expired');
  });

  it('release a wallet order that was never paid', async () => {
    const order = await placeOrderFor(customer, today, { paymentMethod: 'wallet' });
    await Payment.updateOne(
      { orderCode: order.code },
      { expiresAt: new Date(clock.getTime() - 60_000) },
    );

    const results = await scheduler(gateway).runDue();
    expect(resultOf(results, 'payment-upkeep').summary.expired).toBe(1);
    expect((await Order.findOne({ code: order.code })).status).toBe('cancelled');
  });

  it('record earnings for a delivered order that missed them', async () => {
    const order = await placeOrderFor(customer, today);
    await Order.updateOne({ code: order.code }, { status: 'delivered', deliveredAt: new Date() });

    const results = await scheduler().runDue();
    expect(resultOf(results, 'earnings-backfill').summary).toEqual({
      checked: 1,
      recorded: 2,
      failed: 0,
    });
  });

  it('keep going when one job fails', async () => {
    const jobs = createJobs();
    jobs[0] = {
      ...jobs[0],
      run: async () => {
        throw new Error('shelf broke');
      },
    };
    const s = createScheduler({
      jobs,
      store: createJobStore(),
      logger,
      now: () => clock,
      instanceId: 'x',
    });
    const results = await s.runDue();

    expect(results[0]).toMatchObject({
      name: 'shelf-morning',
      outcome: 'failed',
      error: 'shelf broke',
    });
    expect(results.slice(1).every((r) => r.outcome === 'succeeded')).toBe(true);
    expect((await JobState.findOne({ name: 'shelf-morning' })).lastStatus).toBe('failed');
  });
});
