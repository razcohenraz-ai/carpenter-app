import type { CabinetInput, SavedCabinetState } from '../../types';
import type { ProductUnit } from '../../types/project';
import type { CustomMaterial } from '../../types/materials';
import type { Box, BoxLevel } from '../../types/geometry';
import type { InteriorItem, DrawerItem, RodItem } from '../../types/interior';
import type { ProductSubBox } from '../room/productBounds';
import {
  buildBoardModel, buildPlinthBoardModel, deriveEnvelopeFlags,
  resolveCabinetJointMethod, computeInnerWidth, computeCarcassDepth,
  getMaterial, HINGE_GAP_CM, LEVELER_GAP_CM, type Board, type BoardRole, type BoardOverrides,
} from '../boards/boardModel';
import { decomposeBoxes, applyBoxDimensionOverrides } from '../geometry/boxDecomposition';
import { getRunner } from '../../catalog/runners';
import { getLiftMechanism } from '../../catalog/liftMechanisms';
import { selectNominalLength, computeDrawerBox } from '../drawers/drawerBox';
import { DEFAULT_DRAWER_BOTTOM_MM } from '../drawers/drawerBoxCuts';
import { RUNNER_OVER_GAP_MM } from '../drawers/drawerDrilling';
import { resolveBoxMaterials } from '../boards/boxMaterials';
import { boxStableKey } from '../interior/interiorUtils';
import { getShellSides } from '../../types/cabinet';
import { getMaterialWithCustom } from '../../catalog';
import { kitchenElevationLayout } from './kitchenFootprint';
import { cabinetFrontPanels } from './cabinetFronts';
import { isCorner, cornerReturnBox } from './cornerModule';

/** One board of a product, expressed as a thin axis-aligned box in the
 *  product's LOCAL frame (cm) — the same frame as {@link ProductSubBox}
 *  (x = 0..width left→right, y = 0..height up from the floor, z = 0..depth
 *  back→front). Carries the board's `role` and effective `materialId` so the
 *  3D renderer can colour it. Because it extends `ProductSubBox`, the existing
 *  `placementSubBoxAABBs` transform maps it into room space unchanged — a board
 *  is just a very thin sub-box. */
/** Tag for the non-board pieces the 3D view also draws. A drawer is rendered as
 *  its inner tray box; a rod as a slender horizontal bar; a front as a flat
 *  door / drawer-front panel at the cabinet face (fronts view). */
export type FixtureRole = 'drawer-box' | 'rod' | 'front' | 'runner' | 'lift-mechanism';

export interface BoardBox3D extends ProductSubBox {
  role: BoardRole | FixtureRole;
  materialId: string;
  /** Set only on door front faces (role 'front'): the hinge EDGE, so the 3D
   *  view can draw the elevation hinge-marking triangle (apex on the opposite,
   *  opening side). 'top' = a lift-up door (קלפה) → apex points down. */
  hingeSide?: 'left' | 'right' | 'top';
}

// ── Interior fixture geometry (cm) — mirrors CabinetSketch's 2D drawing ─────────
const DRAWER_SIDE_GAP_CM = 1.25;   // inset each side, inside the inner band
const DRAWER_BOTTOM_GAP_CM = 2;    // tray bottom above the drawer face bottom
const DRAWER_TOP_GAP_CM = 3;       // tray top below the drawer face top
const EXT_DRAWER_GAP_CM = 0.2;     // gap between stacked external drawer faces
const DRAWER_DEPTH_BACK_INSET_CM = 1;   // tray set back from the carcass rear
const DRAWER_DEPTH_FRONT_INSET_CM = 2;  // tray set back from the carcass front
const ROD_RADIUS_CM = 1.5;         // hanging-rod half-thickness
// Drawer-runner rail — LENGTH (= nominal length NL), DEPTH placement and the
// floor-anchored DATUM are exact (runner spec + drilling model). The cross-
// section is built as a low C-CHANNEL read off the TANDEM cross-section diagram:
// a vertical web screwed to the gable, a foot under the drawer and a top return
// lip, its height ≈ the screw line; plus a front coupling block (the latch
// housing). The closest a box renderer gets to the real undermount runner.
const RUNNER_WEB_T_CM = 0.4;    // web thickness (flush to the gable)
const RUNNER_FOOT_W_CM = 2.2;   // channel depth inward, under the drawer
const RUNNER_FOOT_H_CM = 0.5;   // foot thickness
const RUNNER_LIP_W_CM = 1.4;    // top return lip reach
const RUNNER_LIP_H_CM = 0.4;    // lip thickness
const RUNNER_COUPLING_L_CM = 4; // front coupling-block length (along depth)
// Lift mechanism (AVENTOS) — a power-unit plate on each gable inner face at the
// top-front + a short folded lever arm. Schematic (the exact AVENTOS profile
// isn't specced); position (top-front, both gables) matches the planning diagram.
const LIFT_PLATE_T_CM = 2;      // plate stand-off from the gable inner face
const LIFT_PLATE_H_CM = 18;     // plate height (capped to the body)
const LIFT_PLATE_D_CM = 15;     // plate depth along Z (capped to the body)
const LIFT_TOP_GAP_CM = 2;      // gap below the body top

