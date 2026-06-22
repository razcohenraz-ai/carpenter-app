import type { RunnerSpec } from '../../types/runners';
import { roundOutput } from '../utils/round';

// ── Vertical placement (floor-anchored stack) ────────────────────────────────

/** A drawer that is NOT the bottom one sits this far (mm) above the top of the
 *  reveal gap to the drawer below it. The bottom drawer's runner sits on the
 *  body floor instead. */
export const RUNNER_OVER_GAP_MM = 5;

export interface StackDrawer {
  id: string;
  /** Height of this drawer's front BOTTOM edge above the body floor (mm) — the
   *  top of the reveal gap to the drawer below. Ignored for the bottom drawer. */
  frontBottomFromFloorMm: number;
  /** True for the lowest drawer in the body (its runner sits on the floor). */
  isBottom: boolean;
}

export interface DrawerFixing {
  id: string;
  /** Runner-bottom (= side-panel bottom) height above the body floor, mm. */
  runnerBottomFromFloorMm: number;
  /** Side-panel screw-hole height above the body floor, mm
   *  (= runner bottom + spec.screwHeightMm). */
  screwHeightFromFloorMm: number;
}

/** Vertical placement of each drawer's runner + side-panel fixing screws, from
 *  the body floor up: the bottom drawer's runner sits on the floor (0); every
 *  drawer above sits RUNNER_OVER_GAP_MM (5) above the top of the reveal gap to
 *  the drawer below; the screw line is `spec.screwHeightMm` (37) above the
 *  runner bottom. */
export function computeDrawerFixingHeights(drawers: StackDrawer[], spec: RunnerSpec): DrawerFixing[] {
  return drawers.map((d): DrawerFixing => {
    const runnerBottom = d.isBottom ? 0 : d.frontBottomFromFloorMm + RUNNER_OVER_GAP_MM;
    return {
      id: d.id,
      runnerBottomFromFloorMm: roundOutput(runnerBottom),
      screwHeightFromFloorMm: roundOutput(runnerBottom + spec.screwHeightMm),
    };
  });
}

// ── Longitudinal hole selection ──────────────────────────────────────────────

export interface DrawerSideHoles {
  /** Front-screw hole, mm from the runner front. */
  frontHoleMm: number;
  /** Back-screw hole for this nominal length, mm from the runner front. */
  backHoleMm: number;
}

/** The two side-panel fixing-hole positions (mm from the runner front) for a
 *  given nominal length: a constant front hole and a per-NL back hole, both from
 *  the runner's `fixing` table (carpenter-supplied 560-series data). */
export function runnerFixingHoles(spec: RunnerSpec, nlMm: number): DrawerSideHoles {
  const ranges = spec.fixing.backHoleByNlMm;
  const match = ranges.find(r => nlMm <= r.maxNlMm) ?? ranges[ranges.length - 1];
  return {
    frontHoleMm: spec.fixing.frontHoleMm,
    backHoleMm: match?.holeMm ?? spec.fixing.frontHoleMm,
  };
}
