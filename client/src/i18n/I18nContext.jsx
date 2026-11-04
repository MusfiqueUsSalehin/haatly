// client/src/i18n/I18nContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { strings } from './strings.js';

const I18nContext = createContext(null);
const KEY = 'haatly.lang';

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem(KEY) ?? 'bn'); // Bangla is the default

  useEffect(() => {
    localStorage.setItem(KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      // Falls back to English, then to the key, so a missing string never blanks the UI.
      t: (key) => strings[lang][key] ?? strings.en[key] ?? key,
      // For bilingual API data like { nameBn, nameEn }.
      pick: (bn, en) => (lang === 'bn' ? bn || en : en || bn),
      money: (n) => `৳${Number(n).toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US')}`,
    }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
};
