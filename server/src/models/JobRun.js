import mongoose from 'mongoose';
import { JOB_NAME_PATTERN, JOB_STATUSES } from '../constants/jobs.js';
import { cleanJson } from './geo.js';

const THIRTY_DAYS = 30 * 24 * 60 * 60;

/** The history of every job run, for finding out what happened. Expires after 30 days. */
const jobRunSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, match: JOB_NAME_PATTERN, maxlength: 60 },
    instance: { type: String, required: true, maxlength: 100 },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    durationMs: { type: Number, required: true, min: 0 },
    status: { type: String, enum: JOB_STATUSES, required: true },
    summary: { type: mongoose.Schema.Types.Mixed },
    error: { type: String, maxlength: 300 },
  },
  { timestamps: false },
);

jobRunSchema.index({ name: 1, startedAt: -1 });
jobRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: THIRTY_DAYS });

jobRunSchema.set('toJSON', { transform: cleanJson });

export const JobRun = mongoose.model('JobRun', jobRunSchema);
