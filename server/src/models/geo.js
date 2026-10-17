import mongoose from 'mongoose';

/** A rough bounding box around Bangladesh. It catches swapped or mistyped coordinates. */
export const BD_BOUNDS = Object.freeze({ lat: [20.5, 26.7], lng: [88.0, 92.8] });

/** A plain latitude/longitude pair (not GeoJSON); distances are computed in code. */
export const pointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true, min: BD_BOUNDS.lat[0], max: BD_BOUNDS.lat[1] },
    lng: { type: Number, required: true, min: BD_BOUNDS.lng[0], max: BD_BOUNDS.lng[1] },
  },
  { _id: false },
);

/** Shared toJSON transform: drop Mongo internals from API responses. */
export function cleanJson(_doc, ret) {
  delete ret._id;
  delete ret.__v;
  return ret;
}
