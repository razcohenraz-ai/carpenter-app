import React, { useState } from 'react';
import type { MaterialId, CustomMaterial } from '../../types/materials';
import { MATERIALS } from '../../catalog';
import { useTranslation } from '../hooks/useTranslation';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  settings: {
    bodyMaterialPriceOverrides: Partial<Record<MaterialId, number>>;
    bodyMaterialNameOverrides: Partial<Record<MaterialId, string>>;
    bodyMaterialThicknessOverrides: Partial<Record<MaterialId, number>>;
    bodyCustomMaterials: CustomMaterial[];
    frontMaterialPriceOverrides: Partial<Record<MaterialId, number>>;
    frontMaterialNameOverrides: Partial<Record<MaterialId, string>>;
    frontMaterialThicknessOverrides: Partial<Record<MaterialId, number>>;
    frontCustomMaterials: CustomMaterial[];
    hardwarePriceOverrides: Partial<Record<string, number>>;
  };
  // Body material
  onSetBodyMaterialPrice: (id: MaterialId, price: number) => void;
  onResetBodyMaterialPrice: (id: MaterialId) => void;
  onSetBodyMaterialName: (id: MaterialId, name: string) => void;
  onResetBodyMaterialName: (id: MaterialId) => void;
  onSetBodyMaterialThickness: (id: MaterialId, thickness: number) => void;
  onResetBodyMaterialThickness: (id: MaterialId) => void;
  onAddBodyCustomMaterial: (material: CustomMaterial) => void;
  onRemoveBodyCustomMaterial: (id: string) => void;
  onUpdateBodyCustomMaterial: (id: string, updates: Partial<CustomMaterial>) => void;
  // Front material
  onSetFrontMaterialPrice: (id: MaterialId, price: number) => void;
  onResetFrontMaterialPrice: (id: MaterialId) => void;
  onSetFrontMaterialName: (id: MaterialId, name: string) => void;
  onResetFrontMaterialName: (id: MaterialId) => void;
  onSetFrontMaterialThickness: (id: MaterialId, thickness: number) => void;
  onResetFrontMaterialThickness: (id: MaterialId) => void;
  onAddFrontCustomMaterial: (material: CustomMaterial) => void;
  onRemoveFrontCustomMaterial: (id: string) => void;
  onUpdateFrontCustomMaterial: (id: string, updates: Partial<CustomMaterial>) => void;
  // Hardware (Phase 3)
  onSetHardwarePrice?: (id: string, price: number) => void;
  onResetHardwarePrice?: (id: string) => void;
  onClose: () => void;
}

function generateId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return 'custom_' + Array.from(arr, x => x.toString(16).padStart(2, '0')).join('');
}

type Tab = 'body' | 'front' | 'hardware';

