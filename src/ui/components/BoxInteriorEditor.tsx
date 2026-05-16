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
  onTogglePartitions: () => void;
}

const SKETCH_W = 180;
const SKETCH_H = 380;

export default function BoxInteriorEditor({ box, items, onChange, onBack, numFronts, hasPartitions, onTogglePartitions }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [localItems, setLocalItems] = useState<InteriorItem[]>(items);

  const bodyH = box.H;

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

  const warnings = validateInterior(localItems, bodyH);
  const warnSet = new Set(warnings.map(w =>
    w.kind === 'outOfBounds' ? w.itemId : w.itemIds.join(','),
  ));

  function hasWarning(item: InteriorItem): boolean {
    if (warnSet.has(item.id)) return true;
    return warnings.some(w => w.kind === 'drawerOverlap' && w.itemIds.includes(item.id));
  }

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

  function warningMessages(item: InteriorItem): string[] {
    const msgs: string[] = [];
    const w: InteriorWarning[] = warnings.filter(w =>
      w.kind === 'outOfBounds' ? w.itemId === item.id
      : w.itemIds.includes(item.id),
    );
    for (const warn of w) {
      if (warn.kind === 'outOfBounds') msgs.push(t.interior.warnOutOfBounds);
      if (warn.kind === 'drawerOverlap') msgs.push(t.interior.warnDrawerOverlap);
    }
    return [...new Set(msgs)];
  }

  function onItemMove(id: string, newH: number): void {
    update(localItems.map(i => i.id === id ? { ...i, heightFromFloor: newH } : i));
  }

  return (
    <div className={styles.editor}>
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
            numPartitions={hasPartitions ? numFronts - 1 : 0}
          />
        </div>

        {/* Controls */}
        <div className={styles.controlsCol}>
          {/* Add buttons */}
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
              <button
                className={`${styles.addBtn} ${hasPartitions ? styles.addBtnActive : ''}`}
                onClick={onTogglePartitions}
              >
                {hasPartitions ? t.interior.removePartitions : t.interior.addPartitions}
              </button>
            )}
          </div>

          {/* Items list */}
          {sorted.length === 0 ? (
            <p className={styles.empty}>{t.interior.noItems}</p>
          ) : (
            <ul className={styles.list}>
              {sorted.map(item => (
                <li
                  key={item.id}
                  className={`${styles.item} ${hasWarning(item) ? styles.itemWarn : ''}`}
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
                      onChange={e => updateHeight(item.id, e.target.value)}
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
                        onChange={e => updateDrawerH(item.id, e.target.value)}
                        onFocus={e => e.target.select()}
                      />
                    </label>
                  )}

                  <button
                    className={styles.deleteBtn}
                    onClick={() => deleteItem(item.id)}
                    aria-label="מחק"
                  >
                    ✕
                  </button>

                  {warningMessages(item).map((msg, i) => (
                    <span key={i} className={styles.warning}>⚠ {msg}</span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
