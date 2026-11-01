import { describe, expect, it } from 'vitest';
import { buildEarnings, summarizeEarnings } from '../../src/services/earnings/buildEarnings.js';

const DELIVERED = new Date('2026-10-20T06:00:00Z');
const lot = (code, farmer, farmerFloorBdt) => ({ code, farmer, farmerFloorBdt });
const allocation = (lotCode, produceSlug, kg, pricePerKgBdt) => ({
  lotCode,
  produceSlug,
  kg,
  pricePerKgBdt,
});
const order = (...allocations) => ({
  code: 'ORD-ABCD2345',
  deliveredAt: DELIVERED,
  items: [{ allocations }],
});

describe('buildEarnings', () => {
  it('splits each lot between the farmer and the platform', () => {
    const entries = buildEarnings({
      order: order(
        allocation('LOT-AAAAAAAA', 'tomato', 3, 56),
        allocation('LOT-BBBBBBBB', 'cabbage', 3, 40),
      ),
      lots: [lot('LOT-AAAAAAAA', 'f1', 28), lot('LOT-BBBBBBBB', 'f2', 20)],
    });
    expect(entries).toEqual([
      {
        farmer: 'f1',
        orderCode: 'ORD-ABCD2345',
        lotCode: 'LOT-AAAAAAAA',
        produceSlug: 'tomato',
        kg: 3,
        floorBdt: 28,
        pricePerKgBdt: 56,
        revenueBdt: 168,
        farmerBdt: 120.96, // 3 kg x 40.32 (72 percent of 56)
        platformBdt: 47.04,
        deliveredAt: DELIVERED,
      },
      {
        farmer: 'f2',
        orderCode: 'ORD-ABCD2345',
        lotCode: 'LOT-BBBBBBBB',
        produceSlug: 'cabbage',
        kg: 3,
        floorBdt: 20,
        pricePerKgBdt: 40,
        revenueBdt: 120,
        farmerBdt: 86.4, // 3 kg x 28.80
        platformBdt: 33.6,
        deliveredAt: DELIVERED,
      },
    ]);
  });

  it("tops the farmer up to the floor, at the platform's expense", () => {
    const [entry] = buildEarnings({
      order: order(allocation('LOT-AAAAAAAA', 'tomato', 2, 30)),
      lots: [lot('LOT-AAAAAAAA', 'f1', 28)],
    });
    // 72 percent of 30 is 21.60, below the 28 floor, so the farmer gets 28 a kilo.
    expect(entry).toMatchObject({ revenueBdt: 60, farmerBdt: 56, platformBdt: 4 });
  });

  it('shows a negative platform amount when the floor costs more than the sale brought in', () => {
    const [entry] = buildEarnings({
      order: order(allocation('LOT-AAAAAAAA', 'tomato', 10, 20)),
      lots: [lot('LOT-AAAAAAAA', 'f1', 28)],
    });
    expect(entry).toMatchObject({ revenueBdt: 200, farmerBdt: 280, platformBdt: -80 });
  });

  it('adds up several allocations from the same lot into one entry', () => {
    const entries = buildEarnings({
      order: {
        code: 'ORD-ABCD2345',
        deliveredAt: DELIVERED,
        items: [
          { allocations: [allocation('LOT-AAAAAAAA', 'tomato', 3, 56)] },
          { allocations: [allocation('LOT-AAAAAAAA', 'tomato', 3, 56)] },
        ],
      },
      lots: [lot('LOT-AAAAAAAA', 'f1', 28)],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kg: 6,
      revenueBdt: 336,
      farmerBdt: 241.92,
      pricePerKgBdt: 56,
    });
  });

  it('uses the floor the lot was listed with, not a current one', () => {
    const [entry] = buildEarnings({
      order: order(allocation('LOT-AAAAAAAA', 'tomato', 1, 30)),
      lots: [lot('LOT-AAAAAAAA', 'f1', 10)],
    });
    expect(entry.farmerBdt).toBe(21.6); // 72 percent of 30, since the floor of 10 is lower
  });

  it('never pays a farmer less than their floor, at any price', () => {
    for (let price = 1; price <= 120; price++) {
      const [entry] = buildEarnings({
        order: order(allocation('LOT-AAAAAAAA', 'tomato', 2.5, price)),
        lots: [lot('LOT-AAAAAAAA', 'f1', 28)],
      });
      expect(entry.farmerBdt).toBeGreaterThanOrEqual(70);
      expect(entry.revenueBdt - entry.farmerBdt).toBeCloseTo(entry.platformBdt, 2);
    }
  });

  it('refuses an order that has not been delivered, and a lot that is missing', () => {
    const notDelivered = {
      ...order(allocation('LOT-AAAAAAAA', 'tomato', 1, 56)),
      deliveredAt: undefined,
    };
    expect(() =>
      buildEarnings({ order: notDelivered, lots: [lot('LOT-AAAAAAAA', 'f1', 28)] }),
    ).toThrow(/delivered/);
    expect(() =>
      buildEarnings({ order: order(allocation('LOT-ZZZZZZZZ', 'tomato', 1, 56)), lots: [] }),
    ).toThrow(/LOT-ZZZZZZZZ/);
  });
});

describe('summarizeEarnings', () => {
  const entry = (orderCode, farmerBdt, status = 'unpaid') => ({
    orderCode,
    kg: 3,
    revenueBdt: 168,
    farmerBdt,
    platformBdt: 168 - farmerBdt,
    status,
  });

  it('adds up money, kilos and orders, split by paid and unpaid', () => {
    const summary = summarizeEarnings([
      entry('ORD-AAAAAAAA', 120.96),
      entry('ORD-AAAAAAAA', 86.4),
      entry('ORD-BBBBBBBB', 100, 'paid'),
    ]);
    expect(summary).toEqual({
      kg: 9,
      revenueBdt: 504,
      farmerBdt: 307.36,
      platformBdt: 196.64,
      unpaidBdt: 207.36,
      paidBdt: 100,
      orders: 2,
      entries: 3,
    });
  });

  it('is all zeros for no entries', () => {
    expect(summarizeEarnings([])).toEqual({
      kg: 0,
      revenueBdt: 0,
      farmerBdt: 0,
      platformBdt: 0,
      unpaidBdt: 0,
      paidBdt: 0,
      orders: 0,
      entries: 0,
    });
  });
});
