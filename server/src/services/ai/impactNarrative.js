// server/src/services/ai/impactNarrative.js
// A two-sentence thank-you in Bangla and English. The model writes the words only:
// every number comes from the database and is filled in by code.

const ALLOWED = new Set(['{orders}', '{kg}', '{co2}', '{saved}']);
const DIGITS = /[0-9০-৯]/;
const LINK = /https?:|www\.|\.com|\.bd/i;

const RULES_TEXT = {
  bn: '{orders}টি অর্ডারে আপনি {kg} কেজি খাবার রক্ষা করেছেন, ৳{saved} বাঁচিয়েছেন এবং আনুমানিক {co2} কেজি CO₂ এড়িয়েছেন। ধন্যবাদ!',
  en: 'Across {orders} orders you rescued {kg} kg of food, saved ৳{saved} and avoided about {co2} kg of CO₂. Thank you!',
};

const SYSTEM_PROMPT = `You write a short thank-you for a food-rescue marketplace customer: one sentence in Bangla and one in English.
Use these placeholders for numbers and nothing else: {orders}, {kg}, {co2}, {saved}.
Never write any digit yourself. No links, no emoji.
Reply with JSON only, in the form {"bn":"...","en":"..."}.`;

function parseReply(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in the reply');
  const data = JSON.parse(match[0]);
  if (typeof data.bn !== 'string' || typeof data.en !== 'string')
    throw new Error('"bn" and "en" must be strings');
  return data;
}

/** Model output is only used if it is plain words around known placeholders. */
function clamp(parsed) {
  const out = {};
  for (const lang of ['bn', 'en']) {
    const text = parsed[lang].trim();
    if (text.length < 20 || text.length > 320) throw new Error(`${lang} text has a bad length`);
    if (DIGITS.test(text)) throw new Error(`${lang} text contains digits`);
    if (LINK.test(text)) throw new Error(`${lang} text contains a link`);
    if ((text.match(/\{[^}]*\}/g) ?? []).some((p) => !ALLOWED.has(p))) {
      throw new Error(`${lang} text has an unknown placeholder`);
    }
    out[lang] = text;
  }
  return out;
}

/** Ask once for the wording. The same wording serves every customer, so it can be cached. */
export async function narrationWording(ai) {
  const { result, source, fallbackReason } = await ai.run({
    feature: 'impact_narrative',
    input: {},
    rules: () => RULES_TEXT,
    model: {
      system: SYSTEM_PROMPT,
      content: 'Write the two sentences now.',
      maxTokens: 300,
      parse: parseReply,
      clamp,
    },
  });
  return { texts: result, source, ...(fallbackReason && { fallbackReason }) };
}

const DECIMALS = { orders: 0, kg: 1, co2: 1, saved: 0 };

/** Put one customer's real numbers into the wording. */
export function fillNarrative(texts, figures) {
  const fill = (text, lang) =>
    text.replace(/\{(\w+)\}/g, (_, key) =>
      Number(figures[key] ?? 0).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US', {
        maximumFractionDigits: DECIMALS[key] ?? 0,
      }),
    );
  return { bn: fill(texts.bn, 'bn'), en: fill(texts.en, 'en') };
}
