import mongoose from 'mongoose';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson, pointSchema } from './geo.js';

/** A delivery area inside a city. Riders will be assigned to zones in a later step. */
const zoneSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, match: CODE_PATTERN },
    cityCode: { type: String, required: true, trim: true, match: CODE_PATTERN, index: true },
    nameEn: { type: String, required: true, trim: true, maxlength: 80 },
    nameBn: { type: String, required: true, trim: true, maxlength: 80 },
    center: { type: pointSchema, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// A zone code always starts with its city code ("dhaka-mirpur"), so codes stay unambiguous.
zoneSchema.pre('validate', function () {
  if (this.code && this.cityCode && !this.code.startsWith(`${this.cityCode}-`)) {
    this.invalidate('code', `must start with "${this.cityCode}-"`);
  }
});

zoneSchema.set('toJSON', { transform: cleanJson });

export const Zone = mongoose.model('Zone', zoneSchema);
