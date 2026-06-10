import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import BoxBodySketch from './BoxBodySketch';
import { syncFixedShelf } from '../../core/interior/fixedShelfUtils';
import {
  addShelfRedistributed,
  redistributeShelves,
  defaultDrawerPlacement,
  defaultRodPlacement,
  equalizeExternalDrawersIfOverflow,
  validateInterior,
} from '../../core/interior/interiorUtils';
import { MATERIALS } from '../../catalog';
import styles from './BoxInteriorEditor.module.css';
import type { InteriorItem, DrawerItem, DrawerMount, InteriorWarning, ShelfWarning } from '../../types/interior';
import type { Box, BoxPosition } from '../../types/geometry';
import type { Edging } from '../../types/edging';
import type { MaterialId } from '../../types/materials';
import type { Translations } from '../../i18n/translations';

function shelfWarningText(w: ShelfWarning, t: Translations): string {
  if (w.kind === 'small_zone')        return t.interior.warnShelfSmallZone;
  if (w.kind === 'rod_low')           return t.interior.warnRodLow;
  if (w.kind === 'rod_drawer_close')  return t.interior.warnRodDrawerClose;
  return '';
}

interface Props {
  box: Box;
  items: InteriorItem[];
  onChange: (items: InteriorItem[]) => void;
  onBack: () => void;
  numFronts: number;
  hasPartitions: boolean;
  onAddPartition: () => void;
  onRemovePartition: () => void;
  cellItems: InteriorItem[][];
  onCellItemsChange: (cellIndex: number, items: InteriorItem[]) => void;
  tBody: number;
  /** Cabinet-wide door/front gap in mm — needed locally so the editor can
   *  run `syncFixedShelf` on its optimistic copy and reflect the auto fixed
   *  shelf immediately, before the parent's state update round-trips back. */
  doorGapMm: number;
  // ── Board-model props (passed through to BoxBodySketch) ──────────────────
  // Whole-body sketch uses these to draw the carcass boards as background.
  // Cell sketches (partitioned bodies) intentionally pass hasOuterShell=false
  // — the envelope belongs to the whole body, not the cell.
  bodyMaterialId: import('../../types/materials').MaterialId;
  frontMaterialId: import('../../types/materials').MaterialId;
  hasOuterShell: boolean;
  hasEnvelopeTop: boolean;
  /** Cabinet-wide edging — shown as the "inherit" target in the override
   *  section. Used to seed `bodyEdgingOverride` when the user toggles
   *  "מותאם" for the first time. */
  cabinetEdging: Edging;
  /** Current per-body edging override, if any. `undefined` ↔ inheriting
   *  cabinet edging. */
  bodyEdgingOverride: Edging | undefined;
  /** Setter: pass `undefined` to revert to cabinet edging, an `Edging` value
   *  to apply / update the per-body band. */
  onSetBodyEdging: (edging: Edging | undefined) => void;
  /** Current per-body dimension overrides, if any. Derived (decomposeBoxes)
   *  values are in `box.W / box.H / box.D`; an override replaces only the
   *  axis the carpenter explicitly set. */
  boxDimensionOverride: import('../hooks/useCabinet').BoxDimensionOverride | undefined;
  /** Set one dimension axis override. Pass `undefined` to revert that axis. */
  onSetBoxDimension: (axis: 'W' | 'H' | 'D', value: number | undefined) => void;
  /** Reset all dimension overrides for this body. */
  onResetBoxDimensions: () => void;
  /** Derived box dimensions (from decomposeBoxes, before overrides) — shown
   *  as placeholder values in override inputs. */
  derivedW: number;
  derivedH: number;
  derivedD: number;
  /** When true, hide the "add hanging rod" button. Used for kitchen units
   *  where hanging rods don't apply (only wardrobes use them). */
  hideRodOption?: boolean;
  /** When true, hide ALL add-item controls (shelf, drawer, rod, partition).
   *  Used for appliance-bay units (e.g. dishwasher) that have no interior. */
  hideInteriorControls?: boolean;
  /** Sink-open variant flags — passed through to BoxBodySketch so the
   *  carcass background renders the standing sink traverses instead of a
   *  top board. Both undefined for non-sink units. */
  topVariant?: 'standard' | 'sink-open';
  sinkTraverseWidthCm?: number;
}

