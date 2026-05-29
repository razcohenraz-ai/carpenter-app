import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import DoorBodySketch from './DoorBodySketch';
import { computeHingeWarnings, computeHingeSpacingWarnings, getDoorThicknessCm } from '../../core/doors/doorUtils';
import { MATERIALS, getMaterial } from '../../catalog';
import type { MaterialId } from '../../types/materials';
import styles from './DoorEditor.module.css';
import type { Door } from '../../types/doors';
import type { InteriorItem } from '../../types/interior';

interface Props {
  door: Door;
  interiorItems: InteriorItem[];
  displayNumber: string;
  globalMaterialId: string;
  plinthHeight?: number;
  onHingeSide: (side: 'left' | 'right') => void;
  onHingeCount: (count: 2 | 3 | 4 | 'auto') => void;
  onHingeManual: (hingeId: string, pos: number) => void;
  onResetAuto: (hingeId: string) => void;
  onHasDoor: (hasDoor: boolean) => void;
  onThickness: (materialId: string) => void;
  onBack: () => void;
}

// Larger door sketch — gives a clearer view of the panel + hinge positions.
// The controls column flexes to take the remaining width.
const SKETCH_W = 180;
const SKETCH_H = 330;
const materialsArray = Object.values(MATERIALS);

export default function DoorEditor({
  door, interiorItems, displayNumber, globalMaterialId, plinthHeight,
  onHingeSide, onHingeCount, onHingeManual, onResetAuto, onHasDoor, onThickness, onBack,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const interiorWarnings  = computeHingeWarnings(door, interiorItems, door.gapMm ?? 0);
  const spacingWarnings   = computeHingeSpacingWarnings(door);
  const warnings          = new Set([...interiorWarnings, ...spacingWarnings]);
  const isSmallDoor       = door.hasDoor && door.height < 25;

  const thicknessCm       = door.hasDoor ? getDoorThicknessCm(door, globalMaterialId) : undefined;
  const globalThicknessCm = getMaterial(globalMaterialId as MaterialId).thickness / 10;
  const hasOverride     = door.thicknessOverride !== undefined;
  const warnThickLow    = thicknessCm !== undefined && thicknessCm < 1.5;
  const warnThickHigh   = thicknessCm !== undefined && thicknessCm > 2.5;

  const sortedHinges = [...door.hinges].sort((a, b) => a.positionFromBottom - b.positionFromBottom);

  const gapWarnings: number[] = [];
  for (let i = 0; i < sortedHinges.length - 1; i++) {
    const gap = sortedHinges[i + 1]!.positionFromBottom - sortedHinges[i]!.positionFromBottom;
    if (gap < 25) gapWarnings.push(Math.round(gap * 10) / 10);
  }

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>← {t.interior.back}</button>
        <h2 className={styles.title}>{t.doors.editFront} {displayNumber}</h2>
      </div>

      <div className={styles.body}>
        <div className={styles.sketchCol}>
          <DoorBodySketch
            door={door}
            svgWidth={SKETCH_W}
            svgHeight={SKETCH_H}
            showLabels
            showDimensions={door.hasDoor}
            {...(thicknessCm !== undefined ? { thickness: thicknessCm } : {})}
            {...(plinthHeight !== undefined ? { plinthHeight } : {})}
            warnings={warnings}
          />
        </div>

        <div className={styles.controlsCol}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={door.hasDoor}
              onChange={e => onHasDoor(e.target.checked)}
            />
            {t.doors.hasDoor}
          </label>

          {door.hasDoor && (
            <>
              {/* Thickness override */}
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`thickness-${door.id}`}>
                  {t.doors.thicknessOverride}
                </label>
                <select
                  id={`thickness-${door.id}`}
                  className={`${styles.select} ${styles.selectFull}`}
                  value={door.thicknessOverride ?? ''}
                  onChange={e => onThickness(e.target.value)}
                >
                  <option value="">— {t.doors.thickness}: {globalThicknessCm.toFixed(1)} ס"מ —</option>
                  {materialsArray.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({(m.thickness / 10).toFixed(1)} ס"מ){m.id === globalMaterialId ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                {hasOverride && (
                  <button className={styles.resetBtn} onClick={() => onThickness('')}>
                    {t.doors.clearThickness}
                  </button>
                )}
              </div>

              {warnThickLow  && <p className={styles.warning}>⚠ {t.doors.warnThicknessLow(+(thicknessCm!).toFixed(1))}</p>}
              {warnThickHigh && <p className={styles.warning}>⚠ {t.doors.warnThicknessHigh(+(thicknessCm!).toFixed(1))}</p>}

              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t.doors.hingeSide}</span>
                <div className={styles.radioGroup}>
                  <label>
                    <input
                      type="radio"
                      name={`hingeSide-${door.id}`}
                      value="right"
                      checked={door.hingeSide === 'right'}
                      onChange={() => onHingeSide('right')}
                    />
                    {t.doors.hingeRight}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`hingeSide-${door.id}`}
                      value="left"
                      checked={door.hingeSide === 'left'}
                      onChange={() => onHingeSide('left')}
                    />
                    {t.doors.hingeLeft}
                  </label>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={`hinge-count-${door.id}`}>
                  {t.doors.hingeCount}
                </label>
                <select
                  id={`hinge-count-${door.id}`}
                  className={styles.select}
                  value={door.hingeCount}
                  disabled={isSmallDoor}
                  onChange={e => {
                    const v = e.target.value;
                    onHingeCount(v === 'auto' ? 'auto' : Number(v) as 2 | 3 | 4);
                  }}
                >
                  {isSmallDoor && <option value="1">1</option>}
                  <option value="auto">{t.doors.hingeCountAuto}</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>

              {isSmallDoor && (
                <p className={styles.warning}>⚠ {t.doors.hingeWarnSmallDoor(door.height)}</p>
              )}
              {interiorWarnings.size > 0 && (
                <p className={styles.warning}>⚠ {t.doors.hingeWarnNoPos}</p>
              )}
              {gapWarnings.map((gap, i) => (
                <p key={i} className={styles.warning}>⚠ {t.doors.hingeWarnTooClose(gap)}</p>
              ))}

              <ul className={styles.list}>
                {sortedHinges.map(hinge => (
                  <li
                    key={hinge.id}
                    className={`${styles.item} ${warnings.has(hinge.id) ? styles.itemWarn : ''}`}
                  >
                    <span className={styles.hingePos}>{t.doors.hingePos}</span>
                    <input
                      type="number"
                      className={styles.numInput}
                      value={Math.round(hinge.positionFromBottom * 10) / 10}
                      step={0.5}
                      min={0}
                      max={door.height}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) onHingeManual(hinge.id, v);
                      }}
                      onFocus={e => e.target.select()}
                    />
                    {hinge.isManual && (
                      <>
                        <span className={styles.manualBadge}>{t.doors.hingeManualBadge}</span>
                        <button className={styles.resetBtn} onClick={() => onResetAuto(hinge.id)}>
                          {t.doors.resetAuto}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
