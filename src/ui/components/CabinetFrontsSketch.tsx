import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { isValidSketchInput, computeSketchGeometry } from './CabinetSketch.utils';
import { computeHingeSpacingWarnings, getDoorVisualHeight, getDrawerFrontVisualHeight } from '../../core/doors/doorUtils';
import styles from './CabinetFrontsSketch.module.css';
import sketchStyles from './CabinetSketch.module.css';
import type { DoorById, DrawerFrontById, DrawerFront } from '../../types/doors';

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
  drawerFrontsById?: DrawerFrontById;
  onDrawerFrontClick?: (drawerId: string) => void;
}

export default function CabinetFrontsSketch({
  W, H, D, plinth, lowerDoorH, doorsPerColumn, middleDoorH, doorsById, displayNumbers,
  drawerFrontsById, onDrawerFrontClick,
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

        {/* Door panels — grouped by box, multiple horizontal fronts per box */}
        {(() => {
          // Group doors by boxId, then render all fronts within each box rect
          const doorsByBoxId = new Map<string, typeof doorsById[string][]>();
          for (const door of Object.values(doorsById)) {
            const list = doorsByBoxId.get(door.boxId) ?? [];
            list.push(door);
            doorsByBoxId.set(door.boxId, list);
          }

          // Group external-drawer fronts by (boxId, frontIndex). Body-wide
          // externals (no cellIndex) reuse the same DrawerFront for every
          // frontIndex of that box.
          const drawerFrontsByBoxFi = new Map<string, DrawerFront[]>();
          if (drawerFrontsById) {
            // First collect all per-cell and per-body fronts
            const bodyFrontsByBox = new Map<string, DrawerFront[]>();
            const cellFrontsByKey = new Map<string, DrawerFront[]>();
            for (const f of Object.values(drawerFrontsById)) {
              if (f.cellIndex !== undefined) {
                const k = `${f.boxId}:${f.frontIndex}`;
                const arr = cellFrontsByKey.get(k) ?? [];
                arr.push(f);
                cellFrontsByKey.set(k, arr);
              } else {
                const arr = bodyFrontsByBox.get(f.boxId) ?? [];
                arr.push(f);
                bodyFrontsByBox.set(f.boxId, arr);
              }
            }
            // Then materialize: per-front fronts = body fronts ∪ per-cell fronts
            for (const door of Object.values(doorsById)) {
              const key = `${door.boxId}:${door.frontIndex}`;
              const fromCells = cellFrontsByKey.get(key) ?? [];
              const fromBody = bodyFrontsByBox.get(door.boxId) ?? [];
              const combined = [...fromCells, ...fromBody]
                .sort((a, b) => a.positionFromBoxBottom - b.positionFromBoxBottom);
              if (combined.length > 0) drawerFrontsByBoxFi.set(key, combined);
            }
          }

          return [...doorsByBoxId.entries()].flatMap(([boxId, doors]) => {
            const rect = geo.boxSvgRects[boxId];
            if (!rect) return [];

            const sortedDoors = [...doors].sort((a, b) => a.frontIndex - b.frontIndex);

            return sortedDoors.map(door => {
              const panelW   = door.width * geo.scale;
              const gapPx    = (door.gapMm ?? 0) / 10 * geo.scale;
              const fi       = door.frontIndex;
              // fi=0 is rightmost → highest x in LTR SVG coordinates
              const panelX   = rect.x + rect.w - (fi + 1) * (panelW + gapPx);
              const panelH   = door.height * geo.scale;
              // Drawer fronts attached to this (box, fi) push the main door up.
              const myFronts = drawerFrontsByBoxFi.get(`${boxId}:${fi}`) ?? [];
              const stackTopCm = myFronts.length === 0
                ? 0
                : Math.max(...myFronts.map(f => f.positionFromBoxBottom + f.height + f.gapMm / 10));
              const stackPx  = stackTopCm * geo.scale;
              const panelY   = rect.y + rect.h - stackPx - panelH;
              const toSvgY   = (fromBottom: number) => rect.y + rect.h - fromBottom * geo.scale;
              const num      = displayNumbers.get(door.id) ?? '';

              if (!door.hasDoor) {
                return (
                  <g key={door.id}>
                    <rect x={panelX} y={panelY} width={panelW} height={panelH}
                      className={styles.noDoorRect} />
                    <text x={panelX + panelW / 2} y={panelY + panelH / 2}
                      textAnchor="middle" dominantBaseline="middle"
                      className={styles.noDoorLabel}>
                      {t.doors.noFront}
                    </text>
                  </g>
                );
              }

              const spacingWarns = computeHingeSpacingWarnings(door);
              const iconAnchor   = door.hingeSide === 'right' ? 'start' : 'end';
              const skirtExt     = (getDoorVisualHeight(door, plinthH) - door.height) * geo.scale;

              return (
                <g key={door.id}>
                  <rect x={panelX} y={panelY} width={panelW} height={panelH + skirtExt}
                    className={styles.doorRect} />
                  {skirtExt > 0 && (
                    <line
                      x1={panelX} y1={panelY + panelH}
                      x2={panelX + panelW} y2={panelY + panelH}
                      className={styles.skirtLine}
                    />
                  )}

                  {/* Hinges */}
                  {door.hinges.map(hinge => {
                    const cy = toSvgY(hinge.positionFromBottom);
                    const hasSpacingWarn = spacingWarns.has(hinge.id);
                    const hingeXPanel = door.hingeSide === 'right' ? panelX + panelW : panelX;
                    const iconXPanel  = door.hingeSide === 'right' ? hingeXPanel + 6 : hingeXPanel - 6;
                    return (
                      <g key={hinge.id}>
                        <circle
                          cx={hingeXPanel} cy={cy} r={3.5}
                          className={`${styles.hinge} ${hinge.isManual ? styles.hingeManual : ''} ${hasSpacingWarn ? styles.hingeWarn : ''}`}
                        />
                        {hasSpacingWarn && (
                          <text x={iconXPanel} y={cy} textAnchor={iconAnchor} dominantBaseline="middle"
                            className={styles.hingeWarnIcon}>⚠</text>
                        )}
                      </g>
                    );
                  })}

                  {/* Door number */}
                  <text
                    x={panelX + panelW / 2}
                    y={panelY + panelH / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className={styles.doorNumber}
                  >
                    {num}
                  </text>

                  {/* External-drawer fronts stacked below the main door */}
                  {myFronts.map(front => {
                    const fH      = front.height * geo.scale;
                    const visualH = getDrawerFrontVisualHeight(front, plinthH) * geo.scale;
                    const fY      = rect.y + rect.h - (front.positionFromBoxBottom + front.height) * geo.scale;
                    const interactive = onDrawerFrontClick !== undefined;
                    const onClick = interactive ? () => onDrawerFrontClick!(front.drawerId) : undefined;
                    return (
                      <g
                        key={`f-${front.id}`}
                        {...(onClick ? { onClick, style: { cursor: 'pointer' } } : {})}
                      >
                        <rect
                          x={panelX} y={fY}
                          width={panelW} height={visualH}
                          className={styles.drawerFrontRect}
                        />
                        {visualH > fH && (
                          <line
                            x1={panelX} y1={fY + fH}
                            x2={panelX + panelW} y2={fY + fH}
                            className={styles.skirtLine}
                          />
                        )}
                        <text
                          x={panelX + panelW / 2}
                          y={fY + fH / 2 + 3}
                          textAnchor="middle"
                          className={styles.drawerFrontLabel}
                        >
                          {t.interior.drawer}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            });
          });
        })()}

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
