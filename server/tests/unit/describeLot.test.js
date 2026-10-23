import { describe, expect, it } from 'vitest';
import { Lot } from '../../src/models/Lot.js';
import { describeLot } from '../../src/services/lots/describeLot.js';

const NOW = new Date('2026-10-17T06:00:00Z');
const lot = (overrides) =>
  new Lot({
    code: 'LOT-ABCD2345',
    quantityKg: 100,
    remainingKg: 60,
    priceBdt: 56,
    farmerFloorBdt: 28,
    expiresAt: new Date(NOW.getTime() + 90 * 3600 * 1000),
    ...overrides,
  });

describe('describeLot', () => {
  it('adds sold kilos, hours left and the farmer payout', () => {
    expect(describeLot(lot(), NOW)).toMatchObject({
      code: 'LOT-ABCD2345',
      soldKg: 40,
      hoursToExpiry: 90,
      farmerPayoutPerKgBdt: 40.32,
    });
  });

  it('shows the floor when the price is low', () => {
    expect(describeLot(lot({ priceBdt: 30 }), NOW).farmerPayoutPerKgBdt).toBe(28);
  });

  it('shows zero hours once the lot has expired', () => {
    const past = lot({ expiresAt: new Date(NOW.getTime() - 5 * 3600 * 1000) });
    expect(describeLot(past, NOW).hoursToExpiry).toBe(0);
  });

  it('hides mongo internals', () => {
    const out = describeLot(lot(), NOW);
    expect(out._id).toBeUndefined();
    expect(out.__v).toBeUndefined();
  });
});
