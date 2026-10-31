import { USER_STATUS } from '../constants/roles.js';

// setTimeout cannot wait longer than this: a bigger value fires immediately.
export const MAX_TIMER_MS = 2 ** 31 - 1;

export class SocketAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SocketAuthError';
    this.code = code;
  }
}

/**
 * Check the token sent in a socket handshake and load the user. Throws a SocketAuthError
 * for anything the client can fix (no token, bad token, suspended account). Other errors,
 * such as the database being down, are passed through untouched.
 */
export async function authenticateHandshake({ token, tokens, findUser }) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2000) {
    throw new SocketAuthError('unauthenticated', 'Please sign in to continue');
  }

  let payload;
  try {
    payload = tokens.verify(token.replace(/^Bearer\s+/i, ''));
  } catch {
    throw new SocketAuthError('invalid_token', 'Your session is invalid or has expired');
  }

  const user = await findUser(payload.sub);
  if (!user) throw new SocketAuthError('invalid_token', 'Your session is invalid or has expired');
  if (user.status === USER_STATUS.SUSPENDED) {
    throw new SocketAuthError('account_suspended', 'This account has been suspended');
  }
  return { user, expiresAt: payload.exp ? payload.exp * 1000 : null };
}

/** Milliseconds until the token expires, safe to hand to setTimeout. null means never. */
export function msUntil(expiresAt, now = Date.now()) {
  if (expiresAt === null) return null;
  return Math.min(Math.max(0, expiresAt - now), MAX_TIMER_MS);
}
