import { z } from 'zod';
import { CODE_PATTERN } from '../utils/codes.js';

// The client sends produce codes and a language only. Any other field is dropped.
export const recipesSchema = z.object({
  produceSlugs: z
    .array(z.string().max(60).regex(CODE_PATTERN, 'must be a produce code like "tomato"'))
    .min(1, 'choose at least one produce')
    .max(6, 'choose at most six produce')
    .transform((slugs) => [...new Set(slugs)]),
  language: z.enum(['bn', 'en']).default('bn'),
});
