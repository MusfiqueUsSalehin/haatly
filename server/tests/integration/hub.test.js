import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeLot } from '../helpers/lotFixture.js';
import { setUpShelf } from '../helpers/shelfFixture.js';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';
import { User } from '../../src/models/User.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const tokens = createTokenService(makeTestEnv());
const as = (user) => ({ Authorization: `Bearer ${tokens.sign(user)}` });
const person = (n, role, hubCode) =>
  createUser({
    name: `Staff ${n}`,
    email: `staff${n}@example.com`,
    phone: '+8801712345678',
    password: 'a-strong-password',
    role,
    status: 'active',
    hubCode,
  });

let savar;
let jashore;
let depot;
let admin;

beforeAll(async () => {
  await startTestDb();
  await User.init();
  const { farmer } = await setUpShelf(); // six lots, all at savar
  await makeLot({ farmer, hubCode: 'jashore' });
  savar = await person(1, 'hub_manager', 'savar');
  jashore = await person(2, 'hub_manager', 'jashore');
  depot = await person(3, 'hub_manager', 'dhaka-depot');
  admin = await person(4, 'admin');
});
afterAll(stopTestDb);

describe('hub manager routes', () => {
  it('is for hub managers only', async () => {
    expect((await request(app).get('/api/hub/me')).status).toBe(401);
    expect((await request(app).get('/api/hub/me').set(as(admin))).status).toBe(403);
  });

  it('shows each manager only their own hub', async () => {
    const me = await request(app).get('/api/hub/me').set(as(savar));
    expect(me.body.hub.code).toBe('savar');

    const mine = await request(app).get('/api/hub/lots').set(as(savar));
    expect(mine.body.total).toBe(6);
    expect(mine.body.lots.every((lot) => lot.hubCode === 'savar')).toBe(true);

    const theirs = await request(app).get('/api/hub/lots').set(as(jashore));
    expect(theirs.body.total).toBe(1);
  });

  it('ignores a hub code sent in the query', async () => {
    const res = await request(app).get('/api/hub/lots?hubCode=jashore').set(as(savar));
    expect(res.body.lots.every((lot) => lot.hubCode === 'savar')).toBe(true);
  });

  it('gives a depot runs and no lots, and a collection hub the reverse', async () => {
    expect((await request(app).get('/api/hub/lots').set(as(depot))).body.total).toBe(0);
    expect((await request(app).get('/api/hub/runs').set(as(depot))).status).toBe(200);
    expect((await request(app).get('/api/hub/runs').set(as(savar))).body.runs).toEqual([]);
  });
});
