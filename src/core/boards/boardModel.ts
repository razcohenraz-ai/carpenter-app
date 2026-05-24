import type { Box } from '../../types/geometry';
import type { Material, MaterialId } from '../../types/materials';
import type { InteriorItem, ShelfItem } from '../../types/interior';
import { newItemId } from '../interior/interiorUtils';

// ── BoardModel ────────────────────────────────────────────────────────────────
// Per-body physical model: every carcass panel (sides, top, bottom, shelves,
// partition, envelope) becomes a `Board` with explicit dimensions and a
// visual rectangle in front-view coordinates. Drives the "cut" sketch and
// — eventually — the cut list.
//
// Coordinate convention (per box, front view):
//   x = 0  → outer-left edge of the body
//   x = W  → outer-right edge of the body
//   y = 0  → outer-top edge of the body
//   y = H  → outer-bottom edge of the body
// Envelope boards live at x < 0 / x > W and y < 0.

export type BoardRole =
  | 'side-left'
  | 'side-right'
  | 'top'
  | 'bottom'
  | 'shelf'
  | 'partition'
  | 'fixed-shelf'
  | 'internal-shelf'
  | 'envelope-left'
  | 'envelope-right'
  | 'envelope-top';

export interface Board {
  id: string;
  role: BoardRole;
  materialId: MaterialId;
  /** cm — physical length of the cut piece (the long dimension). */
  length: number;
  /** cm — physical width of the cut piece (typically equals box.D). */
  width: number;
  /** cm — material thickness. */
  thickness: number;
  /** cm — visual front-view rect, left edge. */
  xFrom: number;
  /** cm — visual front-view rect, right edge. */
  xTo: number;
  /** cm — visual front-view rect, top edge (y grows downward). */
  yFrom: number;
  /** cm — visual front-view rect, bottom edge. */
  yTo: number;
}

// ── Joint method ─────────────────────────────────────────────────────────────
// Rabbet: sides span full height; top/bottom slot between the sides.
//   → narrow / tall cabinets (W ≤ 2·H), where the sides carry the load.
// Butt:  top/bottom span full width; sides slot between top and bottom.
//   → wide / short cabinets (W > 2·H), where the top/bottom carry the load.

export type JointMethod = 'rabbet' | 'butt';

export function resolveJointMethod(box: Box): JointMethod {
  return box.W > 2 * box.H ? 'butt' : 'rabbet';
}

// ── Build ────────────────────────────────────────────────────────────────────

export interface BuildBoardModelArgs {
  box: Box;
  bodyMaterial: Material;
  frontMaterial: Material;
  /** Outer envelope on the left edge — true only when this box sits at the
   *  cabinet's left edge AND a shell is present. */
  hasEnvelopeLeft: boolean;
  /** Outer envelope on the right edge. */
  hasEnvelopeRight: boolean;
  /** Outer envelope on top — true for the topmost row only. */
  hasEnvelopeTop: boolean;
  /** Items in this body (or in this cell for a partitioned body). Used to
   *  emit shelf and fixed-shelf boards. Drawers, rods, and internal drawers
   *  are not boards — they are ignored here. */
  items: InteriorItem[];
  /** Whether this body has a vertical partition. */
  hasPartition: boolean;
  /** For partitioned bodies: items of cell 0 (right) and cell 1 (left).
   *  When present, `items` is ignored for shelves; each cell's shelves are
   *  emitted with cell-width xFrom/xTo. */
  cellItems?: [InteriorItem[], InteriorItem[]];
}

