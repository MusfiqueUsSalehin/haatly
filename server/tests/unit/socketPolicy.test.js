import { describe, expect, it } from 'vitest';
import {
  MAX_ORDER_SUBSCRIPTIONS,
  canSubscribeToOrder,
  roomsForUser,
} from '../../src/realtime/policy.js';
import { rooms } from '../../src/realtime/rooms.js';

const customer = { _id: '65f1c2a4b9d3e8a1c4f7b001', role: 'customer', status: 'active' };
const order = { customer: '65f1c2a4b9d3e8a1c4f7b001' };

describe('canSubscribeToOrder', () => {
  it('lets the owner follow their order', () => {
    expect(canSubscribeToOrder(customer, order)).toBe(true);
  });

  it('compares ids as text, so object ids work too', () => {
    const asObject = { toString: () => '65f1c2a4b9d3e8a1c4f7b001' };
    expect(canSubscribeToOrder(customer, { customer: asObject })).toBe(true);
  });

  it('refuses another customer', () => {
    const other = { ...customer, _id: '65f1c2a4b9d3e8a1c4f7b999' };
    expect(canSubscribeToOrder(other, order)).toBe(false);
  });

  it('lets an active admin follow any order', () => {
    expect(canSubscribeToOrder({ ...customer, _id: 'x', role: 'admin' }, order)).toBe(true);
  });

  it('refuses riders, farmers and hub managers', () => {
    for (const role of ['rider', 'farmer', 'hub_manager']) {
      expect(canSubscribeToOrder({ ...customer, role }, order)).toBe(false);
    }
  });

  it('refuses accounts that are not active, even the owner or an admin', () => {
    for (const status of ['pending', 'suspended']) {
      expect(canSubscribeToOrder({ ...customer, status }, order)).toBe(false);
      expect(canSubscribeToOrder({ ...customer, role: 'admin', status }, order)).toBe(false);
    }
  });

  it('refuses when there is no user or no order', () => {
    expect(canSubscribeToOrder(customer, null)).toBe(false);
    expect(canSubscribeToOrder(null, order)).toBe(false);
  });
});

describe('rooms', () => {
  it('names rooms consistently', () => {
    expect(rooms.user('abc')).toBe('user:abc');
    expect(rooms.order('ORD-AAAAAAAA')).toBe('order:ORD-AAAAAAAA');
    expect(rooms.admin).toBe('admin');
  });

  it('puts everyone in their own room, and admins in the shared one too', () => {
    expect(roomsForUser(customer)).toEqual(['user:65f1c2a4b9d3e8a1c4f7b001']);
    expect(roomsForUser({ ...customer, role: 'admin' })).toEqual([
      'user:65f1c2a4b9d3e8a1c4f7b001',
      'admin',
    ]);
  });

  it('caps how many orders one connection can follow', () => {
    expect(MAX_ORDER_SUBSCRIPTIONS).toBe(20);
  });
});
