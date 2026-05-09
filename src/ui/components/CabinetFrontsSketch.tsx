import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { isValidSketchInput, computeSketchGeometry } from './CabinetSketch.utils';
import { computeHingeSpacingWarnings, getDoorVisualHeight } from '../../core/doors/doorUtils';
import styles from './CabinetFrontsSketch.module.css';
import sketchStyles from './CabinetSketch.module.css';
import type { DoorById } from '../../types/doors';

interface Props {
  W: string;
  H: string;
  D: string;
  plinth: string;
  lowerDoorH?: string;
  doorsPerColumn?: string;
  middleDoorH?: string;
  doorsById: DoorById;
  displayNumbers: Map<string, string>;
}

export default function CabinetFrontsSketch({
  W, H, D, plinth, lowerDoorH, doorsPerColumn, middleDoorH, doorsById, displayNumbers,
}: Props): React.JSX.Element {
  const { t } = useTranslation();

  if (!isValidSketchInput(W, H, D, plinth, lowerDoorH, doorsPerColumn, middleDoorH)) {
    return (
      <div className={sketchStyles.placeholder}>
        <span className={sketchStyles.hint}>{t.sketch.invalidDimensions}</span>
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
  const plinthH = parseFloat(plinth);

  return (
    <div className={sketchStyles.wrapper}>
      <p className={sketchStyles.title}>{t.doors.preview}</p>
      <svg
        viewBox={`0 0 ${geo.svgWidth} ${geo.svgHeight}`}
        className={sketchStyles.svg}
        overflow="visible"
        role="img"
        aria-label={t.doors.preview}
      >
        {/* Cabinet outline */}
        <rect
          x={geo.cabinet.x} y={geo.cabinet.y}
          width={geo.cabinet.w} height={geo.cabinet.h}
          className={sketchStyles.cabinetRect}
        />

        {/* Door panels */}
        {Object.entries(doorsById).map(([boxId, door]) => {
          const rect = geo.boxSvgRects[boxId];
          if (!rect) return null;

          const num = displayNumbers.get(boxId) ?? '';
          const toSvgY = (fromBottom: number) => rect.y + rect.h - fromBottom * geo.scale;
          const hingeX = door.hingeSide === 'right' ? rect.x + rect.w : rect.x;

          if (!door.hasDoor) {
            return (
              <g key={boxId}>
                <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h}
                  className={styles.noDoorRect} />
                <text x={rect.x + rect.w / 2} y={rect.y + rect.h / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  className={styles.noDoorLabel}>
                  {t.doors.noFront}
                </text>
              </g>
            );
          }

          const spacingWarns = computeHingeSpacingWarnings(door);
          const iconX = door.hingeSide === 'right' ? hingeX + 6 : hingeX - 6;
          const iconAnchor = door.hingeSide === 'right' ? 'start' : 'end';

          const skirtExt = (getDoorVisualHeight(door, plinthH) - door.height) * geo.scale;

          return (
            <g key={boxId}>
              <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h + skirtExt}
                className={styles.doorRect} />
              {skirtExt > 0 && (
                <line
                  x1={rect.x} y1={rect.y + rect.h}
                  x2={rect.x + rect.w} y2={rect.y + rect.h}
                  className={styles.skirtLine}
                />
              )}

              {/* Hinges */}
              {door.hinges.map(hinge => {
                const cy = toSvgY(hinge.positionFromBottom);
                const hasSpacingWarn = spacingWarns.has(hinge.id);
                return (
                  <g key={hinge.id}>
                    <circle
                      cx={hingeX} cy={cy} r={3.5}
                      className={`${styles.hinge} ${hinge.isManual ? styles.hingeManual : ''} ${hasSpacingWarn ? styles.hingeWarn : ''}`}
                    />
                    {hasSpacingWarn && (
                      <text x={iconX} y={cy} textAnchor={iconAnchor} dominantBaseline="middle"
                        className={styles.hingeWarnIcon}>⚠</text>
                    )}
                  </g>
                );
              })}

              {/* Door number */}
              <text
                x={rect.x + rect.w / 2}
                y={rect.y + rect.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                className={styles.doorNumber}
              >
                {num}
              </text>
            </g>
          );
        })}

        {/* Width label */}
        <text
          x={geo.wLabel.x} y={geo.wLabel.y}
          className={`${sketchStyles.dimLabel} ${sketchStyles.dimLabelWidth}`}
          textAnchor="middle" dominantBaseline="auto"
        >
          {geo.wLabel.text}
        </text>

        {/* Height label */}
        <text
          x={geo.hLabel.x} y={geo.hLabel.y}
          className={`${sketchStyles.dimLabel} ${sketchStyles.dimLabelHeight}`}
          textAnchor="middle" dominantBaseline="middle"
          transform={`rotate(-90, ${geo.hLabel.x}, ${geo.hLabel.y})`}
        >
          {geo.hLabel.text}
        </text>
      </svg>
    </div>
  );
}
