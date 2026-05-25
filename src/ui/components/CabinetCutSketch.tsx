import React from 'react';
import type { Board } from '../../core/boards/boardModel';
import styles from './CabinetCutSketch.module.css';

interface Props {
  /** All boards for one body (output of buildBoardModel). */
  boards: Board[];
  /** SVG x of the body's outer-left edge (where Board.xFrom = 0 lives). */
  offsetX: number;
  /** SVG y of the body's outer-top edge. */
  offsetY: number;
  /** cm → SVG pixels. */
  scale: number;
  /** Material id of the body's main carcass — used to colour boards
   *  differently from envelope boards (which use the front material). */
  bodyMaterialId: string;
}

// Maps a board role to a CSS class. Envelope and internal-shelf get distinct
// styling so the cut view stays readable even when many boards stack up.
function classForRole(role: Board['role']): string {
  if (role.startsWith('envelope-')) return styles.envelopeBoard ?? '';
  if (role === 'fixed-shelf')       return styles.fixedShelfBoard ?? '';
  if (role === 'internal-shelf')    return styles.internalShelfBoard ?? '';
  if (role === 'partition')         return styles.partitionBoard ?? '';
  return styles.carcassBoard ?? '';
}

export default function CabinetCutSketch({
  boards, offsetX, offsetY, scale,
}: Props): React.JSX.Element {
  return (
    <g className={styles.bodyGroup}>
      {boards.filter(b => b.visible).map(b => {
        const x = offsetX + b.xFrom * scale;
        const y = offsetY + b.yFrom * scale;
        const w = (b.xTo - b.xFrom) * scale;
        const h = (b.yTo - b.yFrom) * scale;
        return (
          <rect
            key={b.id}
            x={x} y={y} width={w} height={h}
            className={classForRole(b.role)}
            data-role={b.role}
          />
        );
      })}
    </g>
  );
}
