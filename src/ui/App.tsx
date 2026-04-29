import React from 'react';
import { useTranslation } from './hooks/useTranslation';
import CabinetForm from './components/CabinetForm';
import styles from './App.module.css';

export default function App(): React.JSX.Element {
  const { t, language, setLanguage } = useTranslation();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            <h1 className={styles.title}>{t.appTitle}</h1>
            <p className={styles.subtitle}>{t.appSubtitle}</p>
          </div>
          <button
            className={styles.langToggle}
            onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
            aria-label="החלף שפה / Switch language"
          >
            {t.langToggle}
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <CabinetForm />
      </main>
    </div>
  );
}
