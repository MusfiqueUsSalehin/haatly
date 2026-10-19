import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { AiLog } from '../../src/models/AiLog.js';
import { Produce } from '../../src/models/Produce.js';
import { User } from '../../src/models/User.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createAiRouter } from '../../src/routes/ai.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { createAiGateway } from '../../src/services/ai/gateway.js';
import { createAiStore } from '../../src/services/ai/store.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const env = makeTestEnv();
const tokens = createTokenService(env);
const photo = { mediaType: 'image/jpeg', data: Buffer.alloc(300, 1).toString('base64') };

const provider = { model: 'test-model', complete: vi.fn() };
const modelSays = (text) =>
  provider.complete.mockResolvedValue({ text, inputTokens: 40, outputTokens: 8 });

const gateway = (p) =>
  createAiGateway({ env, logger: { warn() {} }, provider: p, store: createAiStore() });
const withModel = gateway(provider);
const rulesOnly = gateway(null);

const triage = (app, body, token) =>
  request(app).post('/api/ai/triage').set('Authorization', `Bearer ${token}`).send(body);

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
  farmerToken = tokens.sign(await createUser(person(1, 'farmer', 'active')));
  pendingToken = tokens.sign(await createUser(person(2, 'farmer', 'pending')));
  customerToken = tokens.sign(await createUser(person(3, 'customer', 'active')));
});
afterAll(stopTestDb);
beforeEach(async () => {
  await Produce.deleteMany({});
  await AiLog.deleteMany({});
  await seedCatalog();
  provider.complete.mockReset();
});

describe('POST /api/ai/triage: access', () => {
  const app = makeTestApp({}, { ai: rulesOnly });

  it('requires a token', async () => {
    const res = await request(app).post('/api/ai/triage').send({ produceSlug: 'tomato' });
    expect(res.status).toBe(401);
  });

  it('forbids customers and farmers who are not approved yet', async () => {
    expect((await triage(app, { produceSlug: 'tomato' }, customerToken)).status).toBe(403);
    const pending = await triage(app, { produceSlug: 'tomato' }, pendingToken);
    expect(pending.status).toBe(403);
    expect(pending.body.error.code).toBe('account_pending');
  });
});

describe('POST /api/ai/triage: rules only', () => {
  const app = makeTestApp({}, { ai: rulesOnly });

  it('grades from the ticked defects and logs the call', async () => {
    const res = await triage(app, { produceSlug: 'tomato', defectTags: ['bruise'] }, farmerToken);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('rules');
    expect(res.body.triage).toMatchObject({
      grade: 'B',
      sellable: true,
      shelfLifeDays: 3,
      photoUsed: false,
    });
    const log = await AiLog.findOne({ feature: 'triage' });
    expect(log).toMatchObject({ source: 'rules', modelCalled: false });
  });

  it('defaults to a clean crate when no defects are ticked', async () => {
    const res = await triage(app, { produceSlug: 'potato' }, farmerToken);
    expect(res.body.triage).toMatchObject({ grade: 'A', shelfLifeDays: 30 });
  });

  it('refuses to sell rotten produce', async () => {
    const res = await triage(app, { produceSlug: 'tomato', defectTags: ['rot'] }, farmerToken);
    expect(res.body.triage).toMatchObject({ grade: 'C', sellable: false, shelfLifeDays: 0 });
  });

  it('rejects unknown defects, unknown produce and inactive produce', async () => {
    const bad = await triage(app, { produceSlug: 'tomato', defectTags: ['purple'] }, farmerToken);
    expect(bad.status).toBe(400);
    const unknown = await triage(app, { produceSlug: 'dragonfruit' }, farmerToken);
    expect(unknown.status).toBe(404);
    await Produce.updateOne({ slug: 'tomato' }, { active: false });
    expect((await triage(app, { produceSlug: 'tomato' }, farmerToken)).status).toBe(404);
  });

  it('accepts a large photo through the bigger AI body limit but ignores it', async () => {
    const big = { mediaType: 'image/png', data: 'A'.repeat(600_000) };
    const res = await triage(app, { produceSlug: 'tomato', photo: big }, farmerToken);
    expect(res.status).toBe(200);
    expect(res.body.triage.photoUsed).toBe(false);
  });
});

describe('POST /api/ai/triage: photo validation', () => {
  const app = makeTestApp({}, { ai: rulesOnly });
  const send = (body) => triage(app, { produceSlug: 'tomato', ...body }, farmerToken);

  it('rejects an unsupported image type', async () => {
    expect((await send({ photo: { ...photo, mediaType: 'image/gif' } })).status).toBe(400);
  });

  it('rejects data that is not plain base64', async () => {
    const dataUrl = { mediaType: 'image/jpeg', data: `data:image/jpeg;base64,${photo.data}` };
    expect((await send({ photo: dataUrl })).status).toBe(400);
  });

  it('rejects a photo over the size limit', async () => {
    const res = await send({ photo: { mediaType: 'image/jpeg', data: 'A'.repeat(1_500_000) } });
    expect(res.status).toBe(400);
    expect(res.body.error.details['photo.data']).toMatch(/too large/);
  });

  it('rejects a body over the AI route limit', async () => {
    const res = await send({ photo: { mediaType: 'image/jpeg', data: 'A'.repeat(2_200_000) } });
    expect(res.status).toBe(413);
  });
});

describe('POST /api/ai/triage: with a model', () => {
  const app = makeTestApp({}, { ai: withModel });

  it('uses the defects the model sees, and logs tokens', async () => {
    modelSays('{"defects":["mould"]}');
    const res = await triage(app, { produceSlug: 'tomato', photo }, farmerToken);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('model');
    expect(res.body.triage).toMatchObject({ sellable: false, photoUsed: true });
    const log = await AiLog.findOne({ feature: 'triage' });
    expect(log).toMatchObject({ source: 'model', modelCalled: true, inputTokens: 40 });
  });

  it('keeps a defect the farmer ticked even if the model sees nothing', async () => {
    modelSays('{"defects":[]}');
    const body = { produceSlug: 'tomato', defectTags: ['rot'], photo };
    const res = await triage(app, body, farmerToken);
    expect(res.body.triage.sellable).toBe(false);
  });

  it('falls back to the rules when the model reply is unusable', async () => {
    modelSays('sorry, I cannot help with that');
    const body = { produceSlug: 'tomato', defectTags: ['bruise'], photo };
    const res = await triage(app, body, farmerToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'rules', fallbackReason: 'invalid_output' });
    expect(res.body.triage).toMatchObject({ grade: 'B', photoUsed: false });
  });

  it('does not call the model when there is no photo', async () => {
    await triage(app, { produceSlug: 'tomato', defectTags: ['bruise'] }, farmerToken);
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/triage: allowance', () => {
  it('limits how many gradings one farmer can request per hour', async () => {
    const mini = express();
    mini.use(express.json());
    mini.use('/ai', createAiRouter({ tokens, ai: rulesOnly, perUserPerHour: 2 }));
    mini.use(errorHandler({ error() {} }));
    const call = () =>
      request(mini)
        .post('/ai/triage')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ produceSlug: 'tomato' });

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const third = await call();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('rate_limited');
  });
});
