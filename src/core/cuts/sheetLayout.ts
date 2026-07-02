// Sheet layout (פריסה) — nests cut-list pieces onto full material plates.
//
// This is a GUILLOTINE nester, not a free 2D max-fill packer: every produced
// layout is buildable on a panel / sliding-table saw whose only motion is a
// straight cut edge-to-edge across the piece. Concretely it is a two-stage
// shelf (strip) packing — the sheet is first ripped into horizontal bands
// ("shelves"), then each band is cross-cut into parts left→right. Both stages
// are full-length cuts, so the result is always saw-reproducible. We favour a
// clean, cuttable layout over squeezing in a few extra parts (per the
// carpenter's brief: "don't just optimise as much as you can fit — respect the
// natural movement of the saw").
//
// Units: every dimension here is in **mm** (matching CutItem.w / .h). Callers
// convert plate sizes (catalog sheetW/sheetH, in cm) ×10 before calling.
//
// SSOT note: this is a *derived view* of the cut list — nothing here is stored.
// It owns no truth; it is recomputed on the fly whenever the פריסה tab renders.

/** Saw kerf — material consumed by each cut, mm. */
export const DEFAULT_KERF_MM = 3;

/** Straightening allowance removed from each plate dimension, mm (1 cm). The
 *  saw operator squares the plate with one straightening cut per axis before
 *  any part is cut, so the usable area is `plate − trim` on width and height. */
export const DEFAULT_TRIM_MM = 10;

/** One part to place. `w`/`h` are the part's dimensions as listed in the cut
 *  list (mm). Grain policy is global (see {@link SheetLayoutOptions.allowRotation}). */
export interface LayoutPiece {
  id: string;
  label: string;
  w: number;
  h: number;
  /** Opaque passthrough for the view (e.g. the CutGroup, for colouring).
   *  The engine never reads it. */
  tag?: string;
}

/** A part placed on a plate. `x`/`y` are the top-left corner in usable-area
 *  coordinates (origin at the straightened reference corner, mm). `w`/`h` are
 *  the dimensions *as placed* (already swapped when `rotated`). */
export interface PlacedPiece {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  tag?: string;
}

/** One physical plate with the parts nested on it. */
export interface PackedSheet {
  pieces: PlacedPiece[];
  /** Σ area of the parts on this plate, mm². */
  usedArea: number;
  /** usedArea / usable-plate-area, 0..1. */
  usedRatio: number;
}

export interface SheetLayoutOptions {
  /** Full plate width, mm (e.g. 2440). */
  sheetW: number;
  /** Full plate height, mm (e.g. 1220). */
  sheetH: number;
  /** Saw kerf, mm. Default {@link DEFAULT_KERF_MM}. */
  kerf?: number;
  /** Straightening allowance removed per axis, mm. Default {@link DEFAULT_TRIM_MM}. */
  trim?: number;
  /** Grain policy. `true` (default) = grain free: parts may be turned 90° to
   *  pack tighter. `false` = grain locked: every part's long side is forced
   *  parallel to the plate's long (244 cm) edge; no off-grain turning. */
  allowRotation?: boolean;
}

export interface SheetLayoutResult {
  /** Full plate dimensions, mm (for drawing the plate outline). */
  sheetW: number;
  sheetH: number;
  /** Usable dimensions after straightening trim, mm. */
  usableW: number;
  usableH: number;
  kerf: number;
  trim: number;
  sheets: PackedSheet[];
  /** Parts that do not fit on a single usable plate (need a larger plate or
   *  joining). Never silently dropped. */
  oversize: LayoutPiece[];
  /** Σ area of every placed part, mm². */
  totalPieceArea: number;
  /** sheets.length × usable-plate-area, mm². */
  totalUsableArea: number;
  /** totalPieceArea / totalUsableArea, 0..1 (0 when no sheets). */
  utilization: number;
}

// ── internal working types ───────────────────────────────────────────────────

interface Shelf {
  /** Top of the shelf in usable coords (mm, y grows downward). */
  y: number;
  /** Shelf band height = tallest part placed in it, mm. */
  height: number;
  /** Next free x within the shelf, mm (already past placed parts + kerf). */
  cursorX: number;
  pieces: PlacedPiece[];
}

interface WorkSheet {
  shelves: Shelf[];
  /** Bottom of the lowest shelf, mm (next shelf starts at +kerf below). */
  usedHeight: number;
}

type Orientation = { w: number; h: number; rotated: boolean };

/** Orientations to try for a piece, given the grain policy.
 *
 * The plate's wood grain runs along its LONG edge (the 244 cm length). A part's
 * grain is assumed to run along ITS long edge too, so the *grain-aligned*
 * orientation lays the part's long side parallel to the plate's long side.
 *
 * - grain LOCKED (`allowRotation === false`): only the grain-aligned
 *   orientation — the part may not be turned off-grain (grained woods require
 *   this). If it doesn't fit that way, it's oversize (we never turn it).
 * - grain FREE (`allowRotation === true`): grain-aligned first (good yield and
 *   still grain-correct when it fits), then the turned alternative — the packer
 *   takes whichever fits.
 *
 * Orientations exceeding the usable area are dropped (→ oversize upstream).
 */
function orientationsFor(
  p: LayoutPiece,
  usableW: number,
  usableH: number,
  allowRotation: boolean,
): Orientation[] {
  const fits = (o: Orientation) => o.w <= usableW && o.h <= usableH;
  const long = Math.max(p.w, p.h);
  const short = Math.min(p.w, p.h);
  // Which usable axis is the grain (long) axis. x = usableW (the plate length).
  const plateLongIsX = usableW >= usableH;
  const grain: Orientation = plateLongIsX
    ? { w: long, h: short, rotated: p.w < p.h }
    : { w: short, h: long, rotated: p.w > p.h };

  if (!allowRotation) return fits(grain) ? [grain] : [];

  const turned: Orientation = { w: grain.h, h: grain.w, rotated: !grain.rotated };
  return [grain, turned].filter(fits);
}

