import React from 'react';
import type { Door } from '../../types/doors';
import { getDoorVisualHeight } from '../../core/doors/doorUtils';
import styles from './DoorBodySketch.module.css';

interface Props {
  door: Door;
  svgWidth: number;
  svgHeight: number;
  showLabels?: boolean;
  showDimensions?: boolean;
  thickness?: number;       // cm, renders dimension annotation when provided
  warnings?: Set<string>;
  plinthHeight?: number;    // cm; when provided + door.coversSkirt, extends rect below structural
}

const PAD = 8;
const DIM_PAD_TOP   = 26;
const DIM_PAD_RIGHT = 48;

export default function DoorBodySketch({
  door, svgWidth, svgHeight,
  showLabels = false, showDimensions = false, thickness,
  warnings, plinthHeight,
}: Props): React.JSX.Element {
  if (!door.hasDoor) {
    return (
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width={svgWidth} height={svgHeight}>
        <rect x={PAD} y={PAD} width={svgWidth - PAD * 2} height={svgHeight - PAD * 2}
          className={styles.noDoorRect} />
      </svg>
    );
  }

  const padTop   = showDimensions ? DIM_PAD_TOP   : PAD;
  const padRight = showDimensions ? DIM_PAD_RIGHT : PAD;
  const drawW = svgWidth  - PAD    - padRight;
  const drawH = svgHeight - padTop - PAD;

  const visualH  = getDoorVisualHeight(door, plinthHeight ?? 0);
  const skirtExt = visualH - door.height; // cm below structural

  const scaleH = drawH / Math.max(visualH, 1);
  const scaleW = drawW / Math.max(door.width, 1);
  const scale  = Math.min(scaleH, scaleW);

  const dW     = door.width  * scale;
  const dH     = door.height * scale;   // structural height in SVG
  const dSkirt = skirtExt    * scale;   // extension below structural
  const dX = PAD + (drawW - dW) / 2;
  const dY = padTop + (drawH - (dH + dSkirt)) / 2;

  const toY      = (fromBottom: number) => dY + dH - fromBottom * scale;
  const hingeX   = door.hingeSide === 'right' ? dX + dW : dX;
  const labelDir = door.hingeSide === 'right' ? 1 : -1;

  const wArrowY = dY - 10;
  const hArrowX = dX + dW + 10;
  const tX      = dX + dW + 32;
  const tY      = dY + 4;

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width={svgWidth} height={svgHeight}
      className={styles.svg} overflow="visible">

      <rect x={dX} y={dY} width={dW} height={dH + dSkirt} className={styles.doorRect} />
      {dSkirt > 0 && (
        <line x1={dX} y1={dY + dH} x2={dX + dW} y2={dY + dH} className={styles.skirtLine} />
      )}

      {door.hinges.map(hinge => {
        const y    = toY(hinge.positionFromBottom);
        const warn = warnings?.has(hinge.id);
        return (
          <g key={hinge.id}>
            <circle
              cx={hingeX} cy={y} r={4}
              className={`${styles.hinge} ${hinge.isManual ? styles.hingeManual : ''} ${warn ? styles.hingeWarn : ''}`}
            />
            {showLabels && (
              <text
                x={hingeX + labelDir * 8} y={y + 4}
                textAnchor={door.hingeSide === 'right' ? 'start' : 'end'}
                className={styles.label}
              >
                {Math.round(hinge.positionFromBottom)}
              </text>
            )}
          </g>
        );
      })}

      {showDimensions && (
        <g>
          {/* Width arrow */}
          <line x1={dX} y1={wArrowY} x2={dX + dW} y2={wArrowY} className={styles.dimLine} />
          <line x1={dX}      y1={wArrowY - 4} x2={dX}      y2={wArrowY + 4} className={styles.dimLine} />
          <line x1={dX + dW} y1={wArrowY - 4} x2={dX + dW} y2={wArrowY + 4} className={styles.dimLine} />
          <text x={dX + dW / 2} y={wArrowY - 3} textAnchor="middle" dominantBaseline="auto"
            className={styles.dimLabel}>
            {door.width.toFixed(1)} ס"מ
          </text>

          {/* Height arrow — spans full visual height */}
          <line x1={hArrowX} y1={dY} x2={hArrowX} y2={dY + dH + dSkirt} className={styles.dimLine} />
          <line x1={hArrowX - 4} y1={dY}              x2={hArrowX + 4} y2={dY}              className={styles.dimLine} />
          <line x1={hArrowX - 4} y1={dY + dH + dSkirt} x2={hArrowX + 4} y2={dY + dH + dSkirt} className={styles.dimLine} />
          <text
            x={hArrowX + 10} y={dY + (dH + dSkirt) / 2}
            textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(-90, ${hArrowX + 10}, ${dY + (dH + dSkirt) / 2})`}
            className={styles.dimLabel}
          >
            {visualH.toFixed(1)} ס"מ
          </text>

          {/* Thickness indicator */}
          {thickness !== undefined && (
            <>
              <rect x={tX} y={tY} width={6} height={18} className={styles.dimThicknessRect} />
              <text x={tX + 3} y={tY + 26} textAnchor="middle" className={styles.dimLabel}>
                T:{thickness.toFixed(1)}
              </text>
            </>
          )}
        </g>
      )}
    </svg>
  );
}
