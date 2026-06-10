import { useState } from 'react';
import type { KitchenUnit } from '../../types/project';
import type { KitchenModuleType } from '../../core/product/kitchenModules';
import { useTranslation } from '../hooks/useTranslation';
import { KitchenOverview } from './KitchenOverview';
import styles from './KitchenEditor.module.css';

const KITCHEN_MODULES: KitchenModuleType[] = ['drawers', 'shelves', 'sink', 'dishwasher'];
const KITCHEN_DEFAULT_W: Record<KitchenModuleType, number> = { drawers: 60, shelves: 60, sink: 80, dishwasher: 64 };

interface Props {
  units: KitchenUnit[];
  onAddUnit: (moduleType: KitchenModuleType, name: string, W?: number) => void;
  onRemoveUnit: (unitId: string) => void;
  onOpenUnit: (unitId: string) => void;
  onReorderUnit: (unitId: string, direction: 'left' | 'right') => void;
  /** Called when KitchenOverview's kitchen-level editors (plinth, etc.)
   *  commit a change that must propagate to a unit's cabinet. */
  onUpdateUnit?: (unitId: string, cabinet: import('../../types').Cabinet) => void;
  settings?: {
    customMaterials?: import('../../types/materials').CustomMaterial[];
    bodyMaterialPriceOverrides?: Partial<Record<import('../../types/materials').MaterialId, number>>;
    frontMaterialPriceOverrides?: Partial<Record<import('../../types/materials').MaterialId, number>>;
  } | undefined;
}

export function KitchenEditor({
  units,
  onAddUnit, onRemoveUnit, onOpenUnit, onReorderUnit,
  onUpdateUnit,
  settings,
}: Props) {
  const { t } = useTranslation();
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    units.length > 0 ? units[0]!.id : null,
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedModule, setSelectedModule] = useState<KitchenModuleType>('drawers');
  const [unitW, setUnitW] = useState<string>('60');
  const [unitName, setUnitName] = useState('');

  const selectedUnit = selectedUnitId ? units.find(u => u.id === selectedUnitId) ?? null : null;
  const selectedIndex = selectedUnit ? units.indexOf(selectedUnit) : -1;

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
    <div className={styles.editor}>
      {/* Visual overview */}
      <KitchenOverview
        units={units}
        selectedUnitId={selectedUnitId}
        onSelect={id => { setSelectedUnitId(id); setShowAddForm(false); }}
        onOpenUnit={onOpenUnit}
        {...(onUpdateUnit ? { onUpdateUnit } : {})}
        settings={settings}
      />

      {/* Selected unit panel */}
      {selectedUnit && !showAddForm && (
        <div className={styles.selectedPanel}>
          <div className={styles.selectedInfo}>
            <span className={styles.selectedTag}>
              {t.project.kitchenModules[selectedUnit.moduleType] ?? selectedUnit.moduleType}
            </span>
            <span className={styles.selectedName}>{selectedUnit.name}</span>
            <span className={styles.selectedDims}>
              {selectedUnit.cabinet.input.W} × {selectedUnit.cabinet.input.H} × {selectedUnit.cabinet.input.D} ס"מ
            </span>
          </div>
          <div className={styles.selectedActions}>
            <button
              type="button"
              className={styles.reorderBtn}
              disabled={selectedIndex <= 0}
              onClick={() => onReorderUnit(selectedUnit.id, 'left')}
              title="הזז שמאלה"
            >
              ←
            </button>
            <button
              type="button"
              className={styles.reorderBtn}
              disabled={selectedIndex >= units.length - 1}
              onClick={() => onReorderUnit(selectedUnit.id, 'right')}
              title="הזז ימינה"
            >
              →
            </button>
            <button
              type="button"
              className={styles.editBtn}
              onClick={() => onOpenUnit(selectedUnit.id)}
            >
              {t.project.kitchenEditUnit}
            </button>
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => {
                if (window.confirm(t.project.deleteConfirm)) {
                  onRemoveUnit(selectedUnit.id);
                  setSelectedUnitId(null);
                }
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Add form */}
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
            <button type="submit" className={styles.confirmBtn}>הוסף</button>
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
