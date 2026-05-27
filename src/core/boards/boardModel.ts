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

/** Per-side reveal on shelf width. Kept at 0 so a shelf is cut to exactly
 *  the same length as the top/bottom panel (`W − 2·tBody`). The constant is
 *  retained as a structural seam — re-enable here if a future carpentry
 *  convention calls for a clearance reveal. cm. */
export const SHELF_WIDTH_REVEAL_CM = 0;

/** Total depth reduction on shelves. Kept at 0 so a shelf width matches
 *  the body depth `D` exactly (same as top/bottom). cm. */
export const SHELF_DEPTH_REVEAL_CM = 0;

/** Back-panel thickness — default 5 mm sheet. Overridable per-call via
 *  `backThicknessCm` in BuildBoardModelArgs (and per-cabinet via the form
 *  field "עובי גב"). cm. */
export const BACK_THICKNESS_CM = 0.5;

/** Hinge gap between the carcass front edge and the front panel — fixed
 *  by the hinge cup geometry. cm. Drives the carcass-depth reduction:
 *  `carcassD = cabinetD - backThickness - HINGE_GAP_CM - frontThickness`. */
export const HINGE_GAP_CM = 0.3;

/** Floor clearance under the outer envelope side panels — the cabinet rests
 *  on plastic levelers ~6 mm tall, so the envelope sides are cut short by
 *  this amount to leave room. cm. Affects only `envelope-left` /
 *  `envelope-right` cut length. */
export const LEVELER_GAP_CM = 0.6;

// ── Joint method ─────────────────────────────────────────────────────────────
// Rabbet: sides span full height; top/bottom slot between the sides.
//   → narrow / tall cabinets (W ≤ 2·H), where the sides carry the load.
// Butt:  top/bottom span full width; sides slot between top and bottom.
//   → wide / short cabinets (W > 2·H), where the top/bottom carry the load.

export type JointMethod = 'rabbet' | 'butt';

/** Per-body helper kept for legacy callers / unit tests. Production code
 *  (`useCabinet`, `CabinetSketch`) decides the joint method ONCE per cabinet
 *  via {@link resolveCabinetJointMethod} so all bodies in a multi-row
 *  cabinet share the same top/bottom-panel cut formula. */
export function resolveJointMethod(box: Box): JointMethod {
  return box.W > 2 * box.H ? 'butt' : 'rabbet';
}

/** Cabinet-level joint method. Takes the user's H and W input (the external
 *  cabinet dimensions including plinth) so multi-row cabinets do not flip
 *  joint between rows when one row's box.H drops below the W/2 threshold.
 *  Carpentry intent: a tall cabinet rests load on its sides (rabbet);
 *  a wide-short cabinet rests load on its top/bottom (butt). The overall
 *  cabinet's slenderness drives the choice — not the slenderness of any
 *  individual row. */
export function resolveCabinetJointMethod(cabinetW: number, cabinetH: number): JointMethod {
  return cabinetW > 2 * cabinetH ? 'butt' : 'rabbet';
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
  /** Outer envelope depth in cm — used for envelope-* board `width`. The
   *  envelope spans the full cabinet depth, while box.D is the (smaller)
   *  carcass depth (= cabinetD − backThickness − HINGE_GAP − frontThickness).
   *  Defaults to box.D when not provided (legacy callers / unit tests). */
  envelopeDepth?: number;
  /** Back-panel thickness in cm. Defaults to `BACK_THICKNESS_CM`. The form
   *  exposes this as the "עובי גב" field; callers pass the user value
   *  here so the back-panel cut emits the right thickness. */
  backThicknessCm?: number;
  /** Full cabinet height in cm (top of envelope-top to floor — i.e. the
   *  user's H input, which already includes plinth). Drives the cut length
   *  of envelope-left / envelope-right: those side panels span the WHOLE
   *  cabinet side and are shortened by `LEVELER_GAP_CM` so they sit on
   *  plastic levelers. Defaults to box.H for legacy / unit-test callers. */
  cabinetTotalH?: number;
  /** Joint method override — when provided, replaces the per-box default
   *  from `resolveJointMethod(box)`. Production callers (`useCabinet`,
   *  `CabinetSketch`) compute this once at cabinet level via
   *  {@link resolveCabinetJointMethod} so every body in the cabinet shares
   *  the same top/bottom-panel cut formula. */
  joint?: JointMethod;
}

export function buildBoardModel(args: BuildBoardModelArgs): Board[] {
  const {
    box, bodyMaterial, frontMaterial,
    hasEnvelopeLeft, hasEnvelopeRight, hasEnvelopeTop,
    items, hasPartition, cellItems,
    plinthHeight = 0,
    hasBack = true,
    envelopeDepth,
    backThicknessCm = BACK_THICKNESS_CM,
    cabinetTotalH,
    joint: jointOverride,
  } = args;

  if (box.level === 'plinth') return [];

  const t = bodyMaterial.thickness / 10;   // cm
  const tF = frontMaterial.thickness / 10; // cm
  const W = box.W;
  const H = box.H;
  const D = box.D;
  // Envelope panels span the full cabinet depth — that includes the back
  // panel + hinge gap + front thickness that box.D already excluded.
  const envD = envelopeDepth ?? D;
  // Envelope side length: full external cabinet height minus the floor gap
  // for plastic levelers. Defaults to this body's H so legacy callers and
  // unit tests keep working when they only care about a single body.
  const envSideLength = (cabinetTotalH ?? H) - LEVELER_GAP_CM;
  const matId = bodyMaterial.id;
  const frontMatId = frontMaterial.id;
  const joint = jointOverride ?? resolveJointMethod(box);

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
  // The back is cut to the OUTER dimensions of the body (W × H) so it
  // overlays the back face of the carcass — covering the rear edges of the
  // side / top / bottom panels rather than slotting between them.
  if (hasBack) {
    out.push({
      id: newItemId(), role: 'back', materialId: matId,
      length: W, width: H, thickness: backThicknessCm,
      xFrom: 0, xTo: W, yFrom: 0, yTo: H, visible: false,
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
  // Envelope panels use `envD` (full cabinet depth) rather than box.D
  // (carcass depth) — the outer shell wraps around the back panel and the
  // hinge gap that the carcass excludes. envelope-left/right length spans
  // the FULL external cabinet height (cabinetTotalH, including plinth)
  // minus LEVELER_GAP_CM for the plastic levelers under the cabinet.
  if (hasEnvelopeLeft) {
    out.push({
      id: newItemId(), role: 'envelope-left', materialId: frontMatId,
      length: envSideLength, width: envD, thickness: tF,
      xFrom: -tF, xTo: 0, yFrom: 0, yTo: H, visible: true,
    });
  }
  if (hasEnvelopeRight) {
    out.push({
      id: newItemId(), role: 'envelope-right', materialId: frontMatId,
      length: envSideLength, width: envD, thickness: tF,
      xFrom: W, xTo: W + tF, yFrom: 0, yTo: H, visible: true,
    });
  }
  if (hasEnvelopeTop) {
    out.push({
      id: newItemId(), role: 'envelope-top', materialId: frontMatId,
      length: W, width: envD, thickness: tF,
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
      materialId: b.materialId,
    } satisfies CutItem;
  });
}
