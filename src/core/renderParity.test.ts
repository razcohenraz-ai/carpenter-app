import { describe, it, expect } from 'vitest';
import { computeUnitCutsAndHardware } from './cabinetCompute';
import { cabinetBoardBoxes, type BoardBox3D } from './product/cabinetBoards3D';
import { cabinetSketchBoards } from './product/cabinetSketchBoards';
import { cabinetFrontPanels } from './product/cabinetFronts';
import { computeInnerWidth, computeCarcassDepth, HINGE_GAP_CM, type Board } from './boards/boardModel';
import { isCorner } from './product/cornerModule';
import { defaultInputForType, emptyCabinetState } from './product/productDefaults';
import { kitchenModuleInput, kitchenModuleState, type KitchenModuleType } from './product/kitchenModules';
import { computeSketchGeometry } from '../ui/components/CabinetSketch.utils';
import { getMaterialWithCustom } from '../catalog';
import { getShellSides } from '../types/cabinet';
import type { CabinetInput, CutItem, SavedCabinetState } from '../types';

/**
 * Render-parity net (Gotcha #8 — the three board-building call sites that drift).
 *
 * The cut list (`computeUnitCutsAndHardware`) is the SINGLE SOURCE OF TRUTH for
 * which boards a cabinet has. The 3D view (`cabinetBoardBoxes`) and the 2D sketch
 * (`computeSketchGeometry`) re-derive the model independently — and historically
 * drifted (e.g. the קלפה top/bottom envelope caps that the cut list emitted but
 * the 3D dropped, and the 2D drew in body colour).
 *
 * What this asserts — and, deliberately, what it does NOT:
 *  - The 3D model and the cut list MUST agree on the **multiset of structural
 *    boards by role** (a "census"). This is the true invariant: a render path
 *    dropping, duplicating, or mis-roling a board breaks it immediately.
 *  - It does NOT compare exact dimensions. The 3D view legitimately rounds off
 *    the 6 mm leveler gap, edge-banding deductions, the full-height envelope
 *    re-emission, and the flat `plinth-gable-b` cap — so size parity would
 *    false-positive. A coarse bounding-box guard catches gross mis-sizing
 *    without that fragility.
 *  - The 2D check covers the pure geometry function (`computeSketchGeometry`):
 *    envelope-cap presence must match the cut list. The role-tagged body-board
 *    emission still lives in `CabinetSketch.tsx` (React) and is NOT reachable
 *    here — extracting it to core would let this net cover it too (see the note
 *    at the bottom of this file).
 */

// ── Census scope ────────────────────────────────────────────────────────────
// Cut-list groups that carry `boardsToCutItems` boards (each item is one board,
// qty 1). Doors ('door'), external-drawer faces + corner filler ('front'), and
// drawer-box parts ('drawer') are NOT structural carcass boards.
const STRUCT_GROUPS = new Set<CutItem['group']>(['body', 'shell', 'back', 'plinth']);

// The 2D BODY sketch draws the plinth as one cabinet-level rect, never as
// per-body boards — so its board model carries carcass + envelope + back, but
// no plinth. Census the 2D path against this narrower scope.
const STRUCT_GROUPS_2D = new Set<CutItem['group']>(['body', 'shell', 'back']);

// Roles the two paths handle asymmetrically BY DESIGN — excluded from the census
// on both sides so the comparison stays a true invariant:
//  - 'partition': the cut list emits it via computePartitionCuts WITHOUT a role
//    tag (so it never enters the cut census), while the 3D tags it 'partition'.
//  - 'plinth-gable-b': the flat cap the 3D view intentionally skips.
const EXCLUDED_ROLES = new Set<string>(['partition', 'plinth-gable-b']);

// 3D-only fixture roles (not carcass boards, never in the cut list as boards).
const FIXTURE_ROLES = new Set<string>(['drawer-box', 'rod', 'front']);

/** Multiset of structural board roles in the cut list (the source of truth),
 *  restricted to the given cut groups (3D censuses all four; 2D omits plinth). */
function censusFromCuts(
  cuts: CutItem[],
  groups: ReadonlySet<CutItem['group']> = STRUCT_GROUPS,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cuts) {
    if (!c.role) continue;
    if (!c.group || !groups.has(c.group)) continue;
    if (EXCLUDED_ROLES.has(c.role)) continue;
    m.set(c.role, (m.get(c.role) ?? 0) + c.qty);
  }
  return m;
}

