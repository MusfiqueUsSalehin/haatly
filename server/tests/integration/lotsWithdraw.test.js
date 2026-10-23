import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeLot } from '../helpers/lotFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { Lot, sellableFilter } from '../../src/models/Lot.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());

let farmer;
let other;
let farmerToken;
let customerToken;

const withdraw = (code, token = farmerToken) =>
  request(app).post(`/api/lots/${code}/withdraw`).set('Authorization', `Bearer ${token}`);

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
  farmer = await createUser(person(1, 'farmer'));
  other = await createUser(person(2, 'farmer'));
  farmerToken = tokens.sign(farmer);
  customerToken = tokens.sign(await createUser(person(3, 'customer')));
});
afterAll(stopTestDb);
beforeEach(() => Lot.deleteMany({}));

describe('POST /api/lots/:code/withdraw', () => {
  it('requires a farmer', async () => {
    const lot = await makeLot({ farmer: farmer._id });
    expect((await request(app).post(`/api/lots/${lot.code}/withdraw`)).status).toBe(401);
    expect((await withdraw(lot.code, customerToken)).status).toBe(403);
  });

  it('withdraws a listed lot and takes it off sale', async () => {
    const lot = await makeLot({ farmer: farmer._id, remainingKg: 60 });
    expect(await Lot.countDocuments(sellableFilter())).toBe(1);

    const res = await withdraw(lot.code);
    expect(res.status).toBe(200);
    expect(res.body.lot).toMatchObject({ status: 'withdrawn', soldKg: 40, remainingKg: 60 });
    expect(await Lot.countDocuments(sellableFilter())).toBe(0);
  });

  it("will not touch another farmer's lot", async () => {
    const theirs = await makeLot({ farmer: other._id });
    const res = await withdraw(theirs.code);
    expect(res.status).toBe(404);
    expect((await Lot.findOne({ code: theirs.code })).status).toBe('listed');
  });

  it.each(['withdrawn', 'expired', 'sold_out'])(
    'refuses a lot that is already %s',
    async (status) => {
      const lot = await makeLot({
        farmer: farmer._id,
        status,
        ...(status === 'sold_out' && { remainingKg: 0 }),
      });
      const res = await withdraw(lot.code);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('lot_not_listed');
      expect(res.body.error.message).toContain(status);
    },
  );

  it('only lets one of two simultaneous requests win', async () => {
    const lot = await makeLot({ farmer: farmer._id });
    const results = await Promise.all([withdraw(lot.code), withdraw(lot.code)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('returns 404 for an unknown code and 400 for a malformed one', async () => {
    expect((await withdraw('LOT-AAAAAAAA')).status).toBe(404);
    expect((await withdraw('BAD-CODE')).status).toBe(400);
  });
});
