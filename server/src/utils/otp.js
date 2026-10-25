import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const OTP_LENGTH = 6;

/** A random per-order value. Stored on the order, useless without the server secret. */
export const newOtpSalt = () => randomBytes(12).toString('base64url');

/**
 * The delivery code is worked out from a server secret, so it is never stored. A leaked
 * database reveals nothing, and only code holding the secret can show or check it.
 */
export function deriveOtp(secret, orderCode, salt) {
  const digest = createHmac('sha256', secret).update(`delivery-otp:${orderCode}:${salt}`).digest();
  return String(digest.readUInt32BE(0) % 10 ** OTP_LENGTH).padStart(OTP_LENGTH, '0');
}

export function verifyOtp(secret, orderCode, salt, attempt) {
  if (typeof attempt !== 'string' || !/^\d{6}$/.test(attempt)) return false;
  const expected = Buffer.from(deriveOtp(secret, orderCode, salt));
  return timingSafeEqual(expected, Buffer.from(attempt));
}
