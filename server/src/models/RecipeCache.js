import mongoose from 'mongoose';

const THIRTY_DAYS = 30 * 24 * 60 * 60;

/**
 * A saved model answer for one basket and language, so the same request never pays for
 * the model twice. Only real model answers are stored. Entries expire after 30 days.
 */
const recipeCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, maxlength: 300 },
    result: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

recipeCacheSchema.index({ createdAt: 1 }, { expireAfterSeconds: THIRTY_DAYS });

export const RecipeCache = mongoose.model('RecipeCache', recipeCacheSchema);
