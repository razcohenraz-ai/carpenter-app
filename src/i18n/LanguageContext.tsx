import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Language,
  Translations,
  translations,
  defaultLanguage,
} from './translations';

interface LanguageContextValue {
  t: Translations;
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [language, setLang] = useState<Language>(defaultLanguage);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = language;
    html.dir = language === 'he' ? 'rtl' : 'ltr';
  }, [language]);

  return (
    <LanguageContext.Provider
      value={{ t: translations[language], language, setLanguage: setLang }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useTranslation must be used inside <LanguageProvider>');
  return ctx;
}
