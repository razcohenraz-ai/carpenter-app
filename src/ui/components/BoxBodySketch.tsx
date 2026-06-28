import React, { useRef, useState } from 'react';
import type { InteriorItem, DrawerItem } from '../../types/interior';
import type { Box } from '../../types/geometry';
import type { MaterialId } from '../../types/materials';
import { useTranslation } from '../hooks/useTranslation';
import { getEffectiveMaterial } from '../../catalog';
import { buildBoardModel } from '../../core/boards/boardModel';
import { computeInteriorGaps } from '../../core/interior/interiorUtils';
import CabinetCutSketch from './CabinetCutSketch';
import { internalDrawerBoxBoundsCm, drawerBoxBoardRects, liftMechanismRects } from './CabinetSketch.utils';
import styles from './BoxBodySketch.module.css';

interface Props {
  bodyH: number;           // cm
  bodyW?: number;          // cm — required when showDimensions
  bodyD?: number;          // cm — required when showDimensions
  items: InteriorItem[];
  svgWidth: number;
  svgHeight: number;
  showLabels?: boolean;
  showDimensions?: boolean;
  /** When true, the clear vertical opening (cm) of every empty space inside the
   *  body — floor→first object, between each pair, last object→ceiling — is
   *  drawn as an inside dimension chain. Uses the same physical extents as the
   *  spacing warnings (see {@link computeInteriorGaps}). */
  showGaps?: boolean;
  onItemMove?: (id: string, newH: number) => void;
  numPartitions?: number;  // number of vertical partition lines to draw
  /** Inter-front gap in mm; used to lay out the external drawer stack. */
  gapMm?: number;
  /** Click handler for an external drawer; opens the editor modal in the parent. */
  onExternalDrawerClick?: (drawerId: string) => void;
  /** Chosen AVENTOS lift-mechanism family id (wall-cabinet flap). When set, a
   *  power-unit indicator is drawn at each top side panel. Undefined → none. */
  liftMechanismId?: string;
  // ── Board-model props ─────────────────────────────────────────────────────
  // When `bodyMaterialId` is provided, the sketch renders the physical carcass
  // boards (sides, top, bottom, shelves, envelope) as a background layer
  // under the interior items. Cell views (called per cell in a partitioned
  // body) pass `hasOuterShell: false` — the envelope belongs to the whole
  // body, not the individual cell.
  bodyMaterialId?: MaterialId;
  frontMaterialId?: MaterialId;
  hasOuterShell?: boolean;
  hasEnvelopeTop?: boolean;
  /** Sink-open variant — when set, `buildBoardModel` emits two standing
   *  traverse boards (front + back) instead of a top board. */
  topVariant?: 'standard' | 'sink-open';
  sinkTraverseWidthCm?: number;
  /** Partition cell items (cell 0 = right half, cell 1 = left half). When
   *  provided with `numPartitions > 0`, the sketch draws each cell's shelves
   *  (via the board model) plus its rods/drawers in that half, alongside the
   *  centered partition board — matching the main cabinet view. Body-level
   *  `items` is then expected to be empty (the parts live in the cells). */
  cellItems?: [InteriorItem[], InteriorItem[]];
  /** Body-local heights (cm from this body's own floor) of structural section
   *  shelves (מדפים מבניים) that divide a merged body into door sections.
   *  When set, `buildBoardModel` emits `internal-shelf` boards for them — the
   *  same boards shown in the 3D view and the cut list. */
  internalShelvesCm?: number[];
}

interface DragState {
  itemId: string;
  startClientY: number;
  startH: number;
  min: number;
  max: number;
  /** live override during drag — null means use items array */
  currentH: number;
}

const PAD           = 8;
const DIM_PAD_TOP   = 30;
const DIM_PAD_RIGHT = 44;

function computeDragBounds(
  item: InteriorItem,
  allItems: InteriorItem[],
  bodyH: number,
): { min: number; max: number } {
  if (item.type !== 'drawer') return { min: 0, max: bodyH };

  const dH = item.drawerHeight;
  const others = allItems
    .filter((i): i is DrawerItem => i.type === 'drawer' && i.id !== item.id)
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor);

  const below = others.filter(d => d.heightFromFloor < item.heightFromFloor);
  const above = others.filter(d => d.heightFromFloor >= item.heightFromFloor + dH);

  const min = below.length > 0
    ? below[below.length - 1]!.heightFromFloor + below[below.length - 1]!.drawerHeight
    : 0;
  const max = above.length > 0
    ? above[0]!.heightFromFloor - dH
    : bodyH - dH;

  return { min: Math.max(0, min), max: Math.min(bodyH - dH, max) };
}

