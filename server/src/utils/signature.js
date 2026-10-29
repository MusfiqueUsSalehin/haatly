import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** HMAC-SHA256 over "<timestamp>.<raw body>", as lowercase hex. */
export function signPayload(secret, timestamp, rawBody) {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

/**
 * Check a webhook signature. The timestamp is part of what is signed and must be recent,
 * so a captured request cannot be replayed later. Returns true or false, never throws.
 */
export function verifySignature({
  secret,
  timestamp,
  rawBody,
  signature,
  now = new Date(),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
}) {
  const stamp = String(timestamp);
  if (!/^\d{1,12}$/.test(stamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(stamp)) > toleranceSeconds) return false;
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false;

  const expected = Buffer.from(signPayload(secret, stamp, rawBody), 'hex');
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
