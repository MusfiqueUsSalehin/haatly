import mongoose from 'mongoose';
import { PRODUCE_CATEGORIES } from '../constants/produce.js';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson } from './geo.js';

const uniqueSortedMonths = (value) =>
  Array.isArray(value) ? [...new Set(value)].sort((a, b) => a - b) : value;

/** One kind of produce we can sell, with the reference data the pricing engine needs. */
const produceSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, match: CODE_PATTERN },
    nameEn: { type: String, required: true, trim: true, maxlength: 80 },
    nameBn: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, enum: PRODUCE_CATEGORIES, required: true },
    // Typical kacha-bazar (open market) price per kg in BDT. Admins keep it current.
    bazarPriceBdt: { type: Number, required: true, min: 1, max: 5000 },
    bazarPriceUpdatedAt: { type: Date },
    // How many days it stays sellable at ambient temperature.
    shelfLifeDays: { type: Number, required: true, min: 1, max: 60, validate: Number.isInteger },
    // Months (1-12) of seasonal glut, when supply is high and prices are low.
    // Empty means no strong season.
    peakMonths: {
      type: [Number],
      default: [],
      set: uniqueSortedMonths,
      validate: {
        validator: (months) => months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12),
        message: 'peakMonths must be whole numbers from 1 to 12',
      },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

produceSchema.index({ active: 1, category: 1 });

produceSchema.set('toJSON', { transform: cleanJson });

export const Produce = mongoose.model('Produce', produceSchema);
