import { USER_STATUS } from '../constants/roles.js';
import { rooms } from './rooms.js';

/** The most orders one connection may follow at once. */
export const MAX_ORDER_SUBSCRIPTIONS = 20;

/** Only the customer who owns an order, or an admin, may follow it live. */
export function canSubscribeToOrder(user, order) {
  if (!user || !order || user.status !== USER_STATUS.ACTIVE) return false;
  if (user.role === 'admin') return true;
  return user.role === 'customer' && String(order.customer) === String(user._id);
}

/** The rooms a user joins automatically when they connect. */
export function roomsForUser(user) {
  return [rooms.user(user._id), ...(user.role === 'admin' ? [rooms.admin] : [])];
}
