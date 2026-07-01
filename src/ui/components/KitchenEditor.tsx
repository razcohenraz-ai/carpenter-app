import { useState, useRef, useEffect } from 'react';
import type { KitchenUnit } from '../../types/project';
import type { KitchenModuleType } from '../../core/product/kitchenModules';
import type { MaterialId } from '../../types/materials';
import { MATERIALS } from '../../catalog';
import { useTranslation } from '../hooks/useTranslation';
import { KitchenOverview } from './KitchenOverview';
import styles from './KitchenEditor.module.css';

const KITCHEN_MODULES: KitchenModuleType[] = ['drawers', 'shelves', 'sink', 'dishwasher', 'oven', 'pantry', 'wall', 'pantry-top', 'corner'];
const KITCHEN_DEFAULT_W: Record<KitchenModuleType, number> = { drawers: 60, shelves: 60, sink: 80, dishwasher: 64, oven: 60, pantry: 60, wall: 100, 'pantry-top': 60, corner: 125 };

interface Props {
  units: KitchenUnit[];
  onAddUnit: (moduleType: KitchenModuleType, name: string, W?: number, materials?: { bodyMaterialId?: MaterialId; frontMaterialId?: MaterialId }) => void;
  onRemoveUnit: (unitId: string) => void;
  onOpenUnit: (unitId: string) => void;
  /** Open a unit AND land directly on the clicked front's editor (the "cabinet
   *  way" — clicking a front in the overview jumps straight to its door/drawer
   *  editor). */
  onOpenUnitToFront?: (unitId: string, editing: { type: 'door'; doorId: string } | { type: 'drawer'; drawerId: string }) => void;
  onReorderUnit: (unitId: string, direction: 'left' | 'right') => void;
  /** Called when KitchenOverview's kitchen-level editors (plinth, etc.)
   *  commit a change that must propagate to a unit's cabinet. */
  onUpdateUnit?: (unitId: string, cabinet: import('../../types').Cabinet) => void;
  settings?: {
    customMaterials?: import('../../types/materials').CustomMaterial[];
    bodyMaterialPriceOverrides?: Partial<Record<import('../../types/materials').MaterialId, number>>;
    frontMaterialPriceOverrides?: Partial<Record<import('../../types/materials').MaterialId, number>>;
    bodyEnabledMaterialIds?: string[];
    frontEnabledMaterialIds?: string[];
  } | undefined;
}

