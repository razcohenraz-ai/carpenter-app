import type { Box, BoxLevel } from '../../types/geometry';

// ── Cabinet front geometry — per-row ──────────────────────────────────────────
// A "row" is the set of bodies that share the same vertical level
// (Box.level: 'bottom' | 'middle' | 'top' | 'single'). Every row is an
// **independent horizontal unit** for front layout: it spreads its own fronts
// across the cabinet's full width, with one gap on each outer edge and one
// gap between every pair of adjacent fronts within the row.
//
// Internal partitions and boundaries between bodies of the same row are
// deliberately ignored — fronts are an overlay that covers the carcass and
// any internal partition beneath it.
//
// Layout rule (per row):
//   W_available = innerW (= W − 2·shellThickness) when an outer shell is
//                 present; otherwise the raw cabinet width.
//   N           = totalFrontsInRow (sum of numFronts across the row's bodies)
//   frontWidth  = (W_available − (N + 1) · gapCm) / N
//
//   x_i         = gapCm + i · (frontWidth + gapCm)     (0 ≤ i < N)
//
// All x values are in cm, relative to the inner-left of the cabinet (i.e. the
// inside-edge of the left shell panel when a shell is present, else the
// cabinet's left edge). Renderers add the `cabinetLeftOffset` plus their own
// SVG origin.

export interface FrontPosition {
  /** cm from the inner-left of the cabinet (inside-edge of left shell, or
   *  left edge of cabinet when there is no shell). */
  x: number;
  /** cm. */
  width: number;
}

export interface RowFrontLayout {
  /** cm. Sum of fronts + (N+1) gaps. */
  wAvailable: number;
  /** cm. Width of a single front column within this row. */
  frontWidth: number;
  /** cm. Distance from cabinet's outer-left edge to the inner-left of the
   *  front row (= shellThicknessCm when a shell is present, else 0). */
  cabinetLeftOffset: number;
  /** cm. Per-side gap used to derive this layout. Echoed back so downstream
   *  consumers (renderers, cuts) don't have to thread it independently. */
  gapCm: number;
}

export interface RowFrontLayoutArgs {
  /** cm. Outer width of the cabinet. */
  cabinetW: number;
  hasOuterShell: boolean;
  /** cm. Shell panel thickness (irrelevant if `hasOuterShell` is false). */
  shellThicknessCm: number;
  /** Sum of `numFronts` across every body in this row. */
  totalFrontsInRow: number;
  /** cm. Per-side gap (left edge, between adjacent fronts, right edge). */
  gapCm: number;
}

export function computeRowFrontLayout(args: RowFrontLayoutArgs): RowFrontLayout {
  const { cabinetW, hasOuterShell, shellThicknessCm, totalFrontsInRow: N, gapCm } = args;
  const cabinetLeftOffset = hasOuterShell ? shellThicknessCm : 0;
  const wAvailable = hasOuterShell ? cabinetW - 2 * shellThicknessCm : cabinetW;
  const frontWidth = N > 0 ? (wAvailable - (N + 1) * gapCm) / N : 0;
  return { wAvailable, frontWidth, cabinetLeftOffset, gapCm };
}

/** Position + width of a single front at `globalFrontIndexInRow` (0-indexed
 *  from left, **within the row**). For door fronts and single-column drawer
 *  fronts.
 *
 *  The gap that precedes this front sits at `[x − gapCm, x]`; the gap that
 *  follows it sits at `[x + width, x + width + gapCm]`. */
export function computeFrontGeometry(args: {
  globalFrontIndexInRow: number;
  layout: RowFrontLayout;
  gapCm: number;
}): FrontPosition {
  const { globalFrontIndexInRow: i, layout, gapCm } = args;
  return {
    x: gapCm + i * (layout.frontWidth + gapCm),
    width: layout.frontWidth,
  };
}

/** Position + width of a front that spans `spanLength` adjacent columns
 *  **within the same row**.
 *
 *  Use for a body-wide external drawer in an N-front body: its panel covers
 *  all N columns of that body, including the (N − 1) inner gaps between
 *  them. The outer gap on each side is not included (those belong to
 *  neighbouring fronts).
 *
 *  When `spanLength === 1` the result matches `computeFrontGeometry`. */
export function computeFrontGeometryForSpan(args: {
  startGlobalIndexInRow: number;
  spanLength: number;
  layout: RowFrontLayout;
  gapCm: number;
}): FrontPosition {
  const { startGlobalIndexInRow: i, spanLength, layout, gapCm } = args;
  return {
    x: gapCm + i * (layout.frontWidth + gapCm),
    width: spanLength * layout.frontWidth + (spanLength - 1) * gapCm,
  };
}

/** Sum of `numFronts` over every body to the LEFT of `targetBoxId` **within
 *  the same row** (the bodies sharing its `level`). The result is the
 *  `globalFrontIndexInRow` of the first (leftmost) front in the target box.
 *  Returns -1 when the box is absent from the row.
 *
 *  The caller may pass either a pre-filtered row (`rowBoxes` = bodies of the
 *  same level) or the full body list; the helper filters internally by the
 *  target box's level. */
export function getBoxFirstGlobalFrontIndex(args: {
  rowBoxes: ReadonlyArray<Pick<Box, 'id'>>;
  numFrontsPerBox: Map<string, number>;
  targetBoxId: string;
}): number {
  const { rowBoxes, numFrontsPerBox, targetBoxId } = args;
  let sum = 0;
  for (const box of rowBoxes) {
    if (box.id === targetBoxId) return sum;
    sum += numFrontsPerBox.get(box.id) ?? 1;
  }
  return -1;
}

/** Number of front columns a single body splits into.
 *
 *  Standard bodies split once per `maxDoorWidth` of width — a 130 cm body at
 *  maxDoorWidth 120 yields 2 columns (`ceil(130 / 120)`).
 *
 *  Wall cabinets (`mount === 'wall'`) are pinned to a SINGLE front whatever
 *  their width: the lift-up flap is one panel, not a hinged pair, so a wide
 *  wall cabinet must NOT auto-split. (A future per-cabinet "front count"
 *  override will let the carpenter request more — until then it is always 1.)
 *
 *  This is the single source of truth for the column count; every compute path
 *  (useCabinet, cabinetCompute, the kitchen overview) routes through it so the
 *  number of doors stays consistent across the sketch, the cut list and the
 *  hardware. */
export function frontColumnsForBox(
  boxW: number,
  maxDoorWidth: number,
  mount?: 'base' | 'wall',
): number {
  if (mount === 'wall') return 1;
  return Math.max(1, Math.ceil(boxW / maxDoorWidth));
}

/** Total number of fronts in a row — convenience for layout input. */
export function getTotalFrontsInRow(
  rowBoxes: ReadonlyArray<Pick<Box, 'id'>>,
  numFrontsPerBox: Map<string, number>,
): number {
  let total = 0;
  for (const box of rowBoxes) total += numFrontsPerBox.get(box.id) ?? 1;
  return total;
}

/** Groups bodies by their `level` (one row per level). The 'plinth' level
 *  is **skipped** — it doesn't host fronts.
 *
 *  Boxes are kept in input order within each group, so callers that pass
 *  left-to-right ordered boxes get left-to-right ordered rows. */
export function groupBoxesByRow(
  boxes: ReadonlyArray<Box>,
): Map<BoxLevel, Box[]> {
  const result = new Map<BoxLevel, Box[]>();
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    const arr = result.get(box.level) ?? [];
    arr.push(box);
    result.set(box.level, arr);
  }
  return result;
}
