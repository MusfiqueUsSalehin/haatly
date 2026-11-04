// client/src/api/useApi.js
import { useEffect, useState } from 'react';
import { get } from './client.js';

/** GET `path` (pass null to skip). Optional polling with `interval` ms. */
export function useApi(path, { interval } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return undefined;
    let live = true;
    const load = () =>
      get(path)
        .then((data) => live && setState({ data, error: null, loading: false }))
        .catch((error) => live && setState((s) => ({ ...s, error, loading: false })));
    load();
    const id = interval ? setInterval(load, interval) : null;
    return () => {
      live = false;
      if (id) clearInterval(id);
    };
  }, [path, interval, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}
