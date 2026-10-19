import { z } from 'zod';
import { DEFECT_NAMES } from '../services/ai/triage.js';
import { CODE_PATTERN } from '../utils/codes.js';

const MAX_PHOTO_CHARS = 1_400_000; // about 1 MB of image once decoded

export const triageSchema = z.object({
  produceSlug: z.string().regex(CODE_PATTERN, 'must be a produce code like "tomato"'),
  defectTags: z.array(z.enum(DEFECT_NAMES)).max(DEFECT_NAMES.length).default([]),
  photo: z
    .object({
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      data: z
        .string()
        .min(1, 'is required')
        .max(MAX_PHOTO_CHARS, 'photo is too large (max about 1 MB)')
        .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be base64 data without a "data:" prefix'),
    })
    .optional(),
});
