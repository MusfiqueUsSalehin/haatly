import {
  BOX_TIERS,
  MIN_ITEMS,
  MIN_UNITS_PER_LINE,
  TIER_NAMES,
  kgPerItem,
} from '../../constants/boxes.js';
import { round2 } from '../pricing/policy.js';
import { weightedPricePerKg } from './live.js';

const HOUR_MS = 60 * 60 * 1000;
const EPSILON = 1e-9;

function groupByProduce(lots) {
  const groups = new Map();
  for (const lot of lots) {
    const group = groups.get(lot.produceSlug) ?? { slug: lot.produceSlug, lots: [], kg: 0 };
    group.lots.push(lot);
    group.kg += lot.remainingKg;
    groups.set(lot.produceSlug, group);
  }
  return [...groups.values()];
}

/** Take up to `items` lines: mix categories first, then fill any empty slots. */
function pickItems(candidates, items) {
  const perCategoryCap = Math.ceil(items / 2);
  const counts = new Map();
  const picked = [];
  const leftOver = [];

  for (const candidate of candidates) {
    const used = counts.get(candidate.category) ?? 0;
    if (picked.length < items && used < perCategoryCap) {
      picked.push(candidate);
      counts.set(candidate.category, used + 1);
    } else {
      leftOver.push(candidate);
    }
  }
  for (const candidate of leftOver) {
    if (picked.length >= items) break;
    picked.push(candidate);
  }
  return picked;
}

/**
 * Build one city's boxes for a day. `lotsByTier` comes from splitByTier(), so every lot
 * feeds exactly one line of one box. Returns { boxes, skipped }.
 */
export function buildCityBoxes({ cityCode, date, lotsByTier, produceBySlug, now = new Date() }) {
  const boxes = [];
  const skipped = [];

  for (const tier of TIER_NAMES) {
    const lots = lotsByTier[tier] ?? [];
    if (lots.length === 0) {
      skipped.push({ tier, reason: 'no_stock' });
      continue;
    }

    const perItemKg = kgPerItem(tier);
    const candidates = groupByProduce(lots)
      .filter(
        (group) =>
          produceBySlug[group.slug] && group.kg + EPSILON >= MIN_UNITS_PER_LINE * perItemKg,
      )
      .map((group) => ({
        ...group,
        category: produceBySlug[group.slug].category,
        hoursLeft: Math.min(...group.lots.map((l) => (new Date(l.expiresAt) - now) / HOUR_MS)),
      }))
      .sort((a, b) => a.hoursLeft - b.hoursLeft || a.slug.localeCompare(b.slug));

    const picked = pickItems(candidates, BOX_TIERS[tier].items);
    if (picked.length < MIN_ITEMS) {
      skipped.push({ tier, reason: 'not_enough_variety' });
      continue;
    }

    const lines = picked.map((group) => ({
      produceSlug: group.slug,
      kgPerBox: perItemKg,
      // Most urgent lot first, so checkout uses up the lots closest to expiry.
      lotCodes: [...group.lots]
        .sort(
          (a, b) => new Date(a.expiresAt) - new Date(b.expiresAt) || a.code.localeCompare(b.code),
        )
        .map((lot) => lot.code),
    }));

    boxes.push({
      code: `${cityCode}-${tier}-${date}`,
      cityCode,
      tier,
      date,
      lines,
      weightKg: round2(lines.length * perItemKg),
      builtPriceBdt: Math.round(
        picked.reduce((sum, group) => sum + perItemKg * weightedPricePerKg(group.lots), 0),
      ),
      unitsAtBuild: Math.floor(Math.min(...picked.map((g) => g.kg / perItemKg)) + EPSILON),
    });
  }

  return { boxes, skipped };
}
