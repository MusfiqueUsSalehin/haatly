import { describe, expect, it } from 'vitest';
import {
  PRICING_POLICY,
  consumerFloorBdt,
  farmerFloorBdt,
  farmerPayoutBdt,
  maxDiscount,
  round2,
  splitRevenue,
} from '../../src/services/pricing/policy.js';

describe('payout policy', () => {
  it('derives the farmer floor from the bazar price', () => {
    expect(farmerFloorBdt(70)).toBe(28);
    expect(farmerFloorBdt(45)).toBe(18);
    expect(farmerFloorBdt(33)).toBe(13.2);
  });

  it('derives the lowest consumer price from the floor', () => {
    expect(consumerFloorBdt(70)).toBe(39);
    expect(consumerFloorBdt(90)).toBe(50);
    expect(consumerFloorBdt(45)).toBe(25);
  });

  it('keeps the farmer at or above the floor at the lowest consumer price', () => {
    for (let bazar = 1; bazar <= 500; bazar++) {
      const atLowest = round2(consumerFloorBdt(bazar) * PRICING_POLICY.farmerShare);
      expect(atLowest).toBeGreaterThanOrEqual(farmerFloorBdt(bazar));
    }
  });

  it('caps the discount at about 44 percent', () => {
    expect(maxDiscount()).toBeCloseTo(0.4444, 3);
  });

  it('pays the farmer their share when the price is high enough', () => {
    expect(farmerPayoutBdt({ priceBdt: 60, floorBdt: 28 })).toBe(43.2);
  });

  it('tops the payout up to the floor when the price is too low', () => {
    expect(farmerPayoutBdt({ priceBdt: 30, floorBdt: 28 })).toBe(28);
  });

  it('splits revenue between the farmer and the platform', () => {
    expect(splitRevenue({ priceBdt: 60, kg: 10, floorBdt: 28 })).toEqual({
      revenueBdt: 600,
      farmerBdt: 432,
      platformBdt: 168,
    });
  });

  it('shows the platform absorbing the difference when the floor is topped up', () => {
    expect(splitRevenue({ priceBdt: 30, kg: 10, floorBdt: 28 }).platformBdt).toBe(20);
    expect(splitRevenue({ priceBdt: 20, kg: 10, floorBdt: 28 })).toEqual({
      revenueBdt: 200,
      farmerBdt: 280,
      platformBdt: -80,
    });
  });

  it('is frozen so nothing can change it at runtime', () => {
    expect(Object.isFrozen(PRICING_POLICY)).toBe(true);
  });
});
