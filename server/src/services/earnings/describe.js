/** A farmer sees their own money only: never the platform's margin or what customers paid. */
export function describeSummaryForFarmer({ kg, farmerBdt, unpaidBdt, paidBdt, orders, entries }) {
  return { kg, farmerBdt, unpaidBdt, paidBdt, orders, entries };
}

export function describeEntryForFarmer(entry) {
  const {
    orderCode,
    lotCode,
    produceSlug,
    kg,
    pricePerKgBdt,
    floorBdt,
    farmerBdt,
    deliveredAt,
    status,
    paidAt,
    payoutRef,
  } = entry;
  return {
    orderCode,
    lotCode,
    produceSlug,
    kg,
    pricePerKgBdt,
    floorBdt,
    farmerBdt,
    deliveredAt,
    status,
    ...(paidAt && { paidAt, payoutRef }),
  };
}
