const MAX_BOX_H = 200;
const MAX_BOX_W = 120;

const SVG_W = 240;
const SVG_H = 200;
const PAD_TOP = 22;
const PAD_RIGHT = 16;
const PAD_BOTTOM = 12;
const PAD_LEFT = 36;

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

export function isValidSketchInput(W: string, H: string, plinth: string): boolean {
  const w = parseFloat(W);
  const h = parseFloat(H);
  const p = parseFloat(plinth);
  return !isNaN(w) && w > 0 && !isNaN(h) && h > 0 && !isNaN(p) && p >= 0 && p < h;
}

/** Computes SVG layout geometry. Caller must ensure plinth < H. */
export function computeSketchGeometry(W: number, H: number, plinth: number): SketchGeometry {
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

  const splitLines: SketchLine[] = [];

  if (H > MAX_BOX_H) {
    const loH = H * 0.45;
    const splitY = cabY + (H - loH) * scale;
    splitLines.push({ x1: cabX, y1: splitY, x2: cabX + cabW, y2: splitY });
  }

  if (W > 60) {
    const n = W <= MAX_BOX_W ? 2 : Math.ceil(W / MAX_BOX_W);
    for (let i = 1; i < n; i++) {
      const splitX = cabX + (cabW / n) * i;
      splitLines.push({ x1: splitX, y1: cabY, x2: splitX, y2: cabY + bodyH });
    }
  }

  return {
    svgWidth: SVG_W,
    svgHeight: SVG_H,
    cabinet: { x: cabX, y: cabY, w: cabW, h: cabH },
    plinthRect,
    splitLines,
    wLabel: { x: cabX + cabW / 2, y: cabY - 6, text: `${W}` },
    hLabel: { x: 16, y: cabY + cabH / 2, text: `${H}` },
  };
}
