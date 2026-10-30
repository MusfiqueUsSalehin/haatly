import mongoose from 'mongoose';
import { VEHICLE_NAMES } from '../constants/dispatch.js';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson } from './geo.js';

/** What dispatch needs to know about a rider. Set by an admin; the rider toggles onDuty. */
const riderProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    cityCode: { type: String, required: true, trim: true, match: CODE_PATTERN },
    vehicle: { type: String, enum: VEHICLE_NAMES, required: true },
    zoneCodes: { type: [String], default: [] },
    // Dispatch only ever uses riders who are on duty.
    onDuty: { type: Boolean, default: false },
  },
  { timestamps: true },
);

riderProfileSchema.index({ cityCode: 1, onDuty: 1 });

riderProfileSchema.pre('validate', function () {
  if (this.zoneCodes.some((zone) => !zone.startsWith(`${this.cityCode}-`))) {
    this.invalidate('zoneCodes', `every zone must belong to ${this.cityCode}`);
  }
  if (new Set(this.zoneCodes).size !== this.zoneCodes.length) {
    this.invalidate('zoneCodes', 'each zone may be listed only once');
  }
});

riderProfileSchema.set('toJSON', { transform: cleanJson });

export const RiderProfile = mongoose.model('RiderProfile', riderProfileSchema);
