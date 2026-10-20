import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from '../helpers/testApp.js';

describe('GET /api/pricing/policy', () => {
  it('is public and describes the farmer guarantee', async () => {
    const res = await request(makeTestApp()).get('/api/pricing/policy');
    expect(res.status).toBe(200);
    expect(res.body.policy).toMatchObject({
      currency: 'BDT',
      farmerSharePct: 72,
      farmerFloorPct: 40,
      maxDiscountPct: 44,
    });
  });

  it('includes the markdown ladder', async () => {
    const res = await request(makeTestApp()).get('/api/pricing/policy');
    expect(res.body.policy.ladder).toEqual([
      { below: 0.25, discount: 0.2 },
      { below: 0.5, discount: 0.28 },
      { below: 0.75, discount: 0.36 },
    ]);
  });
});
