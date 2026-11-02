// Built-in recipe suggestions. They need no model and no network, so recipes always work.

const MAX_RECIPES = 3;
const BHORTA = new Set(['tomato', 'brinjal', 'potato', 'carrot', 'pumpkin', 'raw-papaya']);
const SALAD = new Set([
  'tomato',
  'cucumber',
  'carrot',
  'radish',
  'cabbage',
  'lemon',
  'coriander-leaf',
]);

const nameOf = (item, language) => (language === 'bn' ? item.nameBn : item.nameEn);

// Tried in this order; the first three that apply are suggested.
const TEMPLATES = [
  {
    title: { en: 'Stir-fried greens (Shak bhaji)', bn: 'শাক ভাজি' },
    timeMinutes: 15,
    min: 1,
    max: 3,
    pick: (produce) => produce.filter((p) => p.category === 'leafy'),
    extras: {
      en: ['garlic', 'dried chilli', 'oil', 'salt'],
      bn: ['রসুন', 'শুকনো মরিচ', 'তেল', 'লবণ'],
    },
    steps: (names) => ({
      en: [
        `Wash ${names} well and chop roughly.`,
        'Heat 1 tablespoon of oil and fry garlic and dried chilli for 30 seconds.',
        'Add the greens and salt, and stir-fry on high heat for 4 to 5 minutes.',
        'Serve hot with rice and dal.',
      ],
      bn: [
        `${names} ভালো করে ধুয়ে মোটামুটি কুচি করে নিন।`,
        'এক টেবিল চামচ তেলে রসুন ও শুকনো মরিচ ৩০ সেকেন্ড ভেজে নিন।',
        'শাক ও লবণ দিয়ে বেশি আঁচে ৪ থেকে ৫ মিনিট নেড়ে ভেজে নিন।',
        'গরম গরম ভাত ও ডালের সাথে পরিবেশন করুন।',
      ],
    }),
  },
  {
    title: { en: 'Mixed vegetable curry', bn: 'মিশ্র সবজি তরকারি' },
    timeMinutes: 35,
    min: 2,
    max: 5,
    pick: (produce) => produce.filter((p) => p.category === 'vegetable'),
    extras: {
      en: ['onion', 'oil', 'turmeric', 'cumin', 'chilli powder', 'salt'],
      bn: ['পেঁয়াজ', 'তেল', 'হলুদ', 'জিরা', 'মরিচের গুঁড়া', 'লবণ'],
    },
    steps: (names) => ({
      en: [
        `Wash and cut ${names} into bite-sized pieces.`,
        'Heat 2 tablespoons of oil, fry sliced onion until golden, then add turmeric, cumin and chilli powder.',
        'Add the harder vegetables first, stir for 2 minutes, then add the rest with a little water and salt.',
        'Cover and cook on medium heat for 15 to 20 minutes until tender, then serve with rice.',
      ],
      bn: [
        `${names} ধুয়ে ছোট ছোট টুকরো করে কেটে নিন।`,
        'দুই টেবিল চামচ তেলে কুচি করা পেঁয়াজ সোনালি করে ভেজে হলুদ, জিরা ও মরিচের গুঁড়া দিন।',
        'শক্ত সবজিগুলো আগে দিয়ে দুই মিনিট নাড়ুন, তারপর বাকি সবজি, সামান্য পানি ও লবণ দিন।',
        'ঢেকে মাঝারি আঁচে ১৫ থেকে ২০ মিনিট রান্না করুন, নরম হলে ভাতের সাথে পরিবেশন করুন।',
      ],
    }),
  },
  {
    title: { en: 'Vegetable bhorta', bn: 'সবজি ভর্তা' },
    timeMinutes: 20,
    min: 1,
    max: 3,
    pick: (produce) => produce.filter((p) => BHORTA.has(p.slug)),
    extras: {
      en: ['onion', 'green chilli', 'mustard oil', 'salt'],
      bn: ['পেঁয়াজ', 'কাঁচা মরিচ', 'সরিষার তেল', 'লবণ'],
    },
    steps: (names) => ({
      en: [
        `Boil, roast or steam ${names} until soft, then peel if needed.`,
        'Mash with a fork and add chopped onion, green chilli, salt and a few drops of mustard oil.',
        'Mix well, taste for salt, and serve with plain rice.',
      ],
      bn: [
        `${names} সিদ্ধ, পোড়া বা ভাপে নরম করে নিন, দরকার হলে খোসা ছাড়ান।`,
        'কাঁটাচামচ দিয়ে ভর্তা করে কুচি পেঁয়াজ, কাঁচা মরিচ, লবণ ও কয়েক ফোঁটা সরিষার তেল মেশান।',
        'ভালো করে মাখিয়ে লবণ দেখে নিন এবং সাদা ভাতের সাথে পরিবেশন করুন।',
      ],
    }),
  },
  {
    title: { en: 'Fresh salad', bn: 'তাজা সালাদ' },
    timeMinutes: 10,
    min: 1,
    max: 5,
    pick: (produce) => produce.filter((p) => SALAD.has(p.slug)),
    extras: {
      en: ['onion', 'green chilli', 'lemon', 'salt'],
      bn: ['পেঁয়াজ', 'কাঁচা মরিচ', 'লেবু', 'লবণ'],
    },
    steps: (names) => ({
      en: [
        `Wash ${names} and slice or grate them thinly.`,
        'Toss with sliced onion, green chilli, salt and a squeeze of lemon.',
        'Rest for 5 minutes and serve fresh.',
      ],
      bn: [
        `${names} ধুয়ে পাতলা করে কেটে বা কুরিয়ে নিন।`,
        'কুচি পেঁয়াজ, কাঁচা মরিচ, লবণ ও লেবুর রস দিয়ে মেখে নিন।',
        '৫ মিনিট রেখে তাজা পরিবেশন করুন।',
      ],
    }),
  },
  {
    title: { en: 'Vegetable khichuri', bn: 'সবজি খিচুড়ি' },
    timeMinutes: 45,
    min: 2,
    max: 4,
    pick: (produce) => produce.filter((p) => p.category === 'vegetable'),
    extras: {
      en: ['rice', 'lentils', 'onion', 'ginger', 'turmeric', 'oil', 'salt'],
      bn: ['চাল', 'ডাল', 'পেঁয়াজ', 'আদা', 'হলুদ', 'তেল', 'লবণ'],
    },
    steps: (names) => ({
      en: [
        `Rinse 1 cup of rice and half a cup of lentils together, and chop ${names}.`,
        'Fry onion, ginger and turmeric in oil, then add the rice, lentils and vegetables.',
        'Add 4 cups of water and salt, bring to a boil, then simmer covered for 25 minutes.',
        'Stir, rest for 5 minutes, and serve hot.',
      ],
      bn: [
        `এক কাপ চাল ও আধা কাপ ডাল একসাথে ধুয়ে নিন এবং ${names} কেটে রাখুন।`,
        'তেলে পেঁয়াজ, আদা ও হলুদ ভেজে চাল, ডাল ও সবজি দিয়ে নাড়ুন।',
        '৪ কাপ পানি ও লবণ দিয়ে ফুটতে দিন, তারপর ঢেকে ২৫ মিনিট অল্প আঁচে রান্না করুন।',
        'নেড়ে ৫ মিনিট রেখে গরম গরম পরিবেশন করুন।',
      ],
    }),
  },
  {
    title: { en: 'Fruit chaat', bn: 'ফলের চাট' },
    timeMinutes: 10,
    min: 1,
    max: 3,
    pick: (produce) => produce.filter((p) => p.category === 'fruit'),
    extras: {
      en: ['salt', 'chilli powder', 'chaat masala', 'lemon'],
      bn: ['লবণ', 'মরিচের গুঁড়া', 'চাট মসলা', 'লেবু'],
    },
    steps: (names) => ({
      en: [
        `Peel and cut ${names} into small pieces.`,
        'Sprinkle with a little salt, chilli powder and chaat masala, then add lemon juice.',
        'Toss gently and serve chilled.',
      ],
      bn: [
        `${names} খোসা ছাড়িয়ে ছোট টুকরো করে কেটে নিন।`,
        'সামান্য লবণ, মরিচের গুঁড়া ও চাট মসলা ছিটিয়ে লেবুর রস দিন।',
        'আলতো করে মিশিয়ে ঠান্ডা করে পরিবেশন করুন।',
      ],
    }),
  },
  {
    title: { en: 'Simple stir-fry (bhaji)', bn: 'সহজ সবজি ভাজি' },
    timeMinutes: 20,
    min: 1,
    max: 3,
    pick: (produce) => produce.filter((p) => p.category !== 'fruit'),
    extras: {
      en: ['onion', 'oil', 'turmeric', 'salt'],
      bn: ['পেঁয়াজ', 'তেল', 'হলুদ', 'লবণ'],
    },
    steps: (names) => ({
      en: [
        `Wash and slice ${names} evenly.`,
        'Heat 2 tablespoons of oil, add sliced onion and a pinch of turmeric.',
        `Add ${names}, salt and a splash of water, and cook covered on medium heat until tender.`,
        'Uncover and stir-fry for 2 minutes to dry out, then serve.',
      ],
      bn: [
        `${names} ধুয়ে সমান করে কেটে নিন।`,
        'দুই টেবিল চামচ তেলে কুচি পেঁয়াজ ও এক চিমটি হলুদ দিন।',
        `${names}, লবণ ও সামান্য পানি দিয়ে মাঝারি আঁচে ঢেকে নরম হওয়া পর্যন্ত রান্না করুন।`,
        'ঢাকনা খুলে ২ মিনিট নেড়ে শুকিয়ে নিয়ে পরিবেশন করুন।',
      ],
    }),
  },
];

/**
 * Suggest up to three recipes for a basket. Pure and deterministic.
 *   produce   [{ slug, nameEn, nameBn, category }]
 *   language  'en' | 'bn'
 * Any basket of fruit or non-fruit produce gets at least one recipe.
 */
export function buildRuleRecipes({ produce, language }) {
  const recipes = [];
  for (const template of TEMPLATES) {
    const used = template.pick(produce).slice(0, template.max);
    if (used.length < template.min) continue;

    const names = used.map((item) => nameOf(item, language)).join(', ');
    recipes.push({
      title: template.title[language],
      timeMinutes: template.timeMinutes,
      uses: used.map((item) => item.slug),
      extras: [...template.extras[language]],
      steps: template.steps(names)[language],
    });
    if (recipes.length === MAX_RECIPES) break;
  }
  return { language, recipes };
}
