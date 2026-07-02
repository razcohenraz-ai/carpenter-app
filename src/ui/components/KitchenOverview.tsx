import React, { useRef, useEffect, useState, useMemo } from 'react';
import type { KitchenUnit } from '../../types/project';
import type { MaterialId, CustomMaterial } from '../../types/materials';
import type { CutItem } from '../../types/cuts';
import type { HardwareLineItem } from '../../types/hardware';
import { calcDoors } from '../../core/doors/doorCalc';
import { computeRowFrontLayout, computeFrontGeometry } from '../../core/geometry/frontGeometry';
import { computeCarcassDepth, HINGE_GAP_CM } from '../../core/boards/boardModel';
import { computeUnitCutsAndHardware } from '../../core/cabinetCompute';
import { groupKitchenUnitsForPlinth, buildKitchenPlinthCuts, plinthPieceWidths, buildKitchenPlinthBoxes } from '../../core/product/kitchenPlinth';
import { buildCabinetSketchModel } from '../../core/product/cabinetSketchModel';
import { getShellSides } from '../../types/cabinet';
import {
  effectiveUnitDims, isWallUnit, kitchenElevationLayout,
  BASE_REF_H_CM, COUNTERTOP_CM,
} from '../../core/product/kitchenFootprint';
import { getEffectiveMaterial, getMaterialWithCustom } from '../../catalog';
import { useTranslation } from '../../i18n/LanguageContext';
import CabinetSketch from './CabinetSketch';
import { CabinetFrontsOverlay } from './CabinetFrontsOverlay';
import CutsList from './CutsList';
import LayoutView from './LayoutView';
import { HardwareList } from './HardwareList';
import PlinthEditor from './PlinthEditor';
import type { Box } from '../../types/geometry';
import styles from './KitchenOverview.module.css';

interface AppSettingsSlice {
  customMaterials?: CustomMaterial[];
  bodyMaterialPriceOverrides?: Partial<Record<MaterialId, number>>;
  frontMaterialPriceOverrides?: Partial<Record<MaterialId, number>>;
  runnerPriceOverrides?: Record<string, number[]>;
  liftMechanismPriceOverrides?: Record<string, number>;
}

interface Props {
  units: KitchenUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  onOpenUnit: (id: string) => void;
  /** Clicking a front in the fronts view opens that unit AND jumps straight to
   *  the clicked door/drawer's editor (the "cabinet way"). */
  onOpenUnitToFront?: (unitId: string, editing: { type: 'door'; doorId: string } | { type: 'drawer'; drawerId: string }) => void;
  /** When provided, the kitchen plinth becomes editable: clicking the plinth
   *  bar opens PlinthEditor for the corresponding plinth group, and changes
   *  propagate to every unit in that group through this callback. */
  onUpdateUnit?: (unitId: string, cabinet: import('../../types').Cabinet) => void;
  settings?: AppSettingsSlice | undefined;
}

type ViewMode = 'bodies' | 'fronts' | 'cuts' | 'layout' | 'hardware';

const GAP_CM  = 2;
const PAD_TOP = 36;
const PAD_BOT = 8;
const OVERVIEW_H = 340;
const DRAW_H = OVERVIEW_H - PAD_TOP - PAD_BOT;

/** Returns effective W/H/D for a unit, applying any boxDimensionOverrides.
 *  The override key is "single:single" (boxStableKey for a single-box cabinet). */
// Effective dims + the wall-cabinet predicate come from the shared kitchen
// footprint module (single source — the room footprint reads the same).
const effectiveDims = effectiveUnitDims;
const isWall = isWallUnit;

function computeScale(units: KitchenUnit[], availableW: number): number {
  if (units.length === 0) return 4;
  const totalW = units.reduce((s, u) => s + effectiveDims(u).W, 0) + (units.length - 1) * GAP_CM;
  const maxH   = Math.max(...units.map(u => effectiveDims(u).H));
  const sx = availableW / totalW;
  const sy = DRAW_H / maxH;
  return Math.min(sx, sy, 8);
}

