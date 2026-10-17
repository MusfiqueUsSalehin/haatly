import { describe, expect, it } from 'vitest';
import { City } from '../../src/models/City.js';
import { Zone } from '../../src/models/Zone.js';
import { errorsOf } from '../helpers/errorsOf.js';

describe('City', () => {
  const base = {
    code: 'dhaka',
    nameEn: 'Dhaka',
    nameBn: 'ঢাকা',
    center: { lat: 23.8103, lng: 90.4125 },
  };

  it('accepts a valid city', async () => {
    expect(await errorsOf(new City(base))).toEqual({});
  });

  it('rejects a bad code and coordinates outside Bangladesh', async () => {
    expect(await errorsOf(new City({ ...base, code: 'Dhaka City' }))).toHaveProperty('code');
    const swapped = await errorsOf(new City({ ...base, center: { lat: 90.4, lng: 23.8 } }));
    expect(Object.keys(swapped).join()).toMatch(/center\.lat|center\.lng/);
  });

  it('hides mongo internals in JSON', () => {
    const json = new City(base).toJSON();
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.code).toBe('dhaka');
  });
});

describe('Zone', () => {
  const base = {
    code: 'dhaka-mirpur',
    cityCode: 'dhaka',
    nameEn: 'Mirpur',
    nameBn: 'মিরপুর',
    center: { lat: 23.8223, lng: 90.3654 },
  };

  it('accepts a valid zone', async () => {
    expect(await errorsOf(new Zone(base))).toEqual({});
  });

  it('requires the code to start with its city code', async () => {
    const errors = await errorsOf(new Zone({ ...base, code: 'mirpur' }));
    expect(errors.code.message).toContain('dhaka-');
    expect(await errorsOf(new Zone({ ...base, cityCode: 'chattogram' }))).toHaveProperty('code');
  });
});
