// client/src/i18n/strings.test.js
import { expect, it } from 'vitest';
import { strings } from './strings.js';

it('Bangla and English define exactly the same keys', () => {
  expect(Object.keys(strings.bn).sort()).toEqual(Object.keys(strings.en).sort());
});
