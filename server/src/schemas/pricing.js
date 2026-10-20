import { z } from 'zod';
import { CODE_PATTERN } from '../utils/codes.js';

export const quoteSchema = z
  .object({
    produceSlug: z.string().regex(CODE_PATTERN, 'must be a produce code like "tomato"'),
    grade: z.enum(['A', 'B', 'C']),
    shelfLifeDays: z.number().int().min(1).max(60),
    hoursToExpiry: z
      .number()
      .min(0)
      .max(60 * 24),
  })
  .refine((quote) => quote.hoursToExpiry <= quote.shelfLifeDays * 24, {
    path: ['hoursToExpiry'],
    message: 'cannot be longer than the shelf life',
  });
