import React, { useRef, useEffect, useState } from 'react';
import type { KitchenUnit } from '../../types/project';
import { calcDoors } from '../../core/doors/doorCalc';
import { computeRowFrontLayout, computeFrontGeometry } from '../../core/geometry/frontGeometry';
import { getMaterial } from '../../catalog';
import styles from './KitchenOverview.module.css';

interface Props {
  units: KitchenUnit[];
  selectedUnitId: string | null;
  onSelect: (id: string) => void;
  onOpenUnit: (id: string) => void;
}

type ViewMode = 'bodies' | 'fronts';

const GAP_CM  = 2;
const PAD_TOP = 36;
const PAD_BOT = 8;
const OVERVIEW_H = 340;
const DRAW_H = OVERVIEW_H - PAD_TOP - PAD_BOT;

function computeScale(units: KitchenUnit[], availableW: number): number {
  if (units.length === 0) return 4;
  const totalW = units.reduce((s, u) => s + u.cabinet.input.W, 0) + (units.length - 1) * GAP_CM;
  const maxH   = Math.max(...units.map(u => u.cabinet.input.H));
  const sx = availableW / totalW;
  const sy = DRAW_H / maxH;
  return Math.min(sx, sy, 8);
}

/** Render a single unit's front panels (doors) in the fronts view. */
function FrontPanels({ unit, layout, scale }: {
  unit: KitchenUnit;
  layout: { x: number; y: number; w: number; h: number; plinthH: number };
  scale: number;
}) {
  const inp = unit.cabinet.input;
  const tFront = getMaterial(inp.frontMaterialId).thickness / 10; // cm
  const forceRows = inp.doorsPerColumn === 'auto' ? undefined : inp.doorsPerColumn as 1 | 2 | 3;
  const dl = calcDoors(inp.W, inp.H, inp.plinth, inp.doorCoversPlinth,
                       inp.lowerDoorH, inp.hasShell, tFront, forceRows);

  if (dl.n === 0) return null;

  const gapCm = inp.doorGapMm / 10;
  const frontLayout = computeRowFrontLayout({
    cabinetW: inp.W,
    hasOuterShell: inp.hasShell,
    shellThicknessCm: tFront,
    totalFrontsInRow: dl.n,
    gapCm,
  });

  const bodyH = layout.h - layout.plinthH; // px
  const doorStartPx = dl.doorStart * scale;
  const panels: React.ReactElement[] = [];

  // Draw each row from bottom to top
  const rows: { heightCm: number; yOffsetFromBottom: number }[] = [];
  if (dl.rows === 1) {
    rows.push({ heightCm: dl.lowerH!, yOffsetFromBottom: dl.doorStart });
  } else if (dl.rows === 2) {
    rows.push({ heightCm: dl.lowerH!, yOffsetFromBottom: dl.doorStart });
    rows.push({ heightCm: dl.upperH!, yOffsetFromBottom: dl.doorStart + dl.lowerH! + 0.2 });
  } else {
    rows.push({ heightCm: dl.lowerH!, yOffsetFromBottom: dl.doorStart });
    rows.push({ heightCm: dl.upperH!, yOffsetFromBottom: dl.doorStart + dl.lowerH! + 0.2 });
    rows.push({ heightCm: dl.topH!, yOffsetFromBottom: dl.doorStart + dl.lowerH! + dl.upperH! + 0.4 });
  }

  rows.forEach((row, ri) => {
    const panelH = row.heightCm * scale;
    // y from bottom of body
    const panelY = layout.y + bodyH - (row.yOffsetFromBottom + row.heightCm) * scale;

    for (let fi = 0; fi < dl.n; fi++) {
      const frontPos = computeFrontGeometry({ globalFrontIndexInRow: fi, layout: frontLayout, gapCm });
      const panelX = layout.x + (frontLayout.cabinetLeftOffset + frontPos.x) * scale;
      const panelW = frontPos.width * scale;

      panels.push(
        <rect
          key={`row${ri}-front${fi}`}
          x={panelX} y={panelY}
          width={Math.max(panelW, 0)}
          height={Math.max(panelH, 0)}
          fill="var(--color-fronts, #e8934a)"
          stroke="var(--color-text-secondary)"
          strokeWidth={0.8}
          opacity={0.85}
        />
      );
    }
  });

  // Shell side panels
  if (inp.hasShell) {
    const shellW = tFront * scale;
    panels.push(
      <rect key="shell-l" x={layout.x} y={layout.y} width={shellW} height={bodyH}
        fill="var(--color-fronts, #e8934a)" stroke="var(--color-text-secondary)" strokeWidth={0.8} opacity={0.7} />,
      <rect key="shell-r" x={layout.x + layout.w - shellW} y={layout.y} width={shellW} height={bodyH}
        fill="var(--color-fronts, #e8934a)" stroke="var(--color-text-secondary)" strokeWidth={0.8} opacity={0.7} />,
    );
  }

  void doorStartPx;
  return <>{panels}</>;
}

