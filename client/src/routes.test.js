// client/src/routes.test.js
import { describe, expect, it } from 'vitest';
import { ROUTES, path } from './routes.js';

describe('route table', () => {
  it('builds the real order tracking link', () => {
    expect(path('order', { code: 'ORD-AB12' })).toBe('/orders/ORD-AB12');
  });
  it('encodes params and rejects missing ones', () => {
    expect(path('box', { code: 'a b' })).toBe('/boxes/a%20b');
    expect(() => path('order')).toThrow(/needs "code"/);
    expect(() => path('nope')).toThrow(/Unknown route/);
  });
  it('has no duplicate paths', () => {
    const v = Object.values(ROUTES);
    expect(new Set(v).size).toBe(v.length);
  });
});
