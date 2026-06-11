import { decomposeBoxes } from '../../core';
import { computeInnerWidth } from '../../core/boards/boardModel';
import { boxStableKey } from '../../core/interior/interiorUtils';
import type { Box, BoxLevel } from '../../types';
import type { BodyLevel } from '../../types/interior';


const SVG_W = 600;
const SVG_H = 500;
const PAD_TOP = 55;
const PAD_RIGHT = 40;
const PAD_BOTTOM = 30;
const PAD_LEFT = 90;

// Ordered from top to bottom for split-line calculation
const LEVEL_ORDER: BoxLevel[] = ['top', 'middle', 'bottom', 'single'];

// ── Drawer-box visual insets ─────────────────────────────────────────────────
// A drawer is drawn as its inner BOX (tray), inset from the body opening, so the
// carcass boards (sides, top, bottom) stay visible around it — never as a full-
// bleed band that would occlude them. Same convention used for the external
// drawer box in the kitchen bodies view; internal drawers reuse it so they look
// like trays inside the carcass rather than solid panels.
export const DRAWER_BOX_SIDE_GAP_CM = 1.25;   // each side
export const DRAWER_BOX_BOTTOM_GAP_CM = 2;
export const DRAWER_BOX_TOP_GAP_CM = 3;

/** Inner drawer-box vertical bounds (cm from body bottom) for an INTERNAL drawer
 *  at `heightFromFloor` with height `drawerHeight`. The bottom/top insets keep
 *  the top/bottom carcass boards visible behind the tray. A drawer shorter than
 *  the combined insets yields `topCm ≤ bottomCm` — callers clamp the rendered
 *  height to ≥ 0. */
export function internalDrawerBoxBoundsCm(
  heightFromFloor: number,
  drawerHeight: number,
): { bottomCm: number; topCm: number } {
  return {
    bottomCm: heightFromFloor + DRAWER_BOX_BOTTOM_GAP_CM,
    topCm: heightFromFloor + drawerHeight - DRAWER_BOX_TOP_GAP_CM,
  };
}

export interface SketchLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface BoxSvgRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SketchGeometry {
  svgWidth: number;
  svgHeight: number;
  cabinet: { x: number; y: number; w: number; h: number };
  plinthRect: { x: number; y: number; w: number; h: number } | null;
  splitLines: SketchLine[];
  internalShelfLines: SketchLine[];
  wLabel: { x: number; y: number; text: string };
  hLabel: { x: number; y: number; text: string };
  /** px per cm — used for rendering interior items */
  scale: number;
  /** floor height of each body (cm above plinth) — used for interior item y-coords */
  bodyFloors: Partial<Record<BodyLevel, number>>;
  /** SVG bounding rect for each non-plinth box, keyed by Box.id */
  boxSvgRects: Record<string, BoxSvgRect>;
  /** All decomposed boxes (including plinth) — for door fronts rendering */
  boxes: Box[];
  /** Outer envelope side panels (when hasShell) */
  envelopePanels: { left: BoxSvgRect | null; right: BoxSvgRect | null } | null;
  /** Outer envelope ceiling panel (when hasShell && hasEnvelopeTop) */
  envelopeTopPanel: BoxSvgRect | null;
}

export function isValidSketchInput(
  W: string,
  H: string,
  D: string,
  plinth: string,
  lowerDoorH?: string,
  doorsPerColumn?: string,
  middleDoorH?: string,
): boolean {
  const w = parseFloat(W);
  const h = parseFloat(H);
  const d = parseFloat(D);
  const p = parseFloat(plinth);

  if (isNaN(w) || w <= 0) return false;
  if (isNaN(h) || h <= 0) return false;
  if (isNaN(d) || d <= 0) return false;
  if (isNaN(p) || p < 0 || p >= h) return false;

  if (lowerDoorH !== undefined) {
    const lo = parseFloat(lowerDoorH);
    if (isNaN(lo) || lo <= 0 || lo >= h || lo <= p) return false;

    if (doorsPerColumn === '3' && middleDoorH !== undefined) {
      const mid = parseFloat(middleDoorH);
      if (isNaN(mid) || mid <= 0) return false;
      if (lo + mid >= h) return false;
    }
  }

  return true;
}

function positionRank(box: Box): number {
  if (box.position === 'single' || box.position === 'left') return 0;
  if (box.position === 'right') return 1;
  return box.unitIndex ?? 0;
}

