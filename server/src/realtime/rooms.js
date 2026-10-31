/** Room names. Every user is in their own room, and admins also share one. */
export const rooms = Object.freeze({
  admin: 'admin',
  user: (id) => `user:${id}`,
  order: (code) => `order:${code}`,
});
