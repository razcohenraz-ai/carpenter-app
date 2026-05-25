import type { Box } from '../../types/geometry';
import type { Material, MaterialId } from '../../types/materials';
import type { InteriorItem, ShelfItem } from '../../types/interior';
import type { CutItem, CutGroup } from '../../types/cuts';
import { newItemId } from '../interior/interiorUtils';

// ── BoardModel ────────────────────────────────────────────────────────────────
// Per-body physical model: every carcass panel (sides, top, bottom, shelves,
// partition, envelope, plinth, back) becomes a `Board` with explicit
// dimensions and a visual rectangle in front-view coordinates. Drives both
// the "cut" sketch and the cut list (via `boardsToCutItems`).
//
// Coordinate convention (per box, front view):
//   x = 0  → outer-left edge of the body
//   x = W  → outer-right edge of the body
//   y = 0  → outer-top edge of the body
//   y = H  → outer-bottom edge of the body
// Envelope boards live at x < 0 / x > W and y < 0. Plinth boards live at
// y > H (below the body).

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
  | 'envelope-top'
  | 'back'
  | 'plinth-front'
  | 'plinth-back';

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
  /** Whether this board is rendered by the cross-section sketch. The back
   *  panel sits BEHIND the carcass so it is invisible in front view, but it
   *  is still emitted into the cut list. */
  visible: boolean;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Per-side reveal on shelf width — keeps the shelf from binding against the
 *  side panels. cm (1 mm per side). */
export const SHELF_WIDTH_REVEAL_CM = 0.1;

/** Total depth reduction on shelves — shelves don't reach the front so the
 *  fingertips clear the facade. cm (20 mm). */
export const SHELF_DEPTH_REVEAL_CM = 2.0;

/** Back-panel thickness — typical 6 mm sheet (4 mm for shelving units). cm. */
export const BACK_THICKNESS_CM = 0.6;

// ── Joint method ─────────────────────────────────────────────────────────────
// Rabbet: sides span full height; top/bottom slot between the sides.
//   → narrow / tall cabinets (W ≤ 2·H), where the sides carry the load.
// Butt:  top/bottom span full width; sides slot between top and bottom.
//   → wide / short cabinets (W > 2·H), where the top/bottom carry the load.

export type JointMethod = 'rabbet' | 'butt';

export function resolveJointMethod(box: Box): JointMethod {
  return box.W > 2 * box.H ? 'butt' : 'rabbet';
}

// ── Envelope flag derivation ─────────────────────────────────────────────────
// Centralised so CabinetSketch (renderer) and useCabinet (cuts) agree on
// which boxes carry the cabinet's outer envelope. Without a shell, no
// envelope. With a shell:
//  - envelope-left   on the leftmost body of any row (position 'left',
//                    'single', or unit_1).
//  - envelope-right  on the rightmost (position 'right', 'single', or the
//                    last unit in its row).
//  - envelope-top    on the top row only (level 'top' or 'single'), when
//                    the user also enabled `hasEnvelopeTop`.

export function deriveEnvelopeFlags(
  box: Box,
  hasShell: boolean,
  hasEnvelopeTop: boolean,
): { hasEnvelopeLeft: boolean; hasEnvelopeRight: boolean; hasEnvelopeTop: boolean } {
  if (!hasShell) {
    return { hasEnvelopeLeft: false, hasEnvelopeRight: false, hasEnvelopeTop: false };
  }
  const isUnit = box.position.startsWith('unit_');
  const isLeftEdge =
    box.position === 'left' ||
    box.position === 'single' ||
    (isUnit && box.unitIndex === 1);
  const isRightEdge =
    box.position === 'right' ||
    box.position === 'single' ||
    (isUnit && box.unitIndex !== undefined && box.unitIndex === box.unitTotal);
  const isTopRow = box.level === 'top' || box.level === 'single';
  return {
    hasEnvelopeLeft: isLeftEdge,
    hasEnvelopeRight: isRightEdge,
    hasEnvelopeTop: hasEnvelopeTop && isTopRow,
  };
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
  /** Plinth height in cm — when > 0 this body sits on a plinth and emits
   *  plinth-front + plinth-back boards. Caller (useCabinet) sets this only
   *  for boxes that physically sit on the plinth (bottom row). */
  plinthHeight?: number;
  /** Include a back panel (visible:false). Defaults to true. */
  hasBack?: boolean;
}