export default function BoxBodySketch({
  bodyH, bodyW, bodyD, items, svgWidth, svgHeight,
  showLabels = false, showDimensions = false, showGaps = false, onItemMove,
  numPartitions = 0, gapMm = 2, onExternalDrawerClick,
  bodyMaterialId, frontMaterialId, hasOuterShell = false, hasEnvelopeTop = false,
  topVariant, sinkTraverseWidthCm, cellItems, liftMechanismId, internalShelvesCm,
}: Props): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const { t } = useTranslation();

  // Partition externals from internals so the renderer can handle each kind
  // separately: internals keep their existing in-body rendering (and drag),
  // externals stack from the bottom of the body upward.
  const externalDrawers = items
    .filter((i): i is DrawerItem => i.type === 'drawer' && i.mount === 'external')
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor); // bottom-first
  const externalIds = new Set(externalDrawers.map(d => d.id));
  const renderableItems = items.filter(i => !externalIds.has(i.id));

  const padTop   = showDimensions ? DIM_PAD_TOP   : PAD;
  const padRight = showDimensions ? DIM_PAD_RIGHT : PAD;
  const drawW = svgWidth  - PAD      - padRight;
  const drawH = svgHeight - padTop   - PAD;

  // Uniform scale: fit the box inside drawW × drawH while preserving aspect ratio.
  const scaleH = drawH / Math.max(bodyH, 1);
  const scaleW = bodyW ? drawW / Math.max(bodyW, 1) : scaleH;
  const scale  = Math.min(scaleW, scaleH);

  const bW = bodyW ? bodyW * scale : drawW;
  const bH = bodyH * scale;
  const bX = PAD + (drawW - bW) / 2;
  const bY = padTop + (drawH - bH) / 2;

  // Inner-width band: interior items (shelves, drawers, rods) live BETWEEN
  // the side boards, not edge-to-edge. Uses the body-material thickness so
  // it matches the boards drawn by CabinetCutSketch behind them. Defaults
  // to 18mm when no material is provided.
  const tBodyCm = (bodyMaterialId ? getEffectiveMaterial(bodyMaterialId).thickness : 18) / 10;
  const innerX  = bX + tBodyCm * scale;
  const innerW  = bW - 2 * tBodyCm * scale;

  const toY = (h: number) => bY + bH - h * scale;

  // A drawer is drawn as its actual boards (side + bottom cutaway) when a runner
  // is chosen, else a generic inset tray — via the shared geometry helper so the
  // body view, cabinet view and kitchen view never drift. `colX`/`colW` are the
  // inner band (full body or a cell).
  /** SVG nodes for a drawer drawn via the shared {@link drawerBoxBoardRects}. */
  function drawerBoxNodes(d: DrawerItem, colX: number, colW: number, yTop: number, yBottom: number, opacity = 1): React.ReactNode {
    const rects = drawerBoxBoardRects(d, colW / scale, bodyD ?? 60, colX, colW, yTop, yBottom, scale);
    return (
      <g opacity={opacity}>
        {rects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} className={styles.drawerRect} />
        ))}
      </g>
    );
  }

  // ── Board-model background layer ─────────────────────────────────────────
  // Build the physical carcass boards (sides, top, bottom, shelves, envelope)
  // for this body/cell when material info is provided. Rendered below the
  // interior items so shelves/drawers/rods sit on top. The synthetic Box is
  // a thin wrapper around the dimensions we already render — position/level
  // are 'single' because BoxBodySketch is body-isolated; envelope flags are
  // derived from `hasOuterShell` (false in cell views).
  const bodyMat  = bodyMaterialId  ? getEffectiveMaterial(bodyMaterialId)  : null;
  const frontMat = frontMaterialId ? getEffectiveMaterial(frontMaterialId) : bodyMat;
  // The body editor shows the carcass in isolation — envelope panels belong
  // to the cabinet view, not the body editor. Force all envelope flags off
  // here regardless of the cabinet-level props (which are kept on Props for
  // API symmetry with CabinetSketch).
  void hasOuterShell; void hasEnvelopeTop;
  const boards = (bodyMat && bodyW)
    ? buildBoardModel({
        box: {
          id: 'preview',
          W: bodyW,
          H: bodyH,
          D: bodyD ?? 60,
          position: 'single',
          level: 'single',
          ...(internalShelvesCm && internalShelvesCm.length > 0
            ? { internalShelves: internalShelvesCm } : {}),
        } as Box,
        bodyMaterial: bodyMat,
        frontMaterial: frontMat ?? bodyMat,
        hasEnvelopeLeft: false,
        hasEnvelopeRight: false,
        hasEnvelopeTop: false,
        items,
        // Emit the centered partition as a real board (length H−2t, thickness t)
        // when this body has one — so the body-view sketch shows it with
        // thickness like the main cabinet / 3D / cut sketch, not a hairline.
        // Cell & single-box callers pass numPartitions=0 → stays false.
        hasPartition: numPartitions > 0,
        // With a partition, the cell shelves are emitted as boards from each
        // half (rods/drawers are drawn separately below). Body items stay empty.
        ...(cellItems && numPartitions > 0 ? { cellItems } : {}),
        ...(topVariant ? { topVariant } : {}),
        ...(sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm } : {}),
      })
    : [];

  function clientYToH(clientY: number): number {
    const svgRect = svgRef.current!.getBoundingClientRect();
    const svgY = (clientY - svgRect.top) * (svgHeight / svgRect.height);
    return (bY + bH - svgY) / scale;
  }

  function onPointerDown(e: React.PointerEvent<SVGElement>, item: InteriorItem): void {
    if (!onItemMove) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as SVGElement).setPointerCapture(e.pointerId);
    const bounds = computeDragBounds(item, items, bodyH);
    setDrag({
      itemId: item.id,
      startClientY: e.clientY,
      startH: item.heightFromFloor,
      min: bounds.min,
      max: bounds.max,
      currentH: item.heightFromFloor,
    });
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>): void {
    if (!drag || !onItemMove) return;
    const rawH = clientYToH(e.clientY);
    const item = items.find(i => i.id === drag.itemId);
    if (!item) return;

    // For drawers, snap position is bottom of drawer
    const snapped = Math.round(Math.max(drag.min, Math.min(drag.max, rawH)));
    setDrag(d => d ? { ...d, currentH: snapped } : null);
    onItemMove(drag.itemId, snapped);
  }

  function onPointerUp(): void {
    setDrag(null);
  }

  const dragging = onItemMove !== undefined;

  function resolvedH(item: InteriorItem): number {
    if (drag && drag.itemId === item.id) return drag.currentH;
    return item.heightFromFloor;
  }

  // Inside dimension chain of the clear vertical openings between objects. Drawn
  // in the empty regions only (computeInteriorGaps excludes the object zones), so
  // it never overlaps a shelf/drawer. `gapItems` is the column's own items; the
  // band [leftX, leftX+bandW] is the inner cavity (full body or a partition cell).
  function gapNodes(gapItems: InteriorItem[], leftX: number, bandW: number, keyPrefix: string): React.ReactNode {
    if (!showGaps || gapItems.length === 0) return null;
    const gaps = computeInteriorGaps(gapItems, bodyH, tBodyCm);
    const xDim = leftX + Math.min(10, bandW / 4);
    return gaps.map((g, i) => {
      const yTop    = toY(g.hi);
      const yBottom = toY(g.lo);
      const mid     = (yTop + yBottom) / 2;
      return (
        <g key={`${keyPrefix}-gap-${i}`} pointerEvents="none">
          <line x1={xDim} y1={yTop} x2={xDim} y2={yBottom} className={styles.gapDimLine} />
          <line x1={xDim - 3} y1={yTop}    x2={xDim + 3} y2={yTop}    className={styles.gapDimLine} />
          <line x1={xDim - 3} y1={yBottom} x2={xDim + 3} y2={yBottom} className={styles.gapDimLine} />
          {(yBottom - yTop) >= 14 && (
            <text x={xDim + 5} y={mid + 3} className={styles.gapLabel}>{g.clear}</text>
          )}
        </g>
      );
    });
  }

  // Body-level gap items: the body's own interior plus any structural section
  // shelves (drawn as boards from internalShelvesCm). Overlapping zones merge,
  // so a shelf present in both lists is counted once.
  const bodyGapItems: InteriorItem[] = [
    ...items,
    ...(internalShelvesCm ?? []).map((h, i) => ({
      type: 'shelf' as const, id: `__intshelf_${i}`, heightFromFloor: h,
    })),
  ];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width={svgWidth}
      height={svgHeight}
      className={styles.svg}
      overflow="visible"
      onPointerMove={dragging ? onPointerMove : undefined}
      onPointerUp={dragging ? onPointerUp : undefined}
      onPointerLeave={dragging ? onPointerUp : undefined}
      style={drag ? { cursor: 'ns-resize' } : undefined}
    >
      {/* Body outline */}
      <rect x={bX} y={bY} width={bW} height={bH} className={styles.bodyRect} />

      {/* Lift mechanism (קלפה / AVENTOS) — power-unit indicator at each top side
          panel (edge-on, front elevation) when a family is chosen. */}
      {liftMechanismId && liftMechanismRects({ x: bX, y: bY, w: bW, h: bH }, tBodyCm, scale).map((r, i) => (
        <rect key={`lift-${i}`} x={r.x} y={r.y} width={r.w} height={r.h}
          fill="#b9bdc4" stroke="#7e858d" strokeWidth={0.5} />
      ))}

      {/* Carcass boards — drawn above the body outline but below interior
          items (shelves, drawers, rods). Same renderer used by CabinetSketch
          for the cabinet-wide view, keeping the visual language consistent. */}
      {boards.length > 0 && (
        <CabinetCutSketch
          boards={boards}
          offsetX={bX}
          offsetY={bY}
          scale={scale}
          bodyMaterialId={bodyMat?.id ?? 'mdf18'}
        />
      )}

      {/* Guide line during drag */}
      {drag && (() => {
        const item = items.find(i => i.id === drag.itemId);
        if (!item) return null;
        const guideY = toY(drag.currentH);
        const isDrawer = item.type === 'drawer';
        const topY = isDrawer ? toY(drag.currentH + (item as DrawerItem).drawerHeight) : guideY;
        return (
          <>
            <line x1={bX - 4} y1={guideY} x2={bX + bW + 4} y2={guideY}
              stroke="var(--color-primary)" strokeWidth={1} strokeDasharray="3 2" />
            {isDrawer && (
              <line x1={bX - 4} y1={topY} x2={bX + bW + 4} y2={topY}
                stroke="var(--color-primary)" strokeWidth={1} strokeDasharray="3 2" />
            )}
            <text x={bX + bW + 6} y={guideY + 4} className={styles.label} fill="var(--color-primary)">
              {drag.currentH}
            </text>
          </>
        );
      })()}

      {renderableItems.map(item => {
        const h = resolvedH(item);
        const isDragging = drag?.itemId === item.id;
        const dragProps = dragging ? {
          onPointerDown: (e: React.PointerEvent<SVGElement>) => onPointerDown(e, item),
          style: { cursor: 'ns-resize' } as React.CSSProperties,
        } : {};

        // Shelves (and fixed shelves) are displayed by CabinetCutSketch as
        // physical boards. To keep dragging functional we add only an
        // invisible hit-area line at the shelf's y-position. The board
        // itself (drawn behind, with pointer-events:none) provides the
        // visual; this line captures the pointer events.
        // Fixed shelves above external drawers are derived geometry — they
        // are not draggable.
        if (item.type === 'shelf') {
          if (item.isFixedAboveExternals === true) return null;
          const y = toY(h);
          return (
            <line
              key={item.id}
              x1={innerX} y1={y} x2={innerX + innerW} y2={y}
              stroke="transparent" strokeWidth={10}
              {...dragProps}
            />
          );
        }

        if (item.type === 'rod') {
          const y = toY(h);
          return (
            <g key={item.id} {...dragProps}>
              <line x1={innerX} y1={y} x2={innerX + innerW} y2={y}
                className={styles.rodLine}
                opacity={isDragging ? 0.4 : 1}
              />
              <line x1={innerX} y1={y} x2={innerX + innerW} y2={y}
                stroke="transparent" strokeWidth={10}
              />
              {showLabels && !isDragging && (
                <text x={bX + bW + 3} y={y + 4} className={styles.label}>
                  {Math.round(item.heightFromFloor)}
                </text>
              )}
            </g>
          );
        }

        if (item.type === 'drawer') {
          // Render as the inner drawer BOX. With a chosen runner it shows the
          // actual boards (side + bottom cutaway, real width); otherwise a generic
          // inset tray. `h` is the drag-aware floor; the label reports heightFromFloor.
          const { bottomCm, topCm } = internalDrawerBoxBoundsCm(h, item.drawerHeight);
          const yBottom = toY(bottomCm);
          const yTop    = toY(topCm);
          return (
            <g key={item.id} {...dragProps}>
              {drawerBoxNodes(item, innerX, innerW, yTop, yBottom, isDragging ? 0.4 : 1)}
              {showLabels && !isDragging && (
                <text x={bX + bW + 3} y={(yTop + yBottom) / 2 + 4} className={styles.label}>
                  {Math.round(item.heightFromFloor)}
                </text>
              )}
            </g>
          );
        }

        return null;
      })}

      {/* External drawers — stacked from bottom-of-body upward. In the BODY view
          they render as the inner drawer box (same `drawerBoxNodes` as internal
          drawers), not the front facade — the facade belongs to the fronts view. */}
      {(() => {
        if (externalDrawers.length === 0) return null;
        const gapCm = gapMm / 10;
        let cumulative = 0; // cm from box bottom
        return externalDrawers.map(drawer => {
          const { bottomCm, topCm } = internalDrawerBoxBoundsCm(cumulative, drawer.drawerHeight);
          const yBottom = toY(bottomCm);
          const yTop    = toY(topCm);
          const rectH   = yBottom - yTop;
          const interactive = onExternalDrawerClick !== undefined;
          const onClick = interactive ? () => onExternalDrawerClick!(drawer.id) : undefined;
          const node = (
            <g
              key={drawer.id}
              {...(onClick ? { onClick, style: { cursor: 'pointer' } } : {})}
            >
              {drawerBoxNodes(drawer, innerX, innerW, yTop, yBottom)}
              {showLabels && rectH >= 12 && (
                <text
                  x={innerX + innerW / 2} y={(yTop + yBottom) / 2 + 3}
                  textAnchor="middle" className={styles.externalDrawerLabel}
                >
                  {t.interior.drawer} {Math.round(drawer.drawerHeight)}
                </text>
              )}
            </g>
          );
          cumulative += drawer.drawerHeight + gapCm;
          return node;
        });
      })()}

      {/* Inside dimension chain — clear opening of every empty space between
          objects (single-body / non-partition). Cells draw their own below. */}
      {!(cellItems && numPartitions > 0) && gapNodes(bodyGapItems, innerX, innerW, 'body')}

      {/* Partition cells — each cell's rods + drawers in its half (shelves come
          from the board model above). Cell 0 = right half, cell 1 = left half,
          matching the main cabinet view. */}
      {cellItems && numPartitions > 0 && (() => {
        const partitionX = bX + bW / 2;
        const gapCm = gapMm / 10;
        return cellItems.flatMap((cell, ci) => {
          const xLeft  = ci === 0 ? partitionX : bX;
          const xRight = ci === 0 ? bX + bW : partitionX;
          const cellInnerX = xLeft + tBodyCm * scale;
          const cellInnerW = (xRight - xLeft) - 2 * tBodyCm * scale;
          const externals = cell
            .filter((i): i is DrawerItem => i.type === 'drawer' && i.mount === 'external')
            .sort((a, b) => a.heightFromFloor - b.heightFromFloor);
          const externalIds = new Set(externals.map(d => d.id));

          const internalNodes = cell.map(item => {
            if (externalIds.has(item.id) || item.type === 'shelf') return null; // shelves → boards
            if (item.type === 'rod') {
              const y = toY(item.heightFromFloor);
              return (
                <line key={item.id} x1={cellInnerX} y1={y} x2={cellInnerX + cellInnerW} y2={y}
                  className={styles.rodLine} />
              );
            }
            // Internal drawer → real boards (or inset tray), like the full body.
            const d = item as DrawerItem;
            const { bottomCm, topCm } = internalDrawerBoxBoundsCm(d.heightFromFloor, d.drawerHeight);
            const yBottom = toY(bottomCm);
            const yTop    = toY(topCm);
            return <g key={item.id}>{drawerBoxNodes(d, cellInnerX, cellInnerW, yTop, yBottom)}</g>;
          });

          let cumulative = 0; // cm from cell bottom — externals stack upward
          const externalNodes = externals.map(drawer => {
            const { bottomCm, topCm } = internalDrawerBoxBoundsCm(cumulative, drawer.drawerHeight);
            const yBottom = toY(bottomCm);
            const yTop    = toY(topCm);
            cumulative += drawer.drawerHeight + gapCm;
            return (
              <g key={`ext-${drawer.id}`}>
                {drawerBoxNodes(drawer, cellInnerX, cellInnerW, yTop, yBottom)}
                {showLabels && (yBottom - yTop) >= 12 && (
                  <text x={cellInnerX + cellInnerW / 2} y={(yTop + yBottom) / 2 + 3}
                    textAnchor="middle" className={styles.externalDrawerLabel}>
                    {t.interior.drawer} {Math.round(drawer.drawerHeight)}
                  </text>
                )}
              </g>
            );
          });

          return [...internalNodes, ...externalNodes, gapNodes(cell, cellInnerX, cellInnerW, `cell${ci}`)];
        });
      })()}

      {/* Fallback hairline — only when no board model exists (no material yet /
          pre-calc). With material the partition renders as a real board above. */}
      {numPartitions > 0 && boards.length === 0 && Array.from({ length: numPartitions }, (_, i) => {
        const x = bX + bW * (i + 1) / (numPartitions + 1);
        return (
          <line
            key={`partition-${i}`}
            x1={x} y1={bY}
            x2={x} y2={bY + bH}
            className={styles.partitionLine}
          />
        );
      })}

      {showDimensions && (() => {
        const wArrowY = bY - 10;
        const hArrowX = bX + bW + 12;
        const hTextX  = hArrowX + 10;

        // Depth arrow: 30° above horizontal from top-right corner of box
        const L      = 40;
        const cos30  = Math.sqrt(3) / 2;  // ≈ 0.866
        const sin30  = 0.5;
        const dx0    = bX + bW;
        const dy0    = bY;
        const dx1    = dx0 + L * cos30;   // ≈ dx0 + 34.6
        const dy1    = dy0 - L * sin30;   // ≈ dy0 − 20  (up in SVG = −y)
        // Arrowhead: two lines symmetric about the reversed arrow direction (150°)
        const HL     = 8;
        const hd1x   = dx1 + HL * (-0.5);   // direction 120°
        const hd1y   = dy1 + HL * 0.866;
        const hd2x   = dx1 + HL * (-1);     // direction 180°
        const hd2y   = dy1;

        return (
          <g>
            {/* Width arrow */}
            <line x1={bX} y1={wArrowY} x2={bX + bW} y2={wArrowY}
              className={styles.dimLine} stroke="var(--color-width)" />
            <line x1={bX}      y1={wArrowY - 4} x2={bX}      y2={wArrowY + 4}
              className={styles.dimLine} stroke="var(--color-width)" />
            <line x1={bX + bW} y1={wArrowY - 4} x2={bX + bW} y2={wArrowY + 4}
              className={styles.dimLine} stroke="var(--color-width)" />
            <text x={bX + bW / 2} y={wArrowY - 3}
              textAnchor="middle" dominantBaseline="auto"
              className={styles.dimLabel} fill="var(--color-width)">
              {bodyW?.toFixed(1)}
            </text>

            {/* Height arrow */}
            <line x1={hArrowX} y1={bY} x2={hArrowX} y2={bY + bH}
              className={styles.dimLine} stroke="var(--color-height)" />
            <line x1={hArrowX - 4} y1={bY}      x2={hArrowX + 4} y2={bY}
              className={styles.dimLine} stroke="var(--color-height)" />
            <line x1={hArrowX - 4} y1={bY + bH} x2={hArrowX + 4} y2={bY + bH}
              className={styles.dimLine} stroke="var(--color-height)" />
            <text
              x={hTextX} y={bY + bH / 2}
              textAnchor="middle" dominantBaseline="middle"
              transform={`rotate(-90,${hTextX},${bY + bH / 2})`}
              className={styles.dimLabel} fill="var(--color-height)">
              {bodyH.toFixed(1)}
            </text>

            {/* Depth arrow — diagonal 30° from top-right corner */}
            {bodyD !== undefined && (
              <g>
                <line x1={dx0} y1={dy0} x2={dx1} y2={dy1}
                  className={styles.dimLine} stroke="var(--color-depth)" />
                <line x1={dx1} y1={dy1} x2={hd1x} y2={hd1y}
                  className={styles.dimLine} stroke="var(--color-depth)" />
                <line x1={dx1} y1={dy1} x2={hd2x} y2={hd2y}
                  className={styles.dimLine} stroke="var(--color-depth)" />
                <text x={dx1 + 3} y={dy1 - 3}
                  textAnchor="start" dominantBaseline="auto"
                  className={styles.dimLabel} fill="var(--color-depth)">
                  {bodyD.toFixed(1)}
                </text>
              </g>
            )}
          </g>
        );
      })()}
    </svg>
  );
}
