import { decomposeBoxes } from '../../core';
import type { Box } from '../../types';

const SVG_W = 600;
const SVG_H = 500;
const PAD_TOP = 55;
const PAD_RIGHT = 40;
const PAD_BOTTOM = 30;
const PAD_LEFT = 90;

export interface SketchLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SketchGeometry {
  svgWidth: number;
  svgHeight: number;
  cabinet: { x: number; y: number; w: number; h: number };
  plinthRect: { x: number; y: number; w: number; h: number } | null;
  splitLines: SketchLine[];
  wLabel: { x: number; y: number; text: string };
  hLabel: { x: number; y: number; text: string };
}

export function isValidSketchInput(
  W: string,
  H: string,
  D: string,
  plinth: string,
  lowerDoorH?: string,
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
    // must be a valid positive number, less than H, and greater than plinth
    // (mirrors the constraint in decomposeBoxes to avoid throwing)
    if (isNaN(lo) || lo <= 0 || lo >= h || lo <= p) return false;
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

  const boxes = decomposeBoxes(W, H, D, lowerDoorH, plinth);

  // ── horizontal split (tall cabinet has "top" + "bottom" levels) ──────────────
  const topBoxes = boxes.filter(b => b.level === 'top');
  const topH = topBoxes[0]?.H ?? 0;

  // ── vertical splits: use one body level as the column reference ───────────────
  const colLevel = topH > 0 ? 'bottom' : 'single';
  const colBoxes = boxes
    .filter(b => b.level === colLevel)
    .sort((a, b) => positionRank(a) - positionRank(b));

  const splitLines: SketchLine[] = [];

  if (topH > 0) {
    const splitY = cabY + topH * scale;
    splitLines.push({ x1: cabX, y1: splitY, x2: cabX + cabW, y2: splitY });
  }

  let cumW = 0;
  for (let i = 0; i < colBoxes.length - 1; i++) {
    cumW += colBoxes[i]!.W;
    const splitX = cabX + cumW * scale;
    splitLines.push({ x1: splitX, y1: cabY, x2: splitX, y2: cabY + bodyH });
  }

  return {
    svgWidth: SVG_W,
    svgHeight: SVG_H,
    cabinet: { x: cabX, y: cabY, w: cabW, h: cabH },
    plinthRect,
    splitLines,
    wLabel: { x: cabX + cabW / 2, y: cabY - 8, text: `${W}` },
    hLabel: { x: PAD_LEFT / 2, y: cabY + cabH / 2, text: `${H}` },
  };
}
