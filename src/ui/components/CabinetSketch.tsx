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
import { buildBoardModel, deriveEnvelopeFlags, resolveCabinetJointMethod, HINGE_GAP_CM } from '../../core/boards/boardModel';
import { getMaterial } from '../../catalog';
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
}

export default function CabinetSketch({ W, H, D, backThicknessCm, plinth, lowerDoorH, doorsPerColumn, middleDoorH, interiorById, cellInteriorById, partitionsById, hasShell, frontMaterialThickness, hasEnvelopeTop, frontLayoutByRow, numFrontsPerBox, bodyMaterialId, frontMaterialId, onBoxClick, onDrawerFrontClick }: Props): React.JSX.Element {
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
  const tEnv = hasShell && frontMaterialThickness ? frontMaterialThickness : undefined;
  // Carcass depth reduction matches useCabinet.calculate: the sketch needs
  // box.D = carcassD so the visual board model (BoxBodySketch, depth labels)
  // matches the cut list. The full cabinet depth survives only on the
  // envelope boards via `envelopeDepth` below.
  const fullD = parseFloat(D);
  const tFrontCm = frontMaterialThickness ?? 0;
  const carcassD = Math.max(0, fullD - backThicknessCm - HINGE_GAP_CM - tFrontCm);
  const geo = computeSketchGeometry(parseFloat(W), parseFloat(H), carcassD, parseFloat(plinth), lo, dpc, mid, tEnv, hasEnvelopeTop && !!tEnv);

  // ── Per-body board model (cross-section view) ────────────────────────────
  // Boards are emitted only post-calc (interiorById defined) and only when
  // we have material info. Pre-calc the sketch falls back to the legacy
  // envelopePanels + shelfLine rendering below.
  const bodyMat  = bodyMaterialId  ? getMaterial(bodyMaterialId)  : null;
  const frontMat = frontMaterialId ? getMaterial(frontMaterialId) : null;
  const hasBoards = !!interiorById && !!bodyMat && !!frontMat;
  const boardsByBoxId = new Map<string, ReturnType<typeof buildBoardModel>>();
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
      const env = deriveEnvelopeFlags(box, !!hasShell, !!hasEnvelopeTop);
      const isBottomRow = box.level === 'bottom' || box.level === 'single';
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
        plinthHeight: isBottomRow ? (parseFloat(plinth) || 0) : 0,
        hasBack: true,
        envelopeDepth: fullD,
        backThicknessCm,
        joint: cabinetJoint,
      });
      boardsByBoxId.set(box.id, boards);
    }
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.title}>{t.sketch.preview}</p>
      <svg
        viewBox={`0 0 ${geo.svgWidth} ${geo.svgHeight}`}
        className={styles.svg}
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

        {/* Plinth fill */}
        {geo.plinthRect && (
          <rect
            x={geo.plinthRect.x}
            y={geo.plinthRect.y}
            width={geo.plinthRect.w}
            height={geo.plinthRect.h}
            className={styles.plinthRect}
          />
        )}

        {/* Outer envelope side panels — drawn only PRE-calc.
            Post-calc the per-body board model emits envelope boards. */}
        {!hasBoards && geo.envelopePanels && (
          <>
            <rect
              x={geo.envelopePanels.left.x}
              y={geo.envelopePanels.left.y}
              width={geo.envelopePanels.left.w}
              height={geo.envelopePanels.left.h}
              className={styles.envelopePanel}
            />
            <rect
              x={geo.envelopePanels.right.x}
              y={geo.envelopePanels.right.y}
              width={geo.envelopePanels.right.w}
              height={geo.envelopePanels.right.h}
              className={styles.envelopePanel}
            />
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
            sit on top. */}
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
          // External drawer in cabinet view: clipped to inner width (between
          // side boards), matching the inner-width convention for other
          // interior items. The front-layout `drawerSpan` is no longer used
          // for x positioning here — fronts have their own dedicated view
          // (CabinetFrontsSketch).
          void drawerSpan;
          const externalNodes = externals.map(drawer => {
            const yBottom = toSvgY(cumulative);
            const yTop    = toSvgY(cumulative + drawer.drawerHeight);
            cumulative += drawer.drawerHeight + gapCm;
            const fX = innerX;
            const fW = innerW;
            const interactive = onDrawerFrontClick !== undefined;
            return (
              <rect
                key={`ext-${drawer.id}`}
                x={fX} y={yTop}
                width={fW} height={yBottom - yTop}
                className={styles.externalDrawerRect}
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
                // Cell external drawer in cabinet view: same inner-width
                // clipping as other cell items. Front-layout values are
                // ignored here — front positioning is handled by
                // CabinetFrontsSketch.
                void layout; void frontGeo;
                const externalNodes = externals.map(drawer => {
                  const yBottom = toSvgY(cumulative);
                  const yTop    = toSvgY(cumulative + drawer.drawerHeight);
                  cumulative += drawer.drawerHeight + gapCm;
                  const fX = cellInnerX;
                  const fW = cellInnerW;
                  const interactive = onDrawerFrontClick !== undefined;
                  return (
                    <rect
                      key={`ext-${drawer.id}`}
                      x={fX} y={yTop}
                      width={fW} height={yBottom - yTop}
                      className={styles.externalDrawerRect}
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

        {/* Width label */}
        <text
          x={geo.wLabel.x}
          y={geo.wLabel.y}
          className={`${styles.dimLabel} ${styles.dimLabelWidth}`}
          textAnchor="middle"
          dominantBaseline="auto"
        >
          {geo.wLabel.text}
        </text>

        {/* Height label — rotated 90° on the left side */}
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
      </svg>
    </div>
  );
}
