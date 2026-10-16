import { User } from '../models/User.js';
import { USER_STATUS, initialStatusFor } from '../constants/roles.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { AppError } from '../utils/AppError.js';

/** Create a user with an explicit status. Callers decide who may use this. */
export async function createUser({ name, email, phone, password, role, status }) {
  const passwordHash = await hashPassword(password);
  try {
    return await User.create({ name, email, phone, passwordHash, role, status });
  } catch (err) {
    if (err?.code === 11000) {
      throw new AppError(409, 'email_taken', 'An account with this email already exists');
    }
    throw err;
  }
}

/** Public sign-up: customers are active at once, farmers and riders wait for approval. */
export function registerUser(input) {
  return createUser({ ...input, status: initialStatusFor(input.role) });
}

// Hashed once, used to burn the same CPU time when the email is unknown, so response
// timing does not reveal which emails have accounts.
let timingDecoy;

export async function verifyCredentials(email, password) {
  const user = await User.findOne({ email }).select('+passwordHash');
  timingDecoy ??= hashPassword('haatly-timing-decoy');
  const matches = await verifyPassword(password, user ? user.passwordHash : await timingDecoy);

  if (!user || !matches) {
    throw new AppError(401, 'invalid_credentials', 'Incorrect email or password');
  }
  if (user.status === USER_STATUS.SUSPENDED) {
    throw new AppError(403, 'account_suspended', 'This account has been suspended');
  }
  return user;
}
