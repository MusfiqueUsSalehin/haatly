import { z } from 'zod';
import { DEFECT_NAMES } from '../services/ai/triage.js';
import { CODE_PATTERN } from '../utils/codes.js';
import { photoSchema } from './ai.js';

export const createLotSchema = z.object({
  produceSlug: z.string().regex(CODE_PATTERN, 'must be a produce code like "tomato"'),
  hubCode: z.string().regex(CODE_PATTERN, 'must be a hub code like "jashore"'),
  quantityKg: z.number().min(1).max(5000),
  defectTags: z.array(z.enum(DEFECT_NAMES)).max(DEFECT_NAMES.length).default([]),
  photo: photoSchema.optional(),
});