// Larger sketches give the carpenter a more readable cross-section in the
// body editor; the controls column flexes to take the remaining width.
const SKETCH_W      = 270;
const SKETCH_H      = 570;
const CELL_SKETCH_W = 195;
const CELL_SKETCH_H = 390;

export default function BoxInteriorEditor({
  box, items, onChange, onBack, numFronts, hasPartitions,
  onAddPartition, onRemovePartition,
  cellItems, onCellItemsChange, tBody, doorGapMm,
  bodyMaterialId, frontMaterialId, hasOuterShell, hasEnvelopeTop,
  cabinetEdging, bodyEdgingOverride, onSetBodyEdging,
  boxDimensionOverride, onSetBoxDimension, onResetBoxDimensions,
  derivedW, derivedH, derivedD,
  hideRodOption,
  hideInteriorControls,
  topVariant, sinkTraverseWidthCm,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [localItems, setLocalItems] = useState<InteriorItem[]>(items);
  const [localCellItems, setLocalCellItems] = useState<InteriorItem[][]>(
    cellItems.length === 2 ? cellItems : [[], []],
  );
  const [pendingAction, setPendingAction] = useState<null | 'add' | 'remove'>(null);
  const [boxShelfWarnings,  setBoxShelfWarnings]  = useState<ShelfWarning[]>([]);
  const [cellShelfWarnings, setCellShelfWarnings] = useState<ShelfWarning[][]>([[], []]);
  // Where to drop the new drawer once the user picks internal/external.
  // null = no dialog open; { kind: 'box' } = add to body; { kind: 'cell', cellIndex } = add to cell.
  const [drawerTarget, setDrawerTarget] = useState<null | { kind: 'box' } | { kind: 'cell'; cellIndex: number }>(null);

  const bodyH = box.H;
  const cellW = (box.W - tBody) / 2;

  const levelLabel: Record<string, string> = {
    top:    t.boxes.levelTop,
    middle: t.boxes.levelMiddle,
    bottom: t.boxes.levelBottom,
    single: t.boxes.levelSingle,
  };

  const posLabel = (pos: BoxPosition): string => {
    if (pos === 'single') return '';
    if (pos === 'left')  return t.boxes.posLeft;
    if (pos === 'right') return t.boxes.posRight;
    return `${t.boxes.posUnit} ${box.unitIndex ?? ''}`.trim();
  };

  const levelStr = levelLabel[box.level] ?? box.level;
  const posStr   = posLabel(box.position);
  const boxLabel = posStr ? `${levelStr} ${posStr}` : levelStr;

  // ── single-box item helpers ───────────────────────────────────────────────

  function update(next: InteriorItem[]): void {
    // Run syncFixedShelf on the local copy so the auto fixed shelf appears in
    // BoxBodySketch immediately, without waiting for a parent state round-trip.
    // The parent (useCabinet.setBoxInterior) re-runs the same sync against its
    // own snapshot — that path is idempotent (existing shelf → height update).
    const synced = syncFixedShelf(localItems, next, doorGapMm, tBody);
    setLocalItems(synced);
    onChange(synced);
  }

  function addShelf(): void {
    const { items: next, warnings } = addShelfRedistributed(localItems, bodyH);
    update(next);
    setBoxShelfWarnings(warnings);
  }
  function addDrawer(): void {
    // Open the type dialog; actual placement happens in confirmDrawerType.
    setDrawerTarget({ kind: 'box' });
  }
  function confirmDrawerType(mount: DrawerMount): void {
    if (!drawerTarget) return;
    if (drawerTarget.kind === 'box') {
      const { drawer, warnings } = defaultDrawerPlacement(localItems, bodyH, undefined, mount, doorGapMm);
      const next = equalizeExternalDrawersIfOverflow([...localItems, drawer], bodyH, doorGapMm);
      update(next);
      setBoxShelfWarnings(warnings);
    } else {
      const ci = drawerTarget.cellIndex;
      const c = localCellItems[ci] ?? [];
      const { drawer, warnings } = defaultDrawerPlacement(c, bodyH, undefined, mount, doorGapMm);
      const next = equalizeExternalDrawersIfOverflow([...c, drawer], bodyH, doorGapMm);
      updateCell(ci, next);
      setCellWarnings(ci, warnings);
    }
    setDrawerTarget(null);
  }
  function addRod(): void {
    const { rod, warnings } = defaultRodPlacement(bodyH, localItems);
    update([...localItems, rod]);
    setBoxShelfWarnings(warnings);
  }

  function deleteItem(id: string): void {
    const filtered = localItems.filter(i => i.id !== id);
    const wasShelf = localItems.some(i => i.id === id && i.type === 'shelf');
    if (wasShelf) {
      const { items: next } = redistributeShelves(filtered, bodyH);
      update(next);
    } else {
      update(filtered);
    }
  }

  function updateHeight(id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h)) return;
    // Fixed shelves (above external drawers) derive their height from drawer
    // geometry — silently ignore manual edits.
    const target = localItems.find(i => i.id === id);
    if (target?.type === 'shelf' && target.isFixedAboveExternals === true) return;
    update(localItems.map(i => {
      if (i.id !== id) return i;
      if (i.type === 'shelf') return { ...i, heightFromFloor: h, isManuallyPositioned: true };
      return { ...i, heightFromFloor: h };
    }));
  }

  function updateDrawerH(id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h) || h <= 0) return;
    update(localItems.map(i =>
      i.id === id && i.type === 'drawer' ? { ...i, drawerHeight: h } : i,
    ));
  }

  function onItemMove(id: string, newH: number): void {
    update(localItems.map(i => {
      if (i.id !== id) return i;
      if (i.type === 'shelf') return { ...i, heightFromFloor: newH, isManuallyPositioned: true };
      return { ...i, heightFromFloor: newH };
    }));
  }

  // ── cell item helpers ─────────────────────────────────────────────────────

  function updateCell(cellIndex: number, next: InteriorItem[]): void {
    // syncFixedShelf runs per-cell — each cell maintains its own fixed shelf,
    // so the diff is between the cell's previous items and the new items.
    const prev = localCellItems[cellIndex] ?? [];
    const synced = syncFixedShelf(prev, next, doorGapMm, tBody);
    const updated = localCellItems.map((c, i) => i === cellIndex ? synced : c);
    setLocalCellItems(updated);
    onCellItemsChange(cellIndex, synced);
  }

  function setCellWarnings(ci: number, warnings: ShelfWarning[]): void {
    setCellShelfWarnings(prev => {
      const out = [prev[0] ?? [], prev[1] ?? []];
      out[ci] = warnings;
      return out;
    });
  }

  function addCellShelf(ci: number): void {
    const c = localCellItems[ci] ?? [];
    const { items: next, warnings } = addShelfRedistributed(c, bodyH);
    updateCell(ci, next);
    setCellWarnings(ci, warnings);
  }
  function addCellDrawer(ci: number): void {
    // Same dialog as the body editor — user picks mount, then confirmDrawerType places it.
    setDrawerTarget({ kind: 'cell', cellIndex: ci });
  }
  function addCellRod(ci: number): void {
    const c = localCellItems[ci] ?? [];
    const { rod, warnings } = defaultRodPlacement(bodyH, c);
    updateCell(ci, [...c, rod]);
    setCellWarnings(ci, warnings);
  }

  function deleteCellItem(ci: number, id: string): void {
    const current = localCellItems[ci] ?? [];
    const filtered = current.filter(i => i.id !== id);
    const wasShelf = current.some(i => i.id === id && i.type === 'shelf');
    if (wasShelf) {
      const { items: next } = redistributeShelves(filtered, bodyH);
      updateCell(ci, next);
    } else {
      updateCell(ci, filtered);
    }
  }

  function dismissBoxWarning(i: number): void {
    setBoxShelfWarnings(ws => ws.filter((_, j) => j !== i));
  }
  function dismissCellWarning(ci: number, i: number): void {
    setCellShelfWarnings(prev => {
      const out = [prev[0] ?? [], prev[1] ?? []];
      out[ci] = (out[ci] ?? []).filter((_, j) => j !== i);
      return out;
    });
  }

  function updateCellHeight(ci: number, id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h)) return;
    const cellItems = localCellItems[ci] ?? [];
    const target = cellItems.find(i => i.id === id);
    if (target?.type === 'shelf' && target.isFixedAboveExternals === true) return;
    updateCell(ci, cellItems.map(i => {
      if (i.id !== id) return i;
      if (i.type === 'shelf') return { ...i, heightFromFloor: h, isManuallyPositioned: true };
      return { ...i, heightFromFloor: h };
    }));
  }

  function updateCellDrawerH(ci: number, id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h) || h <= 0) return;
    updateCell(ci, (localCellItems[ci] ?? []).map(i =>
      i.id === id && i.type === 'drawer' ? { ...i, drawerHeight: h } : i,
    ));
  }

  function onCellItemMove(ci: number, id: string, newH: number): void {
    updateCell(ci, (localCellItems[ci] ?? []).map(i => {
      if (i.id !== id) return i;
      if (i.type === 'shelf') return { ...i, heightFromFloor: newH, isManuallyPositioned: true };
      return { ...i, heightFromFloor: newH };
    }));
  }

  // ── partition action handlers ─────────────────────────────────────────────

  function requestAddPartition(): void {
    if (localItems.length > 0) {
      setPendingAction('add');
    } else {
      onAddPartition();
    }
  }

  function requestRemovePartition(): void {
    const totalCellItems = (localCellItems[0]?.length ?? 0) + (localCellItems[1]?.length ?? 0);
    if (totalCellItems > 0) {
      setPendingAction('remove');
    } else {
      onRemovePartition();
    }
  }

  function confirmAction(): void {
    if (pendingAction === 'add') onAddPartition();
    if (pendingAction === 'remove') onRemovePartition();
    setPendingAction(null);
  }

  // ── warnings ──────────────────────────────────────────────────────────────

  const warnings = validateInterior(localItems, bodyH);
  const warnSet = new Set(warnings.map(w =>
    w.kind === 'outOfBounds' ? w.itemId : w.itemIds.join(','),
  ));

  function hasWarning(item: InteriorItem): boolean {
    if (warnSet.has(item.id)) return true;
    return warnings.some(w => w.kind === 'drawerOverlap' && w.itemIds.includes(item.id));
  }

  function warningMessages(item: InteriorItem): string[] {
    const msgs: string[] = [];
    const w: InteriorWarning[] = warnings.filter(w =>
      w.kind === 'outOfBounds' ? w.itemId === item.id : w.itemIds.includes(item.id),
    );
    for (const warn of w) {
      if (warn.kind === 'outOfBounds') msgs.push(t.interior.warnOutOfBounds);
      if (warn.kind === 'drawerOverlap') msgs.push(t.interior.warnDrawerOverlap);
    }
    return [...new Set(msgs)];
  }

  const cellWarnings = localCellItems.map(cellItemList => validateInterior(cellItemList, bodyH));

  function hasCellWarning(ci: number, item: InteriorItem): boolean {
    const ws = cellWarnings[ci] ?? [];
    return ws.some(w =>
      w.kind === 'outOfBounds' ? w.itemId === item.id : w.itemIds.includes(item.id),
    );
  }

  function cellWarningMessages(ci: number, item: InteriorItem): string[] {
    const ws = cellWarnings[ci] ?? [];
    const msgs: string[] = [];
    for (const w of ws.filter(w =>
      w.kind === 'outOfBounds' ? w.itemId === item.id : w.itemIds.includes(item.id),
    )) {
      if (w.kind === 'outOfBounds') msgs.push(t.interior.warnOutOfBounds);
      if (w.kind === 'drawerOverlap') msgs.push(t.interior.warnDrawerOverlap);
    }
    return [...new Set(msgs)];
  }

  // ── labels ────────────────────────────────────────────────────────────────

  const sorted = [...localItems].sort((a, b) => a.heightFromFloor - b.heightFromFloor);

  const typeLabel: Record<InteriorItem['type'], string> = {
    shelf:  t.interior.shelf,
    drawer: t.interior.drawer,
    rod:    t.interior.rod,
  };

  const typeIcon: Record<InteriorItem['type'], string> = {
    shelf:  '📐',
    drawer: '🗄️',
    rod:    '🔧',
  };

  // ── pending-action warning text ───────────────────────────────────────────

  function pendingWarningText(): string {
    if (pendingAction === 'add') {
      const shelves = localItems.filter(i => i.type === 'shelf').length;
      const drawers = localItems.filter(i => i.type === 'drawer').length;
      const rods    = localItems.filter(i => i.type === 'rod').length;
      return t.interior.partitionWarnAdd(shelves, drawers, rods);
    }
    if (pendingAction === 'remove') {
      const a = localCellItems[0]?.length ?? 0;
      const b = localCellItems[1]?.length ?? 0;
      return t.interior.partitionWarnRemove(a, b);
    }
    return '';
  }

  // ── shelf-warning banner ──────────────────────────────────────────────────

  function renderShelfWarnings(
    warnings: ShelfWarning[],
    onDismiss: (i: number) => void,
  ): React.JSX.Element | null {
    if (warnings.length === 0) return null;
    return (
      <div className={styles.shelfWarnings}>
        {warnings.map((w, i) => (
          <div key={i} className={styles.shelfWarning}>
            <span>⚠ {shelfWarningText(w, t)}</span>
            <button
              className={styles.shelfWarningDismiss}
              onClick={() => onDismiss(i)}
              aria-label={t.interior.dismissWarning}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    );
  }

  // ── item list renderer (shared between box and cell) ─────────────────────

  function renderItemList(
    itemList: InteriorItem[],
    onDelete: (id: string) => void,
    onUpdateH: (id: string, val: string) => void,
    onUpdateDrawerH: (id: string, val: string) => void,
    getHasWarning: (item: InteriorItem) => boolean,
    getWarnings: (item: InteriorItem) => string[],
  ): React.JSX.Element {
    const sorted = [...itemList].sort((a, b) => a.heightFromFloor - b.heightFromFloor);
    if (sorted.length === 0) {
      return <p className={styles.empty}>{t.interior.noItems}</p>;
    }
    return (
      <ul className={styles.list}>
        {sorted.map(item => {
          const isFixedShelf = item.type === 'shelf' && item.isFixedAboveExternals === true;
          return (
          <li
            key={item.id}
            className={`${styles.item} ${getHasWarning(item) ? styles.itemWarn : ''}`}
          >
            <span className={styles.itemIcon}>{typeIcon[item.type]}</span>
            <span className={styles.itemType}>
              {typeLabel[item.type]}
              {isFixedShelf && (
                <span className={styles.fixedTag} title={t.interior.fixedShelfTooltip}>
                  {' '}{t.interior.fixedShelfLabel}
                </span>
              )}
            </span>

            <label className={styles.fieldLabel}>
              {t.interior.heightFromFloor}
              <input
                type="number"
                className={styles.numInput}
                value={item.heightFromFloor}
                step={1}
                readOnly={isFixedShelf}
                onChange={e => onUpdateH(item.id, e.target.value)}
                onFocus={e => e.target.select()}
              />
            </label>

            {item.type === 'drawer' && (
              <label className={styles.fieldLabel}>
                {t.interior.drawerHeight}
                <input
                  type="number"
                  className={styles.numInput}
                  value={(item as DrawerItem).drawerHeight}
                  step={1}
                  min={1}
                  onChange={e => onUpdateDrawerH(item.id, e.target.value)}
                  onFocus={e => e.target.select()}
                />
              </label>
            )}

            <button
              className={styles.deleteBtn}
              onClick={() => onDelete(item.id)}
              aria-label="מחק"
            >
              ✕
            </button>

            {getWarnings(item).map((msg, i) => (
              <span key={i} className={styles.warning}>⚠ {msg}</span>
            ))}
          </li>
          );
        })}
      </ul>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.editor}>
      {/* Confirmation dialog */}
      {pendingAction && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <p className={styles.dialogText}>{pendingWarningText()}</p>
            <div className={styles.dialogBtns}>
              <button className={styles.dialogConfirmBtn} onClick={confirmAction}>
                {pendingAction === 'add' ? t.interior.partitionConfirmAdd : t.interior.partitionConfirmRemove}
              </button>
              <button className={styles.dialogCancelBtn} onClick={() => setPendingAction(null)}>
                {t.interior.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer-type dialog (internal vs external) */}
      {drawerTarget && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <p className={styles.dialogTitle}>{t.interior.drawerTypeDialogTitle}</p>
            <div className={styles.drawerTypeBtns}>
              <button
                className={styles.drawerTypeBtn}
                onClick={() => confirmDrawerType('internal')}
              >
                <span className={styles.drawerTypeLabel}>{t.interior.drawerInternal}</span>
                <span className={styles.drawerTypeDesc}>{t.interior.drawerInternalDesc}</span>
              </button>
              <button
                className={styles.drawerTypeBtn}
                onClick={() => confirmDrawerType('external')}
              >
                <span className={styles.drawerTypeLabel}>{t.interior.drawerExternal}</span>
                <span className={styles.drawerTypeDesc}>{t.interior.drawerExternalDesc}</span>
              </button>
            </div>
            <button className={styles.dialogCancelBtn} onClick={() => setDrawerTarget(null)}>
              {t.interior.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          ← {t.interior.back}
        </button>
        <h2 className={styles.title}>
          {t.interior.editBody} — {boxLabel}
          <span className={styles.bodyHint}> ({bodyH} ס"מ)</span>
        </h2>
      </div>

      {/* Per-body edging override.
          - "כמו ארון" (default) → no override entry; cabinet edging applies.
          - "מותאם" → an entry seeded from `cabinetEdging`, then edited
            in-place via the two dropdowns. Switching back to "כמו ארון"
            deletes the entry (setter receives `undefined`).
          Section sits above both layout branches so the carpenter sees the
          same control in partitioned and single-body modes. */}
      <div className={styles.edgingSection}>
        <span className={styles.edgingLabel}>{t.edging.overrideLabel}:</span>
        <label className={styles.edgingRadioLabel}>
          <input
            type="radio"
            name={`edging-${box.id}`}
            checked={bodyEdgingOverride === undefined}
            onChange={() => onSetBodyEdging(undefined)}
          />
          {t.edging.inherit}
        </label>
        <label className={styles.edgingRadioLabel}>
          <input
            type="radio"
            name={`edging-${box.id}`}
            checked={bodyEdgingOverride !== undefined}
            onChange={() => onSetBodyEdging({ ...cabinetEdging })}
          />
          {t.edging.custom}
        </label>

        {bodyEdgingOverride !== undefined && (
          <>
            <label className={styles.edgingField}>
              <span className={styles.edgingFieldLabel}>{t.edging.thicknessShort}</span>
              <select
                className={styles.edgingSelect}
                value={String(bodyEdgingOverride.thickness)}
                onChange={e => onSetBodyEdging({
                  ...bodyEdgingOverride,
                  thickness: e.target.value === '1.3' ? 1.3 : 0.6,
                })}
              >
                <option value="0.6">0.6</option>
                <option value="1.3">1.3</option>
              </select>
            </label>

            <label className={styles.edgingField}>
              <span className={styles.edgingFieldLabel}>{t.edging.finishShort}</span>
              <select
                className={styles.edgingSelect}
                value={bodyEdgingOverride.finishMaterialId ?? ''}
                onChange={e => {
                  const v = e.target.value as '' | MaterialId;
                  // '' = auto → drop the key so the band tracks the panel
                  // material. Any other value pins the band's color.
                  if (v === '') {
                    onSetBodyEdging({ thickness: bodyEdgingOverride.thickness });
                  } else {
                    onSetBodyEdging({ ...bodyEdgingOverride, finishMaterialId: v });
                  }
                }}
              >
                <option value="">{t.edging.finishAuto}</option>
                {Object.values(MATERIALS).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {/* ── Dimension overrides ─────────────────────────────────────────── */}
      <div className={styles.dimOverrideSection}>
        <span className={styles.dimOverrideTitle}>{t.interior.dimOverrideTitle}</span>
        {(['W', 'H', 'D'] as const).map(axis => {
          const derived = axis === 'W' ? derivedW : axis === 'H' ? derivedH : derivedD;
          const overrideVal = boxDimensionOverride?.[axis];
          return (
            <label key={axis} className={styles.dimOverrideField}>
              <span className={styles.dimOverrideLabel}>
                {axis === 'W' ? t.interior.dimOverrideW
                  : axis === 'H' ? t.interior.dimOverrideH
                  : t.interior.dimOverrideD}
              </span>
              <input
                type="number"
                className={`${styles.dimOverrideInput} ${overrideVal !== undefined ? styles.dimOverrideInputActive : ''}`}
                value={overrideVal !== undefined ? overrideVal : ''}
                placeholder={String(Math.round(derived * 10) / 10)}
                min={1}
                step={0.5}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  onSetBoxDimension(axis, isNaN(v) || v <= 0 ? undefined : v);
                }}
              />
            </label>
          );
        })}
        {boxDimensionOverride !== undefined && (
          <button
            type="button"
            className={styles.dimOverrideResetBtn}
            onClick={onResetBoxDimensions}
          >
            {t.interior.dimOverrideReset}
          </button>
        )}
      </div>

      {hasPartitions ? (
        /* ── Cell editor (partition mode) ── */
        <div className={styles.partitionBody}>
          <div className={styles.partitionToolbar}>
            <button className={styles.removePartitionBtn} onClick={requestRemovePartition}>
              {t.interior.removePartition}
            </button>
          </div>

          <div className={styles.cellsRow}>
            {[0, 1].map(ci => {
              const cellLabel = ci === 0 ? t.interior.cellRight : t.interior.cellLeft;
              const cellItemList = localCellItems[ci] ?? [];
              return (
                <div key={ci} className={styles.cell}>
                  <div className={styles.cellHeader}>
                    <span className={styles.cellLabel}>{cellLabel}</span>
                    <span className={styles.cellDims}>
                      {cellW.toFixed(1)} × {bodyH} ס"מ
                    </span>
                  </div>

                  <div className={styles.cellSketch}>
                    <BoxBodySketch
                      bodyH={bodyH}
                      bodyW={cellW}
                      bodyD={box.D}
                      items={cellItemList}
                      svgWidth={CELL_SKETCH_W}
                      svgHeight={CELL_SKETCH_H}
                      showLabels={false}
                      onItemMove={(id, newH) => onCellItemMove(ci, id, newH)}
                      numPartitions={0}
                      bodyMaterialId={bodyMaterialId}
                      frontMaterialId={frontMaterialId}
                      hasOuterShell={false}
                      hasEnvelopeTop={false}
                    />
                  </div>

                  {!hideInteriorControls && (
                    <div className={styles.addRow}>
                      <button className={styles.addBtn} onClick={() => addCellShelf(ci)}>
                        {t.interior.addShelf}
                      </button>
                      <button className={styles.addBtn} onClick={() => addCellDrawer(ci)}>
                        {t.interior.addDrawer}
                      </button>
                      {!hideRodOption && (
                        <button className={styles.addBtn} onClick={() => addCellRod(ci)}>
                          {t.interior.addRod}
                        </button>
                      )}
                    </div>
                  )}

                  {renderShelfWarnings(
                    cellShelfWarnings[ci] ?? [],
                    i => dismissCellWarning(ci, i),
                  )}

                  {renderItemList(
                    cellItemList,
                    id => deleteCellItem(ci, id),
                    (id, val) => updateCellHeight(ci, id, val),
                    (id, val) => updateCellDrawerH(ci, id, val),
                    item => hasCellWarning(ci, item),
                    item => cellWarningMessages(ci, item),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Single-box editor ── */
        <div className={styles.body}>
          {/* Sketch */}
          <div className={styles.sketchCol}>
            <BoxBodySketch
              bodyH={bodyH}
              bodyW={box.W}
              bodyD={box.D}
              items={localItems}
              svgWidth={SKETCH_W}
              svgHeight={SKETCH_H}
              showLabels
              showDimensions
              onItemMove={onItemMove}
              numPartitions={0}
              bodyMaterialId={bodyMaterialId}
              frontMaterialId={frontMaterialId}
              hasOuterShell={hasOuterShell}
              hasEnvelopeTop={hasEnvelopeTop}
              {...(topVariant ? { topVariant } : {})}
              {...(sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm } : {})}
            />
          </div>

          {/* Controls */}
          <div className={styles.controlsCol}>
            {!hideInteriorControls && (
              <div className={styles.addRow}>
                <button className={styles.addBtn} onClick={addShelf}>
                  {t.interior.addShelf}
                </button>
                <button className={styles.addBtn} onClick={addDrawer}>
                  {t.interior.addDrawer}
                </button>
                {!hideRodOption && (
                  <button className={styles.addBtn} onClick={addRod}>
                    {t.interior.addRod}
                  </button>
                )}
                {numFronts > 1 && (
                  <button className={styles.addBtn} onClick={requestAddPartition}>
                    {t.interior.addPartition}
                  </button>
                )}
              </div>
            )}

            {renderShelfWarnings(boxShelfWarnings, dismissBoxWarning)}

            {renderItemList(
              sorted,
              deleteItem,
              updateHeight,
              updateDrawerH,
              hasWarning,
              warningMessages,
            )}
          </div>
        </div>
      )}
    </div>
  );
}
