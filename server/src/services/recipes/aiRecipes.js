import { buildRuleRecipes } from './rules.js';

const MAX_RECIPES = 3;
const LANGUAGE_NAME = { bn: 'Bangla', en: 'English' };
const URL_PATTERN = /https?:\/\/|www\./i;

const systemPrompt = (
  language,
) => `You suggest simple home recipes for Bangladeshi households, using produce that was rescued from waste.
Use ONLY the produce listed by the user, and refer to each one by its slug.
Reply with JSON only, in exactly this form:
{"recipes":[{"title":"...","timeMinutes":30,"uses":["slug"],"extras":["pantry item"],"steps":["..."]}]}
Give 1 to 3 recipes. Each has 2 to 8 short steps. Extras are common pantry items only.
Write the title, extras and steps in ${LANGUAGE_NAME[language]}.
Never include links, prices or health claims.`;

/** The prompt holds catalog data only: nothing the client typed ever reaches the model. */
const describeProduce = (produce) =>
  `Produce:\n${produce
    .map((p) => `- ${p.slug}: ${p.nameEn} (${p.nameBn}), ${p.category}`)
    .join('\n')}`;

/**
 * Clean one piece of text from the model: whitespace collapsed, control characters and
 * angle brackets removed, limited in length, and refused if it contains a link.
 * Returns the cleaned text, or null when it cannot be used.
 */
function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = [...value.replace(/\s+/g, ' ')]
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127)
    .join('')
    .replace(/[<>]/g, '')
    .trim();
  if (text.length === 0 || text.length > max || URL_PATTERN.test(text)) return null;
  return text;
}

/** One recipe checked against the produce the customer actually chose. Null = unusable. */
function cleanRecipe(raw, allowed) {
  if (!raw || typeof raw !== 'object') return null;

  const title = cleanText(raw.title, 80);
  if (!title) return null;

  const { timeMinutes } = raw;
  if (!Number.isInteger(timeMinutes) || timeMinutes < 5 || timeMinutes > 180) return null;

  // The model may only use produce from the basket, so it cannot invent ingredients.
  const uses = Array.isArray(raw.uses)
    ? [...new Set(raw.uses.filter((slug) => typeof slug === 'string' && allowed.has(slug)))]
    : [];
  if (uses.length === 0) return null;

  const extras = Array.isArray(raw.extras)
    ? raw.extras
        .slice(0, 8)
        .map((extra) => cleanText(extra, 40))
        .filter(Boolean)
    : [];

  if (!Array.isArray(raw.steps) || raw.steps.length < 2 || raw.steps.length > 8) return null;
  const steps = raw.steps.map((step) => cleanText(step, 240));
  if (steps.some((step) => step === null)) return null; // a half-cleaned recipe would mislead

  return { title, timeMinutes, uses, extras, steps };
}

function parseModelReply(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in the reply');
  const data = JSON.parse(match[0]);
  if (!Array.isArray(data.recipes)) throw new Error('"recipes" must be a list');
  return data;
}

function clampRecipes(parsed, _rulesResult, input) {
  const allowed = new Set(input.produce.map((p) => p.slug));
  const recipes = parsed.recipes
    .map((raw) => cleanRecipe(raw, allowed))
    .filter(Boolean)
    .slice(0, MAX_RECIPES);
  if (recipes.length === 0) throw new Error('no usable recipes in the reply');
  return { language: input.language, recipes };
}

/** Build the request the AI gateway runs. If the model fails, the rules answer instead. */
export function buildRecipeRequest({ produce, language }) {
  return {
    feature: 'recipes',
    input: { produce, language },
    rules: (input) => buildRuleRecipes(input),
    model: {
      system: systemPrompt(language),
      content: describeProduce(produce),
      maxTokens: 900,
      parse: parseModelReply,
      clamp: clampRecipes,
    },
  };
}
