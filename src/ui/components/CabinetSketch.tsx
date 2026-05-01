import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { isValidSketchInput, computeSketchGeometry } from './CabinetSketch.utils';
import styles from './CabinetSketch.module.css';
import type { InteriorByLevel, BodyLevel } from '../../types/interior';

interface Props {
  W: string;
  H: string;
  D: string;
  plinth: string;
  lowerDoorH?: string;
  doorsPerColumn?: string;
  middleDoorH?: string;
  interiorByLevel?: InteriorByLevel | undefined;
}

export default function CabinetSketch({ W, H, D, plinth, lowerDoorH, doorsPerColumn, middleDoorH, interiorByLevel }: Props): React.JSX.Element {
  const { t } = useTranslation();

  if (!isValidSketchInput(W, H, D, plinth, lowerDoorH, doorsPerColumn, middleDoorH)) {
    return (
      <div className={styles.placeholder}>
        <span className={styles.hint}>{t.sketch.invalidDimensions}</span>
      </div>
    );
  }

  const lo  = lowerDoorH  !== undefined ? parseFloat(lowerDoorH)  : undefined;
  const mid = middleDoorH !== undefined ? parseFloat(middleDoorH) : undefined;
  const dpc: 'auto' | 1 | 2 | 3 =
    doorsPerColumn === '1' ? 1 :
    doorsPerColumn === '2' ? 2 :
    doorsPerColumn === '3' ? 3 : 'auto';
  const geo = computeSketchGeometry(parseFloat(W), parseFloat(H), parseFloat(D), parseFloat(plinth), lo, dpc, mid);

  return (
    <div className={styles.wrapper}>
      <p className={styles.title}>{t.sketch.preview}</p>
      <svg
        viewBox={`0 0 ${geo.svgWidth} ${geo.svgHeight}`}
        className={styles.svg}
        overflow="visible"
        role="img"
        aria-label={t.sketch.preview}
      >
        {/* Cabinet outline */}
        <rect
          x={geo.cabinet.x}
          y={geo.cabinet.y}
          width={geo.cabinet.w}
          height={geo.cabinet.h}
          className={styles.cabinetRect}
        />

        {/* Plinth fill */}
        {geo.plinthRect && (
          <rect
            x={geo.plinthRect.x}
            y={geo.plinthRect.y}
            width={geo.plinthRect.w}
            height={geo.plinthRect.h}
            className={styles.plinthRect}
          />
        )}

        {/* Box split lines */}
        {geo.splitLines.map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className={styles.splitLine}
          />
        ))}

        {/* Internal shelf lines — only when no explicit interior state */}
        {!interiorByLevel && geo.internalShelfLines.map((line, i) => (
          <line
            key={`shelf_${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className={styles.splitLine}
          />
        ))}

        {/* Interior items per body level */}
        {interiorByLevel && (Object.keys(interiorByLevel) as BodyLevel[]).map(level => {
          const items = interiorByLevel[level] ?? [];
          const bodyFloor = geo.bodyFloors[level] ?? 0;
          const Hn = parseFloat(H);
          const pn = parseFloat(plinth);
          const toSvgY = (h: number) =>
            geo.cabinet.y + (Hn - pn - bodyFloor - h) * geo.scale;

          return items.map(item => {
            if (item.type === 'shelf') {
              const y = toSvgY(item.heightFromFloor);
              return (
                <line
                  key={item.id}
                  x1={geo.cabinet.x}
                  y1={y}
                  x2={geo.cabinet.x + geo.cabinet.w}
                  y2={y}
                  className={styles.shelfLine}
                />
              );
            }
            if (item.type === 'rod') {
              const y = toSvgY(item.heightFromFloor);
              return (
                <line
                  key={item.id}
                  x1={geo.cabinet.x}
                  y1={y}
                  x2={geo.cabinet.x + geo.cabinet.w}
                  y2={y}
                  className={styles.rodLine}
                />
              );
            }
            if (item.type === 'drawer') {
              const yBottom = toSvgY(item.heightFromFloor);
              const yTop    = toSvgY(item.heightFromFloor + item.drawerHeight);
              return (
                <rect
                  key={item.id}
                  x={geo.cabinet.x + 2}
                  y={yTop}
                  width={geo.cabinet.w - 4}
                  height={yBottom - yTop}
                  className={styles.drawerRect}
                />
              );
            }
            return null;
          });
        })}

        {/* Width label */}
        <text
          x={geo.wLabel.x}
          y={geo.wLabel.y}
          className={`${styles.dimLabel} ${styles.dimLabelWidth}`}
          textAnchor="middle"
          dominantBaseline="auto"
        >
          {geo.wLabel.text}
        </text>

        {/* Height label — rotated 90° on the left side */}
        <text
          x={geo.hLabel.x}
          y={geo.hLabel.y}
          className={`${styles.dimLabel} ${styles.dimLabelHeight}`}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90, ${geo.hLabel.x}, ${geo.hLabel.y})`}
        >
          {geo.hLabel.text}
        </text>
      </svg>
    </div>
  );
}
