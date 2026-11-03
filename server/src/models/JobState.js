import mongoose from 'mongoose';
import { JOB_NAME_PATTERN, JOB_STATUSES } from '../constants/jobs.js';
import { cleanJson } from './geo.js';

/**
 * One row per job: who is running it right now, and how its last run went. A server claims
 * a job by updating this row in one atomic step (see jobs/jobStore.js).
 */
const jobStateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, match: JOB_NAME_PATTERN, maxlength: 60 },
    // Who holds the claim, and until when. A claim that is never released (the server died)
    // simply expires, so a crashed run can never block a job forever.
    lockedBy: { type: String, maxlength: 100, default: null },
    lockedUntil: { type: Date, default: null },
    lastStartedAt: { type: Date },
    lastFinishedAt: { type: Date },
    lastStatus: { type: String, enum: JOB_STATUSES },
    lastError: { type: String, maxlength: 300 },
    lastDurationMs: { type: Number, min: 0 },
  },
  { timestamps: true },
);

jobStateSchema.pre('validate', function () {
  if (this.lastStartedAt && this.lastFinishedAt && this.lastFinishedAt < this.lastStartedAt) {
    this.invalidate('lastFinishedAt', 'cannot be before lastStartedAt');
  }
});

jobStateSchema.set('toJSON', { transform: cleanJson });

export const JobState = mongoose.model('JobState', jobStateSchema);
