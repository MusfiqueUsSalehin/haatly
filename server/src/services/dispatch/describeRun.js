/**
 * A run as its rider sees it. Each stop shows where to go and how much cash to collect.
 * The delivery code is never included: only the customer has it.
 */
export function describeRun(run, ordersByCode = new Map()) {
  const view = run.toJSON();
  view.stops = view.stops.map((stop, index) => {
    const order = ordersByCode.get(stop.orderCode);
    return {
      sequence: index + 1,
      ...stop,
      orderStatus: order?.status,
      recipientName: order?.recipientName,
      phone: order?.phone,
      address: order?.address,
      // Cash to take at the door: the whole total for an unpaid cash order, otherwise nothing.
      collectBdt:
        order?.paymentMethod === 'cod' && order.paymentStatus !== 'paid' ? order.totalBdt : 0,
    };
  });
  return view;
}