export function buildBoardModel(args: BuildBoardModelArgs): Board[] {
  const {
    box, bodyMaterial, frontMaterial,
    hasEnvelopeLeft, hasEnvelopeRight, hasEnvelopeTop,
    items, hasPartition, cellItems,
  } = args;

  if (box.level === 'plinth') return [];

  const t = bodyMaterial.thickness / 10;   // cm
  const tF = frontMaterial.thickness / 10; // cm
  const W = box.W;
  const H = box.H;
  const D = box.D;
  const matId = bodyMaterial.id;
  const frontMatId = frontMaterial.id;
  const joint = resolveJointMethod(box);

  const out: Board[] = [];

  // ── Sides + top + bottom ──────────────────────────────────────────────────
  if (joint === 'rabbet') {
    // Sides span full height
    out.push({
      id: newItemId(), role: 'side-left', materialId: matId,
      length: H, width: D, thickness: t,
      xFrom: 0, xTo: t, yFrom: 0, yTo: H,
    });
    out.push({
      id: newItemId(), role: 'side-right', materialId: matId,
      length: H, width: D, thickness: t,
      xFrom: W - t, xTo: W, yFrom: 0, yTo: H,
    });
    // Top/bottom sit between the sides
    out.push({
      id: newItemId(), role: 'top', materialId: matId,
      length: W - 2 * t, width: D, thickness: t,
      xFrom: t, xTo: W - t, yFrom: 0, yTo: t,
    });
    out.push({
      id: newItemId(), role: 'bottom', materialId: matId,
      length: W - 2 * t, width: D, thickness: t,
      xFrom: t, xTo: W - t, yFrom: H - t, yTo: H,
    });
  } else {
    // butt: top/bottom span full width
    out.push({
      id: newItemId(), role: 'top', materialId: matId,
      length: W, width: D, thickness: t,
      xFrom: 0, xTo: W, yFrom: 0, yTo: t,
    });
    out.push({
      id: newItemId(), role: 'bottom', materialId: matId,
      length: W, width: D, thickness: t,
      xFrom: 0, xTo: W, yFrom: H - t, yTo: H,
    });
    // Sides sit between top and bottom
    out.push({
      id: newItemId(), role: 'side-left', materialId: matId,
      length: H - 2 * t, width: D, thickness: t,
      xFrom: 0, xTo: t, yFrom: t, yTo: H - t,
    });
    out.push({
      id: newItemId(), role: 'side-right', materialId: matId,
      length: H - 2 * t, width: D, thickness: t,
      xFrom: W - t, xTo: W, yFrom: t, yTo: H - t,
    });
  }

  // ── Partition (centered, between top and bottom) ─────────────────────────
  if (hasPartition) {
    out.push({
      id: newItemId(), role: 'partition', materialId: matId,
      length: H - 2 * t, width: D, thickness: t,
      xFrom: (W - t) / 2, xTo: (W + t) / 2, yFrom: t, yTo: H - t,
    });
  }

  // ── Shelves ──────────────────────────────────────────────────────────────
  // For partitioned bodies, shelves come from cellItems with cell-width
  // x-range. For non-partitioned bodies, shelves come from items with
  // full-body-width x-range.

  function shelfYRange(hf: number): { yFrom: number; yTo: number } {
    // heightFromFloor = BOTTOM of the shelf (project-wide convention).
    return { yFrom: H - hf - t, yTo: H - hf };
  }

  function pushShelf(item: ShelfItem, xFrom: number, xTo: number): void {
    const y = shelfYRange(item.heightFromFloor);
    const role: BoardRole = item.isFixedAboveExternals === true ? 'fixed-shelf' : 'shelf';
    out.push({
      id: newItemId(), role, materialId: matId,
      length: xTo - xFrom, width: D, thickness: t,
      xFrom, xTo, yFrom: y.yFrom, yTo: y.yTo,
    });
  }

  if (hasPartition && cellItems) {
    // Cell 0 = right; cell 1 = left
    const rightX = { from: (W + t) / 2, to: W - t };
    const leftX  = { from: t, to: (W - t) / 2 };
    for (const it of cellItems[0]) {
      if (it.type === 'shelf') pushShelf(it, rightX.from, rightX.to);
    }
    for (const it of cellItems[1]) {
      if (it.type === 'shelf') pushShelf(it, leftX.from, leftX.to);
    }
  } else {
    for (const it of items) {
      if (it.type === 'shelf') pushShelf(it, t, W - t);
    }
  }

  // ── Internal shelves (merged-body structural shelves) ────────────────────
  // box.internalShelves[] are box-local heightFromFloor values for structural
  // shelves that split a merged box. They are kept distinct from regular
  // shelves so the renderer can style them (e.g. dashed) — and so that future
  // calc-list integration emits them with role 'internal-shelf'.
  if (box.internalShelves) {
    for (const hf of box.internalShelves) {
      const y = shelfYRange(hf);
      out.push({
        id: newItemId(), role: 'internal-shelf', materialId: matId,
        length: W - 2 * t, width: D, thickness: t,
        xFrom: t, xTo: W - t, yFrom: y.yFrom, yTo: y.yTo,
      });
    }
  }

  // ── Envelope ─────────────────────────────────────────────────────────────
  // Envelope panels live OUTSIDE the body's outer rect (negative x or > W),
  // and are made of the FRONT material (the visible facade material).
  if (hasEnvelopeLeft) {
    out.push({
      id: newItemId(), role: 'envelope-left', materialId: frontMatId,
      length: H, width: D, thickness: tF,
      xFrom: -tF, xTo: 0, yFrom: 0, yTo: H,
    });
  }
  if (hasEnvelopeRight) {
    out.push({
      id: newItemId(), role: 'envelope-right', materialId: frontMatId,
      length: H, width: D, thickness: tF,
      xFrom: W, xTo: W + tF, yFrom: 0, yTo: H,
    });
  }
  if (hasEnvelopeTop) {
    out.push({
      id: newItemId(), role: 'envelope-top', materialId: frontMatId,
      length: W, width: D, thickness: tF,
      xFrom: 0, xTo: W, yFrom: -tF, yTo: 0,
    });
  }

  return out;
}
