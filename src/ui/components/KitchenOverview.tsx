import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { KitchenUnit } from '../../types/project';
import type { MaterialId, CustomMaterial } from '../../types/materials';
import type { CutItem } from '../../types/cuts';
import type { HardwareLineItem } from '../../types/hardware';
import { calcDoors } from '../../core/doors/doorCalc';
import { computeRowFrontLayout, computeFrontGeometry, getTotalFrontsInRow, groupBoxesByRow, type RowFrontLayout } from '../../core/geometry/frontGeometry';
import { decomposeBoxes } from '../../core/geometry/boxDecomposition';
import type { InteriorItem, InteriorById, CellInteriorById } from '../../types/interior';
import { computeInnerWidth, computeCarcassDepth, HINGE_GAP_CM } from '../../core/boards/boardModel';
import { computeUnitCutsAndHardware } from '../../core/cabinetCompute';
import { boxStableKey } from '../../core/interior/interiorUtils';
import { getShellSides } from '../../types/cabinet';
import type { BoxLevel } from '../../types/geometry';
import { getEffectiveMaterial, getMaterialWithCustom } from '../../catalog';
import { useTranslation } from '../../i18n/LanguageContext';
import CabinetSketch from './CabinetSketch';
import CutsList from './CutsList';
import { HardwareList } from './HardwareList';
import styles from './KitchenOverview.module.css';

interface AppSettingsSlice {
  customMaterials?: CustomMaterial[];
  bodyMaterialPriceOverrides?: Partial<Record<MaterialId, number>>;
  frontMaterialPriceOverrides?: Partial<Record<MaterialId, number>>;
}

interface Props {
  units: KitchenUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  onOpenUnit: (id: string) => void;
  settings?: AppSettingsSlice | undefined;
}

type ViewMode = 'bodies' | 'fronts' | 'cuts' | 'hardware';

const GAP_CM  = 2;
const PAD_TOP = 36;
const PAD_BOT = 8;
const OVERVIEW_H = 340;
const DRAW_H = OVERVIEW_H - PAD_TOP - PAD_BOT;

/** Returns effective W/H/D for a unit, applying any boxDimensionOverrides.
 *  The override key is "single:single" (boxStableKey for a single-box cabinet). */
function effectiveDims(unit: KitchenUnit): { W: number; H: number; D: number } {
  const inp = unit.cabinet.input;
  const ovr = unit.cabinet.state.boxDimensionOverrides?.['single:single'];
  return {
    W: ovr?.W ?? inp.W,
    H: ovr?.H ?? inp.H,
    D: ovr?.D ?? inp.D,
  };
}

function computeScale(units: KitchenUnit[], availableW: number): number {
  if (units.length === 0) return 4;
  const totalW = units.reduce((s, u) => s + effectiveDims(u).W, 0) + (units.length - 1) * GAP_CM;
  const maxH   = Math.max(...units.map(u => effectiveDims(u).H));
  const sx = availableW / totalW;
  const sy = DRAW_H / maxH;
  return Math.min(sx, sy, 8);
}

/** Render a single unit's front panels in the fronts view.
 *  External drawers from SavedCabinetState take precedence over door panels
 *  in the area they occupy. */
