import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import BoxBodySketch from './BoxBodySketch';
import styles from './BoxThumbnail.module.css';
import type { InteriorItem } from '../../types/interior';
import type { Box, BoxPosition } from '../../types/geometry';

interface Props {
  box: Box;
  items: InteriorItem[];
  svgWidth?: number;
  svgHeight?: number;
  hasPartition?: boolean;
  cellItems?: InteriorItem[][];
  /** Body material thickness in cm — used to compute cell width when the
   *  body is partitioned. Defaults to 1.8 if omitted. */
  tBody?: number;
  onClick: () => void;
}

const DEFAULT_W = 70;
const DEFAULT_H = 110;

export default function BoxThumbnail({ box, items, svgWidth = DEFAULT_W, svgHeight = DEFAULT_H, hasPartition, cellItems, tBody = 1.8, onClick }: Props): React.JSX.Element {
  const { t } = useTranslation();

  const levelLabels: Record<string, string> = {
    top:    t.boxes.levelTop,
    middle: t.boxes.levelMiddle,
    bottom: t.boxes.levelBottom,
    single: t.boxes.levelSingle,
  };

  const posLabel = (pos: BoxPosition): string => {
    if (pos === 'single') return '';
    if (pos === 'left')  return t.boxes.posLeft;
    if (pos === 'right') return t.boxes.posRight;
    return `${t.boxes.posUnit} ${box.unitIndex ?? ''}`.trim();
  };

  const levelStr = levelLabels[box.level] ?? box.level;
  const posStr   = posLabel(box.position);
  const label    = posStr ? `${levelStr} ${posStr}` : levelStr;

  // Body with partition: render the two cells side-by-side, each with its
  // own BoxBodySketch. This preserves cell boundaries (drawers in cell 0 stay
  // in cell 0, no flattening). Without this, `cellItems.flat()` would stack
  // externals from both cells together at the box bottom.
  if (hasPartition && cellItems) {
    const cellW = (box.W - tBody) / 2;
    const cellSvgW = Math.max(1, Math.floor((svgWidth - 2) / 2));
    return (
      <button className={styles.thumb} onClick={onClick} title={t.interior.editBody}>
        <div className={styles.cellsRow}>
          <BoxBodySketch
            bodyH={box.H}
            bodyW={cellW}
            items={cellItems[1] ?? []}
            svgWidth={cellSvgW}
            svgHeight={svgHeight}
            showLabels={false}
            numPartitions={0}
          />
          <BoxBodySketch
            bodyH={box.H}
            bodyW={cellW}
            items={cellItems[0] ?? []}
            svgWidth={cellSvgW}
            svgHeight={svgHeight}
            showLabels={false}
            numPartitions={0}
          />
        </div>
        <span className={styles.label}>{label}</span>
        <span className={styles.dims}>
          {box.W.toFixed(1)} × {box.H.toFixed(1)} × {box.D.toFixed(1)}
        </span>
      </button>
    );
  }

  return (
    <button className={styles.thumb} onClick={onClick} title={t.interior.editBody}>
      <BoxBodySketch
        bodyH={box.H}
        items={items}
        svgWidth={svgWidth}
        svgHeight={svgHeight}
        showLabels={false}
        numPartitions={0}
      />
      <span className={styles.label}>{label}</span>
      <span className={styles.dims}>
        {box.W.toFixed(1)} × {box.H.toFixed(1)} × {box.D.toFixed(1)}
      </span>
    </button>
  );
}
