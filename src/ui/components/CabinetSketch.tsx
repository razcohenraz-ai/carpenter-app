import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { isValidSketchInput, computeSketchGeometry } from './CabinetSketch.utils';
import styles from './CabinetSketch.module.css';
import type { InteriorById, CellInteriorById, DrawerItem } from '../../types/interior';

interface Props {
  W: string;
  H: string;
  D: string;
  plinth: string;
  lowerDoorH?: string;
  doorsPerColumn?: string;
  middleDoorH?: string;
  interiorById?: InteriorById | undefined;
  cellInteriorById?: CellInteriorById;
  partitionsById?: Map<string, boolean>;
  hasShell?: boolean;
  frontMaterialThickness?: number;
  hasEnvelopeTop?: boolean;
}

export default function CabinetSketch({ W, H, D, plinth, lowerDoorH, doorsPerColumn, middleDoorH, interiorById, cellInteriorById, partitionsById, hasShell, frontMaterialThickness, hasEnvelopeTop }: Props): React.JSX.Element {
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
  const tEnv = hasShell && frontMaterialThickness ? frontMaterialThickness : undefined;
  const geo = computeSketchGeometry(parseFloat(W), parseFloat(H), parseFloat(D), parseFloat(plinth), lo, dpc, mid, tEnv, hasEnvelopeTop && !!tEnv);

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

        {/* Outer envelope side panels */}
        {geo.envelopePanels && (
          <>
            <rect
              x={geo.envelopePanels.left.x}
              y={geo.envelopePanels.left.y}
              width={geo.envelopePanels.left.w}
              height={geo.envelopePanels.left.h}
              className={styles.envelopePanel}
            />
            <rect
              x={geo.envelopePanels.right.x}
              y={geo.envelopePanels.right.y}
              width={geo.envelopePanels.right.w}
              height={geo.envelopePanels.right.h}
              className={styles.envelopePanel}
            />
          </>
        )}

        {/* Outer envelope ceiling panel */}
        {geo.envelopeTopPanel && (
          <rect
            x={geo.envelopeTopPanel.x}
            y={geo.envelopeTopPanel.y}
            width={geo.envelopeTopPanel.w}
            height={geo.envelopeTopPanel.h}
            className={styles.envelopePanel}
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
        {!interiorById && geo.internalShelfLines.map((line, i) => (
          <line
            key={`shelf_${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className={styles.splitLine}
          />
        ))}

        {/* Interior items per box */}
        {interiorById && Object.entries(interiorById).map(([boxId, items]) => {
          const rect = geo.boxSvgRects[boxId];
          if (!rect) return null;

          const toSvgY = (h: number) => rect.y + rect.h - h * geo.scale;

          return items.map(item => {
            if (item.type === 'shelf') {
              const y = toSvgY(item.heightFromFloor);
              return (
                <line
                  key={item.id}
                  x1={rect.x}
                  y1={y}
                  x2={rect.x + rect.w}
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
                  x1={rect.x}
                  y1={y}
                  x2={rect.x + rect.w}
                  y2={y}
                  className={styles.rodLine}
                />
              );
            }
            if (item.type === 'drawer') {
              const yBottom = toSvgY(item.heightFromFloor);
              const yTop    = toSvgY(item.heightFromFloor + (item as DrawerItem).drawerHeight);
              return (
                <rect
                  key={item.id}
                  x={rect.x + 2}
                  y={yTop}
                  width={rect.w - 4}
                  height={yBottom - yTop}
                  className={styles.drawerRect}
                />
              );
            }
            return null;
          });
        })}

        {/* Cell interior items for partitioned boxes */}
        {cellInteriorById && partitionsById && Object.entries(cellInteriorById).map(([boxId, cells]) => {
          if (!partitionsById.get(boxId)) return null;
          const rect = geo.boxSvgRects[boxId];
          if (!rect) return null;

          const partitionX = rect.x + rect.w / 2;
          const toSvgY = (h: number) => rect.y + rect.h - h * geo.scale;

          return (
            <g key={`${boxId}-cells`}>
              <line
                x1={partitionX} y1={rect.y}
                x2={partitionX} y2={rect.y + rect.h}
                className={styles.partitionLine}
              />
              {cells.flatMap((cellItems, ci) => {
                const xLeft  = ci === 0 ? partitionX : rect.x;
                const xRight = ci === 0 ? rect.x + rect.w : partitionX;
                return cellItems.map(item => {
                  if (item.type === 'shelf') {
                    const y = toSvgY(item.heightFromFloor);
                    return <line key={item.id} x1={xLeft} y1={y} x2={xRight} y2={y} className={styles.shelfLine} />;
                  }
                  if (item.type === 'rod') {
                    const y = toSvgY(item.heightFromFloor);
                    return <line key={item.id} x1={xLeft} y1={y} x2={xRight} y2={y} className={styles.rodLine} />;
                  }
                  if (item.type === 'drawer') {
                    const yBottom = toSvgY(item.heightFromFloor);
                    const yTop    = toSvgY(item.heightFromFloor + (item as DrawerItem).drawerHeight);
                    return (
                      <rect
                        key={item.id}
                        x={xLeft + 2} y={yTop}
                        width={xRight - xLeft - 4}
                        height={yBottom - yTop}
                        className={styles.drawerRect}
                      />
                    );
                  }
                  return null;
                });
              })}
            </g>
          );
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
