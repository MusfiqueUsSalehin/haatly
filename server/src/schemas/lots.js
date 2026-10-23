import { z } from 'zod';
import { DEFECT_NAMES } from '../services/ai/triage.js';
import { CODE_PATTERN } from '../utils/codes.js';
import { photoSchema } from './ai.js';

import { LOT_STATUSES } from '../models/Lot.js';

export const createLotSchema = z.object({
  produceSlug: z.string().regex(CODE_PATTERN, 'must be a produce code like "tomato"'),
  hubCode: z.string().regex(CODE_PATTERN, 'must be a hub code like "jashore"'),
  quantityKg: z.number().min(1).max(5000),
  defectTags: z.array(z.enum(DEFECT_NAMES)).max(DEFECT_NAMES.length).default([]),
  photo: photoSchema.optional(),
});

export const lotCodeParams = z.object({
  code: z.string().regex(/^LOT-[A-HJ-NP-Z2-9]{8}$/, 'must be a lot code like LOT-7KQ2XM4D'),
});

export const listLotsQuery = z.object({
  status: z.enum(LOT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
