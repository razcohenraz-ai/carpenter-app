import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import DimensionValue from './DimensionValue';
import { getDoorVisualHeight, getDoorThicknessCm, makeDoorId } from '../../core/doors/doorUtils';
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
  numFrontsPerBox: Map<string, number>;
  hasShell?: boolean;
  hasEnvelopeTop?: boolean;
  cabinetW?: number;
  cabinetH?: number;
  cabinetD?: number;
  frontMaterialThickness?: number;
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
  bodyBoxes, doorsById, displayNumbers, globalMaterialId, plinthHeight, numFrontsPerBox,
  hasShell, hasEnvelopeTop, cabinetW, cabinetH, cabinetD, frontMaterialThickness,
}: Props): React.JSX.Element {
  const { t } = useTranslation();

  const rows: { box: Box; door: Door }[] = bodyBoxes.flatMap(box => {
    const nf = numFrontsPerBox.get(box.id) ?? 1;
    const items: { box: Box; door: Door }[] = [];
    for (let fi = 0; fi < nf; fi++) {
      const door = doorsById[makeDoorId(box.id, fi)];
      if (door?.hasDoor) items.push({ box, door });
    }
    return items;
  });

  const showEnvelope = hasShell && cabinetH && cabinetD && frontMaterialThickness;

  if (rows.length === 0 && !showEnvelope) return <></>;

  const nextIndex = rows.length + 1;

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>{t.doors.listTitle}</h3>
      <ul className={styles.list}>
        {rows.map(({ box, door }) => {
          const displayNum = displayNumbers.get(door.id) ?? '';
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

        {showEnvelope && (
          <>
            <li className={styles.item}>
              <span className={styles.index}>{nextIndex}</span>
              <span className={styles.label}>{t.doors.envelopeSideRight}</span>
              <span className={styles.dims}>
                <DimensionValue value={cabinetD!.toFixed(1)} axis="width" />
                {' × '}
                <DimensionValue value={cabinetH!.toFixed(1)} axis="height" />
                {' × '}
                <DimensionValue value={frontMaterialThickness!.toFixed(1)} axis="depth" />
                <span className={styles.unit}> {t.form.unitCm}</span>
              </span>
            </li>
            <li className={styles.item}>
              <span className={styles.index}>{nextIndex + 1}</span>
              <span className={styles.label}>{t.doors.envelopeSideLeft}</span>
              <span className={styles.dims}>
                <DimensionValue value={cabinetD!.toFixed(1)} axis="width" />
                {' × '}
                <DimensionValue value={cabinetH!.toFixed(1)} axis="height" />
                {' × '}
                <DimensionValue value={frontMaterialThickness!.toFixed(1)} axis="depth" />
                <span className={styles.unit}> {t.form.unitCm}</span>
              </span>
            </li>
            {hasEnvelopeTop && cabinetW !== undefined && (
              <li className={styles.item}>
                <span className={styles.index}>{nextIndex + 2}</span>
                <span className={styles.label}>{t.doors.envelopeTop}</span>
                <span className={styles.dims}>
                  <DimensionValue value={(cabinetW - 2 * frontMaterialThickness!).toFixed(1)} axis="width" />
                  {' × '}
                  <DimensionValue value={cabinetD!.toFixed(1)} axis="height" />
                  {' × '}
                  <DimensionValue value={frontMaterialThickness!.toFixed(1)} axis="depth" />
                  <span className={styles.unit}> {t.form.unitCm}</span>
                </span>
              </li>
            )}
          </>
        )}
      </ul>
    </section>
  );
}
