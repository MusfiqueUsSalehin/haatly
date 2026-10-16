export const ROLES = Object.freeze(['customer', 'farmer', 'rider', 'hub_manager', 'admin']);

/** Roles anyone may pick when signing up. Staff accounts are created by admins only. */
export const SELF_REGISTER_ROLES = Object.freeze(['customer', 'farmer', 'rider']);
export const STAFF_ROLES = Object.freeze(['hub_manager', 'admin']);

export const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  PENDING: 'pending',
  SUSPENDED: 'suspended',
});
export const STATUSES = Object.freeze(Object.values(USER_STATUS));

/** Farmers and riders handle food and customer data, so an admin must approve them first. */
export function initialStatusFor(role) {
  return role === 'farmer' || role === 'rider' ? USER_STATUS.PENDING : USER_STATUS.ACTIVE;
}