export function SettingsModal({
  settings,
  onSetBodyMaterialPrice,
  onResetBodyMaterialPrice,
  onSetBodyMaterialName,
  onResetBodyMaterialName,
  onSetBodyMaterialThickness,
  onResetBodyMaterialThickness,
  onAddBodyCustomMaterial,
  onRemoveBodyCustomMaterial,
  onUpdateBodyCustomMaterial,
  onSetFrontMaterialPrice,
  onResetFrontMaterialPrice,
  onSetFrontMaterialName,
  onResetFrontMaterialName,
  onSetFrontMaterialThickness,
  onResetFrontMaterialThickness,
  onAddFrontCustomMaterial,
  onRemoveFrontCustomMaterial,
  onUpdateFrontCustomMaterial,
  onClose,
}: SettingsModalProps): React.JSX.Element {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('body');
  const [newMaterial, setNewMaterial] = useState<{
    name?: string;
    thickness?: number;
    pricePerSheet?: number;
    sheetW: number;
    sheetH: number;
  }>({
    sheetW: 244,
    sheetH: 122,
  });

  // Get the active category's settings based on selected tab
  const getActiveSettings = () => {
    if (activeTab === 'front') {
      return {
        customMaterials: settings.frontCustomMaterials,
        nameOverrides: settings.frontMaterialNameOverrides,
        thicknessOverrides: settings.frontMaterialThicknessOverrides,
        priceOverrides: settings.frontMaterialPriceOverrides,
        onAddCustomMaterial: onAddFrontCustomMaterial,
        onRemoveCustomMaterial: onRemoveFrontCustomMaterial,
        onUpdateCustomMaterial: onUpdateFrontCustomMaterial,
        onSetMaterialName: onSetFrontMaterialName,
        onSetMaterialThickness: onSetFrontMaterialThickness,
        onSetMaterialPrice: onSetFrontMaterialPrice,
        onResetMaterialName: onResetFrontMaterialName,
        onResetMaterialThickness: onResetFrontMaterialThickness,
        onResetMaterialPrice: onResetFrontMaterialPrice,
      };
    }
    // Default to body
    return {
      customMaterials: settings.bodyCustomMaterials,
      nameOverrides: settings.bodyMaterialNameOverrides,
      thicknessOverrides: settings.bodyMaterialThicknessOverrides,
      priceOverrides: settings.bodyMaterialPriceOverrides,
      onAddCustomMaterial: onAddBodyCustomMaterial,
      onRemoveCustomMaterial: onRemoveBodyCustomMaterial,
      onUpdateCustomMaterial: onUpdateBodyCustomMaterial,
      onSetMaterialName: onSetBodyMaterialName,
      onSetMaterialThickness: onSetBodyMaterialThickness,
      onSetMaterialPrice: onSetBodyMaterialPrice,
      onResetMaterialName: onResetBodyMaterialName,
      onResetMaterialThickness: onResetBodyMaterialThickness,
      onResetMaterialPrice: onResetBodyMaterialPrice,
    };
  };

  const activeSettings = getActiveSettings();

  const handleAddMaterial = () => {
    if (!newMaterial.name || !newMaterial.thickness || !newMaterial.pricePerSheet) return;
    activeSettings.onAddCustomMaterial({
      id: generateId(),
      name: newMaterial.name,
      thickness: newMaterial.thickness,
      pricePerSheet: newMaterial.pricePerSheet,
      sheetW: newMaterial.sheetW ?? 244,
      sheetH: newMaterial.sheetH ?? 122,
    });
    setNewMaterial({ sheetW: 244, sheetH: 122 });
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2 className={styles.title}>{t.settings.title}</h2>
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setActiveTab('body')}
                style={{
                  padding: '8px 16px',
                  background: activeTab === 'body' ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === 'body' ? 'white' : 'var(--color-text-primary)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  borderRadius: '4px 4px 0 0',
                }}
              >
                חומר גוף
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('front')}
                style={{
                  padding: '8px 16px',
                  background: activeTab === 'front' ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === 'front' ? 'white' : 'var(--color-text-primary)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  borderRadius: '4px 4px 0 0',
                }}
              >
                חומר חזית
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hardware')}
                style={{
                  padding: '8px 16px',
                  background: activeTab === 'hardware' ? 'var(--color-primary)' : 'transparent',
                  color: activeTab === 'hardware' ? 'white' : 'var(--color-text-primary)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  borderRadius: '4px 4px 0 0',
                }}
              >
                פרזולים
              </button>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {/* Catalog materials */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t.settings.catalogMaterials}</h3>
            <table className={styles.materialTable}>
              <thead>
                <tr>
                  <th>{t.settings.materialName}</th>
                  <th>{t.settings.materialThickness}</th>
                  <th>{t.settings.materialPrice}</th>
                  <th>{t.settings.sheetDimensions}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(MATERIALS) as MaterialId[]).map(id => {
                  const mat = MATERIALS[id]!;
                  const nameOverride = activeSettings.nameOverrides[id];
                  const thicknessOverride = activeSettings.thicknessOverrides[id];
                  const priceOverride = activeSettings.priceOverrides[id];
                  const effectiveName = nameOverride ?? mat.name;
                  const effectiveThickness = thicknessOverride ?? mat.thickness;
                  const effectivePrice = priceOverride ?? mat.pricePerSheet;
                  return (
                    <tr key={id}>
                      <td>
                        <input
                          type="text"
                          className={styles.priceInput}
                          value={effectiveName}
                          onChange={e => activeSettings.onSetMaterialName(id, e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={styles.priceInput}
                          value={effectiveThickness}
                          onChange={e => activeSettings.onSetMaterialThickness(id, Number(e.target.value))}
                          onFocus={e => e.currentTarget.select()}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={styles.priceInput}
                          value={effectivePrice}
                          onChange={e => activeSettings.onSetMaterialPrice(id, Number(e.target.value))}
                          onFocus={e => e.currentTarget.select()}
                        />
                      </td>
                      <td className={styles.sheetDim}>
                        {mat.sheetW} × {mat.sheetH} cm
                      </td>
                      <td>
                        {(priceOverride !== undefined || nameOverride !== undefined || thicknessOverride !== undefined) && (
                          <button
                            type="button"
                            className={styles.resetBtn}
                            onClick={() => {
                              if (priceOverride !== undefined) activeSettings.onResetMaterialPrice(id);
                              if (nameOverride !== undefined) activeSettings.onResetMaterialName(id);
                              if (thicknessOverride !== undefined) activeSettings.onResetMaterialThickness(id);
                            }}
                          >
                            {t.settings.resetPrice}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Custom materials */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t.settings.customMaterials}</h3>
            {activeSettings.customMaterials.length === 0 ? (
              <p className={styles.empty}>{t.settings.noCustomMaterials}</p>
            ) : (
              <table className={styles.materialTable}>
                <thead>
                  <tr>
                    <th>{t.settings.materialName}</th>
                    <th>{t.settings.materialThickness}</th>
                    <th>{t.settings.materialPrice}</th>
                    <th>{t.settings.sheetDimensions}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {activeSettings.customMaterials.map(mat => (
                    <tr key={mat.id}>
                      <td>
                        <input
                          type="text"
                          className={styles.priceInput}
                          value={mat.name}
                          onChange={e => activeSettings.onUpdateCustomMaterial(mat.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={styles.priceInput}
                          value={mat.thickness}
                          onChange={e => activeSettings.onUpdateCustomMaterial(mat.id, { thickness: Number(e.target.value) })}
                          onFocus={e => e.currentTarget.select()}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={styles.priceInput}
                          value={mat.pricePerSheet}
                          onChange={e => activeSettings.onUpdateCustomMaterial(mat.id, { pricePerSheet: Number(e.target.value) })}
                          onFocus={e => e.currentTarget.select()}
                        />
                      </td>
                      <td className={styles.sheetDim}>
                        {mat.sheetW} × {mat.sheetH} cm
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => activeSettings.onRemoveCustomMaterial(mat.id)}
                        >
                          {t.settings.removeMaterial}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Add custom material form */}
            <fieldset className={styles.addMaterialForm}>
              <legend className={styles.addMaterialLegend}>{t.settings.addMaterial}</legend>
              <div className={styles.formGrid}>
                <input
                  type="text"
                  placeholder={t.settings.newMaterialName}
                  value={newMaterial.name ?? ''}
                  onChange={e => setNewMaterial(prev => ({ ...prev, name: e.target.value }))}
                  className={styles.formInput}
                />
                <input
                  type="number"
                  placeholder={t.settings.newMaterialThickness}
                  value={newMaterial.thickness ?? ''}
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : undefined;
                    setNewMaterial(prev => {
                      if (val === undefined) {
                        const { thickness: _, ...rest } = prev;
                        return rest;
                      }
                      return { ...prev, thickness: val };
                    });
                  }}
                  className={styles.formInput}
                />
                <input
                  type="number"
                  placeholder={t.settings.newMaterialPrice}
                  value={newMaterial.pricePerSheet ?? ''}
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : undefined;
                    setNewMaterial(prev => {
                      if (val === undefined) {
                        const { pricePerSheet: _, ...rest } = prev;
                        return rest;
                      }
                      return { ...prev, pricePerSheet: val };
                    });
                  }}
                  className={styles.formInput}
                />
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={handleAddMaterial}
                >
                  {t.settings.addMaterialBtn}
                </button>
              </div>
            </fieldset>
          </section>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.closeMainBtn} onClick={onClose}>
            {t.settings.close}
          </button>
        </div>
      </div>
    </div>
  );
}
