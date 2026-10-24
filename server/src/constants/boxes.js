/**
 * Box sizes. `items` is the most produce lines a box can hold, and every line weighs
 * weightKg / items. `share` is the part of a city's stock aimed at each size.
 */
export const BOX_TIERS = Object.freeze({
  mini: Object.freeze({ weightKg: 3, items: 3, share: 0.3 }),
  family: Object.freeze({ weightKg: 6, items: 4, share: 0.45 }),
  bulk: Object.freeze({ weightKg: 12, items: 6, share: 0.25 }),
});

export const TIER_NAMES = Object.freeze(Object.keys(BOX_TIERS));

/** Biggest share first: the order used to break ties when handing out lots. */
export const TIERS_BY_SHARE = Object.freeze(
  [...TIER_NAMES].sort((a, b) => BOX_TIERS[b].share - BOX_TIERS[a].share),
);

/** A box needs at least this many different produce lines to be worth selling. */
export const MIN_ITEMS = 2;

/** A produce line must hold enough stock for at least this many boxes. */
export const MIN_UNITS_PER_LINE = 2;

export const kgPerItem = (tier) => BOX_TIERS[tier].weightKg / BOX_TIERS[tier].items;
