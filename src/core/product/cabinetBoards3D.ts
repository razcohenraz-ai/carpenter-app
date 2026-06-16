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
import { decomposeBoxes } from '../geometry/boxDecomposition';
import { boxStableKey } from '../interior/interiorUtils';
import { getShellSides } from '../../types/cabinet';
import { getMaterialWithCustom } from '../../catalog';
import { kitchenElevationLayout } from './kitchenFootprint';
import { cabinetFrontPanels } from './cabinetFronts';

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
export type FixtureRole = 'drawer-box' | 'rod' | 'front';

export interface BoardBox3D extends ProductSubBox {
  role: BoardRole | FixtureRole;
  materialId: string;
}

// ── Interior fixture geometry (cm) — mirrors CabinetSketch's 2D drawing ─────────
const DRAWER_SIDE_GAP_CM = 1.25;   // inset each side, inside the inner band
const DRAWER_BOTTOM_GAP_CM = 2;    // tray bottom above the drawer face bottom
const DRAWER_TOP_GAP_CM = 3;       // tray top below the drawer face top
const EXT_DRAWER_GAP_CM = 0.2;     // gap between stacked external drawer faces
const DRAWER_DEPTH_BACK_INSET_CM = 1;   // tray set back from the carcass rear
const DRAWER_DEPTH_FRONT_INSET_CM = 2;  // tray set back from the carcass front
const ROD_RADIUS_CM = 1.5;         // hanging-rod half-thickness

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

  const innerW = computeInnerWidth(input.W, sides, tF);
  const carcassD = computeCarcassDepth(input.D, input.backThickness, HINGE_GAP_CM, tF);
  const envelopeTopH = (input.hasEnvelopeTop && hasAnyShell) ? tF : 0;

  const overrides = new Map(Object.entries(state.boxDimensionOverrides ?? {}));
  const rawBoxes = decomposeBoxes(
    innerW, input.H, carcassD, input.lowerDoorH, input.plinth,
    input.doorsPerColumn, input.middleDoorH, envelopeTopH,
  );
  const boxes = overrides.size === 0 ? rawBoxes : rawBoxes.map(box => {
    const o = overrides.get(boxStableKey(box));
    if (!o) return box;
    return {
      ...box,
      ...(o.W !== undefined ? { W: o.W } : {}),
      ...(o.H !== undefined ? { H: o.H } : {}),
      ...(o.D !== undefined ? { D: o.D } : {}),
    };
  });

  const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
  const plinth = input.plinth;
  const leftEnv = sides.left ? tF : 0;

  // ── Per-level vertical layout (bottom-from-floor for each box) ──────────────
  const levelHeight = new Map<BoxLevel, number>();
  for (const b of bodyBoxes) if (!levelHeight.has(b.level)) levelHeight.set(b.level, b.H);
  const activeLevels = LEVEL_ORDER.filter(l => levelHeight.has(l));
  const bottomFromFloor = new Map<BoxLevel, number>();
  {
    let cumY = plinth;
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

    const boards = buildBoardModel({
      box,
      bodyMaterial: bodyMat,
      frontMaterial: frontMat,
      hasEnvelopeLeft: env.hasEnvelopeLeft,
      hasEnvelopeRight: env.hasEnvelopeRight,
      hasEnvelopeTop: env.hasEnvelopeTop,
      items,
      hasPartition,
      ...(hasPartition && cells ? { cellItems: [cells[0] ?? [], cells[1] ?? []] as [InteriorItem[], InteriorItem[]] } : {}),
      hasBack: input.hasBack ?? true,
      hasBottom: input.hasBottom ?? true,
      envelopeDepth: fullD,
      backThicknessCm: backT,
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
    for (const d of externals) {
      cumulative += d.drawerHeight + EXT_DRAWER_GAP_CM;
      const bottomCm = (cumulative - d.drawerHeight) + DRAWER_BOTTOM_GAP_CM;
      const topCm = cumulative - EXT_DRAWER_GAP_CM - DRAWER_TOP_GAP_CM;
      if (topCm <= bottomCm) continue;
      out.push({
        x0: innerL + DRAWER_SIDE_GAP_CM, x1: innerR - DRAWER_SIDE_GAP_CM,
        y0: boxBottom + bottomCm, y1: boxBottom + topCm,
        z0: trayZ0, z1: trayZ1,
        role: 'drawer-box', materialId: bodyMat.id,
      });
    }
  }

  // ── Outer shell envelope — emitted at cabinet level so the side panels run
  //    the FULL cabinet height and the top cap sits flush between them (matching
  //    the cut list / 2D sketch). The body was decomposed with envelopeTopH, so
  //    the carcass top already sits a cap-thickness below the cabinet top. ──────
  if (hasAnyShell) {
    const outerW = innerW + leftEnv + (sides.right ? tF : 0);
    const frontMatId = frontMat.id;
    if (sides.left) {
      out.push({ x0: 0, x1: tF, y0: 0, y1: input.H, z0: 0, z1: fullD, role: 'envelope-left', materialId: frontMatId });
    }
    if (sides.right) {
      out.push({ x0: outerW - tF, x1: outerW, y0: 0, y1: input.H, z0: 0, z1: fullD, role: 'envelope-right', materialId: frontMatId });
    }
    if (input.hasEnvelopeTop) {
      out.push({ x0: leftEnv, x1: leftEnv + innerW, y0: input.H - tF, y1: input.H, z0: 0, z1: fullD, role: 'envelope-top', materialId: frontMatId });
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

/** A single cabinet's front faces as thin boxes at its front plane. */
function cabinetFrontBoxes(
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
