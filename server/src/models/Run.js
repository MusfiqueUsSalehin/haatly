import mongoose from 'mongoose';
import {
  RUN_CODE_PATTERN,
  RUN_STATUS,
  RUN_STATUSES,
  STOP_STATUSES,
} from '../constants/dispatch.js';
import { ORDER_CODE_PATTERN } from '../constants/orders.js';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson } from './geo.js';

const stopSchema = new mongoose.Schema(
  {
    orderCode: { type: String, required: true, match: ORDER_CODE_PATTERN },
    zoneCode: { type: String, required: true, match: CODE_PATTERN },
    weightKg: { type: Number, required: true, min: 0 },
    status: { type: String, enum: STOP_STATUSES, default: 'pending' },
    deliveredAt: { type: Date },
    failReason: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false },
);

/** One trip of one rider: an ordered list of stops, each with its own status. */
const runSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, match: RUN_CODE_PATTERN },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cityCode: { type: String, required: true, match: CODE_PATTERN },
    depotCode: { type: String, required: true, match: CODE_PATTERN },
    trip: { type: Number, required: true, min: 1, validate: Number.isInteger },
    status: { type: String, enum: RUN_STATUSES, default: RUN_STATUS.PLANNED },
    stops: {
      type: [stopSchema],
      validate: {
        validator: (stops) => stops.length > 0,
        message: 'a run needs at least one stop',
      },
    },
    weightKg: { type: Number, required: true, min: 0 },
    distanceKm: { type: Number, required: true, min: 0 },
    offZoneStops: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

runSchema.index({ rider: 1, status: 1, createdAt: -1 });
runSchema.index({ cityCode: 1, status: 1, createdAt: -1 });
// A rider can only be out on one run at a time, and the database enforces it.
runSchema.index(
  { rider: 1 },
  {
    unique: true,
    partialFilterExpression: { status: RUN_STATUS.IN_PROGRESS },
    name: 'one_run_in_progress_per_rider',
  },
);

runSchema.pre('validate', function () {
  const codes = this.stops.map((stop) => stop.orderCode);
  if (new Set(codes).size !== codes.length) {
    this.invalidate('stops', 'each order may appear only once');
  }
  if (this.status === RUN_STATUS.IN_PROGRESS && !this.startedAt) {
    this.invalidate('startedAt', 'is required for a run in progress');
  }
  if (this.status === RUN_STATUS.COMPLETED && !this.completedAt) {
    this.invalidate('completedAt', 'is required for a completed run');
  }
});

runSchema.set('toJSON', { transform: cleanJson });

export const Run = mongoose.model('Run', runSchema);
