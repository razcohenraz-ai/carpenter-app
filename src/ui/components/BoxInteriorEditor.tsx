import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import BoxBodySketch from './BoxBodySketch';
import {
  defaultShelfPlacement,
  defaultDrawerPlacement,
  defaultRodPlacement,
  validateInterior,
} from '../../core/interior/interiorUtils';
import styles from './BoxInteriorEditor.module.css';
import type { InteriorItem, DrawerItem, InteriorWarning } from '../../types/interior';
import type { Box, BoxPosition } from '../../types/geometry';

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
}

const SKETCH_W = 180;
const SKETCH_H = 380;

export default function BoxInteriorEditor({
  box, items, onChange, onBack, numFronts, hasPartitions,
  onAddPartition, onRemovePartition,
  cellItems, onCellItemsChange, tBody,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [localItems, setLocalItems] = useState<InteriorItem[]>(items);
  const [localCellItems, setLocalCellItems] = useState<InteriorItem[][]>(
    cellItems.length === 2 ? cellItems : [[], []],
  );
  const [pendingAction, setPendingAction] = useState<null | 'add' | 'remove'>(null);

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
    setLocalItems(next);
    onChange(next);
  }

  function addShelf(): void { update([...localItems, defaultShelfPlacement(localItems, bodyH)]); }
  function addDrawer(): void { update([...localItems, defaultDrawerPlacement(localItems, bodyH)]); }
  function addRod(): void { update([...localItems, defaultRodPlacement(bodyH, localItems)]); }

  function deleteItem(id: string): void {
    update(localItems.filter(i => i.id !== id));
  }

  function updateHeight(id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h)) return;
    update(localItems.map(i => i.id === id ? { ...i, heightFromFloor: h } : i));
  }

  function updateDrawerH(id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h) || h <= 0) return;
    update(localItems.map(i =>
      i.id === id && i.type === 'drawer' ? { ...i, drawerHeight: h } : i,
    ));
  }

  function onItemMove(id: string, newH: number): void {
    update(localItems.map(i => i.id === id ? { ...i, heightFromFloor: newH } : i));
  }

  // ── cell item helpers ─────────────────────────────────────────────────────

  function updateCell(cellIndex: number, next: InteriorItem[]): void {
    const updated = localCellItems.map((c, i) => i === cellIndex ? next : c);
    setLocalCellItems(updated);
    onCellItemsChange(cellIndex, next);
  }

  function addCellShelf(ci: number): void {
    const c = localCellItems[ci] ?? [];
    updateCell(ci, [...c, defaultShelfPlacement(c, bodyH)]);
  }
  function addCellDrawer(ci: number): void {
    const c = localCellItems[ci] ?? [];
    updateCell(ci, [...c, defaultDrawerPlacement(c, bodyH)]);
  }
  function addCellRod(ci: number): void {
    const c = localCellItems[ci] ?? [];
    updateCell(ci, [...c, defaultRodPlacement(bodyH, c)]);
  }

  function deleteCellItem(ci: number, id: string): void {
    updateCell(ci, (localCellItems[ci] ?? []).filter(i => i.id !== id));
  }

  function updateCellHeight(ci: number, id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h)) return;
    updateCell(ci, (localCellItems[ci] ?? []).map(i =>
      i.id === id ? { ...i, heightFromFloor: h } : i,
    ));
  }

  function updateCellDrawerH(ci: number, id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h) || h <= 0) return;
    updateCell(ci, (localCellItems[ci] ?? []).map(i =>
      i.id === id && i.type === 'drawer' ? { ...i, drawerHeight: h } : i,
    ));
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
        {sorted.map(item => (
          <li
            key={item.id}
            className={`${styles.item} ${getHasWarning(item) ? styles.itemWarn : ''}`}
          >
            <span className={styles.itemIcon}>{typeIcon[item.type]}</span>
            <span className={styles.itemType}>{typeLabel[item.type]}</span>

            <label className={styles.fieldLabel}>
              {t.interior.heightFromFloor}
              <input
                type="number"
                className={styles.numInput}
                value={item.heightFromFloor}
                step={1}
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
        ))}
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

                  <div className={styles.addRow}>
                    <button className={styles.addBtn} onClick={() => addCellShelf(ci)}>
                      {t.interior.addShelf}
                    </button>
                    <button className={styles.addBtn} onClick={() => addCellDrawer(ci)}>
                      {t.interior.addDrawer}
                    </button>
                    <button className={styles.addBtn} onClick={() => addCellRod(ci)}>
                      {t.interior.addRod}
                    </button>
                  </div>

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
            />
          </div>

          {/* Controls */}
          <div className={styles.controlsCol}>
            <div className={styles.addRow}>
              <button className={styles.addBtn} onClick={addShelf}>
                {t.interior.addShelf}
              </button>
              <button className={styles.addBtn} onClick={addDrawer}>
                {t.interior.addDrawer}
              </button>
              <button className={styles.addBtn} onClick={addRod}>
                {t.interior.addRod}
              </button>
              {numFronts > 1 && (
                <button className={styles.addBtn} onClick={requestAddPartition}>
                  {t.interior.addPartition}
                </button>
              )}
            </div>

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
