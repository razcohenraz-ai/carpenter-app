import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import BoxBodySketch from './BoxBodySketch';
import styles from './BoxThumbnail.module.css';
import type { BodyLevel, InteriorItem } from '../../types/interior';

interface Props {
  level: BodyLevel;
  bodyH: number;
  items: InteriorItem[];
  onClick: () => void;
}

const THUMB_W = 70;
const THUMB_H = 110;

export default function BoxThumbnail({ level, bodyH, items, onClick }: Props): React.JSX.Element {
  const { t } = useTranslation();

  const levelLabel: Record<BodyLevel, string> = {
    top:    t.boxes.levelTop,
    middle: t.boxes.levelMiddle,
    bottom: t.boxes.levelBottom,
    single: t.boxes.levelSingle,
  };

  return (
    <button className={styles.thumb} onClick={onClick} title={t.interior.editBody}>
      <BoxBodySketch
        bodyH={bodyH}
        items={items}
        svgWidth={THUMB_W}
        svgHeight={THUMB_H}
        showLabels={false}
      />
      <span className={styles.label}>{levelLabel[level]}</span>
    </button>
  );
}
