import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { isValidSketchInput, computeSketchGeometry } from './CabinetSketch.utils';
import {
  type RowFrontLayout,
  computeFrontGeometry,
  computeFrontGeometryForSpan,
  getBoxFirstGlobalFrontIndex,
  groupBoxesByRow,
} from '../../core/geometry/frontGeometry';
import { buildBoardModel, deriveEnvelopeFlags, resolveCabinetJointMethod, computeCarcassDepth, HINGE_GAP_CM } from '../../core/boards/boardModel';
import { getEffectiveMaterial, getMaterialWithCustom } from '../../catalog';
import CabinetCutSketch from './CabinetCutSketch';
import type { BoxLevel } from '../../types/geometry';
import type { MaterialId } from '../../types/materials';
import styles from './CabinetSketch.module.css';
import type { InteriorById, CellInteriorById, DrawerItem } from '../../types/interior';

interface Props {
  W: string;
  H: string;
  D: string;
  /** Back-panel thickness in cm. Drives the same `carcassD` reduction as
   *  `useCabinet.calculate`, so the sketch's box.D matches the cut list.
   *  Required: the form always supplies it (mm field with cm conversion),
   *  so the sketch never falls back to the BoardModel constant. */
  backThicknessCm: number;
  plinth: string;
  lowerDoorH?: string;
  doorsPerColumn?: string;
  middleDoorH?: string;
  interiorById?: InteriorById | undefined;
  cellInteriorById?: CellInteriorById;
  partitionsById?: Map<string, boolean>;
  hasShell?: boolean;
  /** Per-side shell flags. When omitted, both default to `hasShell`. */
  hasShellLeft?: boolean;
  hasShellRight?: boolean;
  frontMaterialThickness?: number;
  hasEnvelopeTop?: boolean;
  frontLayoutByRow?: Map<BoxLevel, RowFrontLayout>;
  numFrontsPerBox?: Map<string, number>;
  /** Body material id — drives per-board geometry when interiorById is set. */
  bodyMaterialId?: MaterialId;
  /** Front material id — used for envelope boards. */
  frontMaterialId?: MaterialId;
  /** Click handler for a body area (no front above it in this view).
   *  Opens the body's interior editor. */
  onBoxClick?: (boxId: string) => void;
  /** Click handler for an external drawer rect. Opens the drawer editor. */
  onDrawerFrontClick?: (drawerId: string) => void;
  /** Click handler for the plinth rectangle. Opens the plinth top-view editor. */
  onPlinthClick?: () => void;
  /** Per-board override map; the cut-sketch surface uses it via
   *  `getMaterial` to tag boards with an effective material attribute. */
  boardOverrides?: ReadonlyMap<string, import('../../core/boards/boardModel').BoardOverrides>;
  /** Per-body dimension overrides keyed by boxStableKey. When provided, the
   *  sketch applies them to box geometry so the visual matches the cut list. */
  boxDimensionOverrides?: ReadonlyMap<string, { W?: number; H?: number; D?: number }>;
  /** When true, render only the <svg> (no wrapper div, no title).
   *  Used by KitchenOverview to embed multiple cabinet sketches side by side. */
  embedded?: boolean;
  /** Optional: 'sink-open' triggers sink basin overlay (rect + drain circle).
   *  Passed through to buildBoardModel for sink-traverse boards (top boards
   *  become two narrow traverses at front/back). */
  topVariant?: 'standard' | 'sink-open';
  /** Optional: width of each sink traverse in cm (default 8). */
  sinkTraverseWidthCm?: number;
  /** Custom materials registry — needed to resolve custom material thickness
   *  when bodyMaterialId/frontMaterialId reference a custom material (not in
   *  the catalog). Falls back to catalog-only if omitted. */
  customMaterials?: import('../../types/materials').CustomMaterial[];
}

