import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from '../helpers/testApp.js';

describe('request body limits', () => {
  const app = makeTestApp();
  const big = { padding: 'a'.repeat(300_000) };

  it('accepts a large body on the AI routes (it is rejected later, for no token)', async () => {
    const res = await request(app).post('/api/ai/triage').send(big);
    expect(res.status).toBe(401);
  });

  it('still rejects the same body everywhere else', async () => {
    const res = await request(app).post('/api/auth/login').send(big);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });
});
