import { useRef, useEffect, useState } from 'react';
import type { KitchenUnit } from '../../types/project';
import styles from './KitchenOverview.module.css';

interface Props {
  units: KitchenUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  onOpenUnit: (id: string) => void;
}

const GAP_CM  = 2;    // gap between units (cm, same scale)
const PAD_TOP = 36;   // px — room for labels above
const PAD_BOT = 8;    // px
const OVERVIEW_H = 340; // total SVG height (px)
const DRAW_H = OVERVIEW_H - PAD_TOP - PAD_BOT; // drawable height

/** Derive a uniform px/cm scale from the units and available width. */
function computeScale(units: KitchenUnit[], availableW: number): number {
  if (units.length === 0) return 4;
  const totalW = units.reduce((s, u) => s + u.cabinet.input.W, 0) + (units.length - 1) * GAP_CM;
  const maxH   = Math.max(...units.map(u => u.cabinet.input.H));
  const sx = availableW / totalW;
  const sy = DRAW_H / maxH;
  return Math.min(sx, sy, 8); // cap at 8px/cm to avoid huge scales
}

export function KitchenOverview({ units, selectedUnitId, onSelect, onOpenUnit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableW, setAvailableW] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setAvailableW(w);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const scale = computeScale(units, availableW);
  const maxH  = units.length ? Math.max(...units.map(u => u.cabinet.input.H)) : 90;
  const svgH  = OVERVIEW_H;

  // Compute x positions for each unit
  let xCursor = 0;
  const unitLayouts = units.map(u => {
    const inp = u.cabinet.input;
    const uw = inp.W * scale;
    const uh = inp.H * scale;
    const layout = {
      x: xCursor,
      y: PAD_TOP + (maxH - inp.H) * scale, // baseline-align
      w: uw,
      h: uh,
      plinthH: inp.plinth * scale,
      sinkOpen: inp.topVariant === 'sink-open',
      tw: (inp.sinkTraverseWidthCm ?? 8) * scale,
    };
    xCursor += uw + GAP_CM * scale;
    return layout;
  });

  const svgW = xCursor > 0 ? xCursor - GAP_CM * scale : 10;

  return (
    <div ref={containerRef} className={styles.container}>
      {units.length === 0 ? (
        <div className={styles.empty}>הוסף גופים כדי לראות את המטבח</div>
      ) : (
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className={styles.svg}
          style={{ maxWidth: '100%' }}
        >
          {units.map((unit, i) => {
            const l = unitLayouts[i]!;
            const selected = unit.id === selectedUnitId;
            const bodyH = l.h - l.plinthH;

            return (
              <g
                key={unit.id}
                className={styles.unitGroup}
                onClick={() => onSelect(unit.id)}
                onDoubleClick={() => onOpenUnit(unit.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Selection highlight */}
                {selected && (
                  <rect
                    x={l.x - 3} y={l.y - 3}
                    width={l.w + 6} height={l.h + 6}
                    rx={3}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth={2.5}
                    strokeDasharray="6 3"
                  />
                )}

                {/* Plinth */}
                {l.plinthH > 0 && (
                  <rect
                    x={l.x} y={l.y + bodyH}
                    width={l.w} height={l.plinthH}
                    fill="var(--color-surface-raised)"
                    stroke="var(--color-text-secondary)"
                    strokeWidth={1}
                  />
                )}

                {/* Cabinet body */}
                <rect
                  x={l.x} y={l.y}
                  width={l.w} height={bodyH}
                  fill={selected ? '#f0f7ff' : 'var(--color-surface)'}
                  stroke={selected ? 'var(--color-primary)' : 'var(--color-text-secondary)'}
                  strokeWidth={selected ? 1.5 : 1}
                />

                {/* Sink-open indicator: dashed top line + two traverse rects */}
                {l.sinkOpen ? (
                  <>
                    {/* Open top — dashed */}
                    <line
                      x1={l.x} y1={l.y}
                      x2={l.x + l.w} y2={l.y}
                      stroke="var(--color-text-secondary)"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    {/* Front traverse */}
                    <rect
                      x={l.x} y={l.y}
                      width={l.w} height={l.tw}
                      fill="var(--color-surface-raised)"
                      stroke="var(--color-text-secondary)"
                      strokeWidth={1}
                    />
                    {/* Back traverse (same visual position, labelled) */}
                    <rect
                      x={l.x} y={l.y + l.tw + 2}
                      width={l.w} height={l.tw}
                      fill="var(--color-surface-raised)"
                      stroke="var(--color-text-secondary)"
                      strokeWidth={1}
                    />
                    {/* Open space indicator */}
                    <line
                      x1={l.x + l.w * 0.3} y1={l.y + l.tw * 2 + 6}
                      x2={l.x + l.w * 0.7} y2={l.y + l.tw * 2 + 6}
                      stroke="var(--color-text-muted)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  </>
                ) : (
                  /* Standard top: solid top line already drawn by rect */
                  null
                )}

                {/* Unit number badge */}
                <circle
                  cx={l.x + 12} cy={l.y + 12}
                  r={10}
                  fill={selected ? 'var(--color-primary)' : 'var(--color-surface-raised)'}
                  stroke={selected ? 'var(--color-primary)' : 'var(--color-border)'}
                  strokeWidth={1}
                />
                <text
                  x={l.x + 12} y={l.y + 12}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={9}
                  fontWeight="600"
                  fill={selected ? 'white' : 'var(--color-text-secondary)'}
                >
                  {i + 1}
                </text>

                {/* Dimension label: W × H */}
                <text
                  x={l.x + l.w / 2} y={l.y - 18}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-text-primary)"
                  fontWeight={selected ? '600' : '400'}
                >
                  {unit.name}
                </text>
                <text
                  x={l.x + l.w / 2} y={l.y - 6}
                  textAnchor="middle"
                  fontSize={8.5}
                  fill="var(--color-text-secondary)"
                >
                  {unit.cabinet.input.W}×{unit.cabinet.input.H}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
