import mongoose from 'mongoose';
import { CODE_PATTERN } from '../utils/codes.js';
import { cleanJson, pointSchema } from './geo.js';

const citySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, match: CODE_PATTERN },
    nameEn: { type: String, required: true, trim: true, maxlength: 80 },
    nameBn: { type: String, required: true, trim: true, maxlength: 80 },
    center: { type: pointSchema, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

citySchema.set('toJSON', { transform: cleanJson });

export const City = mongoose.model('City', citySchema);
