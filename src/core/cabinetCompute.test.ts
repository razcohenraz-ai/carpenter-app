import { describe, it, expect } from 'vitest';
import { computeUnitCutsAndHardware } from './cabinetCompute';
import { kitchenModuleInput, kitchenModuleState } from './product/kitchenModules';
import type { SavedCabinetState } from '../types/project';

// ── Per-body W override → front geometry ─────────────────────────────────────
// A manual body-size override (boxDimensionOverrides) widens/narrows the body.
// The row's front layout must follow that effective width — not the global
// input W — so the external-drawer front cut (which derives its width from the
// row layout, same source as the rendered door) tracks the overridden body.
//
// NOTE: the DOOR cut itself (calcCuts → group 'door') is produced by a separate
// single-row path that reconstructs columns from input.W and is intentionally
// out of scope here — see CARPENTRY_RULES / PROJECT_CONTEXT known-debt note.

const SLOT = 'single:single';

function withWidthOverride(base: SavedCabinetState, w: number): SavedCabinetState {
  return { ...base, boxDimensionOverrides: { [SLOT]: { W: w } } };
}

/** Width (mm) of the external-drawer front cut in a unit's compute result. */
function drawerFrontWidthMm(
  input: ReturnType<typeof kitchenModuleInput>,
  state: SavedCabinetState,
): number {
  const { cuts } = computeUnitCutsAndHardware(input, state);
  const front = cuts.find(c => c.name === 'חזית מגירה חיצונית');
  expect(front, 'expected an external-drawer front cut').toBeDefined();
  return front!.w;
}

describe('computeUnitCutsAndHardware — per-body W override drives front width', () => {
  // 'drawers' module: single body, W=60, maxDoorWidth=60 → one front column.
  // Overriding within (0, 60] keeps a single column (ceil(W/60)=1), so the
  // change is a pure width shift with no re-split — isolating the layout effect.
  // Assertions compare DELTAS, not absolutes, so they stay valid regardless of
  // the fixed edging-band deduction baked into every front cut.
  const input = kitchenModuleInput('drawers');
  const state = kitchenModuleState('drawers');

  it('baseline equals input W minus the two outer gaps (and edging band)', () => {
    // frontWidth = 60 − 2·0.3 = 59.4 cm → 594 mm, less the 1.2 mm edging band.
    expect(drawerFrontWidthMm(input, state)).toBeCloseTo(592.8, 1);
  });

  it('a 10 cm narrower body shrinks the front by exactly 100 mm', () => {
    const base = drawerFrontWidthMm(input, state);               // W=60
    const narrower = drawerFrontWidthMm(input, withWidthOverride(state, 50));
    expect(base - narrower).toBeCloseTo(100, 1);
  });

  it('a 5 cm narrower body shrinks the front by exactly 50 mm', () => {
    const base = drawerFrontWidthMm(input, state);               // W=60
    const narrower = drawerFrontWidthMm(input, withWidthOverride(state, 55));
    expect(base - narrower).toBeCloseTo(50, 1);
  });

  it('front width is monotonic in the body W override', () => {
    const narrow = drawerFrontWidthMm(input, withWidthOverride(state, 50));
    const mid    = drawerFrontWidthMm(input, state);              // 60
    const wide   = drawerFrontWidthMm(input, withWidthOverride(state, 80));
    expect(narrow).toBeLessThan(mid);
    expect(mid).toBeLessThan(wide);
  });
});
