import { Produce } from '../../models/Produce.js';
import { RecipeCache } from '../../models/RecipeCache.js';
import { AppError } from '../../utils/AppError.js';
import { buildRecipeRequest } from './aiRecipes.js';

/** Same basket and language, whatever the order the produce was chosen in. */
export const recipeKey = ({ slugs, language }) => `${language}:${[...slugs].sort().join(',')}`;

/**
 * Suggest recipes for a basket of catalog produce. Names come from the catalog, never from
 * the client. A cached model answer is returned without any model call.
 */
export async function suggestRecipes({ slugs, language, ai }) {
  const found = await Produce.find({ slug: { $in: slugs }, active: true }).lean();
  const bySlug = new Map(found.map((item) => [item.slug, item]));

  const unknown = slugs.filter((slug) => !bySlug.has(slug));
  if (unknown.length > 0) {
    throw new AppError(400, 'validation_error', 'Validation failed', {
      produceSlugs: `unknown produce: ${unknown.join(', ')}`,
    });
  }
  const produce = slugs.map((slug) => bySlug.get(slug));
  const shown = produce.map(({ slug, nameEn, nameBn }) => ({ slug, nameEn, nameBn }));

  const key = recipeKey({ slugs, language });
  const cached = await RecipeCache.findOne({ key }).lean();
  if (cached) return { ...cached.result, produce: shown, source: 'model', cached: true };

  const { result, source, fallbackReason } = await ai.run(
    buildRecipeRequest({ produce, language }),
  );

  // Only real model answers are kept: a rules answer is free to recompute, and caching it
  // would stop a later request from getting the model's answer.
  if (source === 'model') {
    try {
      await RecipeCache.updateOne({ key }, { $setOnInsert: { result } }, { upsert: true });
    } catch (err) {
      if (err?.code !== 11000) throw err; // two requests saved the same answer at once
    }
  }
  return {
    ...result,
    produce: shown,
    source,
    cached: false,
    ...(fallbackReason && { fallbackReason }),
  };
}
