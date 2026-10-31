import { describe, expect, it, vi } from 'vitest';
import { publish, subscribe } from '../../src/realtime/events.js';
import { routeEvent } from '../../src/realtime/routing.js';

describe('event bus', () => {
  it('gives every listener the event type and data', () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribe(a);
    const offB = subscribe(b);
    publish('order.updated', { orderCode: 'ORD-AAAAAAAA' });
    expect(a).toHaveBeenCalledWith('order.updated', { orderCode: 'ORD-AAAAAAAA' });
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it('stops delivering after unsubscribing', () => {
    const listener = vi.fn();
    const off = subscribe(listener);
    off();
    publish('x', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps going when one listener throws', () => {
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const offs = [subscribe(bad), subscribe(good)];
    expect(() => publish('x', {})).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    offs.forEach((off) => off());
  });

  it('does nothing when nobody is listening', () => {
    expect(() => publish('x', {})).not.toThrow();
  });
});

describe('routeEvent', () => {
  const counts = { pending: 1, delivered: 1, failed: 0, skipped: 0 };

  it('tells admins about a new order', () => {
    const data = {
      orderCode: 'ORD-AAAAAAAA',
      customerId: 'c1',
      cityCode: 'dhaka',
      zoneCode: 'dhaka-mirpur',
      totalBdt: 376,
      paymentMethod: 'cod',
    };
    expect(routeEvent('order.placed', data)).toEqual([
      {
        room: 'admin',
        event: 'admin:order',
        payload: {
          type: 'placed',
          orderCode: 'ORD-AAAAAAAA',
          cityCode: 'dhaka',
          zoneCode: 'dhaka-mirpur',
          totalBdt: 376,
          paymentMethod: 'cod',
        },
      },
    ]);
  });

  it('sends an order update to the order room, the customer list and admins', () => {
    const data = {
      orderCode: 'ORD-AAAAAAAA',
      customerId: 'c1',
      status: 'delivered',
      paymentStatus: 'paid',
    };
    expect(routeEvent('order.updated', data)).toEqual([
      {
        room: 'order:ORD-AAAAAAAA',
        event: 'order:update',
        payload: { orderCode: 'ORD-AAAAAAAA', status: 'delivered', paymentStatus: 'paid' },
      },
      { room: 'user:c1', event: 'orders:changed', payload: { orderCode: 'ORD-AAAAAAAA' } },
      {
        room: 'admin',
        event: 'admin:order',
        payload: {
          type: 'updated',
          orderCode: 'ORD-AAAAAAAA',
          status: 'delivered',
          paymentStatus: 'paid',
        },
      },
    ]);
  });

  it('tells the rider about a new run, and admins too', () => {
    const data = {
      runCode: 'RUN-AAAAAAAA',
      riderId: 'r1',
      cityCode: 'dhaka',
      status: 'planned',
      stopCount: 2,
      counts,
    };
    expect(routeEvent('run.created', data)).toEqual([
      {
        room: 'user:r1',
        event: 'run:assigned',
        payload: { runCode: 'RUN-AAAAAAAA', stopCount: 2 },
      },
      {
        room: 'admin',
        event: 'admin:run',
        payload: {
          type: 'created',
          runCode: 'RUN-AAAAAAAA',
          riderId: 'r1',
          cityCode: 'dhaka',
          status: 'planned',
          counts,
        },
      },
    ]);
  });

  it('tells the rider and admins about run progress', () => {
    const data = {
      runCode: 'RUN-AAAAAAAA',
      riderId: 'r1',
      cityCode: 'dhaka',
      status: 'in_progress',
      counts,
    };
    expect(routeEvent('run.updated', data)).toEqual([
      {
        room: 'user:r1',
        event: 'run:update',
        payload: { runCode: 'RUN-AAAAAAAA', status: 'in_progress', counts },
      },
      {
        room: 'admin',
        event: 'admin:run',
        payload: {
          type: 'updated',
          runCode: 'RUN-AAAAAAAA',
          riderId: 'r1',
          cityCode: 'dhaka',
          status: 'in_progress',
          counts,
        },
      },
    ]);
  });

  it('ignores event types it does not know', () => {
    expect(routeEvent('something.else', {})).toEqual([]);
  });

  it('never lets personal details or a delivery code into a message', () => {
    const extras = {
      phone: '+8801712345678',
      address: { line: 'House 12, Road 3' },
      recipientName: 'Rahim Uddin',
      deliveryOtp: '123456',
      otpSalt: 'salt',
    };
    const messages = [
      ...routeEvent('order.placed', { orderCode: 'ORD-AAAAAAAA', ...extras }),
      ...routeEvent('order.updated', {
        orderCode: 'ORD-AAAAAAAA',
        customerId: 'c1',
        status: 'placed',
        ...extras,
      }),
      ...routeEvent('run.created', { runCode: 'RUN-AAAAAAAA', riderId: 'r1', ...extras }),
      ...routeEvent('run.updated', { runCode: 'RUN-AAAAAAAA', riderId: 'r1', ...extras }),
    ];
    const text = JSON.stringify(messages);
    for (const secret of ['8801712345678', 'Road 3', 'Rahim', '123456', 'salt', 'Otp']) {
      expect(text).not.toContain(secret);
    }
  });
});