/** Standalone SVG of a single unit's front panels.
 *  ViewBox is in cm — `0 0 outerCabW effH` — matching the CabinetSketch
 *  (embedded) viewBox of the same unit, so overlaying the two SVGs on the
 *  same wrapper div renders the fronts exactly on top of the cabinet body.
 *  Used by UnitsView when viewMode === 'fronts'. */
function UnitFrontPanelsStandalone({ unit, viewBoxW, viewBoxH, onDoorClick, onDrawerFrontClick }: {
  unit: KitchenUnit;
  viewBoxW: number;  // cm — outerCabW (effW + envelopes)
  viewBoxH: number;  // cm — effH
  onDoorClick?: (doorId: string) => void;
  onDrawerFrontClick?: (drawerId: string) => void;
}): React.JSX.Element | null {
  return (
    <CabinetFrontsOverlay
      input={unit.cabinet.input}
      state={unit.cabinet.state}
      viewBoxW={viewBoxW}
      viewBoxH={viewBoxH}
      {...(onDoorClick ? { onDoorClick } : {})}
      {...(onDrawerFrontClick ? { onDrawerFrontClick } : {})}
    />
  );
}

/** LEGACY: used by the old single-SVG fronts canvas (kept for reference but
 *  no longer rendered after the unified UnitsView). */
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
                       inp.lowerDoorH, hasAnyShell, tFront, forceRows, inp.doorGapMm / 10);
  if (dl.n === 0) return null;

  const bodyH = layout.h - layout.plinthH; // px — body rect height (without plinth)
  const clipId = `clip-unit-${unit.id}`;
  const gapCm = inp.doorGapMm / 10;

  const frontLayout = computeRowFrontLayout({
    cabinetW: effW,
    hasOuterShell: hasAnyShell,
    // Asymmetric shell support — a wall-flush unit with shell on one side
    // only must shrink the door width by 1×t, not 2×t.
    shellSides: sides,
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

export function KitchenOverview({ units, selectedUnitId, onSelect, onOpenUnit, onOpenUnitToFront, onUpdateUnit, settings }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableW, setAvailableW] = useState(800);
  const [viewMode, setViewMode] = useState<ViewMode>('bodies');
  // Index into `groupKitchenUnitsForPlinth(units)` of the group currently
  // being edited via PlinthEditor; null = no editor open.
  const [editingPlinthGroupIdx, setEditingPlinthGroupIdx] = useState<number | null>(null);

  // Precompute plinth groups once per units array — used for click-to-edit
  // routing and for rendering PlinthEditor when active.
  const plinthGroups = useMemo(
    () => groupKitchenUnitsForPlinth(units.filter(u => (u.cabinet.input.mount ?? 'base') !== 'wall')),
    [units],
  );

  // unit.id → group index in plinthGroups (or undefined if unit has no plinth).
  const unitIdToGroupIdx = useMemo(() => {
    const m = new Map<string, number>();
    plinthGroups.forEach((g, gi) => g.units.forEach(u => m.set(u.id, gi)));
    return m;
  }, [plinthGroups]);

  // Open the plinth editor for the group containing this unit. No-op if the
  // parent didn't wire `onUpdateUnit` (no way to commit changes).
  function openPlinthEditorForUnit(unitId: string): void {
    if (!onUpdateUnit) return;
    const gi = unitIdToGroupIdx.get(unitId);
    if (gi === undefined) return;
    setEditingPlinthGroupIdx(gi);
  }

  // Apply a kitchen-level plinth attribute change to every unit in the active
  // group. Each unit's CabinetInput gets a patched plinth field; state is
  // preserved as-is.
  function patchActiveGroupPlinth(patch: { plinth?: number; plinthRecess?: number }): void {
    if (!onUpdateUnit || editingPlinthGroupIdx === null) return;
    const group = plinthGroups[editingPlinthGroupIdx];
    if (!group) return;
    for (const u of group.units) {
      const input = {
        ...u.cabinet.input,
        ...(patch.plinth !== undefined ? { plinth: patch.plinth } : {}),
        ...(patch.plinthRecess !== undefined ? { plinthRecess: patch.plinthRecess } : {}),
      };
      onUpdateUnit(u.id, { input, state: u.cabinet.state });
    }
  }

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
      tw: (inp.sinkTraverseWidthCm ?? 10) * scale,
    };
    xCursor += uw + GAP_CM * scale;
    return l;
  });

  const svgW = xCursor > 0 ? xCursor - GAP_CM * scale : 10;

  // ── Plinth editor (kitchen-level) ─────────────────────────────────────────
  // When a plinth group is selected for editing, render the full-screen
  // PlinthEditor instead of the overview. Changes propagate to every unit
  // in the active group via `patchActiveGroupPlinth`.
  if (editingPlinthGroupIdx !== null && plinthGroups[editingPlinthGroupIdx]) {
    const group = plinthGroups[editingPlinthGroupIdx]!;
    const customMaterials = settings?.customMaterials ?? [];
    const bodyMaterial = getMaterialWithCustom(group.key.bodyMaterialId, customMaterials);
    const frontMaterial = getMaterialWithCustom(group.key.frontMaterialId, customMaterials);
    const tFront = frontMaterial.thickness / 10;
    const carcassD = computeCarcassDepth(group.key.D, group.key.backThickness, HINGE_GAP_CM, tFront);
    // Same cabinet-style gable distribution used by the cut list: split the
    // group's total width by MAX_BOX_W (100 cm). For totalW ≤ 100 the result
    // is a single 'single' box (edges + maybe a mid-body if > 80); for wider
    // groups it's N boxes of ≤ 100 each (edges + joints + mid-bodies).
    const syntheticBoxes: Box[] = buildKitchenPlinthBoxes(group.totalW, group.key.plinthH, group.key.D);
    return (
      <PlinthEditor
        cabinetW={group.totalW}
        cabinetD={carcassD}
        plinthHeight={group.key.plinthH}
        plinthRecess={group.key.plinthRecess}
        boxes={syntheticBoxes}
        bodyMaterial={bodyMaterial}
        frontMaterial={frontMaterial}
        gableOverrides={new Map()}
        boardOverrides={new Map()}
        onSetGableOverride={() => {}}
        onResetGables={() => {}}
        onPlinthHeightChange={h => patchActiveGroupPlinth({ plinth: h })}
        onPlinthRecessChange={r => patchActiveGroupPlinth({ plinthRecess: r })}
        onBack={() => setEditingPlinthGroupIdx(null)}
      />
    );
  }

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
            className={`${styles.toggleBtn} ${viewMode === 'layout' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('layout')}
          >
            פריסה
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
      {viewMode === 'layout' && units.length > 0 && (
        <LayoutAggView units={units} settings={settings} />
      )}
      {viewMode === 'hardware' && units.length > 0 && (
        <HardwareView units={units} settings={settings} />
      )}

      {/* Unified bodies + fronts canvas — same layout, fronts adds an overlay */}
      {(viewMode === 'bodies' || viewMode === 'fronts') && units.length > 0 && (
        <UnitsView units={units} selectedUnitId={selectedUnitId}
          onSelect={onSelect} onOpenUnit={onOpenUnit} settings={settings}
          viewMode={viewMode}
          {...(onOpenUnitToFront ? { onOpenUnitToFront } : {})}
          {...(onUpdateUnit ? { onPlinthClickForUnit: openPlinthEditorForUnit } : {})} />
      )}

      {/* Empty state */}
      {units.length === 0 && (
        <div ref={containerRef} className={styles.container}>
          <div className={styles.empty}>הוסף גופים כדי לראות את המטבח</div>
        </div>
      )}
      {/* DEAD CODE — legacy single-SVG fronts canvas, kept compiled-out to
          preserve TS reachability checks; will be cleaned up later. */}
      {false as boolean && units.length > 0 && (
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

                  {/* Sink-open indicator: front standing board only (back is
                       hidden behind it in front view). 10cm tall by default. */}
                  {l.sinkOpen && (
                    <>
                      <rect x={l.x} y={l.y} width={l.w} height={l.tw}
                        fill="var(--color-surface-raised)" stroke="var(--color-text-secondary)" strokeWidth={1} />

                      {/* Sink basin visualization — overlay on top of standing
                           board, aligned with top of body (4a). */}
                      <rect
                        x={l.x + (l.w - 60 * scale) / 2}
                        y={l.y}
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
                        cy={l.y + 12 * scale}
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
      )}
    </div>
  );
}

// ── UnitsView ───────────────────────────────────────────────────────────────
// Single layout for both 'bodies' and 'fronts' tabs — flex of CabinetSketch
// (embedded) per unit. In fronts mode, an SVG overlay of front panels is
// stacked on top of each unit's sketch holder using the same viewBox so the
// switch between modes feels like adding/removing a layer, not a relayout.

interface UnitsViewProps {
  units: KitchenUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  onOpenUnit: (id: string) => void;
  /** Called when the user clicks the plinth area of a specific unit. Used
   *  by the parent (KitchenOverview) to open the kitchen-level PlinthEditor
   *  for the plinth group containing that unit. */
  onPlinthClickForUnit?: (unitId: string) => void;
  /** Front clicked in the fronts overlay → open that unit on the door/drawer editor. */
  onOpenUnitToFront?: (unitId: string, editing: { type: 'door'; doorId: string } | { type: 'drawer'; drawerId: string }) => void;
  settings?: AppSettingsSlice | undefined;
  viewMode: 'bodies' | 'fronts';
}

function UnitsView({ units, selectedUnitId, onSelect, onOpenUnit, onPlinthClickForUnit, onOpenUnitToFront, settings, viewMode }: UnitsViewProps) {
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

  // Wall (קלפה) vs base units. Wall cabinets hang above the countertop, so they
  // render in an upper row and never participate in the floor plinth.
  // isWall / unitOuterW / WALL_BOTTOM_CM / BASE_REF_H_CM / COUNTERTOP_CM are
  // imported from core/product/kitchenFootprint (shared with productBounds).
  const hasWall = units.some(isWall);

  // Kitchen-level plinth splits — for each unit, which piece-boundary
  // offsets (in cm, measured from the unit's left edge) fall within its
  // width. Built once per units array and looked up by unit.id. Wall units
  // are excluded (no plinth) so adjacent base units form one continuous run.
  const unitPlinthSplits = useMemo<Map<string, number[]>>(() => {
    const map = new Map<string, number[]>();
    const groups = groupKitchenUnitsForPlinth(units.filter(u => (u.cabinet.input.mount ?? 'base') !== 'wall'));
    for (const group of groups) {
      const pieces = plinthPieceWidths(group.totalW);
      if (pieces.length <= 1) continue;
      // Piece boundaries within the group (cumulative widths at end of each piece).
      const boundaries: number[] = [];
      let cumPiece = 0;
      for (let i = 0; i < pieces.length - 1; i++) {
        cumPiece += pieces[i]!;
        boundaries.push(cumPiece);
      }
      // For each unit in the group, find which boundaries fall in its x-range.
      let cumUnit = 0;
      for (const u of group.units) {
        const uw = u.cabinet.input.W;
        const inRange = boundaries
          .filter(b => b > cumUnit && b <= cumUnit + uw)
          .map(b => b - cumUnit);
        if (inRange.length > 0) map.set(u.id, inRange);
        cumUnit += uw;
      }
    }
    return map;
  }, [units]);

  // ── Elevation layout ─────────────────────────────────────────────────────────
  // Per-unit elevation positions come from the shared core layout
  // (kitchenElevationLayout) — single source: the room sub-boxes and the
  // future 3D read the same. `positions` keeps the legacy {xCm, yBottomCm}
  // shape the render below consumes unchanged.
  const elevationLayout = kitchenElevationLayout(units);
  const positions = new Map(
    elevationLayout.map(b => [b.unitId, { xCm: b.xCm, yBottomCm: b.yBottomCm }] as const),
  );
  const baseRunW = elevationLayout.filter(b => !b.isWall).reduce((s, b) => s + b.w, 0);
  const elevationW = Math.max(1, ...elevationLayout.map(b => b.xCm + b.w));
  const elevationTopCm = Math.max(
    1,
    hasWall ? BASE_REF_H_CM + COUNTERTOP_CM : 0,
    ...elevationLayout.map(b => b.yBottomCm + b.h),
  );
  // Pixels-per-cm: one scale fitting the elevation horizontally (with padding)
  // and vertically (taller cap when wall cabinets add an upper row).
  const PADDING = 32;
  const LABEL_RESERVE_PX = 24;
  const MAX_H_PX = hasWall ? 460 : 360;
  const sx = (availW - PADDING) / elevationW;
  const sy = MAX_H_PX / elevationTopCm;
  const scale = Math.max(2, Math.min(sx, sy, 8));

  return (
    <div ref={containerRef} className={styles.elevation}>
      <div
        className={styles.elevationCanvas}
        style={{ width: `${elevationW * scale}px`, height: `${elevationTopCm * scale + LABEL_RESERVE_PX}px` }}
      >
        {/* Countertop (שיש) — a 2 cm strip on top of the base run, drawn only
            when wall cabinets are present so it marks the wall-mount reference. */}
        {hasWall && (
          <div
            className={styles.countertop}
            style={{
              right: 0,
              bottom: `${BASE_REF_H_CM * scale}px`,
              width: `${baseRunW * scale}px`,
              height: `${Math.max(COUNTERTOP_CM * scale, 1.5)}px`,
            }}
          />
        )}
        {units.map((unit, i) => {
        const inp = unit.cabinet.input;
        const st = unit.cabinet.state;
        const isSelected = unit.id === selectedUnitId;
        const customMaterials = settings?.customMaterials ?? [];

        // Single source for the embedded-sketch props (interior maps, front
        // layout, overrides, effective/outer dims) — shared with the room's
        // detailed elevation. See core/product/cabinetSketchModel.
        const {
          interiorById, cellInteriorById, partitionsById,
          frontLayoutByRow: layoutByRow, numFrontsPerBox, boardOverrides,
          boxDimensionOverrides, effW, effH, outerCabW, tFront, sides, hasAnyShell,
        } = buildCabinetSketchModel(inp, st, customMaterials);

        // The cabinet outer width includes envelope panels, so the wrapper div
        // matches the SVG's effective cabinet width (preserveAspectRatio).
        const unitWpx = outerCabW * scale;
        const unitHpx = effH * scale;

        return (
          <div
            key={unit.id}
            className={`${styles.unitWrapper} ${isSelected ? styles.unitSelected : ''}`}
            onClick={() => onSelect(unit.id)}
            onDoubleClick={() => onOpenUnit(unit.id)}
            style={{
              position: 'absolute',
              right: `${(positions.get(unit.id)?.xCm ?? 0) * scale}px`,
              bottom: `${(positions.get(unit.id)?.yBottomCm ?? 0) * scale}px`,
              width: `${unitWpx}px`,
            }}
          >
            <div className={styles.unitLabel}>
              <span className={styles.unitNumber}>{i + 1}</span>
              <span className={styles.unitName}>{unit.name}</span>
              <span className={styles.unitDims}>{effW}×{effH}</span>
            </div>
            <div className={styles.sketchHolder} style={{ width: `${unitWpx}px`, height: `${unitHpx}px` }}>
              <CabinetSketch
                embedded
                W={String(inp.W)}
                H={String(inp.H)}
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
                {...(inp.hasWallEnvelope && inp.mount === 'wall'
                  ? { wallEnvelopeCm: tFront } : {})}
                {...(inp.liftMechanism && inp.liftMechanismId ? { liftMechanismId: inp.liftMechanismId } : {})}
                frontLayoutByRow={layoutByRow}
                numFrontsPerBox={numFrontsPerBox}
                bodyMaterialId={inp.bodyMaterialId}
                frontMaterialId={inp.frontMaterialId}
                boardOverrides={boardOverrides}
                boxDimensionOverrides={boxDimensionOverrides}
                {...(inp.topVariant ? { topVariant: inp.topVariant } : {})}
                {...(inp.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: inp.sinkTraverseWidthCm } : {})}
                {...(inp.hasBack !== undefined ? { hasBack: inp.hasBack } : {})}
                {...(inp.hasBottom !== undefined ? { hasBottom: inp.hasBottom } : {})}
                {...(inp.cornerFiller ? { cornerSingleWidth: true } : {})}
                {...(viewMode === 'bodies' ? { showGaps: true } : {})}
                customMaterials={customMaterials}
                {...((() => {
                  const splits = unitPlinthSplits.get(unit.id);
                  return splits && splits.length > 0 ? { extraPlinthSplits: splits } : {};
                })())}
                unifiedPlinth
                {...(onPlinthClickForUnit && (inp.plinth ?? 0) > 0
                  ? { onPlinthClick: () => onPlinthClickForUnit(unit.id) }
                  : {})}
              />
              {viewMode === 'fronts' && (
                <UnitFrontPanelsStandalone
                  unit={unit}
                  viewBoxW={outerCabW}
                  viewBoxH={effH}
                  {...(onOpenUnitToFront ? {
                    onDoorClick: (doorId: string) => onOpenUnitToFront(unit.id, { type: 'door', doorId }),
                    onDrawerFrontClick: (drawerId: string) => onOpenUnitToFront(unit.id, { type: 'drawer', drawerId }),
                  } : {})}
                />
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── kitchen cut aggregation ──────────────────────────────────────────────────
// Whole-kitchen cut list: per-unit cuts (plinth skipped) prefixed with the unit
// name, plus the kitchen-level aggregated plinth. Shared by the Cuts tab and the
// Layout (פריסה) tab so both nest exactly the same pieces.
function buildAggregateCuts(units: KitchenUnit[], settings?: AppSettingsSlice | undefined): CutItem[] {
  const out: CutItem[] = [];
  // Per-unit cuts WITHOUT plinth — plinth is aggregated at the kitchen
  // level so adjacent units sharing plinth attributes share a single
  // physical plinth that spans them.
  for (const unit of units) {
    const { cuts } = computeUnitCutsAndHardware(
      unit.cabinet.input,
      unit.cabinet.state,
      settings?.customMaterials ?? [],
      { skipPlinth: true },
    );
    // Prefix each cut name with the unit name so the user can tell which
    // unit each piece belongs to.
    for (const c of cuts) {
      out.push({ ...c, name: `${unit.name}: ${c.name}` });
    }
  }
  // Kitchen-level plinth: one group per run of adjacent units with the same
  // plinth attributes; pieces split at 240 cm boundaries. Wall cabinets
  // (mount='wall') have no plinth and are excluded so they don't break runs.
  const groups = groupKitchenUnitsForPlinth(units.filter(u => (u.cabinet.input.mount ?? 'base') !== 'wall'));
  for (const group of groups) {
    const plinthCuts = buildKitchenPlinthCuts(group, settings?.customMaterials ?? []);
    // Label with the joined unit names so the saw operator can see which
    // run the plinth piece belongs to. Use just "צוקל" prefix for clarity.
    const label = `צוקל (${group.units.map(u => u.name).join(' + ')})`;
    for (const c of plinthCuts) {
      out.push({ ...c, name: `${label}: ${c.name}` });
    }
  }
  return out;
}

// ── CutsView ────────────────────────────────────────────────────────────────
// Aggregate cuts from all units into a single CutsList.
function CutsView({ units, settings }: { units: KitchenUnit[]; settings?: AppSettingsSlice | undefined }) {
  const allCuts = useMemo<CutItem[]>(() => buildAggregateCuts(units, settings), [units, settings]);

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

// ── LayoutAggView ─────────────────────────────────────────────────────────────
// Whole-kitchen פריסה: the aggregated cut list nested onto plates.
function LayoutAggView({ units, settings }: { units: KitchenUnit[]; settings?: AppSettingsSlice | undefined }) {
  const allCuts = useMemo<CutItem[]>(() => buildAggregateCuts(units, settings), [units, settings]);
  return (
    <div className={styles.aggregateTab}>
      <LayoutView cuts={allCuts} {...(settings?.customMaterials ? { customMaterials: settings.customMaterials } : {})} />
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
        {
          ...(settings?.runnerPriceOverrides ? { runnerPriceOverrides: settings.runnerPriceOverrides } : {}),
          ...(settings?.liftMechanismPriceOverrides ? { liftMechanismPriceOverrides: settings.liftMechanismPriceOverrides } : {}),
        },
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
