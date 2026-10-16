import { User } from '../models/User.js';
import { USER_STATUS } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';

/**
 * Require a valid session token. Loads the user fresh from the database on every
 * request, so a suspended account is locked out immediately.
 */
export function authenticate(tokens) {
  return async (req, _res, next) => {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new AppError(401, 'unauthenticated', 'Please sign in to continue');
    }

    let payload;
    try {
      payload = tokens.verify(token);
    } catch {
      throw new AppError(401, 'invalid_token', 'Your session is invalid or has expired');
    }

    const user = await User.findById(payload.sub);
    if (!user) throw new AppError(401, 'invalid_token', 'Your session is invalid or has expired');
    if (user.status === USER_STATUS.SUSPENDED) {
      throw new AppError(403, 'account_suspended', 'This account has been suspended');
    }

    req.user = user;
    next();
  };
}

/**
 * Allow only the listed roles, and only once the account is active. A farmer or rider
 * who is still waiting for approval gets a clear 403 instead of any access.
 * Always place this after authenticate().
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw new AppError(401, 'unauthenticated', 'Please sign in to continue');
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'forbidden', 'You do not have access to this resource');
    }
    if (req.user.status !== USER_STATUS.ACTIVE) {
      throw new AppError(403, 'account_pending', 'Your account is waiting for admin approval');
    }
    next();
  };
}
