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
// The DOOR cut now follows the same single source of truth: it is derived from
// the computed `doors` map (Door.width/height), which already reflects the
// override — so both the door and the external-drawer front track the body.
// (Previously the door cut came from a separate calcCuts single-row path that
// reconstructed columns from input.W; see DECISIONS_LOG 2026-05-25 and the
// door-cut derivation in core/cuts/doorCuts.ts that closed that gap.)

const SLOT = 'single:single';

function withWidthOverride(base: SavedCabinetState, w: number): SavedCabinetState {
  return { ...base, boxDimensionOverrides: { [SLOT]: { W: w } } };
}

function withHeightOverride(base: SavedCabinetState, h: number): SavedCabinetState {
  return { ...base, boxDimensionOverrides: { [SLOT]: { H: h } } };
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

// ── Per-body overrides → DOOR cut (closes the calcCuts door-path debt) ───────
// The door cut is now derived from the computed door (doorsById), so a per-body
// W/H override flows into the saw-operator's list — previously it stayed fixed
// to the input W/H. 'shelves' is a single body with internal shelves only (no
// external drawers), so it has exactly one door whose height = body − gaps.
describe('computeUnitCutsAndHardware — door cut tracks per-body overrides', () => {
  const input = kitchenModuleInput('shelves');
  const state = kitchenModuleState('shelves');

  function doorCut(s: SavedCabinetState): { w: number; h: number } {
    const { cuts } = computeUnitCutsAndHardware(input, s);
    const door = cuts.find(c => c.group === 'door');
    expect(door, 'expected a door cut').toBeDefined();
    return { w: door!.w, h: door!.h };
  }

  it('door width follows a W override (was fixed to input W)', () => {
    // Keep W ≤ maxDoorWidth (60) so it stays a single column — pure width shift.
    const base = doorCut(withWidthOverride(state, 60)).w;
    const narrower = doorCut(withWidthOverride(state, 50)).w;
    expect(base - narrower).toBeCloseTo(100, 1); // 10 cm → 100 mm
  });

  it('door height follows an H override (was fixed to input H)', () => {
    const shorter = doorCut(withHeightOverride(state, 50)).h;
    const taller  = doorCut(withHeightOverride(state, 70)).h;
    expect(taller - shorter).toBeCloseTo(200, 1); // 20 cm → 200 mm
  });

  it('door width is monotonic in the W override', () => {
    const narrow = doorCut(withWidthOverride(state, 45)).w;
    const wide   = doorCut(withWidthOverride(state, 60)).w;
    expect(narrow).toBeLessThan(wide);
  });
});

// ── Corner (פינה): fixed-width door + L-shaped filler ────────────────────────
// The corner front is NOT the equal-split of the 125 cm body: it is one fixed
// 60 cm door at the chosen edge plus a front-material filler covering the rest
// (face flange + a 7 cm perpendicular hinge-post return). All three pieces reach
// the saw operator's list; the filler is enriched to the front material.
describe('computeUnitCutsAndHardware — corner (פינה) front + filler', () => {
  const input = kitchenModuleInput('corner'); // W=125, door 60 right, 7 cm return
  const state = kitchenModuleState('corner');
  const { cuts } = computeUnitCutsAndHardware(input, state);

  it('the single door cut is the fixed 60 cm width (not the 125 body width)', () => {
    const doors = cuts.filter(c => c.group === 'door');
    expect(doors).toHaveLength(1);
    expect(doors[0]!.w).toBeCloseTo(600 - 1.2, 1); // 60 cm − 1.2 mm edging band
  });

  it('emits the L-filler: face flange covering the rest + a 7 cm hinge-post return, both front material', () => {
    const face = cuts.find(c => c.name === 'מילוי פינה');
    const ret = cuts.find(c => c.name === 'זקף ציר פינה');
    expect(face).toBeDefined();
    expect(ret).toBeDefined();
    expect(face!.group).toBe('front');
    expect(ret!.group).toBe('front');
    expect(face!.materialId).toBe(input.frontMaterialId); // enriched to front material
    expect(ret!.materialId).toBe(input.frontMaterialId);
    // Face width = (125 − 60 − 3·0.3) cm − 1.2 mm band.
    expect(face!.w).toBeCloseTo((125 - 60 - 0.9) * 10 - 1.2, 1);
    // Return = 7 cm wide × inner opening (bodyH 80 − 2·1.8 = 76.4 cm).
    expect(ret!.w).toBeCloseTo(70, 1);
    expect(ret!.h).toBeCloseTo(764, 1);
  });

  it('the filler face height matches the door height (shared facade line)', () => {
    const door = cuts.find(c => c.group === 'door')!;
    const face = cuts.find(c => c.name === 'מילוי פינה')!;
    expect(face.h).toBeCloseTo(door.h, 1);
  });
});

// ── Per-body material override drives the cut-list materials ──────────────────
describe('computeUnitCutsAndHardware — per-body material override', () => {
  const SHELVES_SLOT = 'single:single';

  it('overrides body/front material + back thickness for that body in the cut list', () => {
    const input = kitchenModuleInput('shelves'); // body mdf18 / front oak18, single body
    const base = kitchenModuleState('shelves') as SavedCabinetState;
    const state: SavedCabinetState = {
      ...base,
      boxMaterialOverrides: { [SHELVES_SLOT]: { bodyMaterialId: 'oak18', frontMaterialId: 'mdf18', backThicknessCm: 1.6 } },
    };
    const { cuts } = computeUnitCutsAndHardware(input, state, []);

    const body = cuts.filter(c => c.group === 'body');
    expect(body.length).toBeGreaterThan(0);
    expect(body.every(c => c.materialId === 'oak18')).toBe(true);   // overridden body material

    const back = cuts.filter(c => c.group === 'back');
    expect(back.length).toBeGreaterThan(0);
    expect(back.every(c => c.materialId === 'oak18')).toBe(true);   // back follows the body material
    expect(back.every(c => c.note === '16mm')).toBe(true);          // overridden back thickness

    const doors = cuts.filter(c => c.group === 'door');
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every(c => c.materialId === 'mdf18')).toBe(true);  // overridden front material
  });

  it('no override → cabinet-default materials (baseline unchanged)', () => {
    const input = kitchenModuleInput('shelves');
    const { cuts } = computeUnitCutsAndHardware(input, kitchenModuleState('shelves'), []);
    expect(cuts.filter(c => c.group === 'body').every(c => c.materialId === 'mdf18')).toBe(true);
    expect(cuts.filter(c => c.group === 'door').every(c => c.materialId === 'oak18')).toBe(true);
  });
});
