// server/tests/integration/adminAi.test.js
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser } from '../helpers/deliveryFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { AiLog } from '../../src/models/AiLog.js';
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
  admin = await makeUser(1, 'admin');
  customer = await makeUser(2, 'customer');
  await AiLog.create([
    {
      feature: 'triage',
      source: 'model',
      modelCalled: true,
      model: 'm',
      latencyMs: 100,
      inputTokens: 10,
      outputTokens: 5,
    },
    {
      feature: 'triage',
      source: 'rules',
      fallbackReason: 'error',
      modelCalled: true,
      latencyMs: 200,
    },
    { feature: 'recipes', source: 'rules', fallbackReason: 'provider_off' },
  ]);
});
afterAll(stopTestDb);

describe('GET /api/admin/ai/health', () => {
  it('is for admins only', async () => {
    expect((await request(app).get('/api/admin/ai/health')).status).toBe(401);
    expect((await request(app).get('/api/admin/ai/health').set(as(customer))).status).toBe(403);
  });

  it('summarises the last day per feature', async () => {
    const res = await request(app).get('/api/admin/ai/health').set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body.budget.used).toBe(2);
    const triage = res.body.features.find((f) => f.feature === 'triage');
    expect(triage).toMatchObject({
      calls: 2,
      modelAnswers: 1,
      ruleAnswers: 1,
      avgLatencyMs: 150,
      inputTokens: 10,
    });
    expect(triage.fallbackReasons).toEqual({ error: 1 });
    const recipes = res.body.features.find((f) => f.feature === 'recipes');
    expect(recipes.fallbackReasons).toEqual({ provider_off: 1 });
  });
});