export default function CabinetSketch({ W, H, D, backThicknessCm, plinth, lowerDoorH, doorsPerColumn, middleDoorH, interiorById, cellInteriorById, partitionsById, hasShell, hasShellLeft, hasShellRight, frontMaterialThickness, hasEnvelopeTop, frontLayoutByRow, numFrontsPerBox, bodyMaterialId, frontMaterialId, onBoxClick, onDrawerFrontClick, onPlinthClick, boardOverrides, boxDimensionOverrides, embedded, topVariant, sinkTraverseWidthCm, customMaterials }: Props): React.JSX.Element {
  const { t } = useTranslation();

  if (!isValidSketchInput(W, H, D, plinth, lowerDoorH, doorsPerColumn, middleDoorH)) {
    return (
      <div className={styles.placeholder}>
        <span className={styles.hint}>{t.sketch.invalidDimensions}</span>
      </div>
    );
  }

  const lo  = lowerDoorH  !== undefined ? parseFloat(lowerDoorH)  : undefined;
  const mid = middleDoorH !== undefined ? parseFloat(middleDoorH) : undefined;
  const dpc: 'auto' | 1 | 2 | 3 =
    doorsPerColumn === '1' ? 1 :
    doorsPerColumn === '2' ? 2 :
    doorsPerColumn === '3' ? 3 : 'auto';
  // Resolve per-side shell flags (kitchen units can have asymmetric shell).
  const shellSides = {
    left: hasShellLeft ?? !!hasShell,
    right: hasShellRight ?? !!hasShell,
  };
  const hasAnyShell = shellSides.left || shellSides.right;
  const tEnv = hasAnyShell && frontMaterialThickness ? frontMaterialThickness : undefined;
  // Carcass depth reduction matches useCabinet.calculate: the sketch needs
  // box.D = carcassD so the visual board model (BoxBodySketch, depth labels)
  // matches the cut list. The full cabinet depth survives only on the
  // envelope boards via `envelopeDepth` below.
  const fullD = parseFloat(D);
  const tFrontCm = frontMaterialThickness ?? 0;
  const carcassD = computeCarcassDepth(fullD, backThicknessCm, HINGE_GAP_CM, tFrontCm);
  const geo = computeSketchGeometry(parseFloat(W), parseFloat(H), carcassD, parseFloat(plinth), lo, dpc, mid, tEnv, hasEnvelopeTop && !!tEnv, boxDimensionOverrides, shellSides);

  // ── Per-body board model (cross-section view) ────────────────────────────
  // Boards are emitted only post-calc (interiorById defined) and only when
  // we have material info. Pre-calc the sketch falls back to the legacy
  // envelopePanels + shelfLine rendering below.
  // Resolve materials — prefer customMaterials if provided so custom IDs
  // (e.g. "custom_xyz") resolve to the right thickness/price. Falls back to
  // catalog when omitted (legacy callers).
  const bodyMat = bodyMaterialId
    ? (customMaterials ? getMaterialWithCustom(bodyMaterialId, customMaterials) : getEffectiveMaterial(bodyMaterialId))
    : null;
  const frontMat = frontMaterialId
    ? (customMaterials ? getMaterialWithCustom(frontMaterialId, customMaterials) : getEffectiveMaterial(frontMaterialId))
    : null;
  const hasBoards = !!interiorById && !!bodyMat && !!frontMat;
  const boardsByBoxId = new Map<string, ReturnType<typeof buildBoardModel>>();

  // Plinth split lines — drawn ONLY between adjacent plinth units when the
  // cabinet is wide enough that decomposeBoxes splits the plinth into
  // multiple boxes (MAX_PLINTH_W=240). The plinth itself renders as a single
  // full-width `geo.plinthRect`; these thin dashed lines mark the joints.
  const plinthSegments = geo.boxes.filter(b => b.level === 'plinth');
  const plinthSplitLines: Array<{ x: number; y1: number; y2: number }> = [];
  if (plinthSegments.length > 1 && geo.plinthRect) {
    let cumW = 0;
    for (let i = 0; i < plinthSegments.length - 1; i++) {
      cumW += plinthSegments[i]!.W;
      const x = geo.plinthRect.x + cumW * geo.scale;
      plinthSplitLines.push({ x, y1: geo.plinthRect.y, y2: geo.plinthRect.y + geo.plinthRect.h });
    }
  }
  // Cabinet-level joint method — same source of truth as useCabinet so the
  // sketch never disagrees with the cut list. Per-row dimensions can vary,
  // but the joint convention is uniform across the whole cabinet.
  const cabinetJoint = resolveCabinetJointMethod(parseFloat(W), parseFloat(H));
  if (hasBoards) {
    for (const box of geo.boxes) {
      if (box.level === 'plinth') continue;
      const hasPartition = partitionsById?.get(box.id) === true;
      const cells = cellInteriorById?.[box.id];
      const items = interiorById![box.id] ?? [];
      // Centralised envelope-flag derivation handles unit_* positions too —
      // the legacy inline check missed unit_1 / unit_N (only 'left' / 'right'
      // / 'single' got envelope panels).
      const env = deriveEnvelopeFlags(box, shellSides, !!hasEnvelopeTop);
      const boards = buildBoardModel({
        box,
        bodyMaterial: bodyMat!,
        frontMaterial: frontMat!,
        hasEnvelopeLeft: env.hasEnvelopeLeft,
        hasEnvelopeRight: env.hasEnvelopeRight,
        hasEnvelopeTop: env.hasEnvelopeTop,
        items,
        hasPartition,
        ...(hasPartition && cells ? { cellItems: [cells[0] ?? [], cells[1] ?? []] as [typeof items, typeof items] } : {}),
        hasBack: true,
        envelopeDepth: fullD,
        backThicknessCm,
        joint: cabinetJoint,
        ...(topVariant ? { topVariant } : {}),
        ...(sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm } : {}),
      });
      // Envelope side panels are drawn as full-height rects via geo.envelopePanels
      // (always visible below). Exclude them from per-body board rendering to
      // avoid a seam where top and bottom bodies would each draw half the panel.
      boardsByBoxId.set(box.id, boards.filter(
        b => b.role !== 'envelope-left' && b.role !== 'envelope-right',
      ));
    }
  }

  // In embedded mode (KitchenOverview), crop the viewBox to the cabinet area
  // only — labels and ambient padding are hidden so units sit flush against
  // each other with no visual gap.
  const viewBox = embedded
    ? `${geo.cabinet.x} ${geo.cabinet.y} ${geo.cabinet.w} ${geo.cabinet.h}`
    : `0 0 ${geo.svgWidth} ${geo.svgHeight}`;
  const svgElement = (
    <svg
      viewBox={viewBox}
      className={embedded ? styles.svgEmbedded : styles.svg}
      overflow="visible"
      role="img"
      aria-label={t.sketch.preview}
    >
        {/* Cabinet outline */}
        <rect
          x={geo.cabinet.x}
          y={geo.cabinet.y}
          width={geo.cabinet.w}
          height={geo.cabinet.h}
          className={styles.cabinetRect}
        />

        {/* Plinth fill — one continuous rectangle across the full cabinet
            width. Per-body `plinth-front` boards are intentionally filtered
            out from CabinetCutSketch below (they would visually slice the
            plinth into segments with gaps between body columns). */}
        {geo.plinthRect && (
          <rect
            x={geo.plinthRect.x}
            y={geo.plinthRect.y}
            width={geo.plinthRect.w}
            height={geo.plinthRect.h}
            className={`${styles.plinthRect}${onPlinthClick ? ` ${styles.plinthClickable}` : ''}`}
            {...(onPlinthClick ? {
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                onPlinthClick();
              },
            } : {})}
          />
        )}

        {/* Plinth unit splits — only when the plinth itself decomposes into
            multiple units (cabinet wider than MAX_PLINTH_W). Thin dashed
            lines only; no separate rectangles. */}
        {plinthSplitLines.map((line, i) => (
          <line
            key={`plinth-split-${i}`}
            x1={line.x} y1={line.y1}
            x2={line.x} y2={line.y2}
            className={styles.splitLine}
          />
        ))}

        {/* Outer envelope side panels — always drawn as full-height rects.
            Post-calc, per-body envelope-left/right boards are filtered out of
            boardsByBoxId so there is no seam at level boundaries. */}
        {geo.envelopePanels && (
          <>
            {geo.envelopePanels.left && (
              <rect
                x={geo.envelopePanels.left.x}
                y={geo.envelopePanels.left.y}
                width={geo.envelopePanels.left.w}
                height={geo.envelopePanels.left.h}
                className={styles.envelopePanel}
              />
            )}
            {geo.envelopePanels.right && (
              <rect
                x={geo.envelopePanels.right.x}
                y={geo.envelopePanels.right.y}
                width={geo.envelopePanels.right.w}
                height={geo.envelopePanels.right.h}
                className={styles.envelopePanel}
              />
            )}
          </>
        )}

        {/* Outer envelope ceiling — pre-calc only (post-calc → board). */}
        {!hasBoards && geo.envelopeTopPanel && (
          <rect
            x={geo.envelopeTopPanel.x}
            y={geo.envelopeTopPanel.y}
            width={geo.envelopeTopPanel.w}
            height={geo.envelopeTopPanel.h}
            className={styles.envelopePanel}
          />
        )}

        {/* Per-body cut sketch — sides, top, bottom, shelves, partition,
            envelope. Drawn BEFORE interior items (rods, drawers) so those
            sit on top. Plinth boards live at the cabinet level (separate
            buildPlinthBoardModel call in useCabinet) and never appear in
            this per-body list. */}
        {hasBoards && [...boardsByBoxId.entries()].map(([boxId, boards]) => {
          const rect = geo.boxSvgRects[boxId];
          if (!rect || !bodyMat) return null;
          return (
            <CabinetCutSketch
              key={`cut-${boxId}`}
              boards={boards}
              offsetX={rect.x}
              offsetY={rect.y}
              scale={geo.scale}
              bodyMaterialId={bodyMat.id}
              {...(boardOverrides ? { overrides: boardOverrides } : {})}
            />
          );
        })}

        {/* Per-body click targets — transparent rects at low z; visible
            elements (shelves, drawers) drawn on top either capture their
            own clicks or are pointer-events:none so the box rect catches
            empty-area clicks. */}
        {onBoxClick && geo.boxes.filter(b => b.level !== 'plinth').map(box => {
          const rect = geo.boxSvgRects[box.id];
          if (!rect) return null;
          return (
            <rect
              key={`box-click-${box.id}`}
              x={rect.x} y={rect.y} width={rect.w} height={rect.h}
              className={styles.boxClickable}
              onClick={() => onBoxClick(box.id)}
            />
          );
        })}

        {/* Box split lines */}
        {geo.splitLines.map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className={styles.splitLine}
          />
        ))}

        {/* Internal shelf lines — only when no explicit interior state */}
        {!interiorById && geo.internalShelfLines.map((line, i) => (
          <line
            key={`shelf_${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className={styles.splitLine}
          />
        ))}

        {/* Interior items per box */}
        {interiorById && Object.entries(interiorById).map(([boxId, items]) => {
          const rect = geo.boxSvgRects[boxId];
          if (!rect) return null;

          const toSvgY = (h: number) => rect.y + rect.h - h * geo.scale;
          // Inner-width band: rods, drawers, external drawers sit between the
          // side boards (same convention as BoxBodySketch).
          const tBodyCm = bodyMat ? bodyMat.thickness / 10 : 1.8;
          const innerX  = rect.x + tBodyCm * geo.scale;
          const innerW  = rect.w - 2 * tBodyCm * geo.scale;

          // External drawers in this box stack from the bottom upward.
          const externals = items
            .filter((i): i is DrawerItem => i.type === 'drawer' && i.mount === 'external')
            .sort((a, b) => a.heightFromFloor - b.heightFromFloor);
          const externalIds = new Set(externals.map(d => d.id));

          const nonExternalNodes = items.map(item => {
            if (externalIds.has(item.id)) return null;
            // Shelves are emitted as boards by CabinetCutSketch — skip here.
            if (item.type === 'shelf') return null;
            if (item.type === 'rod') {
              const y = toSvgY(item.heightFromFloor);
              return (
                <line key={item.id} x1={innerX} y1={y} x2={innerX + innerW} y2={y}
                  className={styles.rodLine} />
              );
            }
            if (item.type === 'drawer') {
              const yBottom = toSvgY(item.heightFromFloor);
              const yTop    = toSvgY(item.heightFromFloor + (item as DrawerItem).drawerHeight);
              return (
                <rect key={item.id} x={innerX} y={yTop}
                  width={innerW} height={yBottom - yTop}
                  className={styles.drawerRect} />
              );
            }
            return null;
          });

          // Stack externals from the body floor; gap between them follows
          // the door-gap convention used by deriveDrawerFronts (default 2mm).
          // Horizontal extent comes from this body's ROW layout: a body-wide
          // drawer spans all `numFronts` columns of this box, within its row.
          const gapCm = 0.2;
          let cumulative = 0;
          const boxLevel = geo.boxes.find(b => b.id === boxId)?.level;
          const layout = boxLevel ? frontLayoutByRow?.get(boxLevel) : undefined;
          const rowBoxes = boxLevel
            ? (groupBoxesByRow(geo.boxes).get(boxLevel) ?? [])
            : [];
          const boxFirstGlobalIndexInRow = layout && numFrontsPerBox
            ? getBoxFirstGlobalFrontIndex({ rowBoxes, numFrontsPerBox, targetBoxId: boxId })
            : -1;
          const numFronts = numFrontsPerBox?.get(boxId) ?? 1;
          const drawerSpan = layout && boxFirstGlobalIndexInRow >= 0
            ? computeFrontGeometryForSpan({
                startGlobalIndexInRow: boxFirstGlobalIndexInRow,
                spanLength: numFronts,
                layout,
                gapCm: layout.gapCm,
              })
            : null;
          // External drawer in CABINET view: render as the DRAWER BOX (the
          // wooden tray inside), not the visible front panel. Carpenter rule:
          //   • box inner width  = inner cabinet width − 2.5 cm (1.25 cm gap each side)
          //   • box inner height = drawer face height − 5 cm (2 cm bottom, 3 cm top)
          // The visible drawer front itself is shown in the fronts overlay.
          void drawerSpan;
          const DRAWER_SIDE_GAP_CM = 1.25;   // each side
          const DRAWER_BOTTOM_GAP_CM = 2;
          const DRAWER_TOP_GAP_CM = 3;
          const externalNodes = externals.map(drawer => {
            cumulative += drawer.drawerHeight + gapCm;
            // Drawer box bounds in cm (from body floor + within inner cabinet width)
            const drawerBoxBottomCm = (cumulative - drawer.drawerHeight) + DRAWER_BOTTOM_GAP_CM;
            const drawerBoxTopCm = cumulative - gapCm - DRAWER_TOP_GAP_CM;
            const yBottom = toSvgY(drawerBoxBottomCm);
            const yTop = toSvgY(drawerBoxTopCm);
            const sideGapPx = DRAWER_SIDE_GAP_CM * geo.scale;
            const fX = innerX + sideGapPx;
            const fW = innerW - 2 * sideGapPx;
            const interactive = onDrawerFrontClick !== undefined;
            return (
              <rect
                key={`ext-${drawer.id}`}
                x={fX} y={yTop}
                width={Math.max(fW, 0)} height={Math.max(yBottom - yTop, 0)}
                className={styles.drawerRect}
                {...(interactive ? {
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation();
                    onDrawerFrontClick!(drawer.id);
                  },
                  style: { cursor: 'pointer' as const },
                } : {})}
              />
            );
          });

          return [...nonExternalNodes, ...externalNodes];
        })}

        {/* Cell interior items for partitioned boxes */}
        {cellInteriorById && partitionsById && Object.entries(cellInteriorById).map(([boxId, cells]) => {
          if (!partitionsById.get(boxId)) return null;
          const rect = geo.boxSvgRects[boxId];
          if (!rect) return null;

          const partitionX = rect.x + rect.w / 2;
          const toSvgY = (h: number) => rect.y + rect.h - h * geo.scale;

          return (
            <g key={`${boxId}-cells`}>
              {/* Partition line — drawn only pre-calc. Post-calc the
                  partition becomes a 'partition' board emitted by
                  CabinetCutSketch. */}
              {!hasBoards && (
                <line
                  x1={partitionX} y1={rect.y}
                  x2={partitionX} y2={rect.y + rect.h}
                  className={styles.partitionLine}
                />
              )}
              {cells.flatMap((cellItems, ci) => {
                const xLeft  = ci === 0 ? partitionX : rect.x;
                const xRight = ci === 0 ? rect.x + rect.w : partitionX;
                // Cell-local inner band: clip rods/drawers/externals between
                // the cell's side (carcass or partition) and the opposite
                // side, matching the inner-width convention.
                const tBodyCmCell = bodyMat ? bodyMat.thickness / 10 : 1.8;
                const cellInnerX = xLeft + tBodyCmCell * geo.scale;
                const cellInnerW = (xRight - xLeft) - 2 * tBodyCmCell * geo.scale;
                const externals = cellItems
                  .filter((i): i is DrawerItem => i.type === 'drawer' && i.mount === 'external')
                  .sort((a, b) => a.heightFromFloor - b.heightFromFloor);
                const externalIds = new Set(externals.map(d => d.id));

                const internalNodes = cellItems.map(item => {
                  if (externalIds.has(item.id)) return null;
                  // Shelves → boards. Skip line rendering here.
                  if (item.type === 'shelf') return null;
                  if (item.type === 'rod') {
                    const y = toSvgY(item.heightFromFloor);
                    return <line key={item.id} x1={cellInnerX} y1={y} x2={cellInnerX + cellInnerW} y2={y} className={styles.rodLine} />;
                  }
                  if (item.type === 'drawer') {
                    const yBottom = toSvgY(item.heightFromFloor);
                    const yTop    = toSvgY(item.heightFromFloor + (item as DrawerItem).drawerHeight);
                    return (
                      <rect key={item.id} x={cellInnerX} y={yTop}
                        width={cellInnerW} height={yBottom - yTop}
                        className={styles.drawerRect} />
                    );
                  }
                  return null;
                });

                const gapCm = 0.2;
                let cumulative = 0;
                // Cell drawer = one column in this body's ROW layout (matches
                // the door above it). ci=0 → rightmost column in this box;
                // ci=1 → leftmost.
                const boxLevel = geo.boxes.find(b => b.id === boxId)?.level;
                const layout = boxLevel ? frontLayoutByRow?.get(boxLevel) : undefined;
                const rowBoxes = boxLevel
                  ? (groupBoxesByRow(geo.boxes).get(boxLevel) ?? [])
                  : [];
                const numFronts = numFrontsPerBox?.get(boxId) ?? 2;
                const boxFirstGlobalIndexInRow = layout && numFrontsPerBox
                  ? getBoxFirstGlobalFrontIndex({ rowBoxes, numFrontsPerBox, targetBoxId: boxId })
                  : -1;
                const fi = ci === 0 ? 0 : numFronts - 1;
                const globalIndexInRow = boxFirstGlobalIndexInRow + (numFronts - 1 - fi);
                const frontGeo = layout && boxFirstGlobalIndexInRow >= 0
                  ? computeFrontGeometry({ globalFrontIndexInRow: globalIndexInRow, layout, gapCm: layout.gapCm })
                  : null;
                // Cell external drawer: same drawer-box rule as full-body
                // externals — render as the inner box, not the front panel.
                void layout; void frontGeo;
                const DRAWER_SIDE_GAP_CM_CELL = 1.25;
                const DRAWER_BOTTOM_GAP_CM_CELL = 2;
                const DRAWER_TOP_GAP_CM_CELL = 3;
                const externalNodes = externals.map(drawer => {
                  cumulative += drawer.drawerHeight + gapCm;
                  const drawerBoxBottomCm = (cumulative - drawer.drawerHeight) + DRAWER_BOTTOM_GAP_CM_CELL;
                  const drawerBoxTopCm = cumulative - gapCm - DRAWER_TOP_GAP_CM_CELL;
                  const yBottom = toSvgY(drawerBoxBottomCm);
                  const yTop = toSvgY(drawerBoxTopCm);
                  const sideGapPx = DRAWER_SIDE_GAP_CM_CELL * geo.scale;
                  const fX = cellInnerX + sideGapPx;
                  const fW = cellInnerW - 2 * sideGapPx;
                  const interactive = onDrawerFrontClick !== undefined;
                  return (
                    <rect
                      key={`ext-${drawer.id}`}
                      x={fX} y={yTop}
                      width={Math.max(fW, 0)} height={Math.max(yBottom - yTop, 0)}
                      className={styles.drawerRect}
                      {...(interactive ? {
                        onClick: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          onDrawerFrontClick!(drawer.id);
                        },
                        style: { cursor: 'pointer' as const },
                      } : {})}
                    />
                  );
                });

                return [...internalNodes, ...externalNodes];
              })}
            </g>
          );
        })}

        {/* Sink basin overlay (sink-open units only) — drawn between sink
            traverses to show the kitchen sink visually. */}
        {topVariant === 'sink-open' && (() => {
          const basinW = Math.min(60 * geo.scale, geo.cabinet.w - 20);
          const basinH = Math.min(25 * geo.scale, geo.cabinet.h * 0.3);
          const basinX = geo.cabinet.x + (geo.cabinet.w - basinW) / 2;
          // Top of basin aligns with top of body — basin is recessed into the
          // countertop from above, extending downward into the cabinet.
          const basinY = geo.cabinet.y;
          return (
            <g key="sink-basin">
              <rect
                x={basinX} y={basinY}
                width={basinW} height={basinH}
                fill="#b0c4d8" stroke="#7a9ab5" strokeWidth={1} rx={2}
              />
              <circle
                cx={basinX + basinW / 2}
                cy={basinY + basinH * 0.5}
                r={Math.max(2, 2 * geo.scale)}
                fill="#7a9ab5"
              />
            </g>
          );
        })()}

        {/* Width + height labels — only in standalone mode. In embedded mode
            (KitchenOverview), the parent already shows dims above each unit
            so duplicating them inside the sketch is visual noise. */}
        {!embedded && (
          <>
            <text
              x={geo.wLabel.x}
              y={geo.wLabel.y}
              className={`${styles.dimLabel} ${styles.dimLabelWidth}`}
              textAnchor="middle"
              dominantBaseline="auto"
            >
              {geo.wLabel.text}
            </text>
            <text
              x={geo.hLabel.x}
              y={geo.hLabel.y}
              className={`${styles.dimLabel} ${styles.dimLabelHeight}`}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90, ${geo.hLabel.x}, ${geo.hLabel.y})`}
            >
              {geo.hLabel.text}
            </text>
          </>
        )}
      </svg>
  );

  if (embedded) return svgElement;
  return (
    <div className={styles.wrapper}>
      <p className={styles.title}>{t.sketch.preview}</p>
      {svgElement}
    </div>
  );
}
