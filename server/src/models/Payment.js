import mongoose from 'mongoose';
import {
  CHARGE_METHODS,
  PAYMENT_CODE_PATTERN,
  PAYMENT_STATUS,
  PAYMENT_STATUS_LIST,
} from '../constants/payments.js';
import { ORDER_CODE_PATTERN } from '../constants/orders.js';
import { cleanJson } from './geo.js';

/** One payment per order. Amounts are whole taka. */
const paymentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, match: PAYMENT_CODE_PATTERN },
    orderCode: { type: String, required: true, unique: true, match: ORDER_CODE_PATTERN },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    method: { type: String, enum: CHARGE_METHODS, required: true },
    provider: { type: String, enum: ['cod', 'sandbox'], required: true },
    amountBdt: { type: Number, required: true, min: 1, validate: Number.isInteger },
    status: { type: String, enum: PAYMENT_STATUS_LIST, default: PAYMENT_STATUS.PENDING },

    // Wallet payments only: the gateway's reference, and when the unpaid hold ends.
    providerRef: { type: String, trim: true, maxlength: 80 },
    expiresAt: { type: Date },

    refundedBdt: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    history: {
      type: [
        new mongoose.Schema(
          {
            status: { type: String, enum: PAYMENT_STATUS_LIST },
            at: { type: Date },
            note: { type: String, maxlength: 200 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

paymentSchema.index({ providerRef: 1 }, { unique: true, sparse: true });
paymentSchema.index({ status: 1, expiresAt: 1 });

paymentSchema.pre('validate', function () {
  if (this.method === 'cod') {
    if (this.provider !== 'cod') this.invalidate('provider', 'cash on delivery has no provider');
    if (this.providerRef) this.invalidate('providerRef', 'cash on delivery has no reference');
    if (this.expiresAt) this.invalidate('expiresAt', 'cash on delivery does not expire');
  }
  if (this.method === 'wallet') {
    if (this.provider === 'cod') this.invalidate('provider', 'a wallet payment needs a provider');
    if (!this.expiresAt) this.invalidate('expiresAt', 'a wallet payment needs a payment window');
    if (this.status === PAYMENT_STATUS.SUCCEEDED && !this.providerRef) {
      this.invalidate('providerRef', 'a successful wallet payment needs a provider reference');
    }
  }

  if (this.refundedBdt > this.amountBdt) {
    this.invalidate('refundedBdt', 'cannot be more than the amount');
  }
  const refunded = this.status === PAYMENT_STATUS.REFUNDED;
  if (refunded && this.refundedBdt !== this.amountBdt) {
    this.invalidate('refundedBdt', 'a refunded payment must be refunded in full');
  }
  if (!refunded && this.refundedBdt !== 0) {
    this.invalidate('refundedBdt', 'only a refunded payment has a refunded amount');
  }
});

paymentSchema.set('toJSON', { transform: cleanJson });

export const Payment = mongoose.model('Payment', paymentSchema);
