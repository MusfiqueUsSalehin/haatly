import { z } from 'zod';
import { CODE_PATTERN } from '../utils/codes.js';

export const boxesQuery = z.object({
  city: z.string().regex(CODE_PATTERN, 'must be a city code like "dhaka"'),
});

export const boxCodeParams = z.object({
  code: z.string().max(60).regex(CODE_PATTERN, 'must be a box code like "dhaka-family-2026-10-17"'),
});