export function KitchenEditor({
  units,
  onAddUnit, onRemoveUnit, onOpenUnit, onOpenUnitToFront, onReorderUnit,
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
  // Kitchen-wide materials — compact button + flyout (click outside to close).
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const materialsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!materialsOpen) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (materialsRef.current && !materialsRef.current.contains(e.target as Node)) {
        setMaterialsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [materialsOpen]);

  const selectedUnit = selectedUnitId ? units.find(u => u.id === selectedUnitId) ?? null : null;
  const selectedIndex = selectedUnit ? units.indexOf(selectedUnit) : -1;

  // ── Kitchen-wide materials (global selectors) ───────────────────────────────
  // No stored kitchen-level field (single source of truth = the units): the
  // selector value is DERIVED — the material shared by all units, or null when
  // they differ ("mixed"). Changing it writes the material to every unit.
  // Per-unit overrides happen later via each unit's own form.
  const DEFAULT_MATERIAL_IDS = Object.keys(MATERIALS);
  const allMaterials = [
    ...Object.values(MATERIALS),
    ...(settings?.customMaterials ?? []),
  ];
  function sharedMaterial(pick: (u: KitchenUnit) => string): string | null {
    if (units.length === 0) return null;
    const first = pick(units[0]!);
    return units.every(u => pick(u) === first) ? first : null;
  }
  const commonBody = sharedMaterial(u => u.cabinet.input.bodyMaterialId);
  const commonFront = sharedMaterial(u => u.cabinet.input.frontMaterialId);
  // Shared back-panel thickness (cm) across units, or null when they differ.
  function sharedNumber(pick: (u: KitchenUnit) => number): number | null {
    if (units.length === 0) return null;
    const first = pick(units[0]!);
    return units.every(u => pick(u) === first) ? first : null;
  }
  const commonBack = sharedNumber(u => u.cabinet.input.backThickness);
  function materialOptions(enabledIds: string[] | undefined, current: string | null) {
    const enabled = enabledIds ?? DEFAULT_MATERIAL_IDS;
    const base = allMaterials.filter(m => enabled.includes(m.id));
    // Always include the current shared material even if it was unchecked in settings.
    if (current && !base.some(m => m.id === current)) {
      const cur = allMaterials.find(m => m.id === current);
      if (cur) return [...base, cur];
    }
    return base;
  }
  const bodyOptions = materialOptions(settings?.bodyEnabledMaterialIds, commonBody);
  const frontOptions = materialOptions(settings?.frontEnabledMaterialIds, commonFront);
  function setAllMaterials(patch: { bodyMaterialId?: MaterialId; frontMaterialId?: MaterialId; backThickness?: number }): void {
    if (!onUpdateUnit) return;
    for (const u of units) {
      onUpdateUnit(u.id, { input: { ...u.cabinet.input, ...patch }, state: u.cabinet.state });
    }
  }

  function handleModuleChange(mod: KitchenModuleType) {
    setSelectedModule(mod);
    setUnitW(String(KITCHEN_DEFAULT_W[mod]));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(unitW);
    const finalName = unitName.trim() || `${t.project.kitchenModules[selectedModule] ?? selectedModule} ${w}`;
    // Inherit the kitchen-wide material so a new unit doesn't break uniformity.
    const inherited: { bodyMaterialId?: MaterialId; frontMaterialId?: MaterialId } = {};
    if (commonBody) inherited.bodyMaterialId = commonBody as MaterialId;
    if (commonFront) inherited.frontMaterialId = commonFront as MaterialId;
    const hasInherited = inherited.bodyMaterialId !== undefined || inherited.frontMaterialId !== undefined;
    onAddUnit(selectedModule, finalName, Number.isFinite(w) && w > 0 ? w : undefined, hasInherited ? inherited : undefined);
    setUnitName('');
    setShowAddForm(false);
  }

  return (
    <div className={styles.editor}>
      {/* Kitchen-wide materials — a compact button opening a flyout with the
          body / front material selectors + back-panel thickness. Applies to
          every unit; per-unit overrides happen later via each unit's editor. */}
      {units.length > 0 && onUpdateUnit && (
        <div className={styles.materialsTool} ref={materialsRef}>
          <button
            type="button"
            className={`${styles.materialsBtn} ${materialsOpen ? styles.materialsBtnActive : ''}`}
            onClick={() => setMaterialsOpen(o => !o)}
          >
            🎨 {t.kitchen.materialsTitle}
          </button>
          {materialsOpen && (
            <div className={styles.materialsFlyout}>
              <label className={styles.materialField}>
                {t.form.bodyMaterial}
                <select
                  className={styles.materialSelect}
                  value={commonBody ?? ''}
                  onChange={e => setAllMaterials({ bodyMaterialId: e.target.value as MaterialId })}
                >
                  {commonBody === null && <option value="" disabled>{t.kitchen.mixed}</option>}
                  {bodyOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className={styles.materialField}>
                {t.form.frontMaterial}
                <select
                  className={styles.materialSelect}
                  value={commonFront ?? ''}
                  onChange={e => setAllMaterials({ frontMaterialId: e.target.value as MaterialId })}
                >
                  {commonFront === null && <option value="" disabled>{t.kitchen.mixed}</option>}
                  {frontOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className={styles.materialField}>
                {t.form.backThickness}
                <input
                  type="number"
                  className={styles.materialSelect}
                  step={0.5}
                  min={0}
                  value={commonBack !== null ? commonBack * 10 : ''}
                  placeholder={commonBack === null ? t.kitchen.mixed : ''}
                  onChange={e => {
                    const mm = parseFloat(e.target.value);
                    setAllMaterials({ backThickness: isNaN(mm) ? 0 : mm / 10 });
                  }}
                  onFocus={e => e.target.select()}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Visual overview */}
      <KitchenOverview
        units={units}
        selectedUnitId={selectedUnitId}
        onSelect={id => { setSelectedUnitId(id); setShowAddForm(false); }}
        onOpenUnit={onOpenUnit}
        {...(onOpenUnitToFront ? { onOpenUnitToFront } : {})}
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
            {/* RTL elevation: index 0 renders right-most, so moving the unit
                visually LEFT means a higher array index ('right'), and visually
                RIGHT means a lower index ('left'). */}
            <button
              type="button"
              className={styles.reorderBtn}
              disabled={selectedIndex >= units.length - 1}
              onClick={() => onReorderUnit(selectedUnit.id, 'right')}
              title="הזז שמאלה"
            >
              ←
            </button>
            <button
              type="button"
              className={styles.reorderBtn}
              disabled={selectedIndex <= 0}
              onClick={() => onReorderUnit(selectedUnit.id, 'left')}
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
