import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import DimensionValue from './DimensionValue';
import { getDoorVisualHeight, getDoorThicknessCm } from '../../core/doors/doorUtils';
import styles from './DoorsList.module.css';
import type { Box } from '../../types';
import type { Door, DoorById } from '../../types/doors';
import type { Translations } from '../../i18n/translations';

interface Props {
  bodyBoxes: Box[];
  doorsById: DoorById;
  displayNumbers: Map<string, string>;
  globalMaterialId: string;
  plinthHeight: number;
}

function buildDoorLabel(box: Box, displayNum: string, t: Translations): string {
  const levelLabel =
    box.level === 'top'    ? t.boxes.levelTop    :
    box.level === 'middle' ? t.boxes.levelMiddle :
    box.level === 'bottom' ? t.boxes.levelBottom :
    t.boxes.levelSingle;

  const posLabel =
    box.position === 'single' ? '' :
    box.position === 'left'   ? t.boxes.posLeft  :
    box.position === 'right'  ? t.boxes.posRight :
    `${t.boxes.posUnit} ${box.unitIndex ?? ''}`.trim();

  const desc = posLabel ? `${levelLabel} ${posLabel}` : levelLabel;
  return `${t.doors.front} ${displayNum} — ${desc}`;
}

function HingeMini({ door }: { door: Door }): React.JSX.Element {
  const H  = 30;
  const W  = 14;
  const cx = door.hingeSide === 'left' ? 1 : W - 1;
  return (
    <svg
      width={W} height={H}
      viewBox={`0 0 ${W} ${H}`}
      className={styles.hingeMini}
      overflow="visible"
    >
      <rect x={1} y={0} width={W - 2} height={H}
        fill="var(--color-surface)" stroke="var(--color-fronts)" strokeWidth={1} />
      {door.hinges.map(h => {
        const cy = H * (1 - h.positionFromBottom / Math.max(door.height, 1));
        return (
          <circle key={h.id} cx={cx} cy={cy} r={2.5}
            fill="var(--color-fronts)" />
        );
      })}
    </svg>
  );
}

export default function DoorsList({
  bodyBoxes, doorsById, displayNumbers, globalMaterialId, plinthHeight,
}: Props): React.JSX.Element {
  const { t } = useTranslation();

  const rows = bodyBoxes
    .map(box => ({ box, door: doorsById[box.id] }))
    .filter((e): e is { box: Box; door: Door } => e.door?.hasDoor === true);

  if (rows.length === 0) return <></>;

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>{t.doors.listTitle}</h3>
      <ul className={styles.list}>
        {rows.map(({ box, door }) => {
          const displayNum = displayNumbers.get(box.id) ?? '';
          const visualH    = getDoorVisualHeight(door, plinthHeight);
          const thickness  = getDoorThicknessCm(door, globalMaterialId);
          return (
            <li key={box.id} className={styles.item}>
              <span className={styles.index}>{displayNum}</span>
              <span className={styles.label}>{buildDoorLabel(box, displayNum, t)}</span>
              <span className={styles.dims}>
                <DimensionValue value={door.width.toFixed(1)} axis="width" />
                {' × '}
                <DimensionValue value={visualH.toFixed(1)} axis="height" />
                {' × '}
                <DimensionValue value={thickness.toFixed(1)} axis="depth" />
                <span className={styles.unit}> {t.form.unitCm}</span>
              </span>
              <HingeMini door={door} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