/** Carcass-board families and their depth (Z) placement. The 2D board model's
 *  front-view rect encodes X (width) and Y (height) only; the depth axis lives
 *  in the board's `width`/`thickness` and must be reconstructed per role here.
 *  Z grows from the back wall (0) toward the cabinet front. */
function boardDepthRange(
  board: Board, box: Box, backT: number, fullD: number,
): { z0: number; z1: number } {
  const carcassD = box.D; // box.D is the carcass depth (already reduced)
  switch (board.role) {
    case 'back':
      return { z0: 0, z1: backT };
    case 'envelope-left':
    case 'envelope-right':
    case 'envelope-top':
    case 'envelope-bottom':
      // Outer shell wraps the full external depth.
      return { z0: 0, z1: fullD };
    case 'sink-traverse-back':
      return { z0: backT, z1: backT + board.thickness };
    case 'sink-traverse-front':
      return { z0: backT + carcassD - board.thickness, z1: backT + carcassD };
    default:
      // sides / top / bottom / partition / shelves run the carcass depth.
      return { z0: backT, z1: backT + carcassD };
  }
}

/** Sort key matching the sketch's column order (single/left first, then right,
 *  then unit_N by index) so X offsets line up with the 2D views. */
function positionRank(box: Box): number {
  if (box.position === 'single' || box.position === 'left') return 0;
  if (box.position === 'right') return 1;
  return box.unitIndex ?? 0;
}

const LEVEL_ORDER: BoxLevel[] = ['top', 'middle', 'bottom', 'single'];

/** Every carcass board of a single cabinet, in CABINET-LOCAL 3D coordinates
 *  (x = 0..outerW from the outer-left edge, y = 0..H up from the floor,
 *  z = 0..D back→front). Mirrors how `CabinetSketch` decomposes and builds
 *  boards (same primitives), then lifts each board's front-view rect into 3D
 *  via {@link boardDepthRange}. Plinth boards (front/back/gable) are rendered
 *  as standing panels at the cabinet base. */
