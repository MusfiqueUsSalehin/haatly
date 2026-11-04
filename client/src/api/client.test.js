// client/src/api/client.test.js
import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, api, tokenStore } from './client.js';

afterEach(() => {
  vi.restoreAllMocks();
  tokenStore.clear();
});

it('turns the server error shape into ApiError', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { code: 'account_pending', message: 'Waiting' } }),
    }),
  );
  await expect(api('/x')).rejects.toMatchObject({ status: 403, code: 'account_pending' });
});

it('sends the bearer token and reports network failure', async () => {
  tokenStore.set('tok');
  const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: 1 }) });
  vi.stubGlobal('fetch', f);
  await api('/y');
  expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');

  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
  await expect(api('/z')).rejects.toBeInstanceOf(ApiError);
});
