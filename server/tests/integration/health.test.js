import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTestApp } from '../helpers/testApp.js';
import { startTestDb, stopTestDb } from '../helpers/testDb.js';

describe('GET /api/health (with database)', () => {
  const app = makeTestApp();

  beforeAll(startTestDb);
  afterAll(stopTestDb);

  it('reports ok with 200 when MongoDB is connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });
});
