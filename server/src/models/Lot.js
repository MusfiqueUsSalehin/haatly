import mongoose from 'mongoose';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson } from './geo.js';

export const LOT_STATUS = Object.freeze({
  LISTED: 'listed',
  SOLD_OUT: 'sold_out',
  EXPIRED: 'expired',
  WITHDRAWN: 'withdrawn',
});
export const LOT_STATUSES = Object.freeze(Object.values(LOT_STATUS));

/**
 * The one definition of "can be sold right now". Checkout must use it, so a lot that is
 * expired, withdrawn or empty can never be sold, even if no cleanup job has run yet.
 */
export function sellableFilter(now = new Date()) {
  return { status: LOT_STATUS.LISTED, remainingKg: { $gt: 0 }, expiresAt: { $gt: now } };
}

/** One batch of produce a farmer has listed at a collection hub. */
const lotSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    produceSlug: { type: String, required: true, trim: true, match: CODE_PATTERN },
    hubCode: { type: String, required: true, trim: true, match: CODE_PATTERN },

    // Worked out by the server from the crate grading, never taken from the farmer.
    grade: { type: String, enum: ['A', 'B', 'C'], required: true },
    defects: { type: [String], default: [] },
    triageSource: { type: String, enum: ['rules', 'model'], required: true },

    quantityKg: { type: Number, required: true, min: 1, max: 5000 },
    remainingKg: { type: Number, required: true, min: 0 },

    shelfLifeDays: { type: Number, required: true, min: 1, max: 60, validate: Number.isInteger },
    listedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },

    // Snapshots taken at listing, so later bazar price changes do not rewrite history.
    bazarPriceBdt: { type: Number, required: true, min: 1 },
    farmerFloorBdt: { type: Number, required: true, min: 0 },
    priceBdt: { type: Number, required: true, min: 1 },

    status: { type: String, enum: LOT_STATUSES, default: LOT_STATUS.LISTED, required: true },
  },
  { timestamps: true },
);

lotSchema.index({ status: 1, expiresAt: 1 });
lotSchema.index({ farmer: 1, createdAt: -1 });
lotSchema.index({ produceSlug: 1, status: 1 });

lotSchema.pre('validate', function () {
  if (this.remainingKg > this.quantityKg) {
    this.invalidate('remainingKg', 'cannot be more than quantityKg');
  }
  if (this.expiresAt <= this.listedAt) {
    this.invalidate('expiresAt', 'must be after listedAt');
  }
  if (this.status === LOT_STATUS.LISTED && this.remainingKg <= 0) {
    this.invalidate('status', 'a listed lot must still have produce left');
  }
});

lotSchema.methods.isSellable = function (now = new Date()) {
  return this.status === LOT_STATUS.LISTED && this.remainingKg > 0 && this.expiresAt > now;
};

lotSchema.set('toJSON', { transform: cleanJson });

export const Lot = mongoose.model('Lot', lotSchema);
