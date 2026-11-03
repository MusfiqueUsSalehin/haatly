/** An in-memory job store with the same claim rules as the real one, for fast unit tests. */
export function createMemoryJobStore() {
  const states = new Map();
  const runs = [];

  return {
    states,
    runs,

    async claim({ name, slot, now, instanceId, lockMs }) {
      const state = states.get(name);
      const locked = state?.lockedUntil && state.lockedUntil > now;
      const due = !state?.lastStartedAt || state.lastStartedAt < slot;
      if (locked || !due) return false;
      states.set(name, {
        ...state,
        name,
        lockedBy: instanceId,
        lockedUntil: new Date(now.getTime() + lockMs),
        lastStartedAt: now,
      });
      return true;
    },

    async finish({ name, instanceId, startedAt, finishedAt, status, error, summary }) {
      const state = states.get(name);
      if (state?.lockedBy === instanceId && state.lastStartedAt.getTime() === startedAt.getTime()) {
        states.set(name, {
          ...state,
          lockedBy: null,
          lockedUntil: null,
          lastFinishedAt: finishedAt,
          lastStatus: status,
          lastError: error ?? null,
          lastDurationMs: finishedAt - startedAt,
        });
      }
      runs.push({ name, instance: instanceId, startedAt, finishedAt, status, error, summary });
    },

    async list() {
      return [...states.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
