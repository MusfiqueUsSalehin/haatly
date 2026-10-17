import { describe, expect, it } from 'vitest';
import { checkCatalogData } from '../../src/seed/checkCatalog.js';
import { cities } from '../../src/seed/data/cities.js';
import { hubs } from '../../src/seed/data/hubs.js';
import { produce } from '../../src/seed/data/produce.js';
import { zones } from '../../src/seed/data/zones.js';

const data = { cities, zones, hubs, produce };
const clone = () => structuredClone(data);

describe('seed catalog data', () => {
  it('is internally consistent', () => {
    expect(checkCatalogData(data)).toEqual([]);
  });

  it('gives every city zones, a depot and at least one supplying hub', () => {
    for (const city of cities) {
      expect(zones.some((z) => z.cityCode === city.code)).toBe(true);
      expect(hubs.some((h) => h.kind === 'depot' && h.cityCode === city.code)).toBe(true);
      expect(
        hubs.some((h) => h.kind === 'collection' && h.serves.some((s) => s.cityCode === city.code)),
      ).toBe(true);
    }
  });

  it('keeps leafy produce short-lived and staples long-lived', () => {
    for (const item of produce.filter((p) => p.category === 'leafy')) {
      expect(item.shelfLifeDays).toBeLessThanOrEqual(3);
    }
    expect(produce.find((p) => p.slug === 'potato').shelfLifeDays).toBeGreaterThanOrEqual(14);
  });

  it('has a sensible amount of data', () => {
    expect(produce.length).toBeGreaterThanOrEqual(20);
    expect(hubs.filter((h) => h.kind === 'collection').length).toBeGreaterThanOrEqual(5);
  });
});

describe('checkCatalogData', () => {
  it('flags a zone that points at an unknown city', () => {
    const bad = clone();
    bad.zones[0].cityCode = 'sylhet';
    expect(checkCatalogData(bad).join('\n')).toMatch(/unknown city sylhet/);
  });

  it('flags a hub that supplies an unknown city', () => {
    const bad = clone();
    bad.hubs[0].serves.push({ cityCode: 'khulna', truckHours: 3 });
    expect(checkCatalogData(bad).join('\n')).toMatch(/serves unknown city khulna/);
  });

  it('flags duplicate codes and slugs', () => {
    const bad = clone();
    bad.hubs.push({ ...bad.hubs[0] });
    bad.produce.push({ ...bad.produce[0] });
    const text = checkCatalogData(bad).join('\n');
    expect(text).toMatch(/duplicate hub code/);
    expect(text).toMatch(/duplicate produce slug/);
  });

  it('flags a missing Bangla name and out-of-country coordinates', () => {
    const bad = clone();
    bad.produce[0].nameBn = 'Tomato';
    bad.hubs[0].location = { lat: 90, lng: 23 };
    const text = checkCatalogData(bad).join('\n');
    expect(text).toMatch(/nameBn must be Bangla/);
    expect(text).toMatch(/outside Bangladesh/);
  });

  it('flags a city nobody supplies', () => {
    const bad = clone();
    bad.hubs = bad.hubs.filter((h) => h.kind === 'depot');
    expect(checkCatalogData(bad).join('\n')).toMatch(/no collection hub supplies it/);
  });

  it('flags bad produce numbers', () => {
    const bad = clone();
    bad.produce[0].bazarPriceBdt = 0;
    bad.produce[1].shelfLifeDays = 1.5;
    bad.produce[2].peakMonths = [0, 13];
    const text = checkCatalogData(bad).join('\n');
    expect(text).toMatch(/price must be positive/);
    expect(text).toMatch(/shelfLifeDays/);
    expect(text).toMatch(/peakMonths/);
  });
});
