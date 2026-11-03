import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeUser } from '../helpers/deliveryFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { createAppScheduler } from '../../src/jobs/index.js';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/config/logger.js';
import { JobRun } from '../../src/models/JobRun.js';
import { JobState } from '../../src/models/JobState.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const logger = { info() {}, warn() {}, error() {} };

let admin;
let customer;
let scheduler;
let app;

const as = (user) => ({ Authorization: `Bearer ${tokens.sign(user)}` });
const get = (path, user = admin, testApp = app) =>
  request(testApp).get(`/api/admin/jobs${path}`).set(as(user));

beforeAll(async () => {
  await startTestDb();
  await Promise.all([User.init(), JobState.init(), JobRun.init()]);
  admin = await makeUser(1, 'admin');
  customer = await makeUser(2, 'customer');
});
afterAll(stopTestDb);
beforeEach(async () => {
  await setUpShelf();
  await Promise.all([JobState.deleteMany({}), JobRun.deleteMany({})]);
  scheduler = createAppScheduler({ logger, payments: null });
  app = createApp({ env, logger: createLogger(env), scheduler });
});

describe('admin jobs: access', () => {
  it('is for admins only', async () => {
    expect((await request(app).get('/api/admin/jobs')).status).toBe(401);
    expect((await get('', customer)).status).toBe(403);
    expect((await get('/runs', customer)).status).toBe(403);
  });
});

describe('GET /api/admin/jobs', () => {
  it('lists every job with its timetable and next run, before anything has run', async () => {
    const res = await get('');
    expect(res.status).toBe(200);
    expect(res.body.schedulerRunsHere).toBe(true);
    expect(res.body.jobs.map((job) => job.name)).toEqual([
      'shelf-morning',
      'shelf-refresh',
      'lot-upkeep',
      'payment-upkeep',
      'earnings-backfill',
    ]);
    expect(res.body.jobs[1]).toMatchObject({
      schedule: 'every 15 minutes',
      running: false,
      lastStatus: null,
      lastStartedAt: null,
    });
    expect(Date.parse(res.body.jobs[1].nextRunAt)).toBeGreaterThan(Date.now());
  });

  it('shows how each job last went', async () => {
    await scheduler.runDue();
    const res = await get('');
    for (const job of res.body.jobs) {
      expect(job).toMatchObject({ running: false, lastStatus: 'succeeded', lastError: null });
      expect(job.lastDurationMs).toBeGreaterThanOrEqual(0);
      expect(job.lastStartedAt).toBeTypeOf('string');
    }
  });

  it('shows a job that is running right now', async () => {
    await JobState.create({
      name: 'lot-upkeep',
      lockedBy: 'other-server',
      lockedUntil: new Date(Date.now() + 60_000),
      lastStartedAt: new Date(),
    });
    const res = await get('');
    expect(res.body.jobs.find((job) => job.name === 'lot-upkeep').running).toBe(true);
    expect(res.body.jobs.find((job) => job.name === 'shelf-refresh').running).toBe(false);
  });

  it('says so when this server does not run jobs', async () => {
    const res = await get('', admin, makeTestApp());
    expect(res.body).toEqual({ schedulerRunsHere: false, jobs: [] });
  });
});

describe('GET /api/admin/jobs/runs', () => {
  beforeEach(async () => {
    await scheduler.runDue();
  });

  it('lists the run history, newest first', async () => {
    const res = await get('/runs');
    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(5);
    const times = res.body.runs.map((run) => Date.parse(run.startedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(res.body.runs[0]).toMatchObject({ status: 'succeeded' });
    expect(res.body.runs[0]._id).toBeUndefined();
  });

  it('filters by job and by status, and limits the list', async () => {
    const byName = await get('/runs?name=lot-upkeep');
    expect(byName.body.runs.map((run) => run.name)).toEqual(['lot-upkeep']);
    expect((await get('/runs?status=failed')).body.runs).toEqual([]);
    expect((await get('/runs?limit=2')).body.runs).toHaveLength(2);
  });

  it('rejects an unknown status, a bad name and a bad limit', async () => {
    expect((await get('/runs?status=lost')).status).toBe(400);
    expect((await get('/runs?name=Bad Name')).status).toBe(400);
    expect((await get('/runs?limit=0')).status).toBe(400);
    expect((await get('/runs?limit=101')).status).toBe(400);
  });
});
