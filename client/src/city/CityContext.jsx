// client/src/city/CityContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { get } from '../api/client.js';

const CityContext = createContext(null);
const KEY = 'haatly.city';

export function CityProvider({ children }) {
  const [cities, setCities] = useState([]);
  const [code, setCode] = useState(() => localStorage.getItem(KEY));

  useEffect(() => {
    get('/catalog/cities')
      .then((d) => {
        setCities(d.cities);
        setCode((c) => (d.cities.some((x) => x.code === c) ? c : (d.cities[0]?.code ?? null)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (code) localStorage.setItem(KEY, code);
  }, [code]);

  const value = useMemo(
    () => ({ cities, city: cities.find((c) => c.code === code) ?? null, setCode }),
    [cities, code],
  );
  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}

export const useCity = () => {
  const ctx = useContext(CityContext);
  if (!ctx) throw new Error('useCity must be used inside <CityProvider>');
  return ctx;
};
