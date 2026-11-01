import { describe, expect, it } from 'vitest';
import {
  describeEntryForFarmer,
  describeSummaryForFarmer,
} from '../../src/services/earnings/describe.js';

const entry = {
  _id: 'internal',
  farmer: '65f1c2a4b9d3e8a1c4f7b001',
  orderCode: 'ORD-ABCD2345',
  lotCode: 'LOT-AAAAAAAA',
  produceSlug: 'tomato',
  kg: 3,
  pricePerKgBdt: 56,
  floorBdt: 28,
  revenueBdt: 168,
  farmerBdt: 120.96,
  platformBdt: 47.04,
  deliveredAt: new Date('2026-10-20T06:00:00Z'),
  status: 'unpaid',
};

describe('describeEntryForFarmer', () => {
  it('shows the farmer their own money and nothing about the platform', () => {
    const view = describeEntryForFarmer(entry);
    expect(Object.keys(view).sort()).toEqual([
      'deliveredAt',
      'farmerBdt',
      'floorBdt',
      'kg',
      'lotCode',
      'orderCode',
      'pricePerKgBdt',
      'produceSlug',
      'status',
    ]);
    expect(view.farmerBdt).toBe(120.96);
  });

  it('adds the payment time and reference once paid', () => {
    const paidAt = new Date('2026-10-25T06:00:00Z');
    const view = describeEntryForFarmer({ ...entry, status: 'paid', paidAt, payoutRef: 'BKASH-1' });
    expect(view).toMatchObject({ status: 'paid', paidAt, payoutRef: 'BKASH-1' });
  });
});

describe('describeSummaryForFarmer', () => {
  it('drops the revenue and platform figures', () => {
    const summary = {
      kg: 6,
      revenueBdt: 336,
      farmerBdt: 241.92,
      platformBdt: 94.08,
      unpaidBdt: 241.92,
      paidBdt: 0,
      orders: 2,
      entries: 2,
    };
    expect(describeSummaryForFarmer(summary)).toEqual({
      kg: 6,
      farmerBdt: 241.92,
      unpaidBdt: 241.92,
      paidBdt: 0,
      orders: 2,
      entries: 2,
    });
  });
});
