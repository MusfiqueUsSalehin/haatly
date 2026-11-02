import { describe, expect, it } from 'vitest';
import { buildRuleRecipes } from '../../src/services/recipes/rules.js';

const item = (slug, nameEn, nameBn, category) => ({ slug, nameEn, nameBn, category });
const tomato = item('tomato', 'Tomato', 'টমেটো', 'vegetable');
const potato = item('potato', 'Potato', 'আলু', 'vegetable');
const okra = item('okra', 'Okra', 'ঢেঁড়স', 'vegetable');
const carrot = item('carrot', 'Carrot', 'গাজর', 'vegetable');
const spinach = item('spinach', 'Spinach', 'পালং শাক', 'leafy');
const mango = item('mango', 'Mango', 'আম', 'fruit');
const guava = item('guava', 'Guava', 'পেয়ারা', 'fruit');
const coriander = item('coriander-leaf', 'Coriander leaf', 'ধনেপাতা', 'herb');

const build = (produce, language = 'en') => buildRuleRecipes({ produce, language });
const titles = (produce, language) => build(produce, language).recipes.map((r) => r.title);
const BENGALI = /[\u0980-\u09FF]/;

describe('buildRuleRecipes: which recipes fit', () => {
  it('suggests greens, a curry and a bhorta for a mixed basket', () => {
    expect(titles([tomato, spinach, potato])).toEqual([
      'Stir-fried greens (Shak bhaji)',
      'Mixed vegetable curry',
      'Vegetable bhorta',
    ]);
  });

  it('suggests a bhorta, a salad and a stir-fry for a single vegetable', () => {
    expect(titles([tomato])).toEqual([
      'Vegetable bhorta',
      'Fresh salad',
      'Simple stir-fry (bhaji)',
    ]);
  });

  it('gives greens on their own greens and a stir-fry', () => {
    expect(titles([spinach])).toEqual([
      'Stir-fried greens (Shak bhaji)',
      'Simple stir-fry (bhaji)',
    ]);
  });

  it('gives fruit a chaat using all the fruit', () => {
    const { recipes } = build([mango, guava]);
    expect(recipes.map((r) => r.title)).toEqual(['Fruit chaat']);
    expect(recipes[0].uses).toEqual(['mango', 'guava']);
  });

  it('gives a herb a salad and a stir-fry', () => {
    expect(titles([coriander])).toEqual(['Fresh salad', 'Simple stir-fry (bhaji)']);
  });

  it('never suggests more than three recipes', () => {
    const basket = [tomato, potato, spinach, okra, mango, carrot];
    expect(build(basket).recipes).toHaveLength(3);
  });

  it('always has at least one recipe for any basket that is not empty', () => {
    const everything = [tomato, potato, okra, carrot, spinach, mango, guava, coriander];
    for (const one of everything) expect(build([one]).recipes.length).toBeGreaterThanOrEqual(1);
    expect(build(everything).recipes.length).toBeGreaterThanOrEqual(1);
  });

  it('returns no recipes for an empty basket', () => {
    expect(build([]).recipes).toEqual([]);
  });
});

describe('buildRuleRecipes: content', () => {
  it('uses only what was chosen, in the order given', () => {
    const { recipes } = build([tomato, potato, spinach, okra, mango, carrot]);
    expect(recipes[0].uses).toEqual(['spinach']);
    expect(recipes[1].uses).toEqual(['tomato', 'potato', 'okra', 'carrot']);
  });

  it('puts the produce names into the steps, in the chosen language', () => {
    expect(build([spinach]).recipes[0].steps[0]).toContain('Spinach');
    expect(build([spinach], 'bn').recipes[0].steps[0]).toContain('পালং শাক');
  });

  it('writes Bangla recipes entirely in Bangla', () => {
    const { recipes, language } = build([tomato, spinach, potato, mango], 'bn');
    expect(language).toBe('bn');
    for (const recipe of recipes) {
      for (const text of [recipe.title, ...recipe.extras, ...recipe.steps]) {
        expect(text).toMatch(BENGALI);
      }
    }
  });

  it('writes English recipes without Bangla', () => {
    for (const recipe of build([tomato, spinach, potato]).recipes) {
      for (const text of [recipe.title, ...recipe.extras, ...recipe.steps]) {
        expect(text).not.toMatch(BENGALI);
      }
    }
  });

  it('gives every recipe a time, extras and three or four steps', () => {
    for (const language of ['en', 'bn']) {
      for (const recipe of build([tomato, spinach, potato], language).recipes) {
        expect(recipe.timeMinutes).toBeGreaterThanOrEqual(5);
        expect(recipe.extras.length).toBeGreaterThan(0);
        expect(recipe.steps.length).toBeGreaterThanOrEqual(3);
        expect(recipe.steps.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('does not change the produce it is given', () => {
    const basket = [tomato, spinach];
    const before = JSON.stringify(basket);
    build(basket);
    expect(JSON.stringify(basket)).toBe(before);
  });
});
