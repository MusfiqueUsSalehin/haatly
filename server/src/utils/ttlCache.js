/** A tiny in-memory cache. A ttl of 0 turns caching off. Failed loads are never cached. */
export function createTtlCache({ ttlMs, now = () => Date.now() }) {
  const entries = new Map();
  return {
    async get(key, load) {
      const hit = entries.get(key);
      if (hit && now() < hit.expires) return hit.value;
      const value = await load();
      if (ttlMs > 0) entries.set(key, { value, expires: now() + ttlMs });
      return value;
    },
  };
}
