import mongoose from 'mongoose';

export const FALLBACK_REASONS = Object.freeze([
  'provider_off',
  'budget',
  'error',
  'timeout',
  'invalid_output',
]);

const NINETY_DAYS = 90 * 24 * 60 * 60;

/** One row per AI feature call: who answered, why, how long, and how many tokens it cost. */
const aiLogSchema = new mongoose.Schema(
  {
    feature: { type: String, required: true, trim: true, maxlength: 60 },
    // Who produced the answer the user actually received.
    source: { type: String, enum: ['rules', 'model'], required: true },
    // True when a request was sent to the model, even if the answer was then discarded.
    modelCalled: { type: Boolean, default: false },
    model: { type: String, trim: true, maxlength: 80 },
    // Set when the rules answered instead of the model.
    fallbackReason: { type: String, enum: FALLBACK_REASONS },
    latencyMs: { type: Number, min: 0 },
    inputTokens: { type: Number, min: 0 },
    outputTokens: { type: Number, min: 0 },
    error: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

aiLogSchema.index({ modelCalled: 1, createdAt: -1 });
// Logs are for monitoring and budgets, so they expire on their own.
aiLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS });

export const AiLog = mongoose.model('AiLog', aiLogSchema);
