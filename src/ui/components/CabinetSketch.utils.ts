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
  /** Outer envelope ceiling panel (when hasShell && hasEnvelopeTop, OR a wall
   *  cabinet with `wallEnvelopeCm > 0`). */
  envelopeTopPanel: BoxSvgRect | null;
  /** Wall-cabinet bottom envelope cap (when `wallEnvelopeCm > 0`). null for
   *  all base cabinets — the cabinet sits on a plinth, not a cap. */
  envelopeBottomPanel: BoxSvgRect | null;
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
  /** Wall-cabinet top+bottom envelope cap thickness (cm). > 0 → the body
   *  shrinks by 2× this in decomposeBoxes, and full-width caps render at the
   *  top and bottom. Independent of the side shell — wall cabinets have none.
   *  Default 0 (no wall envelope). */
  wallEnvelopeCm = 0,
  /** Corner unit (פינה): keep the body as ONE box regardless of MAX_BOX_W, so
   *  the sketch shows a single wide carcass (matching the cut list / 3D) rather
   *  than splitting 125 cm into two columns. Default false. */
  noWidthSplit = false,
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

  // Both the wall envelope (top+bottom caps) AND the shell envelope-top shrink
  // the body in decompose — mirroring useCabinet (envelopeTopH), so the sketch's
  // box heights and y-levels match the cut list. Without the shell-top reduction
  // the top box stayed full-height and the cap board (drawn above the box top)
  // floated proud of the side panels.
  const topEnvCm = wallEnvelopeCm > 0 ? wallEnvelopeCm : (hasEnvelopeTop ? envelopeCm : 0);
  const botEnvCm = wallEnvelopeCm > 0 ? wallEnvelopeCm : 0;
  const rawBoxes = decomposeBoxes(
    innerW, H, D, lowerDoorH, plinth, doorsPerColumn, middleDoorH,
    topEnvCm, botEnvCm, noWidthSplit,
  );
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

  // Effective outer cabinet width: the WIDEST row's summed box widths + envelope
  // (only the sides that actually have a shell). A per-body W override can make
  // rows differ (e.g. a widened top body); the outline + scale must encompass the
  // widest row so no row overflows the outline / mis-scales against the per-row
  // front layout. Mirrors cabinetBoardBoxes' effInnerW. Falls back to innerW when
  // there are no body boxes.
  const shellW = (sides.left ? envelopeCm : 0) + (sides.right ? envelopeCm : 0);
  const rowWidths = new Map<BoxLevel, number>();
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    rowWidths.set(box.level, (rowWidths.get(box.level) ?? 0) + box.W);
  }
  const widestRowW = rowWidths.size > 0 ? Math.max(...rowWidths.values()) : innerW;
  const effectiveCabW = widestRowW + shellW;
  // The plinth sits under the BOTTOM row only — keep its width tied to that row
  // (a widened top body grows the outline, not the kick-board).
  const bottomRowBoxesForW = boxes.filter(b => b.level === 'bottom' || b.level === 'single');
  const bottomRowCabW = (bottomRowBoxesForW.length > 0
    ? bottomRowBoxesForW.reduce((s, b) => s + b.W, 0)
    : innerW) + shellW;

  // ── Build level → H map (body boxes only) ────────────────────────────────────
  // Built BEFORE the scale so the effective total height (below) can drive both
  // the scale and the cabinet outline. Mirrors the width path, which already
  // scales to effectiveCabW (sum of body widths) rather than the raw W param.
  const levelHeightMap = new Map<BoxLevel, number>();
  for (const box of boxes) {
    if (box.level !== 'plinth' && !levelHeightMap.has(box.level)) {
      levelHeightMap.set(box.level, box.H);
    }
  }

  // Effective TOTAL cabinet height: sum of the (possibly overridden) per-level
  // body heights + plinth + top-envelope band. This — not the raw H param —
  // drives the scale and the cabinet outline, so a per-body H override grows the
  // outline together with the body rects (which already use box.H). Without any
  // override this equals H exactly, so un-overridden cabinets are unchanged.
  const levelHeightSum = [...levelHeightMap.values()].reduce((s, h) => s + h, 0);
  // Wall envelope adds 2× caps to the external cabinet height (the body was
  // already shrunk by 2× in decompose so this restores H exactly).
  const wallEnvAdded = wallEnvelopeCm > 0 ? 2 * wallEnvelopeCm : 0;
  const effectiveH =
    levelHeightSum + plinth + (hasEnvelopeTop && envelopeCm ? envelopeCm : 0) + wallEnvAdded;

  // Scale fits the actual cabinet (effectiveCabW × effectiveH). Using the raw
  // W/H params would mis-scale whenever per-body overrides change the body
  // footprint (the outline would shrink while the body rects kept the override
  // size — the "broken" vertical layout the carpenter saw in the fronts view).
  const scale = Math.min(drawW / Math.max(1, effectiveCabW), drawH / Math.max(1, effectiveH));

  const cabW = effectiveCabW * scale;
  const cabH = effectiveH * scale;
  const cabX = PAD_LEFT + (drawW - cabW) / 2;
  const cabY = PAD_TOP + (drawH - cabH) / 2;
  const bodyH = (effectiveH - plinth) * scale;

  const plinthRect = plinth > 0
    ? { x: cabX, y: cabY + bodyH, w: bottomRowCabW * scale, h: plinth * scale }
    : null;

  const envelopePx = envelopeCm * scale;
  // Per-side insets — boxes start after the left envelope (if present) and
  // end before the right envelope (if present). Asymmetric in kitchen units.
  const leftInsetPx = sides.left ? envelopePx : 0;
  const rightInsetPx = sides.right ? envelopePx : 0;

  // Active body levels sorted top → bottom
  const activeLevels = LEVEL_ORDER.filter(l => levelHeightMap.has(l));

  // ── Horizontal split lines between adjacent levels ────────────────────────────
  // Start below the reserved top envelope band so splits line up with the boxes
  // (which also start at `topEnvCm`).
  const splitLines: SketchLine[] = [];
  let cumH = topEnvCm;
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
    y1: cabY + (effectiveH - sh) * scale,
    x2: cabX + cabW - rightInsetPx,
    y2: cabY + (effectiveH - sh) * scale,
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
    // Level y-offsets from top of body area (top → down). Start below the top
    // envelope band (wall cap OR shell envelope-top) — it occupies the first
    // `topEnvCm` of the cabinet height, and the body boxes sit under it.
    const levelYOffset: Partial<Record<BoxLevel, number>> = {};
    let cumLevelH = topEnvCm;
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
  const wallEnvPx = wallEnvelopeCm * scale;
  // Top cap: either the shell-gated envelope-top (legacy) or the wall envelope
  // (קלפה). Wall caps are full-width — no side shell to inset under.
  const envelopeTopPanel = (hasEnvelopeTop && envelopePx > 0)
    ? { x: cabX + topInsetLeft, y: cabY, w: cabW - topInsetLeft - topInsetRight, h: envelopePx }
    : wallEnvPx > 0
      ? { x: cabX, y: cabY, w: cabW, h: wallEnvPx }
      : null;
  // Bottom cap: wall envelope only — base cabinets sit on a plinth, not a cap.
  const envelopeBottomPanel = wallEnvPx > 0
    ? { x: cabX, y: cabY + cabH - wallEnvPx, w: cabW, h: wallEnvPx }
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
      text: `${effectiveH}`,
    },
    scale,
    bodyFloors,
    boxSvgRects,
    boxes,
    envelopePanels,
    envelopeTopPanel,
    envelopeBottomPanel,
  };
}
