import { useState } from 'react';
import type { KitchenUnit } from '../../types/project';
import type { KitchenModuleType } from '../../core/product/kitchenModules';
import { useTranslation } from '../hooks/useTranslation';
import styles from './KitchenEditor.module.css';

const KITCHEN_MODULES: KitchenModuleType[] = ['drawers', 'shelves', 'sink'];
const KITCHEN_DEFAULT_W: Record<KitchenModuleType, number> = { drawers: 60, shelves: 60, sink: 80 };

interface Props {
  productName: string;
  units: KitchenUnit[];
  onAddUnit: (moduleType: KitchenModuleType, name: string, W?: number) => void;
  onRemoveUnit: (unitId: string) => void;
  onOpenUnit: (unitId: string) => void;
}

export function KitchenEditor({ productName, units, onAddUnit, onRemoveUnit, onOpenUnit }: Props) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedModule, setSelectedModule] = useState<KitchenModuleType>('drawers');
  const [unitW, setUnitW] = useState<string>('60');
  const [unitName, setUnitName] = useState('');

  function handleModuleChange(mod: KitchenModuleType) {
    setSelectedModule(mod);
    setUnitW(String(KITCHEN_DEFAULT_W[mod]));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(unitW);
    const finalName = unitName.trim() || `${t.project.kitchenModules[selectedModule] ?? selectedModule} ${w}`;
    onAddUnit(selectedModule, finalName, Number.isFinite(w) && w > 0 ? w : undefined);
    setUnitName('');
    setShowAddForm(false);
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>{productName}</h2>

      {units.length === 0 ? (
        <p className={styles.empty}>{t.project.kitchenNoUnits}</p>
      ) : (
        <div className={styles.unitList}>
          {units.map((unit, i) => (
            <div key={unit.id} className={styles.unitCard}>
              <div className={styles.unitNum}>{i + 1}</div>
              <div className={styles.unitInfo}>
                <div className={styles.unitModuleTag}>
                  {t.project.kitchenModules[unit.moduleType] ?? unit.moduleType}
                </div>
                <div className={styles.unitName}>{unit.name}</div>
                <div className={styles.unitDims}>
                  {unit.cabinet.input.W} × {unit.cabinet.input.H} × {unit.cabinet.input.D} ס"מ
                </div>
              </div>
              <div className={styles.unitActions}>
                <button type="button" className={styles.editBtn} onClick={() => onOpenUnit(unit.id)}>
                  {t.project.kitchenEditUnit}
                </button>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => { if (window.confirm(t.project.deleteConfirm)) onRemoveUnit(unit.id); }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <form className={styles.addForm} onSubmit={handleAdd}>
          <div className={styles.moduleRow}>
            <span className={styles.moduleLabel}>{t.project.kitchenModuleTitle}</span>
            {KITCHEN_MODULES.map(mod => (
              <button
                key={mod}
                type="button"
                className={`${styles.moduleBtn} ${selectedModule === mod ? styles.moduleBtnActive : ''}`}
                onClick={() => handleModuleChange(mod)}
              >
                {t.project.kitchenModules[mod] ?? mod}
              </button>
            ))}
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel}>
              {t.project.kitchenModuleWidth}
              <input
                type="number"
                className={styles.fieldInput}
                value={unitW}
                min={20}
                step={1}
                onChange={e => setUnitW(e.target.value)}
              />
            </label>
            <label className={styles.fieldLabel}>
              שם (אופציונלי)
              <input
                type="text"
                className={styles.fieldInput}
                value={unitName}
                placeholder={`${t.project.kitchenModules[selectedModule] ?? selectedModule} ${unitW}`}
                onChange={e => setUnitName(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className={styles.addActions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setShowAddForm(false)}>
              {t.interior.cancel}
            </button>
            <button type="submit" className={styles.confirmBtn}>
              הוסף
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={styles.addBtn} onClick={() => setShowAddForm(true)}>
          {t.project.kitchenAddUnit}
        </button>
      )}
    </div>
  );
}
