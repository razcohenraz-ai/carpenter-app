import type { KitchenUnit } from '../../types/project';
import { getShellSides } from '../../types/cabinet';
import { getEffectiveMaterial } from '../../catalog';

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

/** Outer width of a unit including its shell envelope on each present side. */
export function unitOuterW(unit: KitchenUnit): number {
  const sides = getShellSides(unit.cabinet.input);
  const tFront = getEffectiveMaterial(unit.cabinet.input.frontMaterialId).thickness / 10;
  return effectiveUnitDims(unit).W + (sides.left ? tFront : 0) + (sides.right ? tFront : 0);
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
