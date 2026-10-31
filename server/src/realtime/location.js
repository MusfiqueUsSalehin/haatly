import { z } from 'zod';
import { BD_BOUNDS } from '../models/geo.js';

/** What a rider's phone may send. Anything else in the message is ignored. */
export const locationSchema = z.object({
  lat: z.number().min(BD_BOUNDS.lat[0]).max(BD_BOUNDS.lat[1]),
  lng: z.number().min(BD_BOUNDS.lng[0]).max(BD_BOUNDS.lng[1]),
  accuracyM: z.number().min(0).max(5000).optional(),
  heading: z.number().min(0).max(360).optional(),
  speedKmh: z.number().min(0).max(150).optional(),
});

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Validate a location message and clean it up: coordinates rounded to about a metre, and
 * a timestamp set by the SERVER (a phone's clock is never trusted). Returns
 * { ok: true, location } or { ok: false }.
 */
export function parseLocation(raw, now = new Date()) {
  const result = locationSchema.safeParse(raw);
  if (!result.success) return { ok: false };

  const { lat, lng, accuracyM, heading, speedKmh } = result.data;
  return {
    ok: true,
    location: {
      lat: round(lat, 5),
      lng: round(lng, 5),
      ...(accuracyM !== undefined && { accuracyM: Math.round(accuracyM) }),
      ...(heading !== undefined && { heading: Math.round(heading) }),
      ...(speedKmh !== undefined && { speedKmh: round(speedKmh, 1) }),
      at: now.toISOString(),
    },
  };
}

/** Allows at most one event per interval. A refused event does not delay the next one. */
export function createRateGate({ minIntervalMs, now = () => Date.now() }) {
  let last = -Infinity;
  return {
    allow() {
      const t = now();
      if (t - last < minIntervalMs) return false;
      last = t;
      return true;
    },
  };
}

/** Allows at most `max` events per window, then starts counting again. */
export function createWindowLimiter({ max, windowMs, now = () => Date.now() }) {
  let start = now();
  let count = 0;
  return {
    allow() {
      const t = now();
      if (t - start >= windowMs) {
        start = t;
        count = 0;
      }
      if (count >= max) return false;
      count += 1;
      return true;
    },
  };
}