/**
 * Computes SVG layout geometry by delegating box splitting to decomposeBoxes.
 * Split line positions therefore exactly match the core's decomposition.
 * Caller must ensure isValidSketchInput returned true for these inputs.
 */
export function computeSketchGeometry(
  W: number,
  H: number,
  D: number,
  plinth: number,
  lowerDoorH?: number,
  doorsPerColumn: 'auto' | 1 | 2 | 3 = 'auto',
  middleDoorH?: number,
  tEnvelope?: number,
  hasEnvelopeTop = false,
  boxDimensionOverrides?: ReadonlyMap<string, { W?: number; H?: number; D?: number }>,
  shellSides?: { left: boolean; right: boolean },
): SketchGeometry {
  const drawW = SVG_W - PAD_LEFT - PAD_RIGHT;
  const drawH = SVG_H - PAD_TOP - PAD_BOTTOM;

  // First pass: decompose boxes and apply overrides, then derive the EFFECTIVE
  // outer cabinet width from the bottom row (so the cabinet outline + plinth
  // follow a per-body W override — "צוקל מורחב יחד עם הגופים").
  const envelopeCm = tEnvelope ?? 0;
  // Per-side shell flags drive innerW and envelope panel emission asymmetrically.
  // Default (when not passed): symmetric — both sides match tEnvelope presence.
  const sides = shellSides ?? { left: tEnvelope !== undefined, right: tEnvelope !== undefined };
  const innerW = computeInnerWidth(W, sides, envelopeCm);

  const rawBoxes = decomposeBoxes(innerW, H, D, lowerDoorH, plinth, doorsPerColumn, middleDoorH);
  const boxes = (boxDimensionOverrides && boxDimensionOverrides.size > 0)
    ? rawBoxes.map(box => {
        const ovr = boxDimensionOverrides.get(boxStableKey(box));
        if (!ovr) return box;
        return {
          ...box,
          ...(ovr.W !== undefined ? { W: ovr.W } : {}),
          ...(ovr.H !== undefined ? { H: ovr.H } : {}),
          ...(ovr.D !== undefined ? { D: ovr.D } : {}),
        };
      })
    : rawBoxes;

  // Effective outer cabinet width: sum of bottom-row box widths + envelope
  // (only the sides that actually have a shell). Falls back to the input W
  // when no body boxes exist.
  const bottomRowBoxesForW = boxes.filter(b => b.level === 'bottom' || b.level === 'single');
  const bottomRowTotalW = bottomRowBoxesForW.length > 0
    ? bottomRowBoxesForW.reduce((s, b) => s + b.W, 0)
    : innerW;
  const effectiveCabW =
    bottomRowTotalW +
    (sides.left ? envelopeCm : 0) +
    (sides.right ? envelopeCm : 0);

  // Scale fits the actual cabinet (effectiveCabW × H). Using `max(W,
  // effectiveCabW)` would mis-scale when overrides + shell make the
  // cabinet wider than input W (height would shrink because scale drops).
  const scale = Math.min(drawW / Math.max(1, effectiveCabW), drawH / Math.max(1, H));

  const cabW = effectiveCabW * scale;
  const cabH = H * scale;
  const cabX = PAD_LEFT + (drawW - cabW) / 2;
  const cabY = PAD_TOP + (drawH - cabH) / 2;
  const bodyH = (H - plinth) * scale;

  const plinthRect = plinth > 0
    ? { x: cabX, y: cabY + bodyH, w: cabW, h: plinth * scale }
    : null;

  const envelopePx = envelopeCm * scale;
  // Per-side insets — boxes start after the left envelope (if present) and
  // end before the right envelope (if present). Asymmetric in kitchen units.
  const leftInsetPx = sides.left ? envelopePx : 0;
  const rightInsetPx = sides.right ? envelopePx : 0;

  // ── Build level → H map (body boxes only) ────────────────────────────────────
  const levelHeightMap = new Map<BoxLevel, number>();
  for (const box of boxes) {
    if (box.level !== 'plinth' && !levelHeightMap.has(box.level)) {
      levelHeightMap.set(box.level, box.H);
    }
  }

  // Active body levels sorted top → bottom
  const activeLevels = LEVEL_ORDER.filter(l => levelHeightMap.has(l));

  // ── Horizontal split lines between adjacent levels ────────────────────────────
  const splitLines: SketchLine[] = [];
  let cumH = 0;
  for (let i = 0; i < activeLevels.length - 1; i++) {
    cumH += levelHeightMap.get(activeLevels[i]!)!;
    const splitY = cabY + cumH * scale;
    splitLines.push({ x1: cabX + leftInsetPx, y1: splitY, x2: cabX + cabW - rightInsetPx, y2: splitY });
  }

  // ── Vertical split lines: use the bottom-most body level as column reference ──
  const colLevel = activeLevels[activeLevels.length - 1] ?? 'single';
  const colBoxes = boxes
    .filter(b => b.level === colLevel)
    .sort((a, b) => positionRank(a) - positionRank(b));

  let cumW = 0;
  for (let i = 0; i < colBoxes.length - 1; i++) {
    cumW += colBoxes[i]!.W;
    const splitX = cabX + leftInsetPx + cumW * scale;
    splitLines.push({ x1: splitX, y1: cabY, x2: splitX, y2: cabY + bodyH });
  }

  // ── Internal shelf lines (absolute heights from floor, merged bodies only) ──
  const internalShelfHeights = new Set<number>();
  for (const box of boxes) {
    if (box.internalShelves) {
      for (const sh of box.internalShelves) {
        internalShelfHeights.add(sh);
      }
    }
  }
  const internalShelfLines: SketchLine[] = [...internalShelfHeights].map(sh => ({
    x1: cabX + leftInsetPx,
    y1: cabY + (H - sh) * scale,
    x2: cabX + cabW - rightInsetPx,
    y2: cabY + (H - sh) * scale,
  }));

  // ── Body floors: cumulative cm above plinth, bottom-to-top ──────────────────
  const bodyFloors: Partial<Record<BodyLevel, number>> = {};
  {
    let cum = 0;
    for (const level of [...activeLevels].reverse() as BodyLevel[]) {
      bodyFloors[level] = cum;
      cum += levelHeightMap.get(level)!;
    }
  }

  // ── Box SVG rects: one per non-plinth box ─────────────────────────────────
  const boxSvgRects: Record<string, BoxSvgRect> = {};
  {
    // Level y-offsets from top of body area (top → down)
    const levelYOffset: Partial<Record<BoxLevel, number>> = {};
    let cumLevelH = 0;
    for (const level of activeLevels) {
      levelYOffset[level] = cumLevelH;
      cumLevelH += levelHeightMap.get(level)!;
    }

    for (const level of activeLevels) {
      const yOff = levelYOffset[level] ?? 0;
      const levelBoxes = boxes
        .filter(b => b.level === level)
        .sort((a, b) => positionRank(a) - positionRank(b));
      let cumW = 0;
      for (const box of levelBoxes) {
        boxSvgRects[box.id] = {
          x: cabX + leftInsetPx + cumW * scale,
          y: cabY + yOff * scale,
          w: box.W * scale,
          h: box.H * scale,
        };
        cumW += box.W;
      }
    }
  }

  const envelopePanels = envelopePx > 0
    ? {
        left:  sides.left  ? { x: cabX,                       y: cabY, w: envelopePx, h: cabH } : null,
        right: sides.right ? { x: cabX + cabW - envelopePx,   y: cabY, w: envelopePx, h: cabH } : null,
      }
    : null;

  // Top envelope spans the inner width between whichever side panels are present.
  const topInsetLeft = sides.left ? envelopePx : 0;
  const topInsetRight = sides.right ? envelopePx : 0;
  const envelopeTopPanel = (hasEnvelopeTop && envelopePx > 0)
    ? { x: cabX + topInsetLeft, y: cabY, w: cabW - topInsetLeft - topInsetRight, h: envelopePx }
    : null;

  return {
    svgWidth: SVG_W,
    svgHeight: SVG_H,
    cabinet: { x: cabX, y: cabY, w: cabW, h: cabH },
    plinthRect,
    splitLines,
    internalShelfLines,
    // Labels reflect EFFECTIVE dimensions (after any per-body overrides).
    // For W: use effectiveCabW (sum of bottom-row box widths + envelope).
    // For H: sum of unique level heights (after overrides) + plinth + envelope-top.
    // When no overrides exist these equal the input W / H exactly.
    wLabel: { x: cabX + cabW / 2, y: cabY - 8, text: `${effectiveCabW}` },
    hLabel: {
      x: PAD_LEFT / 2,
      y: cabY + cabH / 2,
      text: `${[...levelHeightMap.values()].reduce((s, h) => s + h, 0) + plinth + (hasEnvelopeTop && tEnvelope ? tEnvelope : 0)}`,
    },
    scale,
    bodyFloors,
    boxSvgRects,
    boxes,
    envelopePanels,
    envelopeTopPanel,
  };
}
