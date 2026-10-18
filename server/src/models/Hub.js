import mongoose from 'mongoose';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson, pointSchema } from './geo.js';

export const HUB_KINDS = Object.freeze(['collection', 'depot']);

/**
 * collection: farm-side hub where farmers drop produce. It names the cities it can
 *             truck to and how long that trip takes, so a city's shelf is only ever
 *             built from produce that can reach it fresh.
 * depot:      city-side hub where trucks unload and riders start their runs.
 */
const hubSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, match: CODE_PATTERN },
    nameEn: { type: String, required: true, trim: true, maxlength: 80 },
    nameBn: { type: String, required: true, trim: true, maxlength: 80 },
    kind: { type: String, enum: HUB_KINDS, required: true },
    district: { type: String, trim: true, maxlength: 80 },
    location: { type: pointSchema, required: true },
    // Depots only: the city they sit in.
    cityCode: { type: String, trim: true, match: CODE_PATTERN },
    // Collection hubs only: the cities they supply and the planning truck time to each.
    serves: {
      type: [
        new mongoose.Schema(
          {
            cityCode: { type: String, required: true, trim: true, match: CODE_PATTERN },
            truckHours: { type: Number, required: true, min: 0.25, max: 24 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

hubSchema.index({ kind: 1, 'serves.cityCode': 1 });

hubSchema.pre('validate', function () {
  if (this.kind === 'depot') {
    if (!this.cityCode) this.invalidate('cityCode', 'a depot must belong to a city');
    if (this.serves.length > 0) this.invalidate('serves', 'a depot does not supply other cities');
  }
  if (this.kind === 'collection') {
    if (this.serves.length === 0) {
      this.invalidate('serves', 'a collection hub must supply at least one city');
    }
    if (this.cityCode) this.invalidate('cityCode', 'a collection hub does not sit inside a city');
    const codes = this.serves.map((s) => s.cityCode);
    if (new Set(codes).size !== codes.length) {
      this.invalidate('serves', 'each city may be listed only once');
    }
  }
});

hubSchema.set('toJSON', { transform: cleanJson });

export const Hub = mongoose.model('Hub', hubSchema);
