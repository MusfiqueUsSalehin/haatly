// server/tests/integration/impactSummary.test.js
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser } from '../helpers/deliveryFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());
const as = (user) => ({ Authorization: `Bearer ${tokens.sign(user)}` });
let customer;
let farmer;

beforeAll(async () => {
  await startTestDb();
  await User.init();
  customer = await makeUser(1, 'customer');
  farmer = await makeUser(2, 'farmer');
});
afterAll(stopTestDb);

describe('GET /api/impact/me/summary', () => {
  it('is for signed-in customers only', async () => {
    expect((await request(app).get('/api/impact/me/summary')).status).toBe(401);
    expect((await request(app).get('/api/impact/me/summary').set(as(farmer))).status).toBe(403);
  });

  it('has nothing to say before a first order', async () => {
    const res = await request(app).get('/api/impact/me/summary').set(as(customer));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ summary: null });
  });
});
