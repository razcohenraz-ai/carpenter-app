import React from 'react';
import type { Box } from '../../types/geometry';
import type { Material } from '../../types/materials';
import { buildPlinthBoardModel, calcPlinthGables } from '../../core/boards/boardModel';
import { useTranslation } from '../hooks/useTranslation';
import styles from './PlinthEditor.module.css';

interface Props {
  cabinetW: number;
  cabinetD: number;
  plinthHeight: number;
  /** Bottom-row body boxes (excluding plinth boxes themselves). */
  boxes: Box[];
  bodyMaterial: Material;
  /** Close handler — returns to the main view. */
  onBack: () => void;
}

// SVG canvas dimensions — the cabinet rectangle is scaled to fit inside this
// box with margin for dimension labels.
const SVG_W = 600;
const SVG_H = 360;
const PAD_LEFT = 70;
const PAD_RIGHT = 30;
const PAD_TOP = 50;
const PAD_BOTTOM = 50;

export default function PlinthEditor({
  cabinetW, cabinetD, plinthHeight, boxes, bodyMaterial, onBack,
}: Props): React.JSX.Element {
  const { t } = useTranslation();

  if (plinthHeight <= 0 || cabinetW <= 0 || cabinetD <= 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            ← {t.interior.back}
          </button>
        </div>
        <div className={styles.placeholder}>
          <span className={styles.hint}>{t.sketch.invalidDimensions}</span>
        </div>
      </div>
    );
  }

  const tBody = bodyMaterial.thickness / 10;
  const boards = buildPlinthBoardModel({
    cabinetW, cabinetD, plinthHeight, bodyMaterial, boxes,
  });
  const gables = calcPlinthGables(cabinetW, boxes, tBody);

  // Fit cabinet inside the drawable area, preserving aspect ratio.
  const drawW = SVG_W - PAD_LEFT - PAD_RIGHT;
  const drawH = SVG_H - PAD_TOP - PAD_BOTTOM;
  const scale = Math.min(drawW / cabinetW, drawH / cabinetD);
  const cabPxW = cabinetW * scale;
  const cabPxD = cabinetD * scale;
  const originX = PAD_LEFT + (drawW - cabPxW) / 2;
  const originY = PAD_TOP + (drawH - cabPxD) / 2;

  function rectPx(xFrom: number, xTo: number, yFrom: number, yTo: number) {
    return {
      x: originX + xFrom * scale,
      y: originY + yFrom * scale,
      w: (xTo - xFrom) * scale,
      h: (yTo - yFrom) * scale,
    };
  }

  // Joint x-positions to draw a dashed body-boundary marker (helps the user
  // see WHY a gable sits where it does).
  const jointXs = gables
    .filter(g => g.kind === 'joint')
    .map(g => g.xAnchor);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          ← {t.interior.back}
        </button>
        <p className={styles.title}>{t.cutsList.plinthEditorTitle}</p>
        <span className={styles.headerSpacer} />
      </div>
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className={styles.svg}
        role="img"
        aria-label={t.cutsList.plinthEditorTitle}
      >
        {/* Cabinet outline (plinth footprint in plan view) */}
        <rect
          x={originX} y={originY}
          width={cabPxW} height={cabPxD}
          className={styles.cabinetOutline}
        />

        {/* Body-boundary dashed verticals */}
        {jointXs.map((x, i) => (
          <line
            key={`joint-${i}`}
            x1={originX + x * scale} y1={originY}
            x2={originX + x * scale} y2={originY + cabPxD}
            className={styles.jointMarker}
          />
        ))}

        {/* Plinth boards — front, back, and gables */}
        {boards.map(b => {
          const r = rectPx(b.xFrom, b.xTo, b.yFrom, b.yTo);
          let cls = styles.boardOther;
          if (b.role === 'plinth-front' || b.role === 'plinth-back') cls = styles.boardStrip;
          else if (b.role === 'plinth-gable-a') cls = styles.boardGableA;
          else if (b.role === 'plinth-gable-b') cls = styles.boardGableB;
          return (
            <rect
              key={b.id}
              x={r.x} y={r.y} width={r.w} height={r.h}
              className={cls}
              data-role={b.role}
            />
          );
        })}

        {/* Width label (top) */}
        <text
          x={originX + cabPxW / 2} y={originY - 16}
          className={`${styles.dimLabel} ${styles.dimLabelWidth}`}
          textAnchor="middle"
        >
          {cabinetW.toFixed(1)}
        </text>

        {/* Depth label (left, rotated) */}
        <text
          x={PAD_LEFT / 2} y={originY + cabPxD / 2}
          className={`${styles.dimLabel} ${styles.dimLabelDepth}`}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90, ${PAD_LEFT / 2}, ${originY + cabPxD / 2})`}
        >
          {cabinetD.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}
