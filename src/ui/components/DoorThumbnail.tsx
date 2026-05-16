import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import DoorBodySketch from './DoorBodySketch';
import { getDoorThicknessCm, getDoorVisualHeight } from '../../core/doors/doorUtils';
import styles from './DoorThumbnail.module.css';
import type { Door } from '../../types/doors';

interface Props {
  door: Door;
  displayNumber: string;
  globalMaterialId: string;
  plinthHeight?: number;
  onClick: () => void;
}

const THUMB_W = 60;
const THUMB_H = 100;

export default function DoorThumbnail({ door, displayNumber, globalMaterialId, plinthHeight, onClick }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const thicknessCm = getDoorThicknessCm(door, globalMaterialId);
  const hasOverride = door.thicknessOverride !== undefined;
  const visualH = getDoorVisualHeight(door, plinthHeight ?? 0);

  return (
    <button className={styles.thumb} onClick={onClick} title={t.doors.editFront}>
      <DoorBodySketch door={door} svgWidth={THUMB_W} svgHeight={THUMB_H} {...(plinthHeight !== undefined ? { plinthHeight } : {})} />
      <span className={styles.label}>{displayNumber}</span>
      {door.hasDoor && (
        <span className={`${styles.dims} ${hasOverride ? styles.dimsOverride : ''}`}>
          {door.width.toFixed(1)}×{visualH.toFixed(1)}×{thicknessCm.toFixed(1)}
        </span>
      )}
    </button>
  );
}
