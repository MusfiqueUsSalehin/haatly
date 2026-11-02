import { z } from 'zod';
import { CODE_PATTERN } from '../utils/codes.js';

export const forecastQuery = z.object({
  city: z.string().max(60).regex(CODE_PATTERN, 'must be a city code like "dhaka"'),
  days: z.coerce.number().int().min(1).max(14).default(7),
});
