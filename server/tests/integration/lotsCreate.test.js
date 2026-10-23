import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { AiLog } from '../../src/models/AiLog.js';
import { Hub } from '../../src/models/Hub.js';
import { Lot } from '../../src/models/Lot.js';
import { Produce } from '../../src/models/Produce.js';
import { User } from '../../src/models/User.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createLotsRouter } from '../../src/routes/lots.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { createAiGateway } from '../../src/services/ai/gateway.js';
import { createAiStore } from '../../src/services/ai/store.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const photo = { mediaType: 'image/jpeg', data: Buffer.alloc(300, 1).toString('base64') };

const provider = { model: 'test-model', complete: vi.fn() };
const gateway = (p) =>
  createAiGateway({ env, logger: { warn() {} }, provider: p, store: createAiStore() });
const withModel = gateway(provider);
const rulesOnly = gateway(null);

let farmer;
let farmerToken;
let pendingToken;
let customerToken;

beforeAll(async () => {
  await startTestDb();
  await User.init();
  const person = (n, role, status) => ({
    name: `Person ${n}`,
    email: `person${n}@example.com`,
    phone: '+8801712345678',
    password: 'a-strong-password',
    role,
    status,
  });
  farmer = await createUser(person(1, 'farmer', 'active'));
  farmerToken = tokens.sign(farmer);
  pendingToken = tokens.sign(await createUser(person(2, 'farmer', 'pending')));
  customerToken = tokens.sign(await createUser(person(3, 'customer', 'active')));
});
afterAll(stopTestDb);
beforeEach(async () => {
  await Promise.all([Lot.deleteMany({}), AiLog.deleteMany({}), Hub.deleteMany({})]);
  await Produce.deleteMany({});
  await seedCatalog();
  // No seasons, so expected prices never depend on today's date.
  await Produce.updateMany({}, { peakMonths: [] });
  provider.complete.mockReset();
});

const valid = { produceSlug: 'tomato', hubCode: 'jashore', quantityKg: 100 };
const create = (app, body, token = farmerToken) =>
  request(app).post('/api/lots').set('Authorization', `Bearer ${token}`).send(body);

describe('POST /api/lots: access', () => {
  const app = makeTestApp({}, { ai: rulesOnly });

  it('requires a token', async () => {
    expect((await request(app).post('/api/lots').send(valid)).status).toBe(401);
  });

  it('forbids customers and farmers who are not approved yet', async () => {
    expect((await create(app, valid, customerToken)).status).toBe(403);
    const pending = await create(app, valid, pendingToken);
    expect(pending.status).toBe(403);
    expect(pending.body.error.code).toBe('account_pending');
  });
});

describe('POST /api/lots: creating a lot', () => {
  const app = makeTestApp({}, { ai: rulesOnly });

  it('grades, prices and lists the lot', async () => {
    const res = await create(app, { ...valid, defectTags: ['bruise'] });
    expect(res.status).toBe(201);

    const { lot, quote, triage } = res.body;
    expect(lot.code).toMatch(/^LOT-[A-HJ-NP-Z2-9]{8}$/);
    expect(lot).toMatchObject({
      status: 'listed',
      produceSlug: 'tomato',
      hubCode: 'jashore',
      grade: 'B',
      shelfLifeDays: 3,
      quantityKg: 100,
      remainingKg: 100,
      bazarPriceBdt: 70,
      farmerFloorBdt: 28,
      priceBdt: 56,
      triageSource: 'rules',
      farmer: String(farmer._id),
    });
    expect(new Date(lot.expiresAt) - new Date(lot.listedAt)).toBe(72 * 3600 * 1000);
    expect(quote.farmerPayoutBdt).toBe(40.32);
    expect(triage).toMatchObject({ grade: 'B', source: 'rules', photoUsed: false });
    expect(await Lot.countDocuments()).toBe(1);
  });

  it('ignores grade, price, status and owner sent by the client', async () => {
    const res = await create(app, {
      ...valid,
      defectTags: ['bruise'],
      grade: 'A',
      priceBdt: 1,
      shelfLifeDays: 60,
      status: 'sold_out',
      farmer: '65f1c2a4b9d3e8a1c4f7b999',
      remainingKg: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.lot).toMatchObject({
      grade: 'B',
      priceBdt: 56,
      shelfLifeDays: 3,
      status: 'listed',
      remainingKg: 100,
      farmer: String(farmer._id),
    });
  });

  it('refuses a rotten crate and creates nothing', async () => {
    const res = await create(app, { ...valid, defectTags: ['rot'] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('not_sellable');
    expect(await Lot.countDocuments()).toBe(0);
  });

  it('records when the model graded the crate', async () => {
    provider.complete.mockResolvedValue({
      text: '{"defects":["bruise"]}',
      inputTokens: 40,
      outputTokens: 8,
    });
    const modelApp = makeTestApp({}, { ai: withModel });
    const res = await create(modelApp, { ...valid, photo });
    expect(res.status).toBe(201);
    expect(res.body.lot).toMatchObject({ triageSource: 'model', grade: 'B', defects: ['bruise'] });
  });

  it('rejects an unknown hub, a depot, or an inactive hub', async () => {
    const hubError = async (hubCode) => {
      const res = await create(app, { ...valid, hubCode });
      return [res.status, res.body.error.code];
    };
    expect(await hubError('nowhere')).toEqual([404, 'hub_not_found']);
    expect(await hubError('dhaka-depot')).toEqual([404, 'hub_not_found']);
    await Hub.updateOne({ code: 'jashore' }, { active: false });
    expect(await hubError('jashore')).toEqual([404, 'hub_not_found']);
  });

  it('rejects unknown and inactive produce', async () => {
    const unknown = await create(app, { ...valid, produceSlug: 'dragonfruit' });
    expect(unknown.status).toBe(404);
    await Produce.updateOne({ slug: 'tomato' }, { active: false });
    expect((await create(app, valid)).status).toBe(404);
  });

  it.each([
    ['zero kilos', { quantityKg: 0 }],
    ['more than 5000 kilos', { quantityKg: 6000 }],
    ['kilos sent as text', { quantityKg: '100' }],
    ['a missing hub', { hubCode: undefined }],
  ])('rejects %s', async (_label, change) => {
    const res = await create(app, { ...valid, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('accepts a large photo through the bigger body limit', async () => {
    const big = { mediaType: 'image/png', data: 'A'.repeat(600_000) };
    expect((await create(app, { ...valid, photo: big })).status).toBe(201);
  });
});

describe('POST /api/lots: allowance', () => {
  it('limits how many lots one farmer can list per hour', async () => {
    const mini = express();
    mini.use(express.json());
    mini.use('/lots', createLotsRouter({ tokens, ai: rulesOnly, perUserPerHour: 2 }));
    mini.use(errorHandler({ error() {} }));
    const call = () =>
      request(mini).post('/lots').set('Authorization', `Bearer ${farmerToken}`).send(valid);

    expect((await call()).status).toBe(201);
    expect((await call()).status).toBe(201);
    const third = await call();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('rate_limited');
  });
});
