import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTestApp, makeTestEnv } from '../helpers/testApp.js';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/testDb.js';
import { User } from '../../src/models/User.js';
import { authenticate, requireRole } from '../../src/middleware/auth.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createUser } from '../../src/services/userService.js';

const app = makeTestApp();
const customer = {
  name: 'Rahim Uddin',
  email: 'rahim@example.com',
  phone: '01712345678',
  password: 'a-strong-password',
};

const register = (body) => request(app).post('/api/auth/register').send(body);
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

beforeAll(async () => {
  await startTestDb();
  await User.init();
});
afterAll(stopTestDb);
beforeEach(clearTestDb);

describe('POST /api/auth/register', () => {
  it('creates an active customer and returns a token without the password hash', async () => {
    const res = await register(customer);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({
      email: 'rahim@example.com',
      phone: '+8801712345678',
      role: 'customer',
      status: 'active',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt\$/);
  });

  it('stores only a hash of the password', async () => {
    await register(customer);
    const stored = await User.findOne({ email: customer.email }).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain(customer.password);
  });

  it.each(['farmer', 'rider'])('holds a new %s as pending approval', async (role) => {
    const res = await register({ ...customer, role });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe(role);
    expect(res.body.user.status).toBe('pending');
  });

  it('refuses staff roles at sign-up', async () => {
    for (const role of ['admin', 'hub_manager']) {
      const res = await register({ ...customer, role });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it('ignores a status the client tries to set', async () => {
    const res = await register({ ...customer, role: 'farmer', status: 'active' });
    expect(res.body.user.status).toBe('pending');
  });

  it('rejects a duplicate email regardless of case', async () => {
    await register(customer);
    const res = await register({ ...customer, email: 'RAHIM@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('email_taken');
    expect(await User.countDocuments()).toBe(1);
  });

  it('reports each invalid field', async () => {
    const res = await register({ name: 'R', email: 'nope', phone: '123', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(['name', 'email', 'phone', 'password']),
    );
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await register(customer);
  });

  it('returns a token for the right credentials, ignoring email case', async () => {
    const res = await login('Rahim@Example.com', customer.password);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.email).toBe('rahim@example.com');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await login(customer.email, 'not-the-password');
    const unknownEmail = await login('ghost@example.com', 'not-the-password');
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('blocks a suspended account', async () => {
    await User.updateOne({ email: customer.email }, { status: 'suspended' });
    const res = await login(customer.email, customer.password);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('account_suspended');
  });

  it('lets a pending farmer sign in so they can see their status', async () => {
    await register({ ...customer, email: 'farmer@example.com', role: 'farmer' });
    const res = await login('farmer@example.com', customer.password);
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('pending');
  });
});

describe('GET /api/auth/me', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the signed-in user', async () => {
    const { body } = await register(customer);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('rahim@example.com');
  });

  it('rejects a tampered token', async () => {
    const { body } = await register(customer);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.token}x`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_token');
  });

  it('stops working as soon as the account is suspended', async () => {
    const { body } = await register(customer);
    await User.updateOne({ email: customer.email }, { status: 'suspended' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(403);
  });

  it('stops working when the user has been deleted', async () => {
    const { body } = await register(customer);
    await User.deleteMany({});
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(401);
  });
});

describe('role gate with real accounts', () => {
  const env = makeTestEnv();
  const tokens = createTokenService(env);
  const gated = express();
  gated.get('/farmers-only', authenticate(tokens), requireRole('farmer'), (_req, res) =>
    res.json({ ok: true }),
  );
  gated.use(errorHandler({ error() {} }));

  const get = (token) =>
    request(gated).get('/farmers-only').set('Authorization', `Bearer ${token}`);

  it('keeps a pending farmer out until an admin approves them', async () => {
    const { body } = await register({ ...customer, role: 'farmer' });
    const blocked = await get(body.token);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('account_pending');

    await User.updateOne({ email: customer.email }, { status: 'active' });
    expect((await get(body.token)).status).toBe(200);
  });

  it('keeps customers out of farmer routes', async () => {
    const { body } = await register(customer);
    const res = await get(body.token);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });
});

describe('rate limiting', () => {
  it('blocks repeated failed logins from one client', async () => {
    const limited = makeTestApp({ AUTH_RATE_LIMIT_MAX: '3' });
    await createUser({ ...customer, phone: '+8801712345678', role: 'customer', status: 'active' });
    const attempt = () =>
      request(limited)
        .post('/api/auth/login')
        .send({ email: customer.email, password: 'wrong-wrong' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const res = await attempt();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limited');
  });
});