/** Multiset of structural board roles in the 3D model. */
function censusFrom3D(boxes: BoardBox3D[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of boxes) {
    if (FIXTURE_ROLES.has(b.role)) continue;
    if (EXCLUDED_ROLES.has(b.role)) continue;
    m.set(b.role, (m.get(b.role) ?? 0) + 1);
  }
  return m;
}

/** Multiset of structural board roles in the 2D body sketch (carcass + envelope
 *  + back; the body sketch emits no plinth boards). */
function censusFrom2D(boards: Board[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of boards) {
    if (EXCLUDED_ROLES.has(b.role)) continue;
    m.set(b.role, (m.get(b.role) ?? 0) + 1);
  }
  return m;
}

// ── Representative cabinet matrix ────────────────────────────────────────────
interface Case { name: string; input: CabinetInput; state: SavedCabinetState }

function km(name: string, type: KitchenModuleType): Case {
  return { name, input: kitchenModuleInput(type), state: kitchenModuleState(type) };
}
const base = () => defaultInputForType('wardrobe');
const empty = () => emptyCabinetState() as SavedCabinetState;

const CASES: Case[] = [
  { name: 'base — single body, no plinth/shell', input: base(), state: empty() },
  { name: 'base — multi-body (wide + tall: 3 cols × 2 rows)', input: { ...base(), W: 240, H: 220, plinth: 10 }, state: empty() },
  { name: 'base — plinth + 1 door', input: { ...base(), H: 90, plinth: 10 }, state: empty() },
  {
    name: 'base — shell + envelope-top + plinth',
    input: { ...base(), H: 90, plinth: 10, hasShell: true, hasEnvelopeTop: true },
    state: empty(),
  },
  {
    name: 'base — 2 rows + shell + envelope-top',
    input: { ...base(), H: 200, plinth: 10, hasShell: true, hasEnvelopeTop: true, doorsPerColumn: 2, lowerDoorH: 90 },
    state: empty(),
  },
  km('kitchen — drawers', 'drawers'),
  km('kitchen — shelves', 'shelves'),
  km('kitchen — sink (open top)', 'sink'),
  km('kitchen — dishwasher (no back/bottom/plinth)', 'dishwasher'),
  km('kitchen — oven (drawer + fixed shelf)', 'oven'),
  km('kitchen — pantry (internal drawers)', 'pantry'),
  km('kitchen — pantry-top', 'pantry-top'),
  km('kitchen — wall (קלפה), no envelope', 'wall'),
  {
    name: 'kitchen — wall (קלפה) + top&bottom envelope caps',
    input: { ...kitchenModuleInput('wall'), hasWallEnvelope: true },
    state: kitchenModuleState('wall'),
  },
  km('kitchen — corner (פינה)', 'corner'),
];

// ── 1. 3D ↔ cut list: structural board census ────────────────────────────────
describe('render parity — 3D board model vs cut list', () => {
  it.each(CASES)('$name — structural board census matches the cut list', ({ input, state }) => {
    const { cuts } = computeUnitCutsAndHardware(input, state, []);
    const boxes = cabinetBoardBoxes(input, state, []);
    expect(censusFrom3D(boxes)).toEqual(censusFromCuts(cuts));
  });

  // ── 2. Coarse dimension guard: nothing escapes the cabinet envelope, and the
  //      model reaches the right (W) and top (H) extents. Catches gross
  //      mis-sizing without the false positives of exact-dimension parity. ──
  it.each(CASES)('$name — 3D model stays within W×H×D and fills W×H', ({ input, state }) => {
    const boxes = cabinetBoardBoxes(input, state, []);
    expect(boxes.length).toBeGreaterThan(0);
    const EPS = 0.05;
    const maxX1 = Math.max(...boxes.map(b => b.x1));
    const maxY1 = Math.max(...boxes.map(b => b.y1));
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(-EPS);
      expect(b.x1).toBeLessThanOrEqual(input.W + EPS);
      expect(b.y0).toBeGreaterThanOrEqual(-EPS);
      expect(b.y1).toBeLessThanOrEqual(input.H + EPS);
      expect(b.z0).toBeGreaterThanOrEqual(-EPS);
      expect(b.z1).toBeLessThanOrEqual(input.D + EPS);
    }
    expect(maxX1).toBeCloseTo(input.W, 1); // boards reach the right edge
    expect(maxY1).toBeCloseTo(input.H, 1); // boards reach the cabinet top
  });
});

