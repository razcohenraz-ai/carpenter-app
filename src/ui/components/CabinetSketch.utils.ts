import { decomposeBoxes } from '../../core';
import { computeInnerWidth } from '../../core/boards/boardModel';
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
  envelopePanels: { left: BoxSvgRect; right: BoxSvgRect } | null;
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
): SketchGeometry {
  const drawW = SVG_W - PAD_LEFT - PAD_RIGHT;
  const drawH = SVG_H - PAD_TOP - PAD_BOTTOM;
  const scale = Math.min(drawW / W, drawH / H);

  const cabW = W * scale;
  const cabH = H * scale;
  const cabX = PAD_LEFT + (drawW - cabW) / 2;
  const cabY = PAD_TOP + (drawH - cabH) / 2;
  const bodyH = (H - plinth) * scale;

  const plinthRect = plinth > 0
    ? { x: cabX, y: cabY + bodyH, w: cabW, h: plinth * scale }
    : null;

  const envelopePx = tEnvelope ? tEnvelope * scale : 0;
  const innerW = computeInnerWidth(W, tEnvelope !== undefined, tEnvelope ?? 0);

  const boxes = decomposeBoxes(innerW, H, D, lowerDoorH, plinth, doorsPerColumn, middleDoorH);

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
    splitLines.push({ x1: cabX + envelopePx, y1: splitY, x2: cabX + cabW - envelopePx, y2: splitY });
  }

  // ── Vertical split lines: use the bottom-most body level as column reference ──
  const colLevel = activeLevels[activeLevels.length - 1] ?? 'single';
  const colBoxes = boxes
    .filter(b => b.level === colLevel)
    .sort((a, b) => positionRank(a) - positionRank(b));

  let cumW = 0;
  for (let i = 0; i < colBoxes.length - 1; i++) {
    cumW += colBoxes[i]!.W;
    const splitX = cabX + envelopePx + cumW * scale;
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
    x1: cabX + envelopePx,
    y1: cabY + (H - sh) * scale,
    x2: cabX + cabW - envelopePx,
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
          x: cabX + envelopePx + cumW * scale,
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
        left:  { x: cabX,                       y: cabY, w: envelopePx, h: cabH },
        right: { x: cabX + cabW - envelopePx,   y: cabY, w: envelopePx, h: cabH },
      }
    : null;

  const envelopeTopPanel = (hasEnvelopeTop && envelopePx > 0)
    ? { x: cabX + envelopePx, y: cabY, w: cabW - 2 * envelopePx, h: envelopePx }
    : null;

  return {
    svgWidth: SVG_W,
    svgHeight: SVG_H,
    cabinet: { x: cabX, y: cabY, w: cabW, h: cabH },
    plinthRect,
    splitLines,
    internalShelfLines,
    wLabel: { x: cabX + cabW / 2, y: cabY - 8, text: `${W}` },
    hLabel: { x: PAD_LEFT / 2, y: cabY + cabH / 2, text: `${H}` },
    scale,
    bodyFloors,
    boxSvgRects,
    boxes,
    envelopePanels,
    envelopeTopPanel,
  };
}
