import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import type { Box } from '../../types/geometry';
import type { MaterialId } from '../../types/materials';
import type { BoxMaterialOverride } from '../../core/boards/boxMaterials';
import styles from './CabinetForm.module.css';

interface MaterialOption { id: string; name: string }

/** The four preview tabs (mirrors the main cabinet view), each scoped to this
 *  body only. Supplied by the parent as ready-to-render nodes. */
interface BodyTabs {
  bodies: React.ReactNode;
  fronts: React.ReactNode;
  cuts: React.ReactNode;
  hardware: React.ReactNode;
}

interface Props {
  box: Box;
  label: string;
  bodyMaterials: MaterialOption[];
  frontMaterials: MaterialOption[];
  cabinetBodyMaterialId: MaterialId;
  cabinetFrontMaterialId: MaterialId;
  cabinetBackThicknessMm: number;
  override: BoxMaterialOverride | undefined;
  onSetBodyMaterial: (id: MaterialId | undefined) => void;
  onSetFrontMaterial: (id: MaterialId | undefined) => void;
  onSetBackThickness: (mm: number | undefined) => void;
  onReset: () => void;
  onEditInterior: () => void;
  onBack: () => void;
  /** Per-body Bodies / Fronts / Cuts / Hardware tab contents (this body only). */
  tabs: BodyTabs;
}

function nameOf(opts: MaterialOption[], id: string): string {
  return opts.find(m => m.id === id)?.name ?? id;
}

type Tab = 'bodies' | 'fronts' | 'cuts' | 'hardware';

/** The per-body "body view": override this body's materials + back thickness,
 *  and inspect THIS body's bodies / fronts / cuts / hardware. Sits between the
 *  main cabinet view and the interior editor (main → body view → interior). */
export default function BodyView({
  box, label, bodyMaterials, frontMaterials,
  cabinetBodyMaterialId, cabinetFrontMaterialId, cabinetBackThicknessMm,
  override, onSetBodyMaterial, onSetFrontMaterial, onSetBackThickness,
  onReset, onEditInterior, onBack, tabs,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('bodies');
  const hasOverride = override !== undefined && Object.keys(override).length > 0;

  const tabBtn = (id: Tab, text: string) => (
    <button
      type="button"
      className={`${styles.modeBtn} ${tab === id ? styles.modeBtnActive : ''}`}
      onClick={() => setTab(id)}
    >
      {text}
    </button>
  );

  return (
    <div className={styles.form}>
      <div className={styles.bodyViewHeader}>
        <button type="button" className={styles.backButton} onClick={onBack}>{t.bodyView.back}</button>
        <h2 className={styles.bodyViewTitle}>{t.bodyView.title}{label ? ` — ${label}` : ''}</h2>
        <span className={styles.bodyViewDims}>{box.W} × {box.H} × {box.D} {t.form.unitCm}</span>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.formCol}>
          <p className={styles.bodyViewHint}>{t.bodyView.hint}</p>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="bodyview-body-material">{t.form.bodyMaterial}</label>
            <select
              id="bodyview-body-material"
              className={styles.select}
              value={override?.bodyMaterialId ?? ''}
              onChange={e => onSetBodyMaterial(e.target.value === '' ? undefined : (e.target.value as MaterialId))}
            >
              <option value="">{t.bodyView.inherit}: {nameOf(bodyMaterials, cabinetBodyMaterialId)}</option>
              {bodyMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="bodyview-front-material">{t.form.frontMaterial}</label>
            <select
              id="bodyview-front-material"
              className={styles.select}
              value={override?.frontMaterialId ?? ''}
              onChange={e => onSetFrontMaterial(e.target.value === '' ? undefined : (e.target.value as MaterialId))}
            >
              <option value="">{t.bodyView.inherit}: {nameOf(frontMaterials, cabinetFrontMaterialId)}</option>
              {frontMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="bodyview-back-thickness">{t.form.backThickness}</label>
            <input
              id="bodyview-back-thickness"
              className={styles.input}
              type="number"
              step={0.5}
              min={0}
              value={override?.backThicknessCm !== undefined ? override.backThicknessCm * 10 : ''}
              placeholder={String(cabinetBackThicknessMm)}
              onChange={e => onSetBackThickness(e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0))}
              onFocus={e => e.target.select()}
            />
          </div>

          <div className={styles.bodyViewActions}>
            {hasOverride && (
              <button type="button" className={styles.resetButton} onClick={onReset}>{t.bodyView.reset}</button>
            )}
            <button type="button" className={styles.primaryButton} onClick={onEditInterior}>{t.bodyView.editInterior}</button>
          </div>
        </div>

        <div className={styles.formCol}>
          <div className={styles.modeToggle}>
            {tabBtn('bodies', t.doors.bodies)}
            {tabBtn('fronts', t.doors.fronts)}
            {tabBtn('cuts', t.cutsList.tab)}
            {tabBtn('hardware', t.hardwareList.tab)}
          </div>
          {tab === 'bodies' && tabs.bodies}
          {tab === 'fronts' && tabs.fronts}
          {tab === 'cuts' && tabs.cuts}
          {tab === 'hardware' && tabs.hardware}
        </div>
      </div>
    </div>
  );
}
