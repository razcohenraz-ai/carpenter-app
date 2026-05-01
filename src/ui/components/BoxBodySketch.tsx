import React, { useRef, useState } from 'react';
import type { InteriorItem, DrawerItem } from '../../types/interior';
import styles from './BoxBodySketch.module.css';

interface Props {
  bodyH: number;           // cm
  items: InteriorItem[];
  svgWidth: number;
  svgHeight: number;
  showLabels?: boolean;
  onItemMove?: (id: string, newH: number) => void;
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

const PAD = 8;

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
  bodyH, items, svgWidth, svgHeight, showLabels = false, onItemMove,
}: Props): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const drawW = svgWidth  - PAD * 2;
  const drawH = svgHeight - PAD * 2;
  const scale = drawH / Math.max(bodyH, 1);

  const bX = PAD;
  const bY = PAD;
  const bW = drawW;
  const bH = drawH;

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
    </svg>
  );
}
