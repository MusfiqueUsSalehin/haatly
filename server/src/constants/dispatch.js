/** What a rider can carry in one trip and how many stops one trip may have. */
export const VEHICLES = Object.freeze({
  bike: Object.freeze({ capacityKg: 40, maxStops: 12 }),
  van: Object.freeze({ capacityKg: 200, maxStops: 25 }),
});
export const VEHICLE_NAMES = Object.freeze(Object.keys(VEHICLES));

export const RUN_STATUS = Object.freeze({
  PLANNED: 'planned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
});
export const RUN_STATUSES = Object.freeze(Object.values(RUN_STATUS));

export const STOP_STATUS = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  SKIPPED: 'skipped', // the order was cancelled before the run started
});
export const STOP_STATUSES = Object.freeze(Object.values(STOP_STATUS));

export const RUN_CODE_PATTERN = /^RUN-[A-HJ-NP-Z2-9]{8}$/;

/** Wrong delivery codes allowed per order before the stop is locked. */
export const MAX_OTP_ATTEMPTS = 5;
