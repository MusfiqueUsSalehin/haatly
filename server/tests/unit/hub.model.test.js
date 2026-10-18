import { describe, expect, it } from 'vitest';
import { Hub } from '../../src/models/Hub.js';
import { errorsOf } from '../helpers/errorsOf.js';

const collection = {
  code: 'jashore',
  nameEn: 'Jashore Hub',
  nameBn: 'যশোর হাব',
  kind: 'collection',
  location: { lat: 23.1664, lng: 89.2081 },
  serves: [{ cityCode: 'dhaka', truckHours: 5 }],
};
const depot = {
  code: 'dhaka-depot',
  nameEn: 'Dhaka Depot',
  nameBn: 'ঢাকা ডিপো',
  kind: 'depot',
  location: { lat: 23.764, lng: 90.394 },
  cityCode: 'dhaka',
};

describe('Hub', () => {
  it('accepts a valid collection hub and a valid depot', async () => {
    expect(await errorsOf(new Hub(collection))).toEqual({});
    expect(await errorsOf(new Hub(depot))).toEqual({});
  });

  it('requires a collection hub to supply at least one city', async () => {
    expect(await errorsOf(new Hub({ ...collection, serves: [] }))).toHaveProperty('serves');
  });

  it('rejects a collection hub that sits inside a city', async () => {
    expect(await errorsOf(new Hub({ ...collection, cityCode: 'dhaka' }))).toHaveProperty(
      'cityCode',
    );
  });

  it('rejects duplicate cities and unrealistic truck times', async () => {
    const twice = { ...collection, serves: [collection.serves[0], collection.serves[0]] };
    expect(await errorsOf(new Hub(twice))).toHaveProperty('serves');
    const tooLong = { ...collection, serves: [{ cityCode: 'dhaka', truckHours: 40 }] };
    expect(Object.keys(await errorsOf(new Hub(tooLong))).join()).toContain('truckHours');
  });

  it('requires a depot to name its city and supply nothing else', async () => {
    expect(await errorsOf(new Hub({ ...depot, cityCode: undefined }))).toHaveProperty('cityCode');
    const withServes = { ...depot, serves: [{ cityCode: 'dhaka', truckHours: 1 }] };
    expect(await errorsOf(new Hub(withServes))).toHaveProperty('serves');
  });

  it('rejects an unknown kind', async () => {
    expect(await errorsOf(new Hub({ ...collection, kind: 'warehouse' }))).toHaveProperty('kind');
  });
});
