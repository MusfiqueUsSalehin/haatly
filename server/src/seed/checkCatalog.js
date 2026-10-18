import { PRODUCE_CATEGORIES } from '../constants/produce.js';
import { BD_BOUNDS } from '../models/geo.js';
import { CODE_PATTERN } from '../utils/codes.js';

const BENGALI = /[\u0980-\u09FF]/;

function duplicates(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function inBounds({ lat, lng } = {}) {
  return (
    lat >= BD_BOUNDS.lat[0] &&
    lat <= BD_BOUNDS.lat[1] &&
    lng >= BD_BOUNDS.lng[0] &&
    lng <= BD_BOUNDS.lng[1]
  );
}

/**
 * Check seed data for mistakes the database cannot catch: broken cross-references,
 * duplicate codes, missing Bangla names, cities nobody supplies. Returns a list of
 * human-readable problems; an empty list means the data is consistent.
 */
export function checkCatalogData({ cities, zones, hubs, produce }) {
  const problems = [];
  const cityCodes = new Set(cities.map((c) => c.code));

  for (const [label, list, key] of [
    ['city', cities, 'code'],
    ['zone', zones, 'code'],
    ['hub', hubs, 'code'],
    ['produce', produce, 'slug'],
  ]) {
    for (const dup of duplicates(list.map((item) => item[key]))) {
      problems.push(`duplicate ${label} ${key}: ${dup}`);
    }
    for (const item of list) {
      if (!CODE_PATTERN.test(item[key])) problems.push(`${label} ${item[key]}: invalid ${key}`);
      if (!BENGALI.test(item.nameBn ?? '')) {
        problems.push(`${label} ${item[key]}: nameBn must be Bangla`);
      }
    }
  }

  const places = [
    ...cities.map((c) => ({ id: c.code, point: c.center })),
    ...zones.map((z) => ({ id: z.code, point: z.center })),
    ...hubs.map((h) => ({ id: h.code, point: h.location })),
  ];
  for (const place of places) {
    if (!inBounds(place.point)) problems.push(`${place.id}: coordinates are outside Bangladesh`);
  }

  for (const zone of zones) {
    if (!cityCodes.has(zone.cityCode)) {
      problems.push(`zone ${zone.code}: unknown city ${zone.cityCode}`);
    }
    if (!zone.code.startsWith(`${zone.cityCode}-`)) {
      problems.push(`zone ${zone.code}: code must start with ${zone.cityCode}-`);
    }
  }

  for (const hub of hubs) {
    if (hub.kind === 'depot' && !cityCodes.has(hub.cityCode)) {
      problems.push(`depot ${hub.code}: unknown city ${hub.cityCode}`);
    }
    for (const s of hub.serves ?? []) {
      if (!cityCodes.has(s.cityCode)) {
        problems.push(`hub ${hub.code}: serves unknown city ${s.cityCode}`);
      }
    }
  }

  for (const city of cities) {
    if (!zones.some((z) => z.cityCode === city.code)) {
      problems.push(`city ${city.code}: has no zones`);
    }
    if (!hubs.some((h) => h.kind === 'depot' && h.cityCode === city.code)) {
      problems.push(`city ${city.code}: has no depot`);
    }
    const supplied = hubs.some(
      (h) => h.kind === 'collection' && h.serves.some((s) => s.cityCode === city.code),
    );
    if (!supplied) problems.push(`city ${city.code}: no collection hub supplies it`);
  }

  for (const item of produce) {
    if (!PRODUCE_CATEGORIES.includes(item.category)) {
      problems.push(`produce ${item.slug}: unknown category`);
    }
    if (!(item.bazarPriceBdt > 0)) problems.push(`produce ${item.slug}: price must be positive`);
    if (!Number.isInteger(item.shelfLifeDays) || item.shelfLifeDays < 1) {
      problems.push(`produce ${item.slug}: shelfLifeDays must be a whole number of days`);
    }
    if (item.peakMonths.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
      problems.push(`produce ${item.slug}: peakMonths must be 1-12`);
    }
  }

  return problems;
}
