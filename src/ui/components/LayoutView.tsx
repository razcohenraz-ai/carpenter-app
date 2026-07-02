import React, { useState } from 'react';
import type { CutItem } from '../../types/cuts';
import type { CustomMaterial, MaterialId } from '../../types/materials';
import { getMaterialWithCustom } from '../../catalog';
import {
  layoutSheets,
  expandPieces,
  type LayoutPiece,
  type PlacedPiece,
  type SheetLayoutResult,
} from '../../core/cuts/sheetLayout';
import { useTranslation } from '../hooks/useTranslation';
import styles from './LayoutView.module.css';

interface LayoutViewProps {
  cuts: CutItem[];
  customMaterials?: CustomMaterial[];
}

/** Big plate offered when a part is too long for the standard sheet, cm. */
const BIG_PLATE_CM = { w: 305, h: 122 };

/** Display scale: SVG px per real mm. A 244cm plate → ~488px wide. */
const PX_PER_MM = 0.2;

/** Fill per cut-group so the carpenter tells part kinds apart on the plate. */
const GROUP_FILL: Record<string, string> = {
  shell: '#d9c3a1',
  body: '#ebdcc0',
  door: '#f1caa0',
  front: '#f1caa0',
  drawer: '#cfe0d1',
  back: '#c9d8e8',
  plinth: '#e3cede',
};
const DEFAULT_FILL = '#ebdcc0';

// ── grouping ─────────────────────────────────────────────────────────────────

interface CutGroupBucket {
  key: string;
  materialId: MaterialId | string | null;
  note: string | undefined;
  cuts: CutItem[];
}

/** Group by material AND thickness note: a 6mm back and an 18mm side share a
 *  material id but are cut from different stock, so they get separate plates. */
function groupForLayout(cuts: CutItem[]): CutGroupBucket[] {
  const buckets = new Map<string, CutGroupBucket>();
  for (const c of cuts) {
    const matKey = c.materialId ?? '__none__';
    const key = `${matKey}|${c.note ?? ''}`;
    let b = buckets.get(key);
    if (!b) {
      b = { key, materialId: c.materialId ?? null, note: c.note, cuts: [] };
      buckets.set(key, b);
    }
    b.cuts.push(c);
  }
  return [...buckets.values()];
}

// ── SVG plate ────────────────────────────────────────────────────────────────

function fillFor(tag: string | undefined): string {
  return (tag && GROUP_FILL[tag]) || DEFAULT_FILL;
}

