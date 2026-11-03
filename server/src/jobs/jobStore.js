import { JobRun } from '../models/JobRun.js';
import { JobState } from '../models/JobState.js';

/**
 * Where scheduled jobs keep their claims and history. claim() is what keeps several
 * servers from running the same job twice.
 */
export function createJobStore() {
  return {
    /**
     * Try to claim a job for `slot`. One atomic update that only succeeds when nobody holds
     * an unexpired claim AND the job has not started since the slot began. The first-ever
     * claim races on the unique name: the loser gets a duplicate-key error, meaning "not
     * claimed". Returns true only for the single winner.
     */
    async claim({ name, slot, now, instanceId, lockMs }) {
      const notLocked = { $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] };
      const due = { $or: [{ lastStartedAt: null }, { lastStartedAt: { $lt: slot } }] };
      try {
        const state = await JobState.findOneAndUpdate(
          { name, $and: [notLocked, due] },
          {
            $set: {
              lockedBy: instanceId,
              lockedUntil: new Date(now.getTime() + lockMs),
              lastStartedAt: now,
            },
          },
          { upsert: true, returnDocument: 'after' },
        );
        return state !== null;
      } catch (err) {
        if (err?.code === 11000) return false;
        throw err;
      }
    },

    /**
     * Release the claim and record how the run went. The state is only updated when this
     * run still owns it (same instance, same start): a run that overran its claim must not
     * overwrite whoever claimed the job after it. The run history is always written.
     */
    async finish({ name, instanceId, startedAt, finishedAt, status, error, summary }) {
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      await JobState.updateOne(
        { name, lockedBy: instanceId, lastStartedAt: startedAt },
        {
          $set: {
            lockedBy: null,
            lockedUntil: null,
            lastFinishedAt: finishedAt,
            lastStatus: status,
            lastDurationMs: durationMs,
            ...(error && { lastError: error }),
          },
          ...(!error && { $unset: { lastError: 1 } }),
        },
      );
      await JobRun.create({
        name,
        instance: instanceId,
        startedAt,
        finishedAt,
        durationMs,
        status,
        ...(summary && { summary }),
        ...(error && { error }),
      });
    },

    list() {
      return JobState.find().sort({ name: 1 }).lean();
    },
  };
}