export function cabinetBoardBoxes(
  input: CabinetInput,
  state: SavedCabinetState,
  customMaterials: CustomMaterial[],
): BoardBox3D[] {
  if (input.W <= 0 || input.H <= 0 || input.D <= 0) return [];

  const bodyMat = getMaterialWithCustom(input.bodyMaterialId, customMaterials);
  const frontMat = getMaterialWithCustom(input.frontMaterialId, customMaterials);
  const tF = frontMat.thickness / 10;
  const tBody = bodyMat.thickness / 10;
  const sides = getShellSides(input);
  const hasAnyShell = sides.left || sides.right;
  const fullD = input.D;

  // Wall cabinet (קלפה): top + bottom front-material caps, independent of the
  // side shell, gated by mount==='wall' — mirrors useCabinet's `wallEnv`.
  const wallEnv = input.hasWallEnvelope === true && input.mount === 'wall';

  const innerW = computeInnerWidth(input.W, sides, tF);
  const carcassD = computeCarcassDepth(input.D, input.backThickness, HINGE_GAP_CM, tF);
  const envelopeTopH = ((input.hasEnvelopeTop && hasAnyShell) || wallEnv) ? tF : 0;
  const envelopeBottomH = wallEnv ? tF : 0;

  const rawBoxes = decomposeBoxes(
    innerW, input.H, carcassD, input.lowerDoorH, input.plinth,
    input.doorsPerColumn, input.middleDoorH, envelopeTopH, envelopeBottomH,
    isCorner(input), // corner (פינה): one wide carcass, no 100 cm column split
  );
  const boxes = applyBoxDimensionOverrides(rawBoxes, state.boxDimensionOverrides);

  const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
  // Per-body material override → this body's carcass boards are coloured from
  // its own materials. The outer shell + plinth stay cabinet-level (below).
  const boxMaterialOvr = new Map(Object.entries(state.boxMaterialOverrides ?? {}));
  const boxMaterials = new Map(
    bodyBoxes.map(b => [b.id, resolveBoxMaterials(b, input, boxMaterialOvr, customMaterials)] as const),
  );
  const plinth = input.plinth;
  const leftEnv = sides.left ? tF : 0;

  // ── Per-level vertical layout (bottom-from-floor for each box) ──────────────
  const levelHeight = new Map<BoxLevel, number>();
  for (const b of bodyBoxes) if (!levelHeight.has(b.level)) levelHeight.set(b.level, b.H);
  const activeLevels = LEVEL_ORDER.filter(l => levelHeight.has(l));
  const bottomFromFloor = new Map<BoxLevel, number>();
  {
    // Bodies sit above the plinth AND above the wall-cabinet bottom cap (קלפה),
    // so the bottom envelope band (envelopeBottomH) fits below the carcass.
    let cumY = plinth + envelopeBottomH;
    for (const level of [...activeLevels].reverse()) {
      bottomFromFloor.set(level, cumY);
      cumY += levelHeight.get(level)!;
    }
  }

  // ── Per-level horizontal layout (left-edge X for each box) ──────────────────
  const boxLeftX = new Map<string, number>();
  for (const level of activeLevels) {
    const levelBoxes = bodyBoxes.filter(b => b.level === level).sort((a, b) => positionRank(a) - positionRank(b));
    let cumX = 0;
    for (const box of levelBoxes) {
      boxLeftX.set(box.id, leftEnv + cumX);
      cumX += box.W;
    }
  }

  const interiorById = mapInteriorBySlot(bodyBoxes, state, 'interior');
  const cellById = mapCellBySlot(bodyBoxes, state);
  const partitionById = new Map<string, boolean>();
  for (const box of bodyBoxes) if (state.partitions[boxStableKey(box)]) partitionById.set(box.id, true);

  const boardOverrides = new Map<string, BoardOverrides>(Object.entries(state.boardOverrides ?? {}));
  const joint = resolveCabinetJointMethod(input.W, input.H);
  const backT = input.backThickness;

  const out: BoardBox3D[] = [];

  for (const box of bodyBoxes) {
    const xLeft = boxLeftX.get(box.id) ?? leftEnv;
    const boxBottom = bottomFromFloor.get(box.level) ?? plinth;
    const boxTop = boxBottom + box.H;

    const env = deriveEnvelopeFlags(box, sides, !!input.hasEnvelopeTop);
    const items = interiorById.get(box.id) ?? [];
    const hasPartition = partitionById.get(box.id) === true;
    const cells = cellById.get(box.id);
    const bm = boxMaterials.get(box.id)!; // effective per-body materials

    const boards = buildBoardModel({
      box,
      bodyMaterial: bm.bodyMaterial,
      frontMaterial: bm.frontMaterial,
      hasEnvelopeLeft: env.hasEnvelopeLeft,
      hasEnvelopeRight: env.hasEnvelopeRight,
      hasEnvelopeTop: env.hasEnvelopeTop,
      items,
      hasPartition,
      ...(hasPartition && cells ? { cellItems: [cells[0] ?? [], cells[1] ?? []] as [InteriorItem[], InteriorItem[]] } : {}),
      hasBack: input.hasBack ?? true,
      hasBottom: input.hasBottom ?? true,
      envelopeDepth: fullD,
      backThicknessCm: bm.backThicknessCm,
      joint,
      ...(input.topVariant ? { topVariant: input.topVariant } : {}),
      ...(input.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: input.sinkTraverseWidthCm } : {}),
    });

    for (const board of boards) {
      // Envelope (outer shell) panels are emitted once at cabinet level below,
      // spanning the FULL cabinet height — a per-body envelope board only spans
      // one body's height, which left the top cap proud of the side panels.
      if (board.role.startsWith('envelope')) continue;
      const { z0, z1 } = boardDepthRange(board, box, backT, fullD);
      out.push({
        x0: xLeft + board.xFrom,
        x1: xLeft + board.xTo,
        // Board y is measured DOWN from the box top; flip into floor-up frame.
        y0: boxTop - board.yTo,
        y1: boxTop - board.yFrom,
        z0, z1,
        role: board.role,
        materialId: getMaterial(board, boardOverrides),
      });
    }

    // ── Interior fixtures: drawer trays + hanging rods ────────────────────────
    const innerL = xLeft + tBody;
    const innerR = xLeft + box.W - tBody;
    const trayZ0 = backT + DRAWER_DEPTH_BACK_INSET_CM;
    const trayZ1 = Math.max(trayZ0 + 1, backT + box.D - DRAWER_DEPTH_FRONT_INSET_CM);
    const rodZc = backT + box.D / 2;

    /** A C-channel runner on each gable inner face (colL/colR) for a drawer with a
     *  chosen runner: web (against the gable) + foot (under the drawer) + top lip,
     *  plus a front coupling block. `runnerBottomCm` is the rail-bottom height
     *  above the box outer bottom (boxBottom). Length = NL front-aligned to the
     *  carcass front; length, depth and the floor datum are EXACT, the section
     *  is read off the TANDEM cross-section. */
    const emitRunner = (d: DrawerItem, runnerBottomCm: number, colL: number, colR: number) => {
      const spec = getRunner(d.runnerId ?? '');
      if (!spec) return;
      const { nl } = selectNominalLength(spec, box.D * 10);
      const z1 = backT + box.D;                       // carcass front
      const z0 = Math.max(backT, z1 - nl / 10);       // front-aligned, length NL
      const profH = spec.screwHeightMm / 10;          // channel height ≈ screw line
      const couplingZ0 = Math.max(z0, z1 - RUNNER_COUPLING_L_CM);
      const floorY = boxBottom + runnerBottomCm;
      const rail = (x0: number, x1: number, yLo: number, yHi: number, za: number) =>
        out.push({ x0, x1, y0: yLo, y1: yHi, z0: za, z1, role: 'runner', materialId: bodyMat.id });
      // dir = +1 → channel extends inward from the left gable; −1 → from the right.
      const emitChannel = (xGable: number, dir: 1 | -1) => {
        const span = (w: number): [number, number] => dir === 1 ? [xGable, xGable + w] : [xGable - w, xGable];
        const [wx0, wx1] = span(RUNNER_WEB_T_CM);
        const [fx0, fx1] = span(RUNNER_FOOT_W_CM);
        const [lx0, lx1] = span(RUNNER_LIP_W_CM);
        rail(wx0, wx1, floorY, floorY + profH, z0);                              // web
        rail(fx0, fx1, floorY, floorY + RUNNER_FOOT_H_CM, z0);                   // foot
        rail(lx0, lx1, floorY + profH - RUNNER_LIP_H_CM, floorY + profH, z0);    // top lip
        rail(fx0, fx1, floorY, floorY + profH, couplingZ0);                      // front coupling
      };
      emitChannel(colL, 1);
      emitChannel(colR, -1);
    };

    /** The drawer body built from its ACTUAL box boards (2 sides + front + back +
     *  bottom), sized by {@link computeDrawerBox} from the chosen runner — the
     *  same dimensions as the cut list. The box is centred between the gables
     *  (colL/colR), sits on the runner datum (runnerBottomCm above boxBottom),
     *  runs SKL deep front-aligned, with the bottom in its groove (M up) and the
     *  front/back shorter than the sides by (M+T). Returns false when the drawer
     *  has no resolvable runner → the caller falls back to a simple tray. */
    const emitDrawerBox = (d: DrawerItem, runnerBottomCm: number, colL: number, colR: number): boolean => {
      const spec = getRunner(d.runnerId ?? '');
      if (!spec) return false;
      const dbox = computeDrawerBox(spec, {
        internalWidthMm: (colR - colL) * 10,
        internalDepthMm: box.D * 10,
        sidePanelThicknessMm: d.drawerSideThicknessMm ?? spec.sidePanelThicknessMm.max,
        bottomThicknessMm: d.drawerBottomThicknessMm ?? DEFAULT_DRAWER_BOTTOM_MM,
        kind: d.mount === 'external' ? 'external' : 'inner',
        heightMm: d.drawerHeight * 10,
      });
      const side = dbox.panels.find(p => p.role === 'side')!;
      const front = dbox.panels.find(p => p.role === 'front')!;
      const bottom = dbox.panels.find(p => p.role === 'bottom')!;
      const t = side.thicknessMm / 10;
      const T = bottom.thicknessMm / 10;
      const sideH = side.heightMm / 10;
      const skl = side.lengthMm / 10;
      const fbW = front.lengthMm / 10;
      const bottomW = bottom.lengthMm / 10;
      const outerW = dbox.outerWidthMm / 10;
      const M = spec.mountOverRunnerMm / 10;
      const centerX = (colL + colR) / 2;
      const boxLeft = centerX - outerW / 2;
      const boxRight = centerX + outerW / 2;
      const zFront = backT + box.D;                 // carcass front
      const zBack = Math.max(backT, zFront - skl);  // SKL deep, front-aligned
      const floorY = boxBottom + runnerBottomCm;    // side-panel bottom = runner bottom
      const panel = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
        out.push({ x0, x1, y0, y1, z0, z1, role: 'drawer-box', materialId: bodyMat.id });
      panel(boxLeft, boxLeft + t, floorY, floorY + sideH, zBack, zFront);   // left side
      panel(boxRight - t, boxRight, floorY, floorY + sideH, zBack, zFront); // right side
      const fbY0 = floorY + M + T;                   // front/back sit on top of the bottom
      panel(centerX - fbW / 2, centerX + fbW / 2, fbY0, floorY + sideH, zFront - t, zFront); // front
      panel(centerX - fbW / 2, centerX + fbW / 2, fbY0, floorY + sideH, zBack, zBack + t);   // back
      panel(centerX - bottomW / 2, centerX + bottomW / 2, floorY + M, floorY + M + T, zBack, zFront); // bottom
      return true;
    };

    /** Rods + internal drawers within an x-range (full inner band, or a cell). */
    const emitInCol = (colItems: InteriorItem[], colL: number, colR: number) => {
      for (const it of colItems) {
        if (it.type === 'rod') {
          const r = it as RodItem;
          out.push({
            x0: colL, x1: colR,
            y0: boxBottom + r.heightFromFloor - ROD_RADIUS_CM,
            y1: boxBottom + r.heightFromFloor + ROD_RADIUS_CM,
            z0: rodZc - ROD_RADIUS_CM, z1: rodZc + ROD_RADIUS_CM,
            role: 'rod', materialId: bodyMat.id,
          });
        } else if (it.type === 'drawer' && (it as DrawerItem).mount === 'internal') {
          const d = it as DrawerItem;
          // Internal drawer's runner sits at its own mounting height.
          if (d.runnerId) emitRunner(d, d.heightFromFloor, colL, colR);
          // Real box from its boards when a runner is chosen; else a simple tray.
          if (emitDrawerBox(d, d.heightFromFloor, colL, colR)) continue;
          const bottomCm = d.heightFromFloor + DRAWER_BOTTOM_GAP_CM;
          const topCm = d.heightFromFloor + d.drawerHeight - DRAWER_TOP_GAP_CM;
          if (topCm <= bottomCm) continue;
          out.push({
            x0: colL + DRAWER_SIDE_GAP_CM, x1: colR - DRAWER_SIDE_GAP_CM,
            y0: boxBottom + bottomCm, y1: boxBottom + topCm,
            z0: trayZ0, z1: trayZ1,
            role: 'drawer-box', materialId: bodyMat.id,
          });
        }
      }
    };

    if (hasPartition && cells) {
      emitInCol(cells[0] ?? [], (innerL + innerR) / 2, innerR); // right cell
      emitInCol(cells[1] ?? [], innerL, (innerL + innerR) / 2); // left cell
    } else {
      emitInCol(items, innerL, innerR);
    }

    // External drawers stack from the body floor (face heights, not their
    // heightFromFloor), spanning the full inner band — mirrors CabinetSketch.
    const externals = items
      .filter((i): i is DrawerItem => i.type === 'drawer' && i.mount === 'external')
      .sort((a, b) => a.heightFromFloor - b.heightFromFloor);
    let cumulative = 0;
    externals.forEach((d, i) => {
      const faceBottomCm = cumulative;            // front bottom edge above floor
      cumulative += d.drawerHeight + EXT_DRAWER_GAP_CM;
      // Runner: the bottom drawer's rail rests ON TOP of the body's bottom panel
      // (boxBottom + tBody = the interior floor), not at the carcass outer bottom;
      // each drawer above is 5 mm over the reveal-gap top to the drawer below
      // (floor-anchored, drawerDrilling model).
      const runnerBottomCm = i === 0 ? tBody : faceBottomCm + RUNNER_OVER_GAP_MM / 10;
      if (d.runnerId) emitRunner(d, runnerBottomCm, innerL, innerR);
      // Real box from its boards when a runner is chosen; else a simple tray.
      if (emitDrawerBox(d, runnerBottomCm, innerL, innerR)) return;
      const bottomCm = (cumulative - d.drawerHeight) + DRAWER_BOTTOM_GAP_CM;
      const topCm = cumulative - EXT_DRAWER_GAP_CM - DRAWER_TOP_GAP_CM;
      if (topCm <= bottomCm) return;
      out.push({
        x0: innerL + DRAWER_SIDE_GAP_CM, x1: innerR - DRAWER_SIDE_GAP_CM,
        y0: boxBottom + bottomCm, y1: boxBottom + topCm,
        z0: trayZ0, z1: trayZ1,
        role: 'drawer-box', materialId: bodyMat.id,
      });
    });

    // ── Lift mechanism (קלפה / AVENTOS) — a power-unit plate on each gable inner
    //    face at the top-front, on the topmost body of a wall cabinet with a
    //    chosen family. Mirrors the hardware gate (liftMechanism + resolvable
    //    family). Schematic; the top-front, both-gables placement matches the
    //    AVENTOS planning diagram. ─────────────────────────────────────────────
    if (input.liftMechanism === true
        && getLiftMechanism(input.liftMechanismId ?? '')
        && (box.level === 'top' || box.level === 'single')) {
      const plateH = Math.min(LIFT_PLATE_H_CM, Math.max(2, box.H - LIFT_TOP_GAP_CM - 2));
      const plateD = Math.min(LIFT_PLATE_D_CM, Math.max(2, box.D - 1));
      const yTop = boxTop - LIFT_TOP_GAP_CM;
      const yBot = yTop - plateH;
      const zF = backT + box.D - 1;        // near the carcass front
      const zB = zF - plateD;
      // dir = +1 → plate stands inward from the left gable; −1 → from the right.
      const emitUnit = (xGable: number, dir: 1 | -1) => {
        const px0 = dir === 1 ? xGable : xGable - LIFT_PLATE_T_CM;
        const px1 = dir === 1 ? xGable + LIFT_PLATE_T_CM : xGable;
        out.push({ x0: px0, x1: px1, y0: yBot, y1: yTop, z0: zB, z1: zF, role: 'lift-mechanism', materialId: bodyMat.id });
      };
      emitUnit(innerL, 1);
      emitUnit(innerR, -1);
    }
  }

  // ── Outer shell + wall envelope — emitted at cabinet level so the side panels
  //    run the FULL cabinet height and the caps sit flush (matching the cut list
  //    / 2D sketch). The body was decomposed with envelopeTopH / envelopeBottomH,
  //    so the carcass already sits a cap-thickness below the top and above the
  //    bottom band. The wall-cabinet (קלפה) caps wrap the body with no side
  //    shell — full external width, top AND bottom. ─────────────────────────────
  if (hasAnyShell || wallEnv) {
    // Wrap the shell around the ACTUAL bodies, not the original innerW: the
    // bodies are laid out from their (possibly overridden) box.W via boxLeftX,
    // so the inner span is the widest level's summed body widths. Using innerW
    // here left the shell at the pre-override width, clipping a widened body.
    // Mirrors the plinth's outerCabW and the cut list's rowEffectiveOuterW.
    const effInnerW = activeLevels.length > 0
      ? Math.max(...activeLevels.map(level =>
          bodyBoxes.filter(b => b.level === level).reduce((s, b) => s + b.W, 0)))
      : innerW;
    const outerW = effInnerW + leftEnv + (sides.right ? tF : 0);
    const frontMatId = frontMat.id;
    if (sides.left) {
      out.push({ x0: 0, x1: tF, y0: 0, y1: input.H, z0: 0, z1: fullD, role: 'envelope-left', materialId: frontMatId });
    }
    if (sides.right) {
      out.push({ x0: outerW - tF, x1: outerW, y0: 0, y1: input.H, z0: 0, z1: fullD, role: 'envelope-right', materialId: frontMatId });
    }
    // Top cap: shell envelope-top (needs a side shell) OR wall-cabinet top cap.
    if ((input.hasEnvelopeTop && hasAnyShell) || wallEnv) {
      out.push({ x0: leftEnv, x1: leftEnv + effInnerW, y0: input.H - tF, y1: input.H, z0: 0, z1: fullD, role: 'envelope-top', materialId: frontMatId });
    }
    // Bottom cap: wall cabinet only (base cabinets sit on a plinth, not a cap).
    if (wallEnv) {
      out.push({ x0: leftEnv, x1: leftEnv + effInnerW, y0: plinth, y1: plinth + tF, z0: 0, z1: fullD, role: 'envelope-bottom', materialId: frontMatId });
    }
  }

  // ── Plinth — kick-board base under the carcass (recess-aware) ───────────────
  if (plinth > 0) {
    const outerCabW = bodyBoxes
      .filter(b => b.level === 'bottom' || b.level === 'single')
      .reduce((s, b) => s + b.W, 0) + leftEnv + (sides.right ? tF : 0);
    const bottomRow = bodyBoxes.filter(b => b.level === 'bottom' || b.level === 'single');
    const gableOverrides = new Map(Object.entries(state.plinthGableOverrides ?? {}));
    const plinthBoards = buildPlinthBoardModel({
      cabinetW: outerCabW || input.W,
      cabinetD: carcassD,
      plinthHeight: plinth,
      bodyMaterial: bodyMat,
      frontMaterial: frontMat,
      boxes: bottomRow,
      ...(gableOverrides.size > 0 ? { gableOverrides } : {}),
      ...(input.plinthRecess > 0 ? { recessCm: input.plinthRecess } : {}),
    });
    const panelH = Math.max(0, plinth - LEVELER_GAP_CM);
    for (const board of plinthBoards) {
      if (board.role === 'plinth-gable-b') continue; // flat cap — skip in this pass
      out.push({
        // Plinth boards are TOP-VIEW (xFrom/xTo = X, yFrom/yTo = DEPTH with
        // y=0 at the FRONT). Map depth into the room frame (z=0 = back wall),
        // sitting the plinth under the carcass: z = backT + carcassD − y. The
        // front kick-board lands at the carcass front; a recess sets it back,
        // visibly, instead of being buried at the back.
        x0: board.xFrom, x1: board.xTo,
        y0: plinth - panelH, y1: plinth,
        z0: backT + carcassD - board.yTo, z1: backT + carcassD - board.yFrom,
        role: board.role,
        materialId: board.materialId,
      });
    }
  }

  // ── Corner (פינה): the perpendicular hinge-post return (the L's second leg).
  //    The face flange is a front panel (productFrontBoxes); this leg is a
  //    front-material board standing inside the carcass at the door↔filler
  //    boundary, carrying the hinges. ──────────────────────────────────────────
  if (isCorner(input)) {
    const cBox = bodyBoxes[0];
    if (cBox) {
      const boxBottom = bottomFromFloor.get(cBox.level) ?? plinth;
      const boxTop = boxBottom + cBox.H;
      const ret = cornerReturnBox({
        cabinetWcm: cBox.W, gapCm: input.doorGapMm / 10, cf: input.cornerFiller!,
        tFrontCm: tF, fullDepthCm: fullD,
        innerBottomCm: boxBottom + tBody, innerTopCm: boxTop - tBody,
      });
      out.push({ ...ret, role: 'front', materialId: frontMat.id });
    }
  }

  return out;
}

