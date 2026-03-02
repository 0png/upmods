import React, { createContext, useContext } from 'react';
import type { Translations } from './translations.js';
import { en, zhTW } from './translations.js';

export type Locale = 'en' | 'zh-TW';

interface LanguageContextValue {
  locale: Locale;
  t: Translations;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

interface LanguageProviderProps {
  locale: Locale;
  toggleLanguage: () => void;
  children: React.ReactNode;
}

export function LanguageProvider({ locale, toggleLanguage, children }: LanguageProviderProps) {
  const t = locale === 'en' ? en : zhTW;
  return (
    <LanguageContext.Provider value={{ locale, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
