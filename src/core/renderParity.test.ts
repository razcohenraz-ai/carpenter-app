import { describe, it, expect } from 'vitest';
import { computeUnitCutsAndHardware } from './cabinetCompute';
import { cabinetBoardBoxes, type BoardBox3D } from './product/cabinetBoards3D';
import { computeInnerWidth, computeCarcassDepth, HINGE_GAP_CM } from './boards/boardModel';
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

// Roles the two paths handle asymmetrically BY DESIGN — excluded from the census
// on both sides so the comparison stays a true invariant:
//  - 'partition': the cut list emits it via computePartitionCuts WITHOUT a role
//    tag (so it never enters the cut census), while the 3D tags it 'partition'.
//  - 'plinth-gable-b': the flat cap the 3D view intentionally skips.
const EXCLUDED_ROLES = new Set<string>(['partition', 'plinth-gable-b']);

// 3D-only fixture roles (not carcass boards, never in the cut list as boards).
const FIXTURE_ROLES = new Set<string>(['drawer-box', 'rod', 'front']);

/** Multiset of structural board roles in the cut list (the source of truth). */
function censusFromCuts(cuts: CutItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cuts) {
    if (!c.role) continue;
    if (!c.group || !STRUCT_GROUPS.has(c.group)) continue;
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

// ── Representative cabinet matrix ────────────────────────────────────────────
interface Case { name: string; input: CabinetInput; state: SavedCabinetState }

function km(name: string, type: KitchenModuleType): Case {
  return { name, input: kitchenModuleInput(type), state: kitchenModuleState(type) };
}
const base = () => defaultInputForType('wardrobe');
const empty = () => emptyCabinetState() as SavedCabinetState;

const CASES: Case[] = [
  { name: 'base — single body, no plinth/shell', input: base(), state: empty() },
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

// NOTE (follow-up): the 2D body-board *role/colour* emission lives in
// CabinetSketch.tsx (React) and is not reachable from this pure-core net. Bug
// #2 of the קלפה incident (the bottom cap drawn in body colour) happened there.
// Extracting that emission into a pure `cabinetSketchBoards(input, state, …):
// Board[]` in core would remove a real single-source violation AND let this
// census cover the 2D path identically. Recommended next step.