function Plate({
  sheet,
  r,
  rotatedTag,
}: {
  sheet: SheetLayoutResult['sheets'][number];
  r: SheetLayoutResult;
  rotatedTag: string;
}): React.JSX.Element {
  const S = PX_PER_MM;
  // Portrait display: the long (grain / 244 cm) axis is drawn VERTICALLY so
  // parts stand with the grain bottom-to-top, as on the real board. Engine
  // coords have x along the long axis and y along the short axis, so we
  // transpose for the screen: engine-x → screen-y, engine-y → screen-x.
  const dispW = r.sheetH; // short axis → horizontal
  const dispH = r.sheetW; // long (grain) axis → vertical
  const wPx = dispW * S;
  const hPx = dispH * S;
  // Faint vertical grain lines across the usable area (visual grain cue).
  const grainLines: number[] = [];
  for (let gx = r.trim + 200; gx < r.trim + r.usableH; gx += 200) grainLines.push(gx);
  return (
    <svg className={styles.plate} width={wPx} height={hPx} viewBox={`0 0 ${dispW} ${dispH}`} role="img">
      {/* full plate */}
      <rect x={0} y={0} width={dispW} height={dispH} className={styles.plateRect} vectorEffect="non-scaling-stroke" />
      {grainLines.map((gx, i) => (
        <line
          key={`g${i}`}
          x1={gx}
          y1={r.trim}
          x2={gx}
          y2={r.trim + r.usableW}
          className={styles.grainLine}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* usable area after straightening trim */}
      <rect x={r.trim} y={r.trim} width={r.usableH} height={r.usableW} className={styles.usableRect} vectorEffect="non-scaling-stroke" />
      {sheet.pieces.map((p: PlacedPiece) => {
        const sx = r.trim + p.y; // engine-y → screen-x
        const sy = r.trim + p.x; // engine-x → screen-y
        const sw = p.h; // short → horizontal extent
        const sh = p.w; // long → vertical extent
        const showLabel = sw * S >= 46 && sh * S >= 20;
        const showDims = showLabel && sh * S >= 34;
        return (
          <g key={p.id}>
            <rect x={sx} y={sy} width={sw} height={sh} fill={fillFor(p.tag)} className={styles.pieceRect} vectorEffect="non-scaling-stroke">
              <title>
                {p.label} — {(p.w / 10).toFixed(1)}×{(p.h / 10).toFixed(1)}
                {p.rotated ? ` (${rotatedTag})` : ''}
              </title>
            </rect>
            {showLabel && (
              <text x={sx + sw / 2} y={sy + sh / 2} className={styles.pieceLabel} textAnchor="middle">
                <tspan x={sx + sw / 2} dy={showDims ? '-0.2em' : '0.32em'} fontSize={46}>
                  {p.label}
                  {p.rotated ? ' ⟳' : ''}
                </tspan>
                {showDims && (
                  <tspan x={sx + sw / 2} dy="1.15em" fontSize={38} className={styles.pieceDims}>
                    {(p.w / 10).toFixed(1)}×{(p.h / 10).toFixed(1)}
                  </tspan>
                )}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── main view ────────────────────────────────────────────────────────────────

export default function LayoutView({ cuts, customMaterials }: LayoutViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const [locked, setLocked] = useState(false);
  // Per-material plate choice: false = standard (material sheet), true = 305×122.
  const [bigPlate, setBigPlate] = useState<Record<string, boolean>>({});

  const groups = groupForLayout(cuts);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t.layout.title}</h3>
        <button
          type="button"
          className={`${styles.lockBtn} ${locked ? styles.lockBtnActive : ''}`}
          onClick={() => setLocked((v) => !v)}
          title={t.layout.lockRotation}
        >
          {locked ? '🔒' : '🔓'} {locked ? t.layout.rotationLocked : t.layout.lockRotation}
        </button>
      </div>

      {groups.length > 0 && <p className={styles.grainNote}>{t.layout.grainNote}</p>}
      {groups.length === 0 && <p className={styles.empty}>{t.layout.empty}</p>}

      {groups.map((g) => {
        const isBig = bigPlate[g.key] ?? false;
        let name: string;
        let plateCm: { w: number; h: number };
        if (g.materialId !== null) {
          const mat = getMaterialWithCustom(g.materialId, customMaterials ?? []);
          name = mat.name;
          plateCm = { w: mat.sheetW, h: mat.sheetH };
        } else {
          name = t.cutsList.noMaterial;
          plateCm = { w: 244, h: 122 };
        }
        if (isBig) plateCm = BIG_PLATE_CM;
        if (g.note) name = `${name} · ${g.note}`;

        // Expand every cut × qty into individual pieces; tag = cut group (colour).
        const pieces: LayoutPiece[] = g.cuts.flatMap((c, i) =>
          expandPieces({ name: c.name, w: c.w, h: c.h, qty: c.qty, ...(c.group ? { tag: c.group } : {}) }, `${g.key}:${i}`),
        );
        const r = layoutSheets(pieces, {
          sheetW: plateCm.w * 10,
          sheetH: plateCm.h * 10,
          allowRotation: !locked,
        });
        const utilPct = Math.round(r.utilization * 100);

        return (
          <div key={g.key} className={styles.group}>
            <div className={styles.groupHeader}>
              <h4 className={styles.groupTitle}>{name}</h4>
              <div className={styles.groupMeta}>
                <span className={styles.badge}>{t.layout.sheetsCount.replace('{n}', String(r.sheets.length))}</span>
                {r.sheets.length > 0 && (
                  <span className={styles.badge}>{t.layout.utilization.replace('{p}', String(utilPct))}</span>
                )}
                <button
                  type="button"
                  className={styles.plateBtn}
                  onClick={() => setBigPlate((m) => ({ ...m, [g.key]: !isBig }))}
                >
                  {isBig ? t.layout.useStandardPlate : t.layout.useBigPlate}
                </button>
              </div>
            </div>

            <div className={styles.plates}>
              {r.sheets.map((sheet, i) => (
                <div key={i} className={styles.plateWrap}>
                  <div className={styles.plateCaption}>
                    {t.layout.plateN.replace('{n}', String(i + 1))} · {Math.round(sheet.usedRatio * 100)}%
                  </div>
                  <Plate sheet={sheet} r={r} rotatedTag={t.layout.rotatedTag} />
                </div>
              ))}
            </div>

            {r.oversize.length > 0 && (
              <div className={styles.oversize}>
                <div className={styles.oversizeTitle}>{t.layout.oversizeTitle}</div>
                <ul className={styles.oversizeList}>
                  {r.oversize.map((p) => (
                    <li key={p.id}>
                      {p.label} — {(p.w / 10).toFixed(1)}×{(p.h / 10).toFixed(1)}
                    </li>
                  ))}
                </ul>
                <p className={styles.oversizeHint}>{isBig ? t.layout.oversizeHint : t.layout.oversizeBigPlateHint}</p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