/** Every carcass board of a whole product, in PRODUCT-LOCAL 3D coordinates —
 *  ready to feed straight into `placementSubBoxAABBs`. A single cabinet is one
 *  call; a kitchen lays out each unit via {@link kitchenElevationLayout} and
 *  translates that unit's boards into place. */
export function productBoardBoxes(
  product: ProductUnit,
  customMaterials: CustomMaterial[],
): BoardBox3D[] {
  if (product.productType !== 'kitchen') {
    return cabinetBoardBoxes(product.cabinet.input, product.cabinet.state, customMaterials);
  }
  return kitchenLayoutBoxes(product, b => cabinetBoardBoxes(b.input, b.state, customMaterials));
}

/** Door / drawer-front faces of a whole product as flat panels at the cabinet
 *  face, in PRODUCT-LOCAL 3D coordinates — the 'fronts' view of the 3D scene.
 *  Each face is a thin box at the front of its cabinet (z = D − tFront … D). */
export function productFrontBoxes(
  product: ProductUnit,
  customMaterials: CustomMaterial[],
): BoardBox3D[] {
  if (product.productType !== 'kitchen') {
    return cabinetFrontBoxes(product.cabinet.input, product.cabinet.state, customMaterials);
  }
  return kitchenLayoutBoxes(product, b => cabinetFrontBoxes(b.input, b.state, customMaterials));
}

