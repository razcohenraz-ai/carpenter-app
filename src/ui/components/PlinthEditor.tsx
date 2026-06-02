import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Box } from '../../types/geometry';
import type { Material, CustomMaterial } from '../../types/materials';
import {
  buildPlinthBoardModel,
  calcPlinthGables,
  clampPlinthGableX,
  defaultPlinthGableLeftX,
  effectivePlinthGableLeftX,
  getDimension,
  snapPlinthGableX,
  type Board,
  type BoardOverrides,
  type PlinthGable,
} from '../../core/boards/boardModel';
import { formatDim } from '../../core/utils/round';
import { useTranslation } from '../hooks/useTranslation';
import styles from './PlinthEditor.module.css';

interface Props {
  cabinetW: number;
  /** Carcass depth (= D − backThickness − HINGE_GAP − tFront) — the same
   *  value `useCabinet` feeds into `buildPlinthBoardModel`. Drives both the
   *  plan-view scale and the depth label, so the editor and the cut list
   *  read the same number. */
  cabinetD: number;
  plinthHeight: number;
  /** Front-cladding setback (cm). 0 = flush with the cabinet front. */
  plinthRecess: number;
  /** Bottom-row body boxes (excluding plinth boxes themselves). */
  boxes: Box[];
  bodyMaterial: Material | CustomMaterial;
  /** Front material — drives the plinth cladding panel. */
  frontMaterial: Material | CustomMaterial;
  /** User-set Panel-A x overrides keyed by `PlinthGable.id`. */
  gableOverrides: ReadonlyMap<string, number>;
  /** Per-board override layer (length / width / thickness / materialId).
   *  Consumed via `getDimension` / `getMaterial` so the dim labels and the
   *  cut list always agree on the effective value of each plinth board. */
  boardOverrides: ReadonlyMap<string, BoardOverrides>;
  /** Set or clear (`x === undefined`) a single gable's override. */
  onSetGableOverride: (gableId: string, x: number | undefined) => void;
  /** Drop every override at once. */
  onResetGables: () => void;
  /** Commit a new plinth height (cm). Triggers a full re-calculate upstream. */
  onPlinthHeightChange: (h: number) => void;
  /** Commit a new recess depth (cm). Pass 0 to disable the recess. */
  onPlinthRecessChange: (cm: number) => void;
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

/** Floor below which the plinth height is rejected — anything thinner is not
 *  a real plinth, and the carcass needs the clearance for plastic levelers. */
const MIN_PLINTH_HEIGHT_CM = 3;

interface DragState {
  gableId: string;
  /** Cursor → Panel-A-left-edge offset captured at mousedown, so the
   *  cursor stays glued to the spot the user grabbed. */
  cursorOffsetCm: number;
  /** Live (uncommitted) Panel-A left edge in cm. */
  proposedX: number;
  /** What the override was BEFORE the drag started — restored on ESC. */
  originalOverride: number | undefined;
}

export default function PlinthEditor({
  cabinetW, cabinetD, plinthHeight, plinthRecess, boxes, bodyMaterial, frontMaterial,
  gableOverrides, boardOverrides, onSetGableOverride, onResetGables, onPlinthHeightChange,
  onPlinthRecessChange, onBack,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Local controlled state for the height input — committed on blur/Enter.
  const [heightInput, setHeightInput] = useState<string>(String(plinthHeight));
  useEffect(() => {
    setHeightInput(String(plinthHeight));
  }, [plinthHeight]);

  function commitHeight(): void {
    const h = parseFloat(heightInput);
    if (Number.isFinite(h) && h >= MIN_PLINTH_HEIGHT_CM && h !== plinthHeight) {
      onPlinthHeightChange(h);
    } else {
      // Invalid or unchanged — revert the input to the live value.
      setHeightInput(String(plinthHeight));
    }
  }

  // Recess: a checkbox decides whether the recess is active. While the
  // checkbox is OFF, upstream stores 0; the local input value is kept so
  // toggling back ON restores the user's last setting without retyping.
  const [recessEnabled, setRecessEnabled] = useState<boolean>(plinthRecess > 0);
  const [recessInput, setRecessInput] = useState<string>(plinthRecess > 0 ? String(plinthRecess) : '5');
  useEffect(() => {
    if (plinthRecess > 0) {
      setRecessEnabled(true);
      setRecessInput(String(plinthRecess));
    } else {
      setRecessEnabled(false);
      // Don't clear `recessInput` — keep the last typed value so a toggle
      // back resumes where the user left off.
    }
  }, [plinthRecess]);

  function commitRecess(): void {
    if (!recessEnabled) return;
    const r = parseFloat(recessInput);
    if (Number.isFinite(r) && r > 0 && r !== plinthRecess) {
      onPlinthRecessChange(r);
    } else {
      // Invalid or unchanged — revert the input to the live value.
      setRecessInput(plinthRecess > 0 ? String(plinthRecess) : recessInput);
    }
  }

  function toggleRecess(next: boolean): void {
    setRecessEnabled(next);
    if (next) {
      const r = parseFloat(recessInput);
      onPlinthRecessChange(Number.isFinite(r) && r > 0 ? r : 5);
    } else {
      onPlinthRecessChange(0);
    }
  }

  const [drag, setDrag] = useState<DragState | null>(null);

  // ── Geometry ───────────────────────────────────────────────────────────────
  const tBody = bodyMaterial.thickness / 10;

  // Effective overrides include the in-flight drag so the live preview reads
  // straight from buildPlinthBoardModel (single source of truth — no separate
  // rendering path for the dragged gable).
  const effectiveOverrides = useMemo<ReadonlyMap<string, number>>(() => {
    if (!drag) return gableOverrides;
    const m = new Map(gableOverrides);
    m.set(drag.gableId, drag.proposedX);
    return m;
  }, [gableOverrides, drag]);

  const invalidInputs = plinthHeight <= 0 || cabinetW <= 0 || cabinetD <= 0;
  const drawW = SVG_W - PAD_LEFT - PAD_RIGHT;
  const drawH = SVG_H - PAD_TOP - PAD_BOTTOM;
  const scale = !invalidInputs ? Math.min(drawW / cabinetW, drawH / cabinetD) : 1;
  const cabPxW = cabinetW * scale;
  const cabPxD = cabinetD * scale;
  const originX = PAD_LEFT + (drawW - cabPxW) / 2;
  const originY = PAD_TOP + (drawH - cabPxD) / 2;

  const gables = useMemo(
    () => (invalidInputs ? [] : calcPlinthGables(cabinetW, boxes, tBody)),
    [invalidInputs, cabinetW, boxes, tBody],
  );

  const boards = useMemo(
    () => (invalidInputs ? [] : buildPlinthBoardModel({
      cabinetW, cabinetD, plinthHeight, bodyMaterial: bodyMaterial as import('../../types/materials').Material, boxes,
      frontMaterial: frontMaterial as import('../../types/materials').Material,
      gableOverrides: effectiveOverrides,
      ...(plinthRecess > 0 ? { recessCm: plinthRecess } : {}),
    })),
    [invalidInputs, cabinetW, cabinetD, plinthHeight, bodyMaterial, frontMaterial,
     boxes, effectiveOverrides, plinthRecess],
  );

  // ── Dimension labels (sourced from the model, not re-derived here) ───────
  // The depth label runs from the front-most face (cladding when present,
  // else plinth-front) to plinth-back. The width label is the plinth-back's
  // effective `length` via `getDimension` so a board-level override is
  // reflected on the editor's canvas the moment the user sets it.
  const plinthBack = boards.find((b: Board) => b.role === 'plinth-back');
  const plinthFrontMost =
       boards.find((b: Board) => b.role === 'plinth-front-cladding')
    ?? boards.find((b: Board) => b.role === 'plinth-front');
  const widthLabel = plinthBack
    ? getDimension(plinthBack, 'length', boardOverrides)
    : cabinetW;
  const depthLabel = (plinthBack && plinthFrontMost)
    ? plinthBack.yTo - plinthFrontMost.yFrom
    : Math.max(0, cabinetD - plinthRecess);

  // ── Drag handlers ──────────────────────────────────────────────────────────
  // SVG → cabinet-cm conversion uses the live bounding rect because the SVG
  // is responsive; the viewBox-to-pixel ratio depends on the rendered width.
  function clientToCm(clientX: number): number | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    const vbScale = rect.width / SVG_W;
    const svgX = (clientX - rect.left) / vbScale;
    return (svgX - originX) / scale;
  }

  function handleGableMouseDown(gable: PlinthGable, e: React.MouseEvent): void {
    e.preventDefault();
    const cursorCm = clientToCm(e.clientX);
    if (cursorCm === null) return;
    const override = gableOverrides.get(gable.id);
    const annotated: PlinthGable = override !== undefined
      ? { ...gable, userPositionX: override }
      : gable;
    const currentX = effectivePlinthGableLeftX(annotated, tBody, cabinetW);
    setDrag({
      gableId: gable.id,
      cursorOffsetCm: cursorCm - currentX,
      proposedX: currentX,
      originalOverride: override,
    });
  }

  // Window-level move/up/key listeners — only mounted while dragging so the
  // drag tracks even when the cursor leaves the SVG and ESC works globally.
  useEffect(() => {
    if (!drag) return;
    function onMove(ev: MouseEvent): void {
      const cursorCm = clientToCm(ev.clientX);
      if (cursorCm === null) return;
      const raw = cursorCm - drag!.cursorOffsetCm;
      const snapped = snapPlinthGableX(raw);
      const clamped = clampPlinthGableX({
        proposedX: snapped,
        gableId: drag!.gableId,
        allGables: gables.map(g => {
          const o = gableOverrides.get(g.id);
          return o !== undefined ? { ...g, userPositionX: o } : g;
        }),
        cabinetW, tBody,
      });
      setDrag(prev => prev ? { ...prev, proposedX: clamped } : prev);
    }
    function onUp(): void {
      setDrag(prev => {
        if (prev) onSetGableOverride(prev.gableId, prev.proposedX);
        return null;
      });
    }
    function onKey(ev: KeyboardEvent): void {
      if (ev.key !== 'Escape') return;
      setDrag(prev => {
        if (prev) onSetGableOverride(prev.gableId, prev.originalOverride);
        return null;
      });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, gables, gableOverrides, cabinetW, tBody, scale, originX]);

  // ── Render helpers ─────────────────────────────────────────────────────────
  function rectPx(xFrom: number, xTo: number, yFrom: number, yTo: number) {
    return {
      x: originX + xFrom * scale,
      y: originY + yFrom * scale,
      w: (xTo - xFrom) * scale,
      h: (yTo - yFrom) * scale,
    };
  }

  // Joint x-positions to draw a dashed body-boundary marker (helps the user
  // see WHY a gable sits where it does, even after dragging).
  const jointXs = gables.filter(g => g.kind === 'joint').map(g => g.xAnchor);

  // Header (always rendered, even on invalid inputs).
  const header = (
    <div className={styles.header}>
      <button type="button" className={styles.backBtn} onClick={onBack}>
        ← {t.interior.back}
      </button>
      <p className={styles.title}>{t.cutsList.plinthEditorTitle}</p>
      <div className={styles.headerActions}>
        <label className={styles.heightField}>
          <span className={styles.heightLabel}>{t.cutsList.plinthHeightLabel}</span>
          <input
            type="number"
            className={styles.heightInput}
            value={heightInput}
            min={MIN_PLINTH_HEIGHT_CM}
            step={0.5}
            onChange={e => setHeightInput(e.target.value)}
            onBlur={commitHeight}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitHeight(); }
            }}
          />
        </label>
        <label className={styles.recessToggle}>
          <input
            type="checkbox"
            checked={recessEnabled}
            onChange={e => toggleRecess(e.target.checked)}
          />
          <span>{t.cutsList.plinthRecessedLabel}</span>
        </label>
        {recessEnabled && (
          <label className={styles.heightField}>
            <span className={styles.heightLabel}>{t.cutsList.plinthRecessLabel}</span>
            <input
              type="number"
              className={styles.heightInput}
              value={recessInput}
              min={0.5}
              step={0.5}
              onChange={e => setRecessInput(e.target.value)}
              onBlur={commitRecess}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitRecess(); }
              }}
            />
          </label>
        )}
        <button
          type="button"
          className={styles.resetBtn}
          onClick={onResetGables}
          disabled={gableOverrides.size === 0}
          title={t.cutsList.plinthResetGablesTooltip}
        >
          {t.cutsList.plinthResetGables}
        </button>
      </div>
    </div>
  );

  if (invalidInputs) {
    return (
      <div className={styles.wrapper}>
        {header}
        <div className={styles.placeholder}>
          <span className={styles.hint}>{t.sketch.invalidDimensions}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {header}
      <svg
        ref={svgRef}
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

        {/* Plinth boards — cladding, front, back, and gables */}
        {boards.map(b => {
          const r = rectPx(b.xFrom, b.xTo, b.yFrom, b.yTo);
          let cls = styles.boardOther;
          if (b.role === 'plinth-front-cladding') cls = styles.boardCladding;
          else if (b.role === 'plinth-front' || b.role === 'plinth-back') cls = styles.boardStrip;
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

        {/* Drag hit-boxes — one per Panel A. Slightly wider than Panel A for
            usable hit area; transparent fill so they don't repaint over the
            visible board rendering. */}
        {gables.map(g => {
          const liveOverride = drag && drag.gableId === g.id
            ? drag.proposedX
            : effectiveOverrides.get(g.id);
          const annotated: PlinthGable = liveOverride !== undefined
            ? { ...g, userPositionX: liveOverride }
            : g;
          const aLeftX = effectivePlinthGableLeftX(annotated, tBody, cabinetW);
          // Hit area: Panel A's footprint expanded by a couple of px each side.
          const hitX = originX + aLeftX * scale - 4;
          const hitW = tBody * scale + 8;
          return (
            <rect
              key={`hit-${g.id}`}
              x={hitX} y={originY + tBody * scale}
              width={hitW} height={(cabinetD - 2 * tBody) * scale}
              className={`${styles.gableHit} ${drag?.gableId === g.id ? styles.gableHitDragging : ''}`}
              onMouseDown={e => handleGableMouseDown(g, e)}
              data-gable-id={g.id}
            />
          );
        })}

        {/* Width label (top) — pulled from the plinth-back board's effective
            length (via `getDimension`) so an override is reflected. */}
        <text
          x={originX + cabPxW / 2} y={originY - 16}
          className={`${styles.dimLabel} ${styles.dimLabelWidth}`}
          textAnchor="middle"
        >
          {formatDim(widthLabel)}
        </text>

        {/* Depth label (left, rotated) — derived from the boards: the depth
            from the front-most face (cladding when present, else
            plinth-front) to the plinth-back's far face. No carcassD
            arithmetic in this component. */}
        <text
          x={PAD_LEFT / 2} y={originY + cabPxD / 2}
          className={`${styles.dimLabel} ${styles.dimLabelDepth}`}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(-90, ${PAD_LEFT / 2}, ${originY + cabPxD / 2})`}
        >
          {formatDim(depthLabel)}
        </text>
      </svg>
    </div>
  );
}

// Silence the lint rule for `defaultPlinthGableLeftX` if it ends up unused
// after refactors — the import is still part of the editor's intended API.
void defaultPlinthGableLeftX;
