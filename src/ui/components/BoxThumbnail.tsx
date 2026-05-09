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
  onClick: () => void;
}

const DEFAULT_W = 70;
const DEFAULT_H = 110;

export default function BoxThumbnail({ box, items, svgWidth = DEFAULT_W, svgHeight = DEFAULT_H, onClick }: Props): React.JSX.Element {
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

  return (
    <button className={styles.thumb} onClick={onClick} title={t.interior.editBody}>
      <BoxBodySketch
        bodyH={box.H}
        items={items}
        svgWidth={svgWidth}
        svgHeight={svgHeight}
        showLabels={false}
      />
      <span className={styles.label}>{label}</span>
      <span className={styles.dims}>
        {box.W.toFixed(1)} × {box.H.toFixed(1)} × {box.D.toFixed(1)}
      </span>
    </button>
  );
}
