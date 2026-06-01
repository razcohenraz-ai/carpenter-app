import React from 'react';
import { useTranslation } from './hooks/useTranslation';
import { useProject } from './hooks/useProject';
import { ProjectView } from './components/ProjectView';
import CabinetForm from './components/CabinetForm';
import type { CabinetInput } from '../types/cabinet';
import type { SavedCabinetState } from '../types/project';
import styles from './App.module.css';

export default function App(): React.JSX.Element {
  const { t, language, setLanguage } = useTranslation();
  const {
    project, activeProductId,
    setActiveProduct, clearActiveProduct,
    addProduct, removeProduct, updateProductCabinet,
    renameProject, newProject,
    exportProject, importProject,
  } = useProject();

  const activeProduct = activeProductId
    ? project.products.find(p => p.id === activeProductId) ?? null
    : null;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            {activeProduct ? (
              <>
                <button
                  className={styles.backBtn}
                  onClick={clearActiveProduct}
                  type="button"
                >
                  {t.project.backToProject}
                </button>
                <h1 className={styles.title}>{activeProduct.name}</h1>
              </>
            ) : (
              <>
                <h1 className={styles.title}>{t.appTitle}</h1>
                <p className={styles.subtitle}>{t.appSubtitle}</p>
              </>
            )}
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
        {activeProduct ? (
          <CabinetForm
            initialInput={activeProduct.cabinet.input}
            initialState={activeProduct.cabinet.state}
            onCabinetChange={(input: CabinetInput, state: SavedCabinetState) =>
              updateProductCabinet(activeProduct.id, { input, state })
            }
          />
        ) : (
          <ProjectView
            project={project}
            onOpenProduct={setActiveProduct}
            onAddProduct={addProduct}
            onRemoveProduct={removeProduct}
            onRenameProject={renameProject}
            onNewProject={newProject}
            onExport={exportProject}
            onImport={importProject}
          />
        )}
      </main>
    </div>
  );
}
