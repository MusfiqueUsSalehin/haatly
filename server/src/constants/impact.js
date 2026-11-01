/**
 * Assumptions behind the CO2e figure. They are estimates, not measurements: adjust them
 * here and every figure follows. Kilos rescued and taka saved do not use them.
 */
export const IMPACT_FACTORS = Object.freeze({
  // kg of CO2e embodied in growing, packing and moving 1 kg of fresh produce.
  co2eKgPerKgProduce: 0.5,
  // Share of rescued produce that would really have been wasted without us. We do not
  // claim all of it: some of it would have sold anyway.
  wasteShare: 0.7,
});
