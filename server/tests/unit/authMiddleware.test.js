import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticate, requireRole } from '../../src/middleware/auth.js';
import { createTokenService } from '../../src/services/tokenService.js';
import { User } from '../../src/models/User.js';

vi.mock('../../src/models/User.js', () => ({ User: { findById: vi.fn() } }));

const tokens = createTokenService({
  JWT_SECRET: 'unit-test-secret-unit-test-secret-1234',
  JWT_EXPIRES_IN: '1h',
});

const userDoc = (overrides = {}) => ({
  _id: '65f1c2a4b9d3e8a1c4f7b001',
  role: 'customer',
  status: 'active',
  ...overrides,
});

function request(headers = {}) {
  return { get: (name) => headers[name.toLowerCase()] };
}

/** Run a middleware and return the error it throws, or null when it calls next(). */
async function run(middleware, req) {
  const next = vi.fn();
  try {
    await middleware(req, {}, next);
  } catch (err) {
    return { error: err, next };
  }
  return { error: null, next };
}

describe('authenticate', () => {
  const middleware = authenticate(tokens);

  beforeEach(() => vi.resetAllMocks());

  it('rejects a request without an Authorization header', async () => {
    const { error } = await run(middleware, request());
    expect(error.status).toBe(401);
    expect(error.code).toBe('unauthenticated');
  });

  it('rejects a non-bearer scheme', async () => {
    const { error } = await run(middleware, request({ authorization: 'Basic abc' }));
    expect(error.code).toBe('unauthenticated');
  });

  it('rejects a bad token', async () => {
    const { error } = await run(middleware, request({ authorization: 'Bearer nope' }));
    expect(error.status).toBe(401);
    expect(error.code).toBe('invalid_token');
  });

  it('rejects a valid token whose user no longer exists', async () => {
    User.findById.mockResolvedValue(null);
    const token = tokens.sign(userDoc());
    const { error } = await run(middleware, request({ authorization: `Bearer ${token}` }));
    expect(error.code).toBe('invalid_token');
  });

  it('locks out a suspended user even with a valid token', async () => {
    User.findById.mockResolvedValue(userDoc({ status: 'suspended' }));
    const token = tokens.sign(userDoc());
    const { error } = await run(middleware, request({ authorization: `Bearer ${token}` }));
    expect(error.status).toBe(403);
    expect(error.code).toBe('account_suspended');
  });

  it('attaches the user and calls next for a valid session', async () => {
    const doc = userDoc();
    User.findById.mockResolvedValue(doc);
    const token = tokens.sign(doc);
    const req = request({ authorization: `Bearer ${token}` });
    const { error, next } = await run(middleware, req);
    expect(error).toBeNull();
    expect(req.user).toBe(doc);
    expect(next).toHaveBeenCalledOnce();
    expect(User.findById).toHaveBeenCalledWith(doc._id);
  });
});

describe('requireRole', () => {
  const farmerOnly = requireRole('farmer');

  it('rejects an unauthenticated request', async () => {
    const { error } = await run(farmerOnly, {});
    expect(error.status).toBe(401);
  });

  it('rejects the wrong role', async () => {
    const { error } = await run(farmerOnly, { user: userDoc({ role: 'customer' }) });
    expect(error.status).toBe(403);
    expect(error.code).toBe('forbidden');
  });

  it('rejects a farmer who is still pending approval', async () => {
    const { error } = await run(farmerOnly, {
      user: userDoc({ role: 'farmer', status: 'pending' }),
    });
    expect(error.status).toBe(403);
    expect(error.code).toBe('account_pending');
  });

  it('allows an active user with the right role', async () => {
    const { error, next } = await run(farmerOnly, { user: userDoc({ role: 'farmer' }) });
    expect(error).toBeNull();
    expect(next).toHaveBeenCalledOnce();
  });

  it('accepts any of several roles', async () => {
    const staff = requireRole('admin', 'hub_manager');
    const { error } = await run(staff, { user: userDoc({ role: 'hub_manager' }) });
    expect(error).toBeNull();
  });
});