/** A single cabinet's front faces as thin boxes at its front plane. Exported
 *  so the per-body editor can overlay THIS body's fronts on its 3D model using
 *  the same pipeline (no drift from the room view / cut list). */
export function cabinetFrontBoxes(
  input: CabinetInput,
  state: SavedCabinetState,
  customMaterials: CustomMaterial[],
): BoardBox3D[] {
  const panels = cabinetFrontPanels(input, state, customMaterials);
  if (panels.length === 0) return [];
  const frontMat = getMaterialWithCustom(input.frontMaterialId, customMaterials);
  const tF = frontMat.thickness / 10;
  const fullD = input.D;
  return panels.map(p => ({
    x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1,
    z0: fullD - tF, z1: fullD,
    role: 'front' as const, materialId: frontMat.id,
    ...(p.hingeSide ? { hingeSide: p.hingeSide } : {}),
  }));
}

/** Lays a per-cabinet box builder over a kitchen's units: mirrors each unit's
 *  position (RTL, to match KitchenOverview) and translates the unit's local
 *  boxes into the product frame. Internal box order stays left-to-right. */
function kitchenLayoutBoxes(
  product: ProductUnit,
  build: (cabinet: { input: CabinetInput; state: SavedCabinetState }) => BoardBox3D[],
): BoardBox3D[] {
  const units = product.kitchenUnits ?? [];
  const layout = kitchenElevationLayout(units);
  const posById = new Map(layout.map(b => [b.unitId, b] as const));
  const totalW = Math.max(1, ...layout.map(b => b.xCm + b.w));
  const out: BoardBox3D[] = [];
  for (const unit of units) {
    const pos = posById.get(unit.id);
    if (!pos) continue;
    const local = build(unit.cabinet);
    const mirroredLeft = totalW - pos.xCm - pos.w;
    for (const b of local) {
      out.push({
        ...b,
        x0: mirroredLeft + b.x0, x1: mirroredLeft + b.x1,
        y0: b.y0 + pos.yBottomCm, y1: b.y1 + pos.yBottomCm,
      });
    }
  }
  return out;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function mapInteriorBySlot(
  bodyBoxes: Box[], state: SavedCabinetState, _key: 'interior',
): Map<string, InteriorItem[]> {
  const m = new Map<string, InteriorItem[]>();
  for (const box of bodyBoxes) {
    const items = state.interior[boxStableKey(box)];
    if (items) m.set(box.id, items as InteriorItem[]);
  }
  return m;
}

function mapCellBySlot(
  bodyBoxes: Box[], state: SavedCabinetState,
): Map<string, InteriorItem[][]> {
  const m = new Map<string, InteriorItem[][]>();
  for (const box of bodyBoxes) {
    const cells = state.cellInterior[boxStableKey(box)];
    if (cells) m.set(box.id, cells as InteriorItem[][]);
  }
  return m;
}
