import jwt from 'jsonwebtoken';

const ALGORITHM = 'HS256';

/**
 * Issues and verifies signed session tokens. The token carries only the user id:
 * role and status are always read from the database, so approvals, suspensions and
 * role changes take effect immediately instead of waiting for a token to expire.
 */
export function createTokenService(env) {
  return {
    sign(user) {
      return jwt.sign({}, env.JWT_SECRET, {
        algorithm: ALGORITHM,
        subject: String(user._id ?? user.id),
        expiresIn: env.JWT_EXPIRES_IN,
      });
    },
    /** Returns the payload, or throws if the token is invalid or expired. */
    verify(token) {
      return jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
    },
  };
}
