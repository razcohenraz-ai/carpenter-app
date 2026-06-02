import React, { useState } from 'react';
import type { MaterialId, CustomMaterial } from '../../types/materials';
import { MATERIALS } from '../../catalog';
import { useTranslation } from '../hooks/useTranslation';
import styles from './SettingsPage.module.css';

interface SettingsPageProps {
  settings: {
    customMaterials: CustomMaterial[];
    bodyEnabledMaterialIds: string[];
    frontEnabledMaterialIds: string[];
    bodyMaterialPriceOverrides: Partial<Record<MaterialId, number>>;
    frontMaterialPriceOverrides: Partial<Record<MaterialId, number>>;
  };
  onToggleBodyMaterial: (id: string) => void;
  onToggleFrontMaterial: (id: string) => void;
  onSetBodyMaterialPrice: (id: MaterialId, price: number) => void;
  onResetBodyMaterialPrice: (id: MaterialId) => void;
  onSetFrontMaterialPrice: (id: MaterialId, price: number) => void;
  onResetFrontMaterialPrice: (id: MaterialId) => void;
  onAddCustomMaterial: (material: CustomMaterial) => void;
  onRemoveCustomMaterial: (id: string) => void;
  onUpdateCustomMaterial: (id: string, updates: Partial<CustomMaterial>) => void;
  onBack: () => void;
}

function generateId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return 'custom_' + Array.from(arr, x => x.toString(16).padStart(2, '0')).join('');
}

type Tab = 'body' | 'front';

export function SettingsPage({
  settings,
  onToggleBodyMaterial,
  onToggleFrontMaterial,
  onSetBodyMaterialPrice,
  onResetBodyMaterialPrice,
  onSetFrontMaterialPrice,
  onResetFrontMaterialPrice,
  onAddCustomMaterial,
  onRemoveCustomMaterial,
  onUpdateCustomMaterial,
  onBack,
}: SettingsPageProps): React.JSX.Element {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('body');
  const [newMaterial, setNewMaterial] = useState<{
    name?: string;
    thickness?: number;
    pricePerSheet?: number;
    sheetW: number;
    sheetH: number;
  }>({ sheetW: 244, sheetH: 122 });

  const enabledIds = activeTab === 'body'
    ? settings.bodyEnabledMaterialIds
    : settings.frontEnabledMaterialIds;

  const priceOverrides = activeTab === 'body'
    ? settings.bodyMaterialPriceOverrides
    : settings.frontMaterialPriceOverrides;

  const onToggle = activeTab === 'body' ? onToggleBodyMaterial : onToggleFrontMaterial;
  const onSetPrice = activeTab === 'body' ? onSetBodyMaterialPrice : onSetFrontMaterialPrice;
  const onResetPrice = activeTab === 'body' ? onResetBodyMaterialPrice : onResetFrontMaterialPrice;

  const handleAddMaterial = () => {
    if (!newMaterial.name || newMaterial.thickness === undefined || newMaterial.pricePerSheet === undefined) {
      return;
    }
    onAddCustomMaterial({
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
    <div className={styles.page}>
      <div className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          ← {t.project.backToProject}
        </button>
        <h1 className={styles.title}>{t.settings.title}</h1>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          onClick={() => setActiveTab('body')}
          className={activeTab === 'body' ? styles.tabActive : styles.tab}
        >
          חומר גוף
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('front')}
          className={activeTab === 'front' ? styles.tabActive : styles.tab}
        >
          חומר חזית
        </button>
      </div>

      <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.tableContainer}>
            <table className={styles.materialTable}>
              <thead>
                <tr>
                  <th className={styles.colCheck}>{/* checkbox column */}</th>
                  <th>{t.settings.materialName}</th>
                  <th>{t.settings.materialThickness}</th>
                  <th>{t.settings.materialPrice}</th>
                  <th>{t.settings.sheetDimensions}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {/* Catalog materials — name & thickness read-only, price editable */}
                {(Object.keys(MATERIALS) as MaterialId[]).map(id => {
                  const mat = MATERIALS[id]!;
                  const isEnabled = enabledIds.includes(id);
                  const priceOverride = priceOverrides[id];
                  const effectivePrice = priceOverride ?? mat.pricePerSheet;
                  return (
                    <tr key={id} className={!isEnabled ? styles.rowDisabled : undefined}>
                      <td className={styles.colCheck}>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => onToggle(id)}
                          className={styles.checkbox}
                        />
                      </td>
                      <td className={styles.colName}>
                        <span className={styles.materialName}>{mat.name}</span>
                      </td>
                      <td>
                        <span className={styles.readOnly}>{mat.thickness}</span>
                      </td>
                      <td>
                        <div className={styles.priceCell}>
                          <input
                            type="number"
                            className={styles.input}
                            value={effectivePrice}
                            onChange={e => onSetPrice(id, Number(e.target.value))}
                            onFocus={e => e.currentTarget.select()}
                          />
                          {priceOverride !== undefined && (
                            <button
                              type="button"
                              className={styles.resetBtn}
                              onClick={() => onResetPrice(id)}
                              title={t.settings.resetPrice}
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={styles.sheetDim}>
                        {mat.sheetW} × {mat.sheetH} cm
                      </td>
                      <td></td>
                    </tr>
                  );
                })}

                {/* Custom materials — all fields editable, delete button */}
                {settings.customMaterials.map(mat => {
                  const isEnabled = enabledIds.includes(mat.id);
                  return (
                    <tr key={mat.id} className={!isEnabled ? styles.rowDisabled : undefined}>
                      <td className={styles.colCheck}>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => onToggle(mat.id)}
                          className={styles.checkbox}
                        />
                      </td>
                      <td className={styles.colName}>
                        <input
                          type="text"
                          className={styles.input}
                          value={mat.name}
                          onChange={e => onUpdateCustomMaterial(mat.id, { name: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={styles.input}
                          value={mat.thickness}
                          onChange={e => onUpdateCustomMaterial(mat.id, { thickness: Number(e.target.value) })}
                          onFocus={e => e.currentTarget.select()}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={styles.input}
                          value={mat.pricePerSheet}
                          onChange={e => onUpdateCustomMaterial(mat.id, { pricePerSheet: Number(e.target.value) })}
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
                          onClick={() => onRemoveCustomMaterial(mat.id)}
                        >
                          {t.settings.removeMaterial}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add custom material form */}
          <fieldset className={styles.addMaterialForm}>
            <legend className={styles.legend}>{t.settings.addMaterial}</legend>
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
    </div>
  );
}