function FrontPanels({ unit, layout, scale }: {
  unit: KitchenUnit;
  layout: { x: number; y: number; w: number; h: number; plinthH: number };
  scale: number;
}) {
  const inp = unit.cabinet.input;
  const { W: effW, H: effH } = effectiveDims(unit);
  const tFront = getEffectiveMaterial(inp.frontMaterialId).thickness / 10; // cm
  const forceRows = inp.doorsPerColumn === 'auto' ? undefined : inp.doorsPerColumn as 1 | 2 | 3;
  const sides = getShellSides(inp);
  const hasAnyShell = sides.left || sides.right;
  const dl = calcDoors(effW, effH, inp.plinth, inp.doorCoversPlinth,
                       inp.lowerDoorH, hasAnyShell, tFront, forceRows);
  if (dl.n === 0) return null;

  const bodyH = layout.h - layout.plinthH; // px — body rect height (without plinth)
  const clipId = `clip-unit-${unit.id}`;
  const gapCm = inp.doorGapMm / 10;

  const frontLayout = computeRowFrontLayout({
    cabinetW: effW,
    hasOuterShell: hasAnyShell,
    shellThicknessCm: tFront,
    totalFrontsInRow: dl.n,
    gapCm,
  });

  const panels: React.ReactElement[] = [];

  // Helper: draw front rects for a given row across all n columns
  function pushFrontRow(key: string, heightCm: number, yFromBodyBottom: number) {
    const panelH = heightCm * scale;
    // y measured upward from body bottom (= layout.y + bodyH)
    const panelY = layout.y + bodyH - (yFromBodyBottom + heightCm) * scale;
    for (let fi = 0; fi < dl.n; fi++) {
      const fp = computeFrontGeometry({ globalFrontIndexInRow: fi, layout: frontLayout, gapCm });
      panels.push(
        <rect
          key={`${key}-fi${fi}`}
          x={layout.x + (frontLayout.cabinetLeftOffset + fp.x) * scale}
          y={panelY}
          width={Math.max(fp.width * scale, 0)}
          height={Math.max(panelH, 0)}
          fill="var(--color-fronts, #e8934a)"
          stroke="var(--color-border, #ccc)"
          strokeWidth={1}
          opacity={0.9}
        />
      );
    }
  }

  // ── External drawers from saved state ─────────────────────────────────────
  // Keyed by "single:single" for a single-box cabinet unit.
  const slotKey = 'single:single';
  const savedItems = unit.cabinet.state.interior[slotKey] ?? [];
  const extDrawers = (savedItems as import('../../types/interior').InteriorItem[])
    .filter((it): it is import('../../types/interior').DrawerItem =>
      it.type === 'drawer' && it.mount === 'external')
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor);

  // heightFromFloor is from the BODY BOTTOM (not from the floor including plinth)
  let totalDrawerH = 0;
  extDrawers.forEach((d, di) => {
    const gap = gapCm / 2;
    pushFrontRow(`drw${di}`, d.drawerHeight - gap, d.heightFromFloor + gap / 2);
    totalDrawerH = Math.max(totalDrawerH, d.heightFromFloor + d.drawerHeight);
  });

  // ── Door panel above drawers (if any space remains) ────────────────────────
  // dl.doorStart = distance from FLOOR (= plinth area bottom) to door bottom.
  // Convert to "from body bottom": body bottom is at plinth height above floor.
  const doorStartFromBodyBottom = dl.doorStart - inp.plinth;
  const doorTopFromBodyBottom = doorStartFromBodyBottom + (dl.lowerH ?? 0);

  if (extDrawers.length === 0) {
    // No external drawers → render door rows normally
    const rows: { h: number; yFromBodyBottom: number }[] = [];
    if (dl.rows >= 1) rows.push({ h: dl.lowerH!, yFromBodyBottom: doorStartFromBodyBottom });
    if (dl.rows >= 2) rows.push({ h: dl.upperH!, yFromBodyBottom: doorStartFromBodyBottom + dl.lowerH! + 0.2 });
    if (dl.rows >= 3) rows.push({ h: dl.topH!,  yFromBodyBottom: doorStartFromBodyBottom + dl.lowerH! + dl.upperH! + 0.4 });
    rows.forEach((r, ri) => pushFrontRow(`door${ri}`, r.h, r.yFromBodyBottom));
  } else if (totalDrawerH < doorTopFromBodyBottom - 3) {
    // Door panel above the drawers
    const remainH = doorTopFromBodyBottom - totalDrawerH;
    pushFrontRow('doorAbove', remainH, totalDrawerH);
  }

  // Shell side panels — per-side flags (kitchen units may have asymmetric shell)
  if (sides.left || sides.right) {
    const shellW = tFront * scale;
    if (sides.left) {
      panels.push(
        <rect key="shell-l" x={layout.x} y={layout.y} width={shellW} height={bodyH}
          fill="var(--color-fronts, #e8934a)" stroke="var(--color-border, #ccc)" strokeWidth={0.8} opacity={0.75} />,
      );
    }
    if (sides.right) {
      panels.push(
        <rect key="shell-r" x={layout.x + layout.w - shellW} y={layout.y} width={shellW} height={bodyH}
          fill="var(--color-fronts, #e8934a)" stroke="var(--color-border, #ccc)" strokeWidth={0.8} opacity={0.75} />,
      );
    }
  }

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x={layout.x} y={layout.y} width={layout.w} height={bodyH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>{panels}</g>
    </>
  );
}

