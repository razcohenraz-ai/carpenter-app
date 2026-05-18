import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { MATERIALS } from '../../catalog';
import styles from './ExternalDrawerEditor.module.css';
import type { DrawerItem } from '../../types/interior';
import type { MaterialId } from '../../types/materials';

interface Props {
  drawer: DrawerItem;
  onSetHeight: (h: number) => void;
  onSetThicknessOverride: (materialId: string | undefined) => void;
  onDelete: () => void;
  onClose: () => void;
}

const materialsArray = Object.values(MATERIALS);

export default function ExternalDrawerEditor({
  drawer, onSetHeight, onSetThicknessOverride, onDelete, onClose,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [heightStr, setHeightStr] = useState<string>(drawer.drawerHeight.toString());

  function commitHeight(): void {
    const n = parseFloat(heightStr);
    if (Number.isFinite(n) && n > 0 && n !== drawer.drawerHeight) onSetHeight(n);
  }

  function onMaterialChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const value = e.target.value;
    onSetThicknessOverride(value === '' ? undefined : (value as MaterialId));
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h3 className={styles.title}>{t.interior.editExternalDrawerTitle}</h3>

        <label className={styles.field}>
          <span className={styles.label}>{t.interior.drawerHeightLabel}</span>
          <input
            type="number"
            className={styles.input}
            value={heightStr}
            step={1}
            min={1}
            onChange={e => setHeightStr(e.target.value)}
            onBlur={commitHeight}
            onKeyDown={e => { if (e.key === 'Enter') { commitHeight(); e.currentTarget.blur(); } }}
            onFocus={e => e.target.select()}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{t.interior.drawerFrontThicknessLabel}</span>
          <select
            className={styles.input}
            value={drawer.frontThicknessOverride ?? ''}
            onChange={onMaterialChange}
          >
            <option value="">{t.interior.defaultMaterial}</option>
            {materialsArray.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.thickness}mm)</option>
            ))}
          </select>
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.deleteBtn} onClick={onDelete}>
            {t.interior.deleteDrawer}
          </button>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            {t.interior.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