/** Place a piece using First-Fit Decreasing-Height across all open sheets:
 *  1) first shelf (any sheet) whose height ≥ part and whose remaining width
 *     (after kerf) fits; else 2) a new shelf on the first sheet with vertical
 *     room; else 3) a brand-new sheet. Returns true if placed. */
function placePiece(
  orientations: Orientation[],
  meta: { id: string; label: string; tag?: string | undefined },
  sheets: WorkSheet[],
  usableW: number,
  usableH: number,
  kerf: number,
): boolean {
  const place = (x: number, y: number, o: Orientation): PlacedPiece => ({
    id: meta.id,
    label: meta.label,
    x,
    y,
    w: o.w,
    h: o.h,
    rotated: o.rotated,
    ...(meta.tag !== undefined ? { tag: meta.tag } : {}),
  });
  // 1) existing shelves
  for (const sheet of sheets) {
    for (const shelf of sheet.shelves) {
      for (const o of orientations) {
        if (o.h > shelf.height) continue;
        const gap = shelf.cursorX > 0 ? kerf : 0;
        const x = shelf.cursorX + gap;
        if (x + o.w <= usableW) {
          shelf.pieces.push(place(x, shelf.y, o));
          shelf.cursorX = x + o.w;
          return true;
        }
      }
    }
  }
  // 2) new shelf on an existing sheet with vertical room
  for (const sheet of sheets) {
    const top = sheet.usedHeight > 0 ? sheet.usedHeight + kerf : 0;
    for (const o of orientations) {
      if (top + o.h <= usableH && o.w <= usableW) {
        const shelf: Shelf = { y: top, height: o.h, cursorX: o.w, pieces: [place(0, top, o)] };
        sheet.shelves.push(shelf);
        sheet.usedHeight = top + o.h;
        return true;
      }
    }
  }
  // 3) new sheet
  const o = orientations[0];
  if (!o) return false;
  const shelf: Shelf = { y: 0, height: o.h, cursorX: o.w, pieces: [place(0, 0, o)] };
  sheets.push({ shelves: [shelf], usedHeight: o.h });
  return true;
}

/**
 * Nests `pieces` onto identical plates using guillotine shelf packing.
 *
 * The caller supplies ONE plate size (a single material). Grouping the cut
 * list by material and choosing 244 vs 305 plates is the UI's concern; this
 * function is material-agnostic and pure.
 */
export function layoutSheets(
  pieces: LayoutPiece[],
  opts: SheetLayoutOptions,
): SheetLayoutResult {
  const kerf = opts.kerf ?? DEFAULT_KERF_MM;
  const trim = opts.trim ?? DEFAULT_TRIM_MM;
  const usableW = opts.sheetW - trim;
  const usableH = opts.sheetH - trim;

  const oversize: LayoutPiece[] = [];
  const placeable: {
    meta: { id: string; label: string; tag?: string | undefined };
    orientations: Orientation[];
    sortH: number;
  }[] = [];

  for (const p of pieces) {
    const orientations = orientationsFor(p, usableW, usableH, opts.allowRotation ?? true);
    if (orientations.length === 0) {
      oversize.push(p);
      continue;
    }
    // Sort key: the canonical (first) orientation's height — FFDH stacks the
    // tallest bands first, minimising the number of shelves.
    placeable.push({
      meta: { id: p.id, label: p.label, tag: p.tag },
      orientations,
      sortH: orientations[0]!.h,
    });
  }

  // Decreasing height. Stable within equal heights by original order (tie-break
  // on width desc keeps wide parts leftmost → tidier bands).
  placeable.sort((a, b) => b.sortH - a.sortH || b.orientations[0]!.w - a.orientations[0]!.w);

  const work: WorkSheet[] = [];
  for (const item of placeable) {
    placePiece(item.orientations, item.meta, work, usableW, usableH, kerf);
  }

  const usablePlateArea = usableW * usableH;
  const sheets: PackedSheet[] = work.map((ws) => {
    const pcs = ws.shelves.flatMap((s) => s.pieces);
    const usedArea = pcs.reduce((sum, p) => sum + p.w * p.h, 0);
    return { pieces: pcs, usedArea, usedRatio: usablePlateArea > 0 ? usedArea / usablePlateArea : 0 };
  });

  const totalPieceArea = sheets.reduce((sum, s) => sum + s.usedArea, 0);
  const totalUsableArea = sheets.length * usablePlateArea;

  return {
    sheetW: opts.sheetW,
    sheetH: opts.sheetH,
    usableW,
    usableH,
    kerf,
    trim,
    sheets,
    oversize,
    totalPieceArea,
    totalUsableArea,
    utilization: totalUsableArea > 0 ? totalPieceArea / totalUsableArea : 0,
  };
}

/** Expands a quantity-bearing cut into individual placeable pieces. Each gets
 *  a stable-ish id `${keyBase}:${k}` for React keying. */
export function expandPieces(
  cut: { name: string; w: number; h: number; qty: number; tag?: string },
  keyBase: string,
): LayoutPiece[] {
  const out: LayoutPiece[] = [];
  for (let k = 0; k < cut.qty; k++) {
    out.push({
      id: `${keyBase}:${k}`,
      label: cut.name,
      w: cut.w,
      h: cut.h,
      ...(cut.tag !== undefined ? { tag: cut.tag } : {}),
    });
  }
  return out;
}
