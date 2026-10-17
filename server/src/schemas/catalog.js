import { z } from 'zod';
import { PRODUCE_CATEGORIES } from '../constants/produce.js';
import { HUB_KINDS } from '../models/Hub.js';
import { CODE_PATTERN } from '../utils/codes.js';

const code = z.string().regex(CODE_PATTERN, 'must be a lowercase code like "green-chilli"');

export const slugParams = z.object({ slug: code });

export const produceQuery = z.object({
  category: z.enum(PRODUCE_CATEGORIES).optional(),
});

export const hubsQuery = z.object({
  city: code.optional(),
  kind: z.enum(HUB_KINDS).optional(),
});

export const updateProduceSchema = z
  .object({
    bazarPriceBdt: z.number().min(1).max(5000),
    shelfLifeDays: z.number().int().min(1).max(60),
    peakMonths: z.array(z.number().int().min(1).max(12)).max(12),
    active: z.boolean(),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'provide at least one field to change',
  });