export function buildBoardModel(args: BuildBoardModelArgs): Board[] {
  const {
    box, bodyMaterial, frontMaterial,
    hasEnvelopeLeft, hasEnvelopeRight, hasEnvelopeTop,
    items, hasPartition, cellItems,
    plinthHeight = 0,
    hasBack = true,
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
    out.push({
      id: newItemId(), role: 'side-left', materialId: matId,
      length: H, width: D, thickness: t,
      xFrom: 0, xTo: t, yFrom: 0, yTo: H, visible: true,
    });
    out.push({
      id: newItemId(), role: 'side-right', materialId: matId,
      length: H, width: D, thickness: t,
      xFrom: W - t, xTo: W, yFrom: 0, yTo: H, visible: true,
    });
    out.push({
      id: newItemId(), role: 'top', materialId: matId,
      length: W - 2 * t, width: D, thickness: t,
      xFrom: t, xTo: W - t, yFrom: 0, yTo: t, visible: true,
    });
    out.push({
      id: newItemId(), role: 'bottom', materialId: matId,
      length: W - 2 * t, width: D, thickness: t,
      xFrom: t, xTo: W - t, yFrom: H - t, yTo: H, visible: true,
    });
  } else {
    out.push({
      id: newItemId(), role: 'top', materialId: matId,
      length: W, width: D, thickness: t,
      xFrom: 0, xTo: W, yFrom: 0, yTo: t, visible: true,
    });
    out.push({
      id: newItemId(), role: 'bottom', materialId: matId,
      length: W, width: D, thickness: t,
      xFrom: 0, xTo: W, yFrom: H - t, yTo: H, visible: true,
    });
    out.push({
      id: newItemId(), role: 'side-left', materialId: matId,
      length: H - 2 * t, width: D, thickness: t,
      xFrom: 0, xTo: t, yFrom: t, yTo: H - t, visible: true,
    });
    out.push({
      id: newItemId(), role: 'side-right', materialId: matId,
      length: H - 2 * t, width: D, thickness: t,
      xFrom: W - t, xTo: W, yFrom: t, yTo: H - t, visible: true,
    });
  }

  // ── Partition ────────────────────────────────────────────────────────────
  if (hasPartition) {
    out.push({
      id: newItemId(), role: 'partition', materialId: matId,
      length: H - 2 * t, width: D, thickness: t,
      xFrom: (W - t) / 2, xTo: (W + t) / 2, yFrom: t, yTo: H - t, visible: true,
    });
  }

  // ── Shelves ──────────────────────────────────────────────────────────────
  // Shelves apply BOTH the inner-clear (W - 2·tBody) AND a per-side reveal
  // so they slide without binding against the carcass sides. Depth is also
  // reduced so the shelf sits behind the door line.
  function shelfYRange(hf: number): { yFrom: number; yTo: number } {
    return { yFrom: H - hf - t, yTo: H - hf };
  }

  function pushShelf(item: ShelfItem, xFrom: number, xTo: number): void {
    const y = shelfYRange(item.heightFromFloor);
    const role: BoardRole = item.isFixedAboveExternals === true ? 'fixed-shelf' : 'shelf';
    const visibleSpan = xTo - xFrom;
    out.push({
      id: newItemId(), role, materialId: matId,
      length: visibleSpan - 2 * SHELF_WIDTH_REVEAL_CM,
      width: D - SHELF_DEPTH_REVEAL_CM,
      thickness: t,
      xFrom, xTo, yFrom: y.yFrom, yTo: y.yTo, visible: true,
    });
  }

  if (hasPartition && cellItems) {
    const rightX = { from: (W + t) / 2, to: W - t };
    const leftX  = { from: t, to: (W - t) / 2 };
    for (const it of cellItems[0]) if (it.type === 'shelf') pushShelf(it, rightX.from, rightX.to);
    for (const it of cellItems[1]) if (it.type === 'shelf') pushShelf(it, leftX.from, leftX.to);
  } else {
    for (const it of items) if (it.type === 'shelf') pushShelf(it, t, W - t);
  }

  // ── Internal shelves (merged-body structural splits) ─────────────────────
  if (box.internalShelves) {
    for (const hf of box.internalShelves) {
      const y = shelfYRange(hf);
      out.push({
        id: newItemId(), role: 'internal-shelf', materialId: matId,
        length: (W - 2 * t) - 2 * SHELF_WIDTH_REVEAL_CM,
        width: D - SHELF_DEPTH_REVEAL_CM,
        thickness: t,
        xFrom: t, xTo: W - t, yFrom: y.yFrom, yTo: y.yTo, visible: true,
      });
    }
  }

  // ── Back panel (invisible in front view, still cut) ──────────────────────
  if (hasBack) {
    out.push({
      id: newItemId(), role: 'back', materialId: matId,
      length: W - 2 * t, width: H - 2 * t, thickness: BACK_THICKNESS_CM,
      xFrom: t, xTo: W - t, yFrom: t, yTo: H - t, visible: false,
    });
  }

  // ── Plinth (front + back) ────────────────────────────────────────────────
  if (plinthHeight > 0) {
    out.push({
      id: newItemId(), role: 'plinth-front', materialId: matId,
      length: W - 2 * t, width: D, thickness: t,
      xFrom: t, xTo: W - t, yFrom: H, yTo: H + plinthHeight, visible: true,
    });
    out.push({
      id: newItemId(), role: 'plinth-back', materialId: matId,
      length: W - 2 * t, width: D, thickness: t,
      xFrom: t, xTo: W - t, yFrom: H, yTo: H + plinthHeight, visible: false,
    });
  }

  // ── Envelope ─────────────────────────────────────────────────────────────
  if (hasEnvelopeLeft) {
    out.push({
      id: newItemId(), role: 'envelope-left', materialId: frontMatId,
      length: H, width: D, thickness: tF,
      xFrom: -tF, xTo: 0, yFrom: 0, yTo: H, visible: true,
    });
  }
  if (hasEnvelopeRight) {
    out.push({
      id: newItemId(), role: 'envelope-right', materialId: frontMatId,
      length: H, width: D, thickness: tF,
      xFrom: W, xTo: W + tF, yFrom: 0, yTo: H, visible: true,
    });
  }
  if (hasEnvelopeTop) {
    out.push({
      id: newItemId(), role: 'envelope-top', materialId: frontMatId,
      length: W, width: D, thickness: tF,
      xFrom: 0, xTo: W, yFrom: -tF, yTo: 0, visible: true,
    });
  }

  return out;
}

