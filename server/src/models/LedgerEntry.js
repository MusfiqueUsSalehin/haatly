import mongoose from 'mongoose';
import { ORDER_CODE_PATTERN } from '../constants/orders.js';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson } from './geo.js';

export const LEDGER_STATUS = Object.freeze({ UNPAID: 'unpaid', PAID: 'paid' });

// Amounts are rounded to 2 decimals, so allow a little rounding slack in the checks.
const TOLERANCE = 0.011;

/**
 * What a farmer earned from one lot in one delivered order. Written once, when the order
 * is delivered, from the exact kilos and prices the order recorded, and never recalculated.
 * The prices and the floor are snapshots, so later changes cannot rewrite history.
 */
const ledgerEntrySchema = new mongoose.Schema(
  {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderCode: { type: String, required: true, match: ORDER_CODE_PATTERN },
    lotCode: { type: String, required: true, match: /^LOT-[A-Z0-9]{8}$/ },
    produceSlug: { type: String, required: true, match: CODE_PATTERN },
    kg: { type: Number, required: true, min: 0.001 },

    pricePerKgBdt: { type: Number, required: true, min: 1 }, // what customers paid per kg
    floorBdt: { type: Number, required: true, min: 0 }, // the farmer's guaranteed minimum per kg
    revenueBdt: { type: Number, required: true, min: 0 }, // what customers paid for these kilos
    farmerBdt: { type: Number, required: true, min: 0 }, // what the farmer earns
    // Can be negative when the farmer's floor was topped up from the platform's own margin.
    platformBdt: { type: Number, required: true },

    deliveredAt: { type: Date, required: true },
    status: { type: String, enum: Object.values(LEDGER_STATUS), default: LEDGER_STATUS.UNPAID },
    payoutRef: { type: String, trim: true, maxlength: 80 },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

// One entry per lot per order: recording the same delivery twice is impossible.
ledgerEntrySchema.index({ orderCode: 1, lotCode: 1 }, { unique: true });
ledgerEntrySchema.index({ farmer: 1, deliveredAt: -1 });
ledgerEntrySchema.index({ farmer: 1, status: 1 });

ledgerEntrySchema.pre('validate', function () {
  if (Math.abs(this.revenueBdt - this.farmerBdt - this.platformBdt) > TOLERANCE) {
    this.invalidate('platformBdt', 'must equal revenueBdt minus farmerBdt');
  }
  // The farmer's guarantee, enforced at the point money is recorded.
  if (this.farmerBdt + TOLERANCE < this.kg * this.floorBdt) {
    this.invalidate('farmerBdt', 'cannot be less than the guaranteed floor for these kilos');
  }

  if (this.status === LEDGER_STATUS.PAID) {
    if (!this.paidAt) this.invalidate('paidAt', 'is required for a paid entry');
    if (!this.payoutRef) this.invalidate('payoutRef', 'is required for a paid entry');
  } else {
    if (this.paidAt) this.invalidate('paidAt', 'only a paid entry has a payment time');
    if (this.payoutRef) this.invalidate('payoutRef', 'only a paid entry has a payout reference');
  }
});

ledgerEntrySchema.set('toJSON', { transform: cleanJson });

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