export function KitchenOverview({ units, selectedUnitId, onSelect, onOpenUnit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableW, setAvailableW] = useState(800);
  const [viewMode, setViewMode] = useState<ViewMode>('bodies');

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

  // Dimension summary
  const totalW = units.reduce((s, u) => s + u.cabinet.input.W, 0);

  // Compute layout for each unit
  let xCursor = 0;
  const unitLayouts = units.map(u => {
    const inp = u.cabinet.input;
    const uw = inp.W * scale;
    const uh = inp.H * scale;
    const l = {
      x: xCursor,
      y: PAD_TOP + (maxH - inp.H) * scale,
      w: uw,
      h: uh,
      plinthH: inp.plinth * scale,
      sinkOpen: inp.topVariant === 'sink-open',
      tw: (inp.sinkTraverseWidthCm ?? 8) * scale,
    };
    xCursor += uw + GAP_CM * scale;
    return l;
  });

  const svgW = xCursor > 0 ? xCursor - GAP_CM * scale : 10;

  return (
    <div className={styles.wrapper}>
      {/* Toolbar: view toggle + dimensions */}
      <div className={styles.toolbar}>
        <div className={styles.toggle}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'bodies' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('bodies')}
          >
            גופים
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${viewMode === 'fronts' ? styles.toggleBtnActive : ''}`}
            onClick={() => setViewMode('fronts')}
          >
            חזיתות
          </button>
        </div>

        {units.length > 0 && (
          <div className={styles.dimBar}>
            <span>רוחב כולל: <strong>{totalW} ס"מ</strong></span>
            <span className={styles.dimSep}>|</span>
            <span>גובה: <strong>{maxH} ס"מ</strong></span>
            <span className={styles.dimSep}>|</span>
            <span><strong>{units.length}</strong> גופים</span>
          </div>
        )}
      </div>

      {/* SVG canvas */}
      <div ref={containerRef} className={styles.container}>
        {units.length === 0 ? (
          <div className={styles.empty}>הוסף גופים כדי לראות את המטבח</div>
        ) : (
          <svg
            width={svgW}
            height={OVERVIEW_H}
            viewBox={`0 0 ${svgW} ${OVERVIEW_H}`}
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
                      rx={3} fill="none"
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

                  {/* Cabinet body outline */}
                  <rect
                    x={l.x} y={l.y}
                    width={l.w} height={bodyH}
                    fill={selected ? '#f0f7ff' : 'var(--color-surface)'}
                    stroke={selected ? 'var(--color-primary)' : 'var(--color-text-secondary)'}
                    strokeWidth={selected ? 1.5 : 1}
                  />

                  {/* Sink-open indicator */}
                  {l.sinkOpen && (
                    <>
                      <line x1={l.x} y1={l.y} x2={l.x + l.w} y2={l.y}
                        stroke="var(--color-text-secondary)" strokeWidth={1} strokeDasharray="4 4" />
                      <rect x={l.x} y={l.y} width={l.w} height={l.tw}
                        fill="var(--color-surface-raised)" stroke="var(--color-text-secondary)" strokeWidth={1} />
                      <rect x={l.x} y={l.y + l.tw + 2} width={l.w} height={l.tw}
                        fill="var(--color-surface-raised)" stroke="var(--color-text-secondary)" strokeWidth={1} />
                    </>
                  )}

                  {/* Fronts overlay (fronts view mode) */}
                  {viewMode === 'fronts' && !l.sinkOpen && (
                    <FrontPanels unit={unit} layout={l} scale={scale} />
                  )}

                  {/* Unit number badge */}
                  <circle cx={l.x + 12} cy={l.y + 12} r={10}
                    fill={selected ? 'var(--color-primary)' : 'var(--color-surface-raised)'}
                    stroke={selected ? 'var(--color-primary)' : 'var(--color-border)'}
                    strokeWidth={1}
                  />
                  <text x={l.x + 12} y={l.y + 12}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={9} fontWeight="600"
                    fill={selected ? 'white' : 'var(--color-text-secondary)'}
                  >
                    {i + 1}
                  </text>

                  {/* Labels */}
                  <text x={l.x + l.w / 2} y={l.y - 18}
                    textAnchor="middle" fontSize={10}
                    fill="var(--color-text-primary)"
                    fontWeight={selected ? '600' : '400'}
                  >
                    {unit.name}
                  </text>
                  <text x={l.x + l.w / 2} y={l.y - 6}
                    textAnchor="middle" fontSize={8.5}
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
    </div>
  );
}
