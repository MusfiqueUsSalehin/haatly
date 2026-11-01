import { describe, expect, it, vi } from 'vitest';
import { createTtlCache } from '../../src/utils/ttlCache.js';

describe('createTtlCache', () => {
  it('reuses a value until it expires, then loads a fresh one', async () => {
    let clock = 0;
    const cache = createTtlCache({ ttlMs: 1000, now: () => clock });
    const load = vi.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    expect(await cache.get('k', load)).toBe('first');
    clock = 999;
    expect(await cache.get('k', load)).toBe('first');
    clock = 1000;
    expect(await cache.get('k', load)).toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps separate keys apart', async () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    expect(await cache.get('a', async () => 1)).toBe(1);
    expect(await cache.get('b', async () => 2)).toBe(2);
  });

  it('never caches when the ttl is zero', async () => {
    const cache = createTtlCache({ ttlMs: 0 });
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.get('k', load)).toBe(1);
    expect(await cache.get('k', load)).toBe(2);
  });

  it('does not cache a failed load', async () => {
    const cache = createTtlCache({ ttlMs: 1000 });
    const load = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce('ok');
    await expect(cache.get('k', load)).rejects.toThrow('db down');
    expect(await cache.get('k', load)).toBe('ok');
  });
});
