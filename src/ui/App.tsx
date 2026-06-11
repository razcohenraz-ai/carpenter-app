import React, { useState } from 'react';
import { useTranslation } from './hooks/useTranslation';
import { useProject } from './hooks/useProject';
import { useSettings } from './hooks/useSettings';
import { ProjectView } from './components/ProjectView';
import { KitchenEditor } from './components/KitchenEditor';
import { SettingsPage } from './pages/SettingsPage';
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
    addKitchenUnit, removeKitchenUnit, updateKitchenUnit, reorderKitchenUnit,
  } = useProject();
  const {
    settings,
    toggleBodyMaterial,
    toggleFrontMaterial,
    setBodyMaterialPrice,
    resetBodyMaterialPrice,
    setFrontMaterialPrice,
    resetFrontMaterialPrice,
    addCustomMaterial,
    removeCustomMaterial,
    updateCustomMaterial,
  } = useSettings();

  // Active kitchen unit id (third navigation level)
  const [activeKitchenUnitId, setActiveKitchenUnitId] = useState<string | null>(null);
  const [showSettingsPage, setShowSettingsPage] = useState(false);

  const activeProduct = activeProductId
    ? project.products.find(p => p.id === activeProductId) ?? null
    : null;

  const isKitchen = activeProduct?.productType === 'kitchen';

  const activeKitchenUnit = (isKitchen && activeKitchenUnitId)
    ? (activeProduct?.kitchenUnits ?? []).find(u => u.id === activeKitchenUnitId) ?? null
    : null;

  // ── Navigation labels ──────────────────────────────────────────────────────

  function headerTitle() {
    if (activeKitchenUnit) return activeKitchenUnit.name;
    if (activeProduct) return activeProduct.name;
    return t.appTitle;
  }

  function handleBack() {
    if (activeKitchenUnit) {
      setActiveKitchenUnitId(null);
    } else {
      clearActiveProduct();
    }
  }

  const showBack = !!activeProduct;

  // If settings page is open, show it fullscreen instead of the main content
  if (showSettingsPage) {
    return (
      <SettingsPage
        settings={settings}
        onToggleBodyMaterial={toggleBodyMaterial}
        onToggleFrontMaterial={toggleFrontMaterial}
        onSetBodyMaterialPrice={setBodyMaterialPrice}
        onResetBodyMaterialPrice={resetBodyMaterialPrice}
        onSetFrontMaterialPrice={setFrontMaterialPrice}
        onResetFrontMaterialPrice={resetFrontMaterialPrice}
        onAddCustomMaterial={addCustomMaterial}
        onRemoveCustomMaterial={removeCustomMaterial}
        onUpdateCustomMaterial={updateCustomMaterial}
        onBack={() => setShowSettingsPage(false)}
      />
    );
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerTitle}>
            {showBack && (
              <button className={styles.backBtn} onClick={handleBack} type="button">
                {t.project.backToProject}
              </button>
            )}
            <h1 className={styles.title}>{headerTitle()}</h1>
            {!activeProduct && <p className={styles.subtitle}>{t.appSubtitle}</p>}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              className={styles.settingsBtn}
              onClick={() => setShowSettingsPage(true)}
              aria-label="הגדרות / Settings"
              title={t.settings.title}
            >
              ⚙️
            </button>
            <button
              className={styles.langToggle}
              onClick={() => setLanguage(language === 'he' ? 'en' : 'he')}
              aria-label="החלף שפה / Switch language"
            >
              {t.langToggle}
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* Level 3: single kitchen unit editor */}
        {activeKitchenUnit && activeProduct && (
          <CabinetForm
            initialInput={activeKitchenUnit.cabinet.input}
            initialState={activeKitchenUnit.cabinet.state}
            onCabinetChange={(input: CabinetInput, state: SavedCabinetState) =>
              updateKitchenUnit(activeProduct.id, activeKitchenUnit.id, { input, state })
            }
            settings={settings}
            hideMainDimensions
            hideDoorsPerColumn
            hideEnvelopeTop
            splitShellSides
            hidePlinthEditor
          />
        )}

        {/* Level 2a: kitchen editor (list of units) */}
        {!activeKitchenUnit && activeProduct && isKitchen && (
          <KitchenEditor
            units={activeProduct.kitchenUnits ?? []}
            onAddUnit={(moduleType, name, W, materials) => addKitchenUnit(activeProduct.id, moduleType, name, W, materials)}
            onRemoveUnit={unitId => removeKitchenUnit(activeProduct.id, unitId)}
            onOpenUnit={unitId => setActiveKitchenUnitId(unitId)}
            onReorderUnit={(unitId, dir) => reorderKitchenUnit(activeProduct.id, unitId, dir)}
            onUpdateUnit={(unitId, cabinet) => updateKitchenUnit(activeProduct.id, unitId, cabinet)}
            settings={settings}
          />
        )}

        {/* Level 2b: single-unit product editor */}
        {!activeKitchenUnit && activeProduct && !isKitchen && (
          <CabinetForm
            initialInput={activeProduct.cabinet.input}
            initialState={activeProduct.cabinet.state}
            onCabinetChange={(input: CabinetInput, state: SavedCabinetState) =>
              updateProductCabinet(activeProduct.id, { input, state })
            }
            settings={settings}
          />
        )}

        {/* Level 1: project view */}
        {!activeProduct && (
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
