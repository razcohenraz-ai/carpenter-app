import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { isValidSketchInput, computeSketchGeometry } from './CabinetSketch.utils';
import styles from './CabinetSketch.module.css';

interface Props {
  W: string;
  H: string;
  plinth: string;
}

export default function CabinetSketch({ W, H, plinth }: Props): React.JSX.Element {
  const { t } = useTranslation();

  if (!isValidSketchInput(W, H, plinth)) {
    return (
      <div className={styles.placeholder}>
        <span className={styles.hint}>{t.sketch.invalidDimensions}</span>
      </div>
    );
  }

  const geo = computeSketchGeometry(parseFloat(W), parseFloat(H), parseFloat(plinth));

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

        {/* Width label */}
        <text
          x={geo.wLabel.x}
          y={geo.wLabel.y}
          className={styles.dimLabel}
          textAnchor="middle"
          dominantBaseline="auto"
        >
          {geo.wLabel.text}
        </text>

        {/* Height label — rotated 90° on the left side */}
        <text
          x={geo.hLabel.x}
          y={geo.hLabel.y}
          className={styles.dimLabel}
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