// ── Board → CutItem conversion ───────────────────────────────────────────────
// Translates the physical board model into the cut-list format used by the
// saw operator and the sheet calculator. Includes ALL boards (visible flag
// drives sketch rendering only; the back panel is invisible but still
// physically cut).

const ROLE_NAME_HE: Record<BoardRole, string> = {
  'side-left': 'צד שמאל',
  'side-right': 'צד ימין',
  'top': 'עליון',
  'bottom': 'תחתון',
  'shelf': 'מדף',
  'partition': 'מחיצה',
  'fixed-shelf': 'מדף קבוע',
  'internal-shelf': 'מדף מבני',
  'envelope-left': 'מעטפת — צד שמאל',
  'envelope-right': 'מעטפת — צד ימין',
  'envelope-top': 'מעטפת תקרה',
  'back': 'גב',
  'plinth-front': 'צוקל קדמי',
  'plinth-back': 'צוקל אחורי',
};

const ROLE_GROUP: Record<BoardRole, CutGroup> = {
  'side-left': 'body',
  'side-right': 'body',
  'top': 'body',
  'bottom': 'body',
  'shelf': 'body',
  'partition': 'body',
  'fixed-shelf': 'body',
  'internal-shelf': 'body',
  'envelope-left': 'shell',
  'envelope-right': 'shell',
  'envelope-top': 'shell',
  'back': 'back',
  'plinth-front': 'plinth',
  'plinth-back': 'plinth',
};

export function boardsToCutItems(boards: Board[], label: string): CutItem[] {
  const tag = label ? ` — ${label}` : '';
  return boards.map(b => {
    const noteMm = `${Math.round(b.thickness * 10)}mm`;
    return {
      name: `${ROLE_NAME_HE[b.role]}${tag}`,
      qty: 1,
      w: Math.round(b.length * 10),
      h: Math.round(b.width * 10),
      group: ROLE_GROUP[b.role],
      note: noteMm,
    } satisfies CutItem;
  });
}
