import React, { useState } from 'react';
import { useTranslation } from './hooks/useTranslation';
import { useProject } from './hooks/useProject';
import { useSettings } from './hooks/useSettings';
import { ProjectView } from './components/ProjectView';
import { KitchenEditor } from './components/KitchenEditor';
import { RoomView } from './components/RoomView';
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
    addRoom, removeRoom, renameRoom, updateRoomDims,
    placeProduct, updatePlacement, removePlacement,
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
  // Active room id (floor-plan navigation level, parallel to activeProductId)
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [showSettingsPage, setShowSettingsPage] = useState(false);

  const activeProduct = activeProductId
    ? project.products.find(p => p.id === activeProductId) ?? null
    : null;

  const activeRoom = activeRoomId
    ? (project.rooms ?? []).find(r => r.id === activeRoomId) ?? null
    : null;

  const isKitchen = activeProduct?.productType === 'kitchen';

  const activeKitchenUnit = (isKitchen && activeKitchenUnitId)
    ? (activeProduct?.kitchenUnits ?? []).find(u => u.id === activeKitchenUnitId) ?? null
    : null;

  // ── Navigation labels ──────────────────────────────────────────────────────

  function headerTitle() {
    if (activeKitchenUnit) return activeKitchenUnit.name;
    if (activeProduct) return activeProduct.name;
    if (activeRoom) return activeRoom.name;
    return t.appTitle;
  }

  function handleBack() {
    if (activeKitchenUnit) {
      setActiveKitchenUnitId(null);
    } else if (activeProduct) {
      // Returns to the room if the product was opened from a room, else project.
      clearActiveProduct();
    } else {
      setActiveRoomId(null);
    }
  }

  const showBack = !!activeProduct || !!activeRoom;

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

        {/* Level 1b: room floor plan (active when a room is open and no product is) */}
        {!activeProduct && activeRoom && (
          <RoomView
            room={activeRoom}
            products={project.products}
            onUpdateDims={dims => updateRoomDims(activeRoom.id, dims)}
            onRenameRoom={name => renameRoom(activeRoom.id, name)}
            onPlaceProduct={placement => placeProduct(activeRoom.id, placement)}
            onUpdatePlacement={(productId, patch) => updatePlacement(activeRoom.id, productId, patch)}
            onRemovePlacement={productId => removePlacement(activeRoom.id, productId)}
            onOpenProduct={setActiveProduct}
          />
        )}

        {/* Level 1: project view */}
        {!activeProduct && !activeRoom && (
          <ProjectView
            project={project}
            onOpenProduct={setActiveProduct}
            onAddProduct={addProduct}
            onRemoveProduct={removeProduct}
            onOpenRoom={setActiveRoomId}
            onAddRoom={() => {
              const name = prompt(t.room.roomName, t.room.title);
              if (name === null) return; // user cancelled
              const id = addRoom(name.trim() || t.room.title);
              setActiveRoomId(id);
            }}
            onRemoveRoom={removeRoom}
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