export function KitchenOverview({ units, selectedUnitId, onSelect, onOpenUnit, settings }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableW, setAvailableW] = useState(800);
  const [viewMode, setViewMode] = useState<ViewMode>('bodies');

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setAvailableW(w);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const scale = computeScale(units, availableW);
  const maxH  = units.length ? Math.max(...units.map(u => effectiveDims(u).H)) : 90;

  // Dimension summary — use effective (overridden) dimensions
  const totalW = units.reduce((s, u) => s + effectiveDims(u).W, 0);

  // Check for mixed heights warning
  const heights = units.map(u => effectiveDims(u).H);
  const hasMixedHeights = new Set(heights).size > 1;

  // Compute layout for each unit using effective dimensions
  let xCursor = 0;
  const unitLayouts = units.map(u => {
    const inp = u.cabinet.input;
    const { W: effW, H: effH } = effectiveDims(u);
    const uw = effW * scale;
    const uh = effH * scale;
    const l = {
      x: xCursor,
      y: PAD_TOP + (maxH - effH) * scale,
      w: uw,
      h: uh,
      plinthH: inp.plinth * scale,
      sinkOpen: inp.topVariant === 'sink-open',
      tw: (inp.sinkTraverseWidthCm ?? 8) * scale,
    };
    xCursor += uw + GAP_CM * scale;
    return l;
  });

  const svgW = xCursor > 0 ? xCursor - GAP_CM * scale : 10;

  return (
    <div className={styles.wrapper}>
      {/* Toolbar: view toggle + dimensions */}
      <div className={styles.toolbar}>
        <div className={styles.toggle}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'bodies' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('bodies')}
          >
            גופים
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'fronts' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('fronts')}
          >
            חזיתות
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'cuts' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('cuts')}
          >
            חיתוכים
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'hardware' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('hardware')}
          >
            פרזולים
          </button>
        </div>

        {units.length > 0 && (
          <div className={styles.dimBar}>
            <span>רוחב כולל: <strong>{totalW} ס"מ</strong></span>
            <span className={styles.dimSep}>|</span>
            <span>גובה: <strong>{maxH} ס"מ</strong></span>
            <span className={styles.dimSep}>|</span>
            <span><strong>{units.length}</strong> גופים</span>
          </div>
        )}
      </div>

      {/* Height warning banner */}
      {hasMixedHeights && units.length > 0 && (
        <div className={styles.heightWarning}>
          ⚠️ {t.kitchen.mixedHeightsWarning}
        </div>
      )}

      {/* Cuts/Hardware tabs — aggregate across all units */}
      {viewMode === 'cuts' && units.length > 0 && (
        <CutsView units={units} settings={settings} />
      )}
      {viewMode === 'hardware' && units.length > 0 && (
        <HardwareView units={units} settings={settings} />
      )}

      {/* Bodies tab — flex layout of CabinetSketch per unit */}
      {viewMode === 'bodies' && units.length > 0 && (
        <BodiesView units={units} selectedUnitId={selectedUnitId}
          onSelect={onSelect} onOpenUnit={onOpenUnit} settings={settings} />
      )}

      {/* SVG canvas — only for fronts view */}
      <div ref={containerRef} className={styles.container}>
        {units.length === 0 ? (
          <div className={styles.empty}>הוסף גופים כדי לראות את המטבח</div>
        ) : viewMode === 'fronts' ? (
          <svg
            width={svgW}
            height={OVERVIEW_H}
            viewBox={`0 0 ${svgW} ${OVERVIEW_H}`}
            className={styles.svg}
            style={{ maxWidth: '100%' }}
          >
            {units.map((unit, i) => {
              const l = unitLayouts[i]!;
              const selected = unit.id === selectedUnitId;
              const bodyH = l.h - l.plinthH;

              return (
                <g
                  key={unit.id}
                  className={styles.unitGroup}
                  onClick={() => onSelect(unit.id)}
                  onDoubleClick={() => onOpenUnit(unit.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Selection highlight */}
                  {selected && (
                    <rect
                      x={l.x - 3} y={l.y - 3}
                      width={l.w + 6} height={l.h + 6}
                      rx={3} fill="none"
                      stroke="var(--color-primary)"
                      strokeWidth={2.5}
                      strokeDasharray="6 3"
                    />
                  )}

                  {/* Plinth */}
                  {l.plinthH > 0 && (
                    <rect
                      x={l.x} y={l.y + bodyH}
                      width={l.w} height={l.plinthH}
                      fill="var(--color-surface-raised)"
                      stroke="var(--color-text-secondary)"
                      strokeWidth={1}
                    />
                  )}

                  {/* Cabinet body outline */}
                  <rect
                    x={l.x} y={l.y}
                    width={l.w} height={bodyH}
                    fill={selected ? '#f0f7ff' : 'var(--color-surface)'}
                    stroke={selected ? 'var(--color-primary)' : 'var(--color-text-secondary)'}
                    strokeWidth={selected ? 1.5 : 1}
                  />

                  {/* Interior elements visualization (DEAD — bodies view now uses BodiesView component) */}
                  {false && (
                    <>
                      {(() => {
                        const slotItems = unit.cabinet.state.interior['single:single'] ?? [];
                        const allItems = (slotItems as import('../../types/interior').InteriorItem[]);

                        // Shelves
                        const shelves = allItems.filter((it): it is import('../../types/interior').ShelfItem =>
                          it.type === 'shelf'
                        );

                        // Hanging rods
                        const rods = allItems.filter((it): it is import('../../types/interior').RodItem =>
                          it.type === 'rod'
                        );

                        // External drawers
                        const externalDrawers = allItems.filter((it): it is import('../../types/interior').DrawerItem =>
                          it.type === 'drawer' && it.mount === 'external'
                        );

                        return (
                          <>
                            {/* Shelves as horizontal lines */}
                            {shelves.map((shelf, si) => {
                              const shelfY = l.y + bodyH - shelf.heightFromFloor * scale;
                              return (
                                <line
                                  key={`shelf-${si}`}
                                  x1={l.x + 2}
                                  x2={l.x + l.w - 2}
                                  y1={shelfY}
                                  y2={shelfY}
                                  stroke="#c9a876"
                                  strokeWidth={0.6}
                                />
                              );
                            })}

                            {/* Hanging rods as thin horizontal lines */}
                            {rods.map((rod, ri) => {
                              const rodY = l.y + bodyH - rod.heightFromFloor * scale;
                              return (
                                <line
                                  key={`rod-${ri}`}
                                  x1={l.x + 3}
                                  x2={l.x + l.w - 3}
                                  y1={rodY}
                                  y2={rodY}
                                  stroke="#888"
                                  strokeWidth={0.4}
                                  strokeDasharray="2 2"
                                />
                              );
                            })}

                            {/* Drawers */}
                            {externalDrawers.map((drawer, di) => {
                              // גובה החזית של המגירה
                              const faceHeight = drawer.drawerHeight;
                              // גובה גוף המגירה — 4 ס"מ פחות מהחזית
                              const boxH = (faceHeight - 4) * scale;
                              // Y של תחתית החזית
                              const faceBottomY = l.y + bodyH - drawer.heightFromFloor * scale;
                              // Y של תחתית גוף המגירה (מתחת לחזית ב-4 ס"מ)
                              const boxY = faceBottomY - boxH;
                              const boxW = l.w - 4;
                              const boxX = l.x + 2;

                              return (
                                <g key={`drawer-${di}`}>
                                  {/* Drawer box */}
                                  <rect
                                    x={boxX}
                                    y={boxY}
                                    width={boxW}
                                    height={boxH}
                                    fill="none"
                                    stroke="#9d8b7e"
                                    strokeWidth={0.8}
                                  />
                                  {/* Left rail (vertical line on left side, bottom part) */}
                                  <line
                                    x1={boxX + 1.5}
                                    x2={boxX + 1.5}
                                    y1={boxY + boxH - 1}
                                    y2={faceBottomY - 1}
                                    stroke="#b8956a"
                                    strokeWidth={0.6}
                                  />
                                  {/* Right rail (vertical line on right side, bottom part) */}
                                  <line
                                    x1={boxX + boxW - 1.5}
                                    x2={boxX + boxW - 1.5}
                                    y1={boxY + boxH - 1}
                                    y2={faceBottomY - 1}
                                    stroke="#b8956a"
                                    strokeWidth={0.6}
                                  />
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </>
                  )}

                  {/* Sink-open indicator */}
                  {l.sinkOpen && (
                    <>
                      <line x1={l.x} y1={l.y} x2={l.x + l.w} y2={l.y}
                        stroke="var(--color-text-secondary)" strokeWidth={1} strokeDasharray="4 4" />
                      <rect x={l.x} y={l.y} width={l.w} height={l.tw}
                        fill="var(--color-surface-raised)" stroke="var(--color-text-secondary)" strokeWidth={1} />
                      <rect x={l.x} y={l.y + l.tw + 2} width={l.w} height={l.tw}
                        fill="var(--color-surface-raised)" stroke="var(--color-text-secondary)" strokeWidth={1} />

                      {/* Sink basin visualization */}
                      <rect
                        x={l.x + (l.w - 60 * scale) / 2}
                        y={l.y + l.tw * 2 + 2}
                        width={60 * scale}
                        height={25 * scale}
                        fill="#b0c4d8"
                        stroke="#7a9ab5"
                        strokeWidth={1}
                        rx={2}
                      />
                      {/* Drain hole */}
                      <circle
                        cx={l.x + l.w / 2}
                        cy={l.y + l.tw * 2 + 2 + 12 * scale}
                        r={2 * scale}
                        fill="#7a9ab5"
                      />
                    </>
                  )}

                  {/* Fronts overlay (fronts view mode) */}
                  {viewMode === 'fronts' && (
                    <FrontPanels unit={unit} layout={l} scale={scale} />
                  )}

                  {/* Unit number badge */}
                  <circle cx={l.x + 12} cy={l.y + 12} r={10}
                    fill={selected ? 'var(--color-primary)' : 'var(--color-surface-raised)'}
                    stroke={selected ? 'var(--color-primary)' : 'var(--color-border)'}
                    strokeWidth={1}
                  />
                  <text x={l.x + 12} y={l.y + 12}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={9} fontWeight="600"
                    fill={selected ? 'white' : 'var(--color-text-secondary)'}
                  >
                    {i + 1}
                  </text>

                  {/* Labels */}
                  <text x={l.x + l.w / 2} y={l.y - 18}
                    textAnchor="middle" fontSize={10}
                    fill="var(--color-text-primary)"
                    fontWeight={selected ? '600' : '400'}
                  >
                    {unit.name}
                  </text>
                  <text x={l.x + l.w / 2} y={l.y - 6}
                    textAnchor="middle" fontSize={8.5}
                    fill="var(--color-text-secondary)"
                  >
                    {effectiveDims(unit).W}×{effectiveDims(unit).H}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
    </div>
  );
}

// ── BodiesView ──────────────────────────────────────────────────────────────
// Flex layout of <CabinetSketch embedded /> — one per unit. Each unit shows
// the full board model (top/bottom/sides with thickness, shelves as boards,
// partitions, envelope, sink basin) just like the single-unit editor sketch.

interface BodiesViewProps {
  units: KitchenUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  onOpenUnit: (id: string) => void;
  settings?: AppSettingsSlice | undefined;
}

function BodiesView({ units, selectedUnitId, onSelect, onOpenUnit, settings }: BodiesViewProps) {
  // Compute totalW and maxH to fit all units into the available canvas width.
  // PX_PER_CM is chosen so the union of all unit widths + label area fits.
  const containerRef = useRef<HTMLDivElement>(null);
  const [availW, setAvailW] = useState(800);
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setAvailW(w);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const maxH = Math.max(...units.map(u => effectiveDims(u).H));
  // Total width includes per-unit envelope panels (so the scale calculation
  // matches the per-unit outerCabW used below for the wrapper div width).
  const totalW = units.reduce((s, u) => {
    const sides = getShellSides(u.cabinet.input);
    const inp = u.cabinet.input;
    const tFront = getEffectiveMaterial(inp.frontMaterialId).thickness / 10;
    const env = (sides.left ? tFront : 0) + (sides.right ? tFront : 0);
    return s + effectiveDims(u).W + env;
  }, 0);
  // Pixels-per-cm: derive a single scale so all units fit horizontally
  // (with some padding) and vertically (cap at 360px tall).
  const PADDING = 32;
  const MAX_H_PX = 360;
  const sx = (availW - PADDING) / Math.max(1, totalW);
  const sy = MAX_H_PX / Math.max(1, maxH);
  const scale = Math.max(2, Math.min(sx, sy, 8));

  return (
    <div ref={containerRef} className={styles.unitsRow}>
      {units.map((unit, i) => {
        const inp = unit.cabinet.input;
        const { W: effW, H: effH } = effectiveDims(unit);
        const st = unit.cabinet.state;
        const isSelected = unit.id === selectedUnitId;

        // Compute frontLayoutByRow + numFrontsPerBox so the embedded sketch
        // can render fronts correctly (it skips fronts in bodies mode but
        // needs these for external drawer geometry).
        const customMaterials = settings?.customMaterials ?? [];
        const bodyMat = getMaterialWithCustom(inp.bodyMaterialId, customMaterials);
        const frontMat = getMaterialWithCustom(inp.frontMaterialId, customMaterials);
        const tBody = bodyMat.thickness / 10;
        const tFront = frontMat.thickness / 10;
        const sides = getShellSides(inp);
        const hasAnyShell = sides.left || sides.right;
        const innerW = computeInnerWidth(effW, sides, tFront);
        const carcassD = computeCarcassDepth(inp.D, inp.backThickness, HINGE_GAP_CM, tFront);
        const envelopeTopH = (inp.hasEnvelopeTop && hasAnyShell) ? tFront : 0;
        const boxes = decomposeBoxes(innerW, effH, carcassD, inp.lowerDoorH, inp.plinth, inp.doorsPerColumn, inp.middleDoorH, envelopeTopH);
        const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
        const numFrontsPerBox = new Map<string, number>();
        for (const box of bodyBoxes) {
          numFrontsPerBox.set(box.id, Math.max(1, Math.ceil(box.W / inp.maxDoorWidth)));
        }
        const cabinetGapCm = inp.doorGapMm / 10;
        const rowsByLevel = groupBoxesByRow(bodyBoxes);
        const layoutByRow = new Map<BoxLevel, RowFrontLayout>();
        for (const [level, rowBoxes] of rowsByLevel) {
          const totalFronts = getTotalFrontsInRow(rowBoxes, numFrontsPerBox);
          layoutByRow.set(level, computeRowFrontLayout({
            cabinetW: effW,
            hasOuterShell: hasAnyShell,
            shellThicknessCm: tFront,
            totalFrontsInRow: totalFronts,
            gapCm: cabinetGapCm,
          }));
        }
        void tBody; // referenced for completeness; not used directly here

        // Translate saved-state Records (keyed by BoxSlotId/boxStableKey) to
        // runtime Maps keyed by the ad-hoc box.id that the current decomposeBoxes
        // call produced. Without this, CabinetSketch can't find interior items
        // / partitions for any body and renders an empty carcass.
        const interiorById: InteriorById = {};
        const cellInteriorById: CellInteriorById = {};
        const partitionsById = new Map<string, boolean>();
        for (const box of bodyBoxes) {
          const slotKey = boxStableKey(box);
          const items = st.interior[slotKey];
          if (items) interiorById[box.id] = items as InteriorItem[];
          const cells = st.cellInterior[slotKey];
          if (cells) cellInteriorById[box.id] = cells as InteriorItem[][];
          if (st.partitions[slotKey]) partitionsById.set(box.id, true);
        }
        const boardOverrides = new Map(Object.entries(st.boardOverrides ?? {}));
        const boxDimensionOverrides = new Map(Object.entries(st.boxDimensionOverrides ?? {}));

        // Render the unit at its REAL OUTER dimensions × shared `scale`.
        // The cabinet outer width includes envelope panels (per side), so the
        // wrapper div must match the SVG's effective cabinet width — otherwise
        // the SVG's preserveAspectRatio compresses the height to fit a narrower
        // container, making the unit look shorter than its neighbours.
        const outerCabW = effW + (sides.left ? tFront : 0) + (sides.right ? tFront : 0);
        const unitWpx = outerCabW * scale;
        const unitHpx = effH * scale;

        return (
          <div
            key={unit.id}
            className={`${styles.unitWrapper} ${isSelected ? styles.unitSelected : ''}`}
            onClick={() => onSelect(unit.id)}
            onDoubleClick={() => onOpenUnit(unit.id)}
            style={{ width: `${unitWpx}px` }}
          >
            <div className={styles.unitLabel}>
              <span className={styles.unitNumber}>{i + 1}</span>
              <span className={styles.unitName}>{unit.name}</span>
              <span className={styles.unitDims}>{effW}×{effH}</span>
            </div>
            <div className={styles.sketchHolder} style={{ width: `${unitWpx}px`, height: `${unitHpx}px` }}>
              <CabinetSketch
                embedded
                W={String(effW)}
                H={String(effH)}
                D={String(inp.D)}
                backThicknessCm={inp.backThickness}
                plinth={String(inp.plinth)}
                doorsPerColumn={String(inp.doorsPerColumn)}
                {...(inp.lowerDoorH !== undefined ? { lowerDoorH: String(inp.lowerDoorH) } : {})}
                {...(inp.middleDoorH !== undefined ? { middleDoorH: String(inp.middleDoorH) } : {})}
                interiorById={interiorById}
                cellInteriorById={cellInteriorById}
                partitionsById={partitionsById}
                hasShell={hasAnyShell}
                hasShellLeft={sides.left}
                hasShellRight={sides.right}
                frontMaterialThickness={tFront}
                {...(inp.hasEnvelopeTop ? { hasEnvelopeTop: true } : {})}
                frontLayoutByRow={layoutByRow}
                numFrontsPerBox={numFrontsPerBox}
                bodyMaterialId={inp.bodyMaterialId}
                frontMaterialId={inp.frontMaterialId}
                boardOverrides={boardOverrides}
                boxDimensionOverrides={boxDimensionOverrides}
                {...(inp.topVariant ? { topVariant: inp.topVariant } : {})}
                {...(inp.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: inp.sinkTraverseWidthCm } : {})}
                customMaterials={customMaterials}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── CutsView ────────────────────────────────────────────────────────────────
// Aggregate cuts from all units into a single CutsList.
function CutsView({ units, settings }: { units: KitchenUnit[]; settings?: AppSettingsSlice | undefined }) {
  const allCuts = useMemo<CutItem[]>(() => {
    const out: CutItem[] = [];
    for (const unit of units) {
      const { cuts } = computeUnitCutsAndHardware(
        unit.cabinet.input,
        unit.cabinet.state,
        settings?.customMaterials ?? [],
      );
      // Prefix each cut name with the unit name so the user can tell which
      // unit each piece belongs to.
      for (const c of cuts) {
        out.push({ ...c, name: `${unit.name}: ${c.name}` });
      }
    }
    return out;
  }, [units, settings]);

  return (
    <div className={styles.aggregateTab}>
      <CutsList cuts={allCuts} settings={{
        ...(settings?.bodyMaterialPriceOverrides ? { bodyMaterialPriceOverrides: settings.bodyMaterialPriceOverrides } : {}),
        ...(settings?.frontMaterialPriceOverrides ? { frontMaterialPriceOverrides: settings.frontMaterialPriceOverrides } : {}),
        ...(settings?.customMaterials ? { bodyCustomMaterials: settings.customMaterials, frontCustomMaterials: settings.customMaterials } : {}),
      }} />
    </div>
  );
}

// ── HardwareView ────────────────────────────────────────────────────────────
// Aggregate hardware from all units. Items with the same specId are summed.
function HardwareView({ units, settings }: { units: KitchenUnit[]; settings?: AppSettingsSlice | undefined }) {
  const allHardware = useMemo<HardwareLineItem[]>(() => {
    const byId = new Map<string, HardwareLineItem>();
    for (const unit of units) {
      const { hardwareItems } = computeUnitCutsAndHardware(
        unit.cabinet.input,
        unit.cabinet.state,
        settings?.customMaterials ?? [],
      );
      for (const item of hardwareItems) {
        const existing = byId.get(item.specId);
        if (existing) {
          existing.qty += item.qty;
          existing.total += item.total;
        } else {
          byId.set(item.specId, { ...item });
        }
      }
    }
    return [...byId.values()];
  }, [units, settings]);

  return (
    <div className={styles.aggregateTab}>
      <HardwareList items={allHardware} />
    </div>
  );
}
