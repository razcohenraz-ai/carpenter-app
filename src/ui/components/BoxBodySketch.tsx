import React from 'react';
import type { InteriorItem } from '../../types/interior';
import styles from './BoxBodySketch.module.css';

interface Props {
  bodyH: number;           // cm
  items: InteriorItem[];
  svgWidth: number;
  svgHeight: number;
  showLabels?: boolean;
}

const PAD = 8;

export default function BoxBodySketch({ bodyH, items, svgWidth, svgHeight, showLabels = false }: Props): React.JSX.Element {
  const drawW = svgWidth  - PAD * 2;
  const drawH = svgHeight - PAD * 2;
  const scale = drawH / Math.max(bodyH, 1);

  const bX = PAD;
  const bY = PAD;
  const bW = drawW;
  const bH = drawH;

  // Convert body-relative h (from floor) to SVG y (from top)
  const toY = (h: number) => bY + bH - h * scale;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      width={svgWidth}
      height={svgHeight}
      className={styles.svg}
      overflow="visible"
    >
      {/* Body outline */}
      <rect x={bX} y={bY} width={bW} height={bH} className={styles.bodyRect} />

      {items.map(item => {
        if (item.type === 'shelf') {
          const y = toY(item.heightFromFloor);
          return (
            <g key={item.id}>
              <line x1={bX} y1={y} x2={bX + bW} y2={y} className={styles.shelfLine} />
              {showLabels && (
                <text x={bX + bW + 3} y={y + 4} className={styles.label}>
                  {Math.round(item.heightFromFloor)}
                </text>
              )}
            </g>
          );
        }

        if (item.type === 'rod') {
          const y = toY(item.heightFromFloor);
          return (
            <g key={item.id}>
              <line x1={bX} y1={y} x2={bX + bW} y2={y} className={styles.rodLine} />
              {showLabels && (
                <text x={bX + bW + 3} y={y + 4} className={styles.label}>
                  {Math.round(item.heightFromFloor)}
                </text>
              )}
            </g>
          );
        }

        if (item.type === 'drawer') {
          const yBottom = toY(item.heightFromFloor);
          const yTop    = toY(item.heightFromFloor + item.drawerHeight);
          return (
            <g key={item.id}>
              <rect
                x={bX + 2}
                y={yTop}
                width={bW - 4}
                height={yBottom - yTop}
                className={styles.drawerRect}
              />
              {showLabels && (
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
