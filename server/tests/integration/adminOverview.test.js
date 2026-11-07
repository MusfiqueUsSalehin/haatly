// server/tests/integration/adminOverview.test.js
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeProfile, makeUser } from '../helpers/deliveryFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());
const as = (user) => ({ Authorization: `Bearer ${tokens.sign(user)}` });

let admin;
let customer;

beforeAll(async () => {
  await startTestDb();
  await User.init();
  await setUpShelf();
  admin = await makeUser(1, 'admin');
  customer = await makeUser(2, 'customer');
  await makeUser(3, 'farmer', 'pending');
  await makeProfile(await makeUser(4, 'rider'), ['dhaka-mirpur']);
});
afterAll(stopTestDb);

describe('GET /api/admin/overview', () => {
  it('is for admins only', async () => {
    expect((await request(app).get('/api/admin/overview')).status).toBe(401);
    expect((await request(app).get('/api/admin/overview').set(as(customer))).status).toBe(403);
  });

  it('counts what is waiting and what is live', async () => {
    const res = await request(app).get('/api/admin/overview').set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body.pendingApprovals).toBe(1);
    expect(res.body.ridersOnDuty).toBe(1);
    expect(res.body.runsInProgress).toBe(0);
    expect(res.body.last7Days).toEqual({ orders: 0, revenueBdt: 0 });
    expect(res.body.topZones).toEqual([]);
    expect(res.body.rescueRatePct).toBeGreaterThanOrEqual(0);
    expect(res.body.rescueRatePct).toBeLessThanOrEqual(100);
  });
});
