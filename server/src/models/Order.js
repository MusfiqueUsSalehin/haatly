import mongoose from 'mongoose';
import { TIER_NAMES } from '../constants/boxes.js';
import {
  MAX_ITEMS,
  MAX_QTY_PER_ITEM,
  ORDER_CODE_PATTERN,
  ORDER_STATUS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from '../constants/orders.js';
import { orderTotals } from '../services/orders/orderPolicy.js';
import { BD_MOBILE_PATTERN, CODE_PATTERN } from '../utils/codes.js';
import { cleanJson } from './geo.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

const lineSchema = new mongoose.Schema(
  {
    produceSlug: { type: String, required: true, match: CODE_PATTERN },
    kgPerBox: { type: Number, required: true, min: 0.5 },
  },
  { _id: false },
);

// Exactly which kilos came from which lot, at which price. Used for payouts and cancels.
const allocationSchema = new mongoose.Schema(
  {
    lotCode: { type: String, required: true },
    produceSlug: { type: String, required: true, match: CODE_PATTERN },
    kg: { type: Number, required: true, min: 0.001 },
    pricePerKgBdt: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const itemSchema = new mongoose.Schema(
  {
    boxCode: { type: String, required: true, match: CODE_PATTERN },
    tier: { type: String, enum: TIER_NAMES, required: true },
    qty: {
      type: Number,
      required: true,
      min: 1,
      max: MAX_QTY_PER_ITEM,
      validate: Number.isInteger,
    },
    // The price the customer was shown for one box. They pay exactly this.
    unitPriceBdt: { type: Number, required: true, min: 1, validate: Number.isInteger },
    lines: { type: [lineSchema], default: [] },
    allocations: {
      type: [allocationSchema],
      validate: { validator: (list) => list.length > 0, message: 'an item needs allocations' },
    },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, match: ORDER_CODE_PATTERN },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    recipientName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    phone: { type: String, required: true, match: BD_MOBILE_PATTERN },
    cityCode: { type: String, required: true, match: CODE_PATTERN },
    zoneCode: { type: String, required: true, match: CODE_PATTERN },
    address: {
      line: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
      landmark: { type: String, trim: true, maxlength: 100 },
    },

    items: { type: [itemSchema], default: [] },
    subtotalBdt: { type: Number, required: true, min: 0 },
    deliveryFeeBdt: { type: Number, required: true, min: 0 },
    totalBdt: { type: Number, required: true, min: 0 },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },

    status: { type: String, enum: ORDER_STATUSES, default: ORDER_STATUS.PLACED },
    statusHistory: {
      type: [
        new mongoose.Schema(
          { status: { type: String, enum: ORDER_STATUSES }, at: { type: Date } },
          { _id: false },
        ),
      ],
      default: [],
    },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true, maxlength: 200 },
    deliveredAt: { type: Date },

    // The delivery code itself is never stored: see utils/otp.js.
    otpSalt: { type: String, required: true, select: false },
    otpAttempts: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1, cityCode: 1, zoneCode: 1 });

orderSchema.pre('validate', function () {
  if (this.items.length < 1 || this.items.length > MAX_ITEMS) {
    this.invalidate('items', `an order needs 1 to ${MAX_ITEMS} boxes`);
  }
  const boxCodes = this.items.map((item) => item.boxCode);
  if (new Set(boxCodes).size !== boxCodes.length) {
    this.invalidate('items', 'each box may appear only once');
  }

  // The recorded lot kilos must cover every box exactly.
  for (const item of this.items) {
    const needed = new Map(item.lines.map((l) => [l.produceSlug, round3(l.kgPerBox * item.qty)]));
    const got = new Map();
    for (const a of item.allocations) {
      got.set(a.produceSlug, round3((got.get(a.produceSlug) ?? 0) + a.kg));
    }
    for (const slug of got.keys()) {
      if (!needed.has(slug)) this.invalidate('items', `${slug} is not in box ${item.boxCode}`);
    }
    for (const [slug, kg] of needed) {
      if (Math.abs((got.get(slug) ?? 0) - kg) > 0.001) {
        this.invalidate('items', `allocations for ${slug} do not cover box ${item.boxCode}`);
      }
    }
  }

  const totals = orderTotals(this.items);
  for (const field of ['subtotalBdt', 'deliveryFeeBdt', 'totalBdt']) {
    if (this[field] !== totals[field]) this.invalidate(field, `should be ${totals[field]}`);
  }

  if (this.zoneCode && this.cityCode && !this.zoneCode.startsWith(`${this.cityCode}-`)) {
    this.invalidate('zoneCode', `must be a zone of ${this.cityCode}`);
  }
  if (this.status === ORDER_STATUS.CANCELLED && !this.cancelledAt) {
    this.invalidate('cancelledAt', 'is required for a cancelled order');
  }
  if (this.status === ORDER_STATUS.DELIVERED && !this.deliveredAt) {
    this.invalidate('deliveredAt', 'is required for a delivered order');
  }
});

orderSchema.set('toJSON', {
  transform(doc, ret) {
    cleanJson(doc, ret);
    delete ret.otpSalt;
    return ret;
  },
});

export const Order = mongoose.model('Order', orderSchema);
