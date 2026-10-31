import { rooms } from './rooms.js';

const pick = (data, keys) => Object.fromEntries(keys.map((key) => [key, data[key]]));

/**
 * Decide who hears about a domain event. Pure. Each message names its room, event and
 * payload. Payloads are built field by field from a short list, so personal details
 * (phone, address) and delivery codes can never leak into a live message, whatever the
 * event carries.
 */
export function routeEvent(type, data) {
  switch (type) {
    case 'order.placed':
      return [
        {
          room: rooms.admin,
          event: 'admin:order',
          payload: {
            type: 'placed',
            ...pick(data, ['orderCode', 'cityCode', 'zoneCode', 'totalBdt', 'paymentMethod']),
          },
        },
      ];

    case 'order.updated': {
      const { orderCode, status, paymentStatus } = data;
      return [
        // For whoever is following this order (its customer, or an admin).
        {
          room: rooms.order(orderCode),
          event: 'order:update',
          payload: { orderCode, status, paymentStatus },
        },
        // A nudge for the customer's order list to refresh.
        { room: rooms.user(data.customerId), event: 'orders:changed', payload: { orderCode } },
        {
          room: rooms.admin,
          event: 'admin:order',
          payload: { type: 'updated', orderCode, status, paymentStatus },
        },
      ];
    }

    case 'run.created': {
      const { runCode, riderId, cityCode, status, stopCount, counts } = data;
      return [
        { room: rooms.user(riderId), event: 'run:assigned', payload: { runCode, stopCount } },
        {
          room: rooms.admin,
          event: 'admin:run',
          payload: { type: 'created', runCode, riderId, cityCode, status, counts },
        },
      ];
    }

    case 'run.updated': {
      const { runCode, riderId, cityCode, status, counts } = data;
      return [
        { room: rooms.user(riderId), event: 'run:update', payload: { runCode, status, counts } },
        {
          room: rooms.admin,
          event: 'admin:run',
          payload: { type: 'updated', runCode, riderId, cityCode, status, counts },
        },
      ];
    }

    default:
      return [];
  }
}