// ── 3. 2D sketch geometry ↔ cut list: envelope-cap presence ───────────────────
describe('render parity — 2D sketch geometry vs cut list', () => {
  it.each(CASES)('$name — envelope caps present iff the cut list emits them', ({ input, state }) => {
    const { cuts } = computeUnitCutsAndHardware(input, state, []);
    const roles = new Set(cuts.map(c => c.role).filter((r): r is string => !!r));

    const frontMat = getMaterialWithCustom(input.frontMaterialId, []);
    const tFront = frontMat.thickness / 10;
    const sides = getShellSides(input);
    const hasAnyShell = sides.left || sides.right;
    const wallEnv = input.hasWallEnvelope === true && input.mount === 'wall';
    const carcassD = computeCarcassDepth(input.D, input.backThickness, HINGE_GAP_CM, tFront);
    void computeInnerWidth; // (innerW is derived inside computeSketchGeometry)

    const geo = computeSketchGeometry(
      input.W, input.H, carcassD, input.plinth,
      input.lowerDoorH, input.doorsPerColumn, input.middleDoorH,
      hasAnyShell ? tFront : undefined, // tEnvelope (side shell)
      input.hasEnvelopeTop,
      undefined,                        // boxDimensionOverrides
      sides,                            // shellSides
      wallEnv ? tFront : 0,             // wallEnvelopeCm (קלפה caps)
      isCorner(input),                  // noWidthSplit
    );

    expect(geo.envelopeTopPanel != null).toBe(roles.has('envelope-top'));
    expect(geo.envelopeBottomPanel != null).toBe(roles.has('envelope-bottom'));
    expect(geo.envelopePanels?.left != null).toBe(roles.has('envelope-left'));
    expect(geo.envelopePanels?.right != null).toBe(roles.has('envelope-right'));
  });
});

// ── 3b. 2D body-board model ↔ cut list: structural board census ───────────────
// `cabinetSketchBoards` is the SAME function `CabinetSketch.tsx` renders, so this
// censuses the real 2D body-board emission — the layer that drew the קלפה cap in
// body colour (bug #2 of that incident) before it was extracted to core.
describe('render parity — 2D body-board model vs cut list', () => {
  it.each(CASES)('$name — 2D carcass+envelope+back census matches the cut list', ({ input, state }) => {
    const { cuts } = computeUnitCutsAndHardware(input, state, []);
    const boards = cabinetSketchBoards(input, state, []);
    expect(censusFrom2D(boards)).toEqual(censusFromCuts(cuts, STRUCT_GROUPS_2D));
  });
});

