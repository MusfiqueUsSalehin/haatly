import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp } from '../helpers/testApp.js';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/testDb.js';
import { User } from '../../src/models/User.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const password = 'a-strong-password';

const person = (n, role) => ({
  name: `Person ${n}`,
  email: `person${n}@example.com`,
  phone: '+8801712345678',
  password,
  role,
});

const signIn = async (email) => {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.token;
};
const as = (token) => ({ Authorization: `Bearer ${token}` });

let adminToken;
let admin;

beforeAll(async () => {
  await startTestDb();
  await User.init();
});
afterAll(stopTestDb);
beforeEach(async () => {
  await clearTestDb();
  admin = await createUser({ ...person(0, 'admin'), status: 'active' });
  adminToken = await signIn(admin.email);
});

describe('admin access control', () => {
  it('requires a token', async () => {
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  it.each(['customer', 'farmer', 'rider', 'hub_manager'])('forbids a %s', async (role) => {
    await createUser({ ...person(1, role), status: 'active' });
    const token = await signIn('person1@example.com');
    const res = await request(app).get('/api/admin/users').set(as(token));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/users', () => {
  beforeEach(async () => {
    await createUser({ ...person(1, 'farmer'), status: 'pending' });
    await createUser({ ...person(2, 'farmer'), status: 'active' });
    await createUser({ ...person(3, 'rider'), status: 'pending' });
  });

  it('lists pending farmers and riders for review', async () => {
    const res = await request(app).get('/api/admin/users?status=pending').set(as(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.users.map((u) => u.email).sort()).toEqual([
      'person1@example.com',
      'person3@example.com',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt\$/);
  });

  it('filters by role and paginates', async () => {
    const res = await request(app)
      .get('/api/admin/users?role=farmer&limit=1&page=2')
      .set(as(adminToken));
    expect(res.body).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(res.body.users).toHaveLength(1);
  });

  it('rejects unknown filter values', async () => {
    const res = await request(app).get('/api/admin/users?role=emperor').set(as(adminToken));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/users/:id/status', () => {
  it('approves a pending farmer and records who reviewed them', async () => {
    const farmer = await createUser({ ...person(1, 'farmer'), status: 'pending' });
    const res = await request(app)
      .patch(`/api/admin/users/${farmer.id}/status`)
      .set(as(adminToken))
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('active');
    expect(res.body.user.reviewedBy).toBe(String(admin._id));
    expect(res.body.user.reviewedAt).toBeTypeOf('string');
  });

  it('suspends an account with a reason and locks it out immediately', async () => {
    const customer = await createUser({ ...person(1, 'customer'), status: 'active' });
    const token = await signIn(customer.email);

    await request(app)
      .patch(`/api/admin/users/${customer.id}/status`)
      .set(as(adminToken))
      .send({ status: 'suspended', reason: 'Fake orders' })
      .expect(200);

    expect((await request(app).get('/api/auth/me').set(as(token))).status).toBe(403);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: customer.email, password });
    expect(login.status).toBe(403);
  });

  it('stops an admin from changing their own status', async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${admin.id}/status`)
      .set(as(adminToken))
      .send({ status: 'suspended' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('cannot_modify_self');
  });

  it('rejects an invalid id, an unknown user and a bad status', async () => {
    const patch = (id, body) =>
      request(app).patch(`/api/admin/users/${id}/status`).set(as(adminToken)).send(body);

    expect((await patch('not-an-id', { status: 'active' })).status).toBe(400);
    expect((await patch('65f1c2a4b9d3e8a1c4f7b001', { status: 'active' })).status).toBe(404);
    const user = await createUser({ ...person(1, 'customer'), status: 'active' });
    expect((await patch(user.id, { status: 'pending' })).status).toBe(400);
  });
});

describe('POST /api/admin/users', () => {
  it('creates an active hub manager', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set(as(adminToken))
      .send({ ...person(5, 'hub_manager'), phone: '01712345678' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'hub_manager', status: 'active' });
    expect(await signIn('person5@example.com')).toBeTypeOf('string');
  });

  it('refuses to create customers, farmers or riders through this route', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set(as(adminToken))
      .send({ ...person(6, 'customer'), phone: '01712345678' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set(as(adminToken))
      .send({ ...person(0, 'hub_manager'), phone: '01712345678' });
    expect(res.status).toBe(409);
  });
});
