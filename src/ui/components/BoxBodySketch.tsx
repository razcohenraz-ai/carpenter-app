import React, { useRef, useState } from 'react';
import type { InteriorItem, DrawerItem } from '../../types/interior';
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
  onItemMove?: (id: string, newH: number) => void;
  numPartitions?: number;  // number of vertical partition lines to draw
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
  showLabels = false, showDimensions = false, onItemMove,
  numPartitions = 0,
}: Props): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

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

  const toY = (h: number) => bY + bH - h * scale;

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

      {items.map(item => {
        const h = resolvedH(item);
        const isDragging = drag?.itemId === item.id;
        const dragProps = dragging ? {
          onPointerDown: (e: React.PointerEvent<SVGElement>) => onPointerDown(e, item),
          style: { cursor: 'ns-resize' } as React.CSSProperties,
        } : {};

        if (item.type === 'shelf') {
          const y = toY(h);
          return (
            <g key={item.id} {...dragProps}>
              <line x1={bX} y1={y} x2={bX + bW} y2={y}
                className={styles.shelfLine}
                opacity={isDragging ? 0.4 : 1}
              />
              {/* Wider invisible hit area */}
              <line x1={bX} y1={y} x2={bX + bW} y2={y}
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

        if (item.type === 'rod') {
          const y = toY(h);
          return (
            <g key={item.id} {...dragProps}>
              <line x1={bX} y1={y} x2={bX + bW} y2={y}
                className={styles.rodLine}
                opacity={isDragging ? 0.4 : 1}
              />
              <line x1={bX} y1={y} x2={bX + bW} y2={y}
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
          const yBottom = toY(h);
          const yTop    = toY(h + item.drawerHeight);
          return (
            <g key={item.id} {...dragProps}>
              <rect
                x={bX + 2}
                y={yTop}
                width={bW - 4}
                height={yBottom - yTop}
                className={styles.drawerRect}
                opacity={isDragging ? 0.4 : 1}
              />
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

      {numPartitions > 0 && Array.from({ length: numPartitions }, (_, i) => {
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
