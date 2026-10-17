import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { seedCatalog } from '../../src/seed/catalog.js';
import { Produce } from '../../src/models/Produce.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());
const as = (token) => ({ Authorization: `Bearer ${token}` });
const patch = (slug, body, token) =>
  request(app).patch(`/api/admin/produce/${slug}`).set(as(token)).send(body);

let adminToken;
let customerToken;

beforeAll(async () => {
  await startTestDb();
  await User.init();
  const person = (n, role) => ({
    name: `Person ${n}`,
    email: `person${n}@example.com`,
    phone: '+8801712345678',
    password: 'a-strong-password',
    role,
    status: 'active',
  });
  adminToken = tokens.sign(await createUser(person(1, 'admin')));
  customerToken = tokens.sign(await createUser(person(2, 'customer')));
});
afterAll(stopTestDb);
beforeEach(async () => {
  await Produce.deleteMany({});
  await seedCatalog();
});

describe('admin produce access control', () => {
  it('requires a token', async () => {
    const res = await request(app).patch('/api/admin/produce/tomato').send({ active: false });
    expect(res.status).toBe(401);
  });

  it('forbids a customer', async () => {
    const res = await patch('tomato', { bazarPriceBdt: 1 }, customerToken);
    expect(res.status).toBe(403);
    expect((await Produce.findOne({ slug: 'tomato' })).bazarPriceBdt).toBe(70);
  });
});

describe('PATCH /api/admin/produce/:slug', () => {
  it('updates the price and refreshes its date', async () => {
    await Produce.updateOne({ slug: 'tomato' }, { bazarPriceUpdatedAt: new Date('2020-01-01') });
    const res = await patch('tomato', { bazarPriceBdt: 95 }, adminToken);

    expect(res.status).toBe(200);
    expect(res.body.produce.bazarPriceBdt).toBe(95);
    expect(new Date(res.body.produce.bazarPriceUpdatedAt).getFullYear()).toBeGreaterThan(2020);
  });

  it('leaves the price date alone when the price did not change', async () => {
    await Produce.updateOne({ slug: 'tomato' }, { bazarPriceUpdatedAt: new Date('2020-01-01') });
    const res = await patch('tomato', { shelfLifeDays: 4 }, adminToken);

    expect(res.body.produce.shelfLifeDays).toBe(4);
    expect(new Date(res.body.produce.bazarPriceUpdatedAt).getFullYear()).toBe(2020);
  });

  it('sorts and de-duplicates peak months', async () => {
    const res = await patch('tomato', { peakMonths: [3, 1, 3] }, adminToken);
    expect(res.body.produce.peakMonths).toEqual([1, 3]);
  });

  it.each([
    ['an empty body', {}],
    ['a zero price', { bazarPriceBdt: 0 }],
    ['a price sent as text', { bazarPriceBdt: '70' }],
    ['an invalid month', { peakMonths: [13] }],
    ['only unknown fields', { slug: 'hacked' }],
  ])('rejects %s', async (_label, body) => {
    const res = await patch('tomato', body, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('returns 404 for an unknown slug and 400 for a malformed one', async () => {
    expect((await patch('dragonfruit', { active: false }, adminToken)).status).toBe(404);
    expect((await patch('BAD_SLUG', { active: false }, adminToken)).status).toBe(400);
  });

  it('deactivates and reactivates an item for the public catalog', async () => {
    await patch('tomato', { active: false }, adminToken).expect(200);

    const publicList = await request(app).get('/api/catalog/produce');
    expect(publicList.body.produce.some((p) => p.slug === 'tomato')).toBe(false);

    const adminList = await request(app).get('/api/admin/produce').set(as(adminToken));
    expect(adminList.body.produce.find((p) => p.slug === 'tomato').active).toBe(false);

    await patch('tomato', { active: true }, adminToken).expect(200);
    const again = await request(app).get('/api/catalog/produce');
    expect(again.body.produce.some((p) => p.slug === 'tomato')).toBe(true);
  });
});
