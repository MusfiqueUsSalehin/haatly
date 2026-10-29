/** What a rider can carry in one trip and how many stops one trip may have. */
export const VEHICLES = Object.freeze({
  bike: Object.freeze({ capacityKg: 40, maxStops: 12 }),
  van: Object.freeze({ capacityKg: 200, maxStops: 25 }),
});
export const VEHICLE_NAMES = Object.freeze(Object.keys(VEHICLES));
