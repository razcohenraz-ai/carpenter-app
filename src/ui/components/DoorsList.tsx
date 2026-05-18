import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import DimensionValue from './DimensionValue';
import {
  getDoorVisualHeight, getDoorThicknessCm, makeDoorId,
  getDrawerFrontVisualHeight, getDrawerFrontThicknessCm,
} from '../../core/doors/doorUtils';
import styles from './DoorsList.module.css';
import type { Box } from '../../types';
import type { Door, DoorById, DrawerFront, DrawerFrontById } from '../../types/doors';
import type { DrawerItem } from '../../types/interior';
import type { Translations } from '../../i18n/translations';

interface Props {
  bodyBoxes: Box[];
  doorsById: DoorById;
  drawerFrontsById?: DrawerFrontById;
  drawerById?: Record<string, DrawerItem>;  // lookup for thickness override
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
  onDrawerFrontClick?: (drawerId: string) => void;
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
  bodyBoxes, doorsById, drawerFrontsById, drawerById, displayNumbers, globalMaterialId, plinthHeight, numFrontsPerBox,
  hasShell, hasEnvelopeTop, cabinetW, cabinetH, cabinetD, frontMaterialThickness, onDrawerFrontClick,
}: Props): React.JSX.Element {
  const { t } = useTranslation();

  // Interleave per-body: doors first (by frontIndex), then drawer fronts for
  // that body (ordered top-most first, matching display reading order).
  type Row =
    | { kind: 'door'; box: Box; door: Door }
    | { kind: 'drawer'; box: Box; front: DrawerFront };

  const drawerFrontsByBox: Map<string, DrawerFront[]> = new Map();
  if (drawerFrontsById) {
    for (const f of Object.values(drawerFrontsById)) {
      const arr = drawerFrontsByBox.get(f.boxId) ?? [];
      arr.push(f);
      drawerFrontsByBox.set(f.boxId, arr);
    }
  }

  const rows: Row[] = bodyBoxes.flatMap(box => {
    const nf = numFrontsPerBox.get(box.id) ?? 1;
    const list: Row[] = [];
    for (let fi = 0; fi < nf; fi++) {
      const door = doorsById[makeDoorId(box.id, fi)];
      if (door?.hasDoor) list.push({ kind: 'door', box, door });
    }
    const fronts = drawerFrontsByBox.get(box.id) ?? [];
    // Read order: top of cabinet → bottom = highest positionFromBoxBottom first
    const sortedFronts = [...fronts].sort((a, b) => b.positionFromBoxBottom - a.positionFromBoxBottom);
    for (const front of sortedFronts) list.push({ kind: 'drawer', box, front });
    return list;
  });

  const showEnvelope = hasShell && cabinetH && cabinetD && frontMaterialThickness;

  if (rows.length === 0 && !showEnvelope) return <></>;

  // Envelope items continue numbering after the doors only (drawer fronts use "—").
  const doorCount = rows.filter(r => r.kind === 'door').length;
  const nextIndex = doorCount + 1;

  return (
    <section className={styles.section}>
      <h3 className={styles.title}>{t.doors.listTitle}</h3>
      <ul className={styles.list}>
        {rows.map(row => {
          if (row.kind === 'door') {
            const { box, door } = row;
            const displayNum = displayNumbers.get(door.id) ?? '';
            const visualH    = getDoorVisualHeight(door, plinthHeight);
            const thickness  = getDoorThicknessCm(door, globalMaterialId);
            return (
              <li key={`d-${door.id}`} className={styles.item}>
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
          }
          // drawer-front row
          const { box, front } = row;
          const drawer    = drawerById?.[front.drawerId];
          const thickness = drawer
            ? getDrawerFrontThicknessCm(drawer, globalMaterialId)
            : (frontMaterialThickness ?? 1.8);
          const visualH   = getDrawerFrontVisualHeight(front, plinthHeight);
          const interactive = onDrawerFrontClick !== undefined;
          return (
            <li
              key={`f-${front.id}`}
              className={`${styles.item} ${interactive ? styles.itemClickable : ''}`}
              {...(interactive ? { onClick: () => onDrawerFrontClick!(front.drawerId) } : {})}
            >
              <span className={styles.index}>—</span>
              <span className={styles.label}>
                {buildDoorLabel(box, '', t).replace(/^[^—]+— /, '')} {t.interior.drawerFrontLabel}
              </span>
              <span className={styles.dims}>
                <DimensionValue value={front.width.toFixed(1)} axis="width" />
                {' × '}
                <DimensionValue value={visualH.toFixed(1)} axis="height" />
                {' × '}
                <DimensionValue value={thickness.toFixed(1)} axis="depth" />
                <span className={styles.unit}> {t.form.unitCm}</span>
              </span>
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
