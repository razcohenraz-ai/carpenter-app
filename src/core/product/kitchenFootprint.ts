import type { KitchenUnit } from '../../types/project';

// ── Kitchen elevation reference heights (cm) ──────────────────────────────────
// A wall cabinet (קלפה) hangs WALL_BOTTOM_CM above the floor:
//   base carcass height + countertop + clearance to the underside of the wall row.
// These were inline in KitchenOverview; centralised here so the room footprint
// and the elevation render agree (single source).

export const COUNTERTOP_CM = 2;
export const BASE_REF_H_CM = 90;
export const WALL_CLEARANCE_CM = 60;
export const WALL_BOTTOM_CM = BASE_REF_H_CM + COUNTERTOP_CM + WALL_CLEARANCE_CM; // 152

/** Effective W/H/D of a kitchen unit after any single-body dimension override
 *  (the `'single:single'` slot — kitchen units are always one body). */
export function effectiveUnitDims(unit: KitchenUnit): { W: number; H: number; D: number } {
  const inp = unit.cabinet.input;
  const ovr = unit.cabinet.state.boxDimensionOverrides?.['single:single'];
  return { W: ovr?.W ?? inp.W, H: ovr?.H ?? inp.H, D: ovr?.D ?? inp.D };
}

/** True if the unit is a wall cabinet (קלפה) — hangs above the countertop and
 *  does not stand on the floor. */
export function isWallUnit(unit: KitchenUnit): boolean {
  return (unit.cabinet.input.mount ?? 'base') === 'wall';
}

/** Outer (external) width of a unit, cm. The entered `W` is ALREADY the
 *  external width — the shell is carved INSIDE it (`innerW = W − shells`; see
 *  CARPENTRY_RULES "מעטפת חיצונית: מידות שהוזנו = מידות חיצוניות"). A unit's
 *  carcass boards therefore span exactly `[0, W]`, so the kitchen layout must
 *  space units by `W`. Adding the shell here double-counted it and left a
 *  shell-thick gap between units in the room top/elevation/3D views (the cut
 *  list and the 3D boards, which use `W` as the outer width, never had it). */
export function unitOuterW(unit: KitchenUnit): number {
  return effectiveUnitDims(unit).W;
}

/** 3D bounding box of a whole kitchen (all of its units), cm:
 *  - width  = sum of base-unit outer widths (wall units stack ABOVE the base
 *             row in the elevation, so they don't add to the floor width).
 *  - depth  = deepest unit.
 *  - height = top of the wall row when a wall cabinet is present, otherwise the
 *             base carcass + countertop.
 *
 *  An empty kitchen yields zeros. A wall-only kitchen (degenerate) falls back
 *  to the sum of all unit widths for `width`. */
export function kitchenFootprint(
  units: ReadonlyArray<KitchenUnit>,
): { width: number; height: number; depth: number } {
  if (units.length === 0) return { width: 0, height: 0, depth: 0 };

  const base = units.filter(u => !isWallUnit(u));
  const walls = units.filter(isWallUnit);

  const width = (base.length > 0 ? base : units).reduce((s, u) => s + unitOuterW(u), 0);
  const depth = units.reduce((m, u) => Math.max(m, effectiveUnitDims(u).D), 0);

  const baseTop = BASE_REF_H_CM + COUNTERTOP_CM;
  const wallTop = walls.length > 0
    ? WALL_BOTTOM_CM + Math.max(...walls.map(u => effectiveUnitDims(u).H))
    : 0;
  const height = Math.max(baseTop, wallTop);

  return { width, height, depth };
}

// ── Per-unit elevation layout ────────────────────────────────────────────────
// Where each unit sits in the kitchen's X-Y elevation plane: base units run
// left→right on the floor; wall cabinets (קלפה) stack in an upper row whose
// bottom is WALL_BOTTOM_CM, pushed past any tall base unit (a pantry) below
// them. Lifted verbatim from KitchenOverview's inline `positions` computation
// so the elevation render, the room sub-boxes, and the future 3D all read one
// source. `xCm` is measured from the kitchen's left edge.

export interface KitchenUnitBox {
  unitId: string;
  /** Left edge of the unit within the kitchen frame, cm (0 = left edge). */
  xCm: number;
  /** Bottom of the unit off the floor, cm — 0 for a base unit, WALL_BOTTOM_CM
   *  for a wall cabinet. */
  yBottomCm: number;
  /** Outer width (incl. shell), cm. */
  w: number;
  /** Effective height, cm. */
  h: number;
  /** Effective depth, cm. */
  depth: number;
  isWall: boolean;
}

/** Lays out every unit of a kitchen in its elevation plane. Preserves the
 *  array order → visual position mapping. A pre-scan marks x-ranges blocked in
 *  the wall row by tall base units (H > WALL_BOTTOM_CM, strict — a unit whose
 *  top edge sits exactly at the wall-row bottom touches but does not overlap),
 *  so a wall cabinet is pushed past a pantry regardless of array order. */
export function kitchenElevationLayout(units: ReadonlyArray<KitchenUnit>): KitchenUnitBox[] {
  // Pre-scan: x-ranges blocked in the wall row by tall base units.
  const wallBlockers: Array<{ lo: number; hi: number }> = [];
  {
    let scanX = 0;
    for (const u of units) {
      if (isWallUnit(u)) continue;
      const w = unitOuterW(u);
      if (effectiveUnitDims(u).H > WALL_BOTTOM_CM) wallBlockers.push({ lo: scanX, hi: scanX + w });
      scanX += w;
    }
  }

  const boxes: KitchenUnitBox[] = [];
  let baseX = 0;
  let wallCursor = 0;
  for (const u of units) {
    const w = unitOuterW(u);
    const { H: h, D: depth } = effectiveUnitDims(u);
    if (isWallUnit(u)) {
      // Push wallCursor past any blocker it would overlap (works even when the
      // blocker appears later in the array than the wall unit).
      let changed = true;
      while (changed) {
        changed = false;
        for (const b of wallBlockers) {
          if (wallCursor < b.hi && wallCursor + w > b.lo) {
            wallCursor = b.hi; changed = true; break;
          }
        }
      }
      boxes.push({ unitId: u.id, xCm: wallCursor, yBottomCm: WALL_BOTTOM_CM, w, h, depth, isWall: true });
      wallCursor += w;
    } else {
      boxes.push({ unitId: u.id, xCm: baseX, yBottomCm: 0, w, h, depth, isWall: false });
      // Tall units block the wall zone (cursor jumps to their right edge);
      // normal units only advance the cursor to their start x so wall units
      // placed after them land "above" them (array-order semantics).
      wallCursor = Math.max(wallCursor, h > WALL_BOTTOM_CM ? baseX + w : baseX);
      baseX += w;
    }
  }
  return boxes;
}
