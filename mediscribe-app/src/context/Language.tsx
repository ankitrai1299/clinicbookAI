// App-language provider.
//
// Mirrors ThemeProvider: it holds the first paint until the stored preference is
// known (a single AsyncStorage read), so the app never flashes English before
// switching to Hindi. Sits OUTSIDE AuthProvider in the tree, because the login
// and registration screens render while signed out and must be translated too.
import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  initI18n,
  loadStoredLanguage,
  persistLanguage,
} from '../i18n';

interface LanguageValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  /** True until the stored preference has been read and i18next initialised. */
  loading: boolean;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      await initI18n();
      const stored = await loadStoredLanguage();
      if (active) {
        setLanguageState(stored);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useMemo(
    () => (lang: AppLanguage) => {
      // Update state first so the switch feels instant, then persist + apply.
      // react-i18next re-renders every component using useTranslation the moment
      // changeLanguage resolves, so the whole UI turns over without a reload.
      setLanguageState(lang);
      void persistLanguage(lang);
    },
    [],
  );

  const value = useMemo(() => ({ language, setLanguage, loading }), [language, setLanguage, loading]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
