import { describe, it, expect } from 'vitest';
import { computeUnitCutsAndHardware } from './cabinetCompute';
import { kitchenModuleInput, kitchenModuleState } from './product/kitchenModules';
import { defaultInputForType, emptyCabinetState } from './product/productDefaults';
import type { CutItem } from '../types/cuts';
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

// ── Per-body door sizing — an override changes only that body ────────────────
// Each body sizes its doors from its OWN width (not one even width spread across
// the whole row). So widening one body widens ONLY its door; its neighbours are
// untouched. (Row-even sizing would instead spread the extra width across every
// door in the row — the bug this replaces.)
describe('per-body door sizing — override changes only that body', () => {
  const base = {
    ...defaultInputForType('wardrobe'),
    W: 240, H: 80, plinth: 0, doorsPerColumn: 1 as const, maxDoorWidth: 120,
  };
  const empty = () => emptyCabinetState() as SavedCabinetState;

  /** Door-cut widths (mm), expanded by qty, ascending. */
  function doorWidthsMm(state: SavedCabinetState): number[] {
    const { cuts } = computeUnitCutsAndHardware(base, state);
    return cuts.filter(c => c.group === 'door')
      .flatMap(c => Array<number>(c.qty).fill(c.w))
      .sort((a, b) => a - b);
  }

  it('widening the middle body widens only its door; the two neighbours are unchanged', () => {
    // 240 cm → 3 carcasses (unit_1/2/3) of 80 cm, one door each.
    const baseline = doorWidthsMm(empty());
    expect(baseline).toHaveLength(3);
    const w0 = baseline[0]!;
    expect(baseline.every(w => Math.abs(w - w0) < 0.5)).toBe(true);

    const ovr = { ...empty(), boxDimensionOverrides: { 'single:unit_2': { W: 100 } } } as SavedCabinetState;
    const widened = doorWidthsMm(ovr);
    expect(widened).toHaveLength(3);
    expect(widened[0]).toBeCloseTo(w0, 0);          // neighbour unchanged
    expect(widened[1]).toBeCloseTo(w0, 0);          // neighbour unchanged
    expect(widened[2]! - w0).toBeCloseTo(200, 0);   // +20 cm goes ENTIRELY to its own door
  });

  it('the plinth follows a per-body width override', () => {
    // 200cm cabinet (left/right of 100), plinth on. Widen 'left' to 130 → the
    // bottom row is 230cm, and the front kick-board must grow to match (not stay
    // at the original 200cm input W).
    const withPlinth = { ...defaultInputForType('wardrobe'), W: 200, H: 90, plinth: 10, doorsPerColumn: 1 as const };
    const frontPlinthMm = (state: SavedCabinetState): number =>
      computeUnitCutsAndHardware(withPlinth, state).cuts
        .find(c => c.group === 'plinth' && c.name === 'צוקל קדמי')?.w ?? 0;
    const noOvr = frontPlinthMm(empty());
    const ovr = frontPlinthMm({ ...empty(), boxDimensionOverrides: { 'single:left': { W: 130 } } } as SavedCabinetState);
    expect(noOvr).toBeGreaterThan(0);
    expect(ovr - noOvr).toBeCloseTo(300, 0);        // +30 cm body → +300 mm plinth
  });
});

// ── No phantom main door when drawers fill the body ──────────────────────────
describe('computeUnitCutsAndHardware — drawers unit has no phantom door', () => {
  it('emits no door cut with height ≤ 0 (the drawers fill the body)', () => {
    const input = kitchenModuleInput('drawers');
    const state = kitchenModuleState('drawers') as SavedCabinetState;
    const { cuts, hardwareItems } = computeUnitCutsAndHardware(input, state);
    const doorCuts = cuts.filter(c => c.group === 'door');
    expect(doorCuts.every(c => c.h > 0)).toBe(true);   // no negative/zero-height door
    // ...and no hinges counted for an absent door.
    expect(hardwareItems.every(h => h.qty >= 0)).toBe(true);
  });
});

// ── Body-view projection (onlyBoxStableKey) — Phase 0 ────────────────────────
// The body view must show a faithful SLICE of the cabinet cut list, not a
// standalone re-derivation. With `onlyBoxStableKey`, the whole cabinet is
// decomposed + laid out (full row context), but cuts are emitted for the one
// target body — so the per-body projections must PARTITION the cabinet's cuts.
describe('computeUnitCutsAndHardware — body-view projection', () => {
  // 240 wide, no shell, single level → 3 carcasses unit_1/2/3 (80 cm each).
  const input = { ...defaultInputForType('wardrobe'), W: 240, H: 80, plinth: 0, doorsPerColumn: 1 as const };
  const st = () => emptyCabinetState() as SavedCabinetState;
  const bodyKeys = ['single:unit_1', 'single:unit_2', 'single:unit_3'];
  const sig = (cuts: CutItem[]) =>
    cuts.map(c => `${c.name}|${c.w}|${c.h}|${c.qty}|${c.group}`).sort();

  it('per-body projections partition the cabinet cut list (no plinth here)', () => {
    const full = computeUnitCutsAndHardware(input, st(), []).cuts;
    const union = bodyKeys.flatMap(key =>
      computeUnitCutsAndHardware(input, st(), [], { onlyBoxStableKey: key }).cuts);
    expect(union.length).toBeGreaterThan(0);
    expect(sig(union)).toEqual(sig(full));
  });

  it("a body's projected door widths are all present in the cabinet door cuts", () => {
    const doorW = (cuts: CutItem[]) => cuts.filter(c => c.group === 'door').map(c => c.w);
    const full = doorW(computeUnitCutsAndHardware(input, st(), []).cuts);
    const proj = doorW(computeUnitCutsAndHardware(input, st(), [], { onlyBoxStableKey: 'single:unit_2' }).cuts);
    expect(proj.length).toBeGreaterThan(0);
    for (const w of proj) expect(full).toContain(w);
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
