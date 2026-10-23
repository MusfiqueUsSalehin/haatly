import { describe, expect, it } from 'vitest';
import { LOT_STATUS, Lot, sellableFilter } from '../../src/models/Lot.js';
import { errorsOf } from '../helpers/errorsOf.js';

const listedAt = new Date('2026-10-16T06:00:00Z');
const base = {
  code: 'LOT-ABCD2345',
  farmer: '65f1c2a4b9d3e8a1c4f7b001',
  produceSlug: 'tomato',
  hubCode: 'jashore',
  grade: 'A',
  defects: [],
  triageSource: 'rules',
  quantityKg: 100,
  remainingKg: 100,
  shelfLifeDays: 5,
  listedAt,
  expiresAt: new Date(listedAt.getTime() + 5 * 24 * 3600 * 1000),
  bazarPriceBdt: 70,
  farmerFloorBdt: 28,
  priceBdt: 56,
  status: 'listed',
};

describe('Lot', () => {
  it('accepts a valid lot', async () => {
    expect(await errorsOf(new Lot(base))).toEqual({});
  });

  it('rejects an unknown grade, status or triage source', async () => {
    expect(await errorsOf(new Lot({ ...base, grade: 'Z' }))).toHaveProperty('grade');
    expect(await errorsOf(new Lot({ ...base, status: 'lost' }))).toHaveProperty('status');
    expect(await errorsOf(new Lot({ ...base, triageSource: 'guess' }))).toHaveProperty(
      'triageSource',
    );
  });

  it('rejects more remaining than the original quantity', async () => {
    expect(await errorsOf(new Lot({ ...base, remainingKg: 101 }))).toHaveProperty('remainingKg');
  });

  it('rejects an expiry that is not after the listing time', async () => {
    expect(await errorsOf(new Lot({ ...base, expiresAt: listedAt }))).toHaveProperty('expiresAt');
  });

  it('rejects a listed lot with nothing left, but allows a sold-out one', async () => {
    const empty = { ...base, remainingKg: 0 };
    expect(await errorsOf(new Lot(empty))).toHaveProperty('status');
    expect(await errorsOf(new Lot({ ...empty, status: 'sold_out' }))).toEqual({});
  });

  it('rejects quantities outside 1-5000 kg', async () => {
    expect(await errorsOf(new Lot({ ...base, quantityKg: 0, remainingKg: 0 }))).toHaveProperty(
      'quantityKg',
    );
    expect(await errorsOf(new Lot({ ...base, quantityKg: 6000 }))).toHaveProperty('quantityKg');
  });

  it('is sellable only while listed, in stock and before expiry', () => {
    const before = new Date('2026-10-17T06:00:00Z');
    const after = new Date('2026-10-30T06:00:00Z');
    expect(new Lot(base).isSellable(before)).toBe(true);
    expect(new Lot(base).isSellable(after)).toBe(false);
    for (const status of ['sold_out', 'expired', 'withdrawn']) {
      expect(new Lot({ ...base, status }).isSellable(before)).toBe(false);
    }
    expect(new Lot({ ...base, remainingKg: 0, status: 'sold_out' }).isSellable(before)).toBe(false);
  });

  it('builds the matching database filter', () => {
    const now = new Date('2026-10-17T06:00:00Z');
    expect(sellableFilter(now)).toEqual({
      status: LOT_STATUS.LISTED,
      remainingKg: { $gt: 0 },
      expiresAt: { $gt: now },
    });
  });

  it('hides mongo internals in JSON', () => {
    const json = new Lot(base).toJSON();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.code).toBe('LOT-ABCD2345');
  });

  it('is indexed for the expiry sweep', () => {
    const indexes = Lot.schema.indexes();
    expect(indexes.some(([fields]) => fields.status === 1 && fields.expiresAt === 1)).toBe(true);
  });
});
