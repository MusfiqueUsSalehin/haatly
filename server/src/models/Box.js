import mongoose from 'mongoose';
import { BOX_TIERS, MIN_ITEMS, TIER_NAMES, kgPerItem } from '../constants/boxes.js';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson } from './geo.js';

export const BOX_STATUS = Object.freeze({ LIVE: 'live', CLOSED: 'closed' });

/** One produce line: how many kg goes in each box, and which lots feed it (urgent first). */
const lineSchema = new mongoose.Schema(
  {
    produceSlug: { type: String, required: true, trim: true, match: CODE_PATTERN },
    kgPerBox: { type: Number, required: true, min: 0.5 },
    lotCodes: {
      type: [String],
      validate: {
        validator: (codes) => codes.length > 0,
        message: 'a line needs at least one lot',
      },
    },
  },
  { _id: false },
);

/**
 * A box on a city's shelf for one day. It stores the recipe only. How many boxes are
 * available and what they cost are worked out live from the lots behind each line.
 */
const boxSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, match: CODE_PATTERN },
    cityCode: { type: String, required: true, trim: true, match: CODE_PATTERN },
    tier: { type: String, enum: TIER_NAMES, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    lines: { type: [lineSchema], default: [] },
    weightKg: { type: Number, required: true, min: 1 },
    // The price when the box was built. Live prices come from the lots and only go down.
    builtPriceBdt: { type: Number, required: true, min: 1 },
    status: { type: String, enum: Object.values(BOX_STATUS), default: BOX_STATUS.LIVE },
  },
  { timestamps: true },
);

boxSchema.index({ cityCode: 1, date: 1, status: 1 });

boxSchema.pre('validate', function () {
  const tier = BOX_TIERS[this.tier];
  if (!tier) return; // the enum check reports an unknown tier

  if (this.code !== `${this.cityCode}-${this.tier}-${this.date}`) {
    this.invalidate('code', 'must be "<cityCode>-<tier>-<date>"');
  }
  if (this.lines.length < MIN_ITEMS || this.lines.length > tier.items) {
    this.invalidate('lines', `a ${this.tier} box needs ${MIN_ITEMS} to ${tier.items} lines`);
  }
  const perItem = kgPerItem(this.tier);
  if (this.lines.some((line) => line.kgPerBox !== perItem)) {
    this.invalidate('lines', `every line in a ${this.tier} box must weigh ${perItem} kg`);
  }
  const slugs = this.lines.map((line) => line.produceSlug);
  if (new Set(slugs).size !== slugs.length) {
    this.invalidate('lines', 'each produce may appear only once');
  }
  if (Math.abs(this.weightKg - this.lines.length * perItem) > 0.001) {
    this.invalidate('weightKg', 'must equal the number of lines times the line weight');
  }
});

boxSchema.set('toJSON', { transform: cleanJson });

export const Box = mongoose.model('Box', boxSchema);