// ── 3c. Front geometry: rendered faces vs the cut list ────────────────────────
// The role census above counts boards but not front POSITIONS/WIDTHS — so a
// render door width drifting from the cut list (as it did for shelled units,
// where the render laid fronts over the full W instead of the inner opening,
// overhanging the right edge) slips past it. These two checks close that gap.
describe('render parity — front-face geometry vs cut list', () => {
  // Containment: no face may overhang the cabinet width. Catches the shelled
  // overhang for EVERY face type (door / drawer / corner filler), self-contained.
  it.each(CASES)('$name — front faces stay within [0, W]', ({ input, state }) => {
    for (const f of cabinetFrontPanels(input, state, [])) {
      expect(f.x0).toBeGreaterThanOrEqual(-0.05);
      expect(f.x1).toBeLessThanOrEqual(input.W + 0.05);
    }
  });

  // Caps: a face must sit BETWEEN the envelope caps, never over them. Catches the
  // קלפה lift door overlapping its top+bottom caps AND a shell door overlapping
  // the ceiling envelope — the door area must drop the same caps the cut list does
  // (via the reduced box.H). Self-contained: derived straight from the input.
  it.each(CASES)('$name — front faces clear the top/bottom envelope caps', ({ input, state }) => {
    const tFront = getMaterialWithCustom(input.frontMaterialId, []).thickness / 10;
    const sides = getShellSides(input);
    const wallEnv = input.hasWallEnvelope === true && input.mount === 'wall';
    const topCap = ((input.hasEnvelopeTop && (sides.left || sides.right)) || wallEnv) ? tFront : 0;
    const botCap = wallEnv ? tFront : 0;
    for (const f of cabinetFrontPanels(input, state, [])) {
      if (topCap > 0) expect(f.y1).toBeLessThanOrEqual(input.H - topCap + 0.05);
      if (botCap > 0) expect(f.y0).toBeGreaterThanOrEqual(input.plinth + botCap - 0.05);
    }
  });

  // Width parity: every rendered door face (hinged panel) must match a cut-list
  // door width. The shell bug made rendered doors too WIDE (laid over W, not the
  // inner opening) → no cut-list match. Tolerance absorbs the perimeter edge-band
  // (≤ 2·1.3mm), well below the cm-scale drift. Subset (not length-equality): the
  // cut list can carry a sub-3cm "door" above a full external-drawer stack that
  // the render intentionally omits (render drops door rows < 3cm).
  const TOL_MM = 3;
  it.each(CASES)('$name — every rendered door width matches a cut-list door', ({ input, state }) => {
    const { cuts } = computeUnitCutsAndHardware(input, state, []);
    const cutDoorW = cuts.filter(c => c.group === 'door').map(c => c.w);
    const renderDoorW = cabinetFrontPanels(input, state, [])
      .filter(p => p.hingeSide !== undefined)            // door panels only
      .map(p => Math.round((p.x1 - p.x0) * 10));         // cm → mm
    for (const rw of renderDoorW) {
      const matched = cutDoorW.some(cw => Math.abs(rw - cw) <= TOL_MM);
      expect(matched, `rendered door ${rw}mm has no cut-list match in [${cutDoorW.join(', ')}]`).toBe(true);
    }
  });
});

// ── 4. Named regression: the קלפה envelope bug, asserted across all three paths.
describe('render parity — קלפה (wall cabinet) top+bottom envelope', () => {
  const input: CabinetInput = { ...kitchenModuleInput('wall'), hasWallEnvelope: true };
  const state = kitchenModuleState('wall');

  it('the cut list, the 3D model, and the 2D sketch all carry BOTH caps', () => {
    const { cuts } = computeUnitCutsAndHardware(input, state, []);
    const cutRoles = new Set(cuts.map(c => c.role));
    expect(cutRoles.has('envelope-top')).toBe(true);
    expect(cutRoles.has('envelope-bottom')).toBe(true);

    const boxes = cabinetBoardBoxes(input, state, []);
    const boxRoles = boxes.map(b => b.role);
    expect(boxRoles).toContain('envelope-top');
    expect(boxRoles).toContain('envelope-bottom');

    const sketchRoles = cabinetSketchBoards(input, state, []).map(b => b.role);
    expect(sketchRoles).toContain('envelope-top');
    expect(sketchRoles).toContain('envelope-bottom');

    const frontMat = getMaterialWithCustom(input.frontMaterialId, []);
    const tFront = frontMat.thickness / 10;
    const carcassD = computeCarcassDepth(input.D, input.backThickness, HINGE_GAP_CM, tFront);
    const geo = computeSketchGeometry(
      input.W, input.H, carcassD, input.plinth,
      input.lowerDoorH, input.doorsPerColumn, input.middleDoorH,
      undefined, false, undefined, getShellSides(input), tFront, false,
    );
    expect(geo.envelopeTopPanel).not.toBeNull();
    expect(geo.envelopeBottomPanel).not.toBeNull();
  });
});

// All three board-building paths are now covered by this net:
//   - cut list   → computeUnitCutsAndHardware (source of truth)
//   - 3D model   → cabinetBoardBoxes
//   - 2D body    → cabinetSketchBoards (the function CabinetSketch.tsx renders)
// The 2D emission was extracted from CabinetSketch.tsx into core/product/
// cabinetSketchBoards.ts so the component and this census share ONE
// implementation — closing the single-source gap that produced bug #2 (the
// קלפה bottom cap drawn in body colour). computeSketchGeometry still owns the
// SVG layout (rects/scale); only the role-tagged board set moved to core.
