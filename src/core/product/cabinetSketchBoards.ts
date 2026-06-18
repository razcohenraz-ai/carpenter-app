import type { CabinetInput } from '../../types/cabinet';
import type { SavedCabinetState } from '../../types/project';
import type { CustomMaterial, Material } from '../../types/materials';
import type { Box } from '../../types/geometry';
import type { InteriorItem, InteriorById, CellInteriorById } from '../../types/interior';
import {
  buildBoardModel, deriveEnvelopeFlags, resolveCabinetJointMethod,
  computeInnerWidth, computeCarcassDepth, HINGE_GAP_CM,
  type Board, type JointMethod,
} from '../boards/boardModel';
import { decomposeBoxes } from '../geometry/boxDecomposition';
import { boxStableKey } from '../interior/interiorUtils';
import { getShellSides } from '../../types/cabinet';
import { getMaterialWithCustom } from '../../catalog';
import { isCorner } from './cornerModule';

type Mat = Material | (Omit<Material, 'id'> & { id: string });

/** Everything {@link buildSketchBoards} needs that isn't carried on the Box —
 *  resolved once at the cabinet level. Mirrors the variables `CabinetSketch.tsx`
 *  derives from its props. */
export interface SketchBoardContext {
  shellSides: { left: boolean; right: boolean };
  hasEnvelopeTop: boolean;
  /** Wall-cabinet (קלפה) cap thickness in cm; > 0 drives the top+bottom caps. */
  wallEnvelopeCm: number;
  bodyMaterial: Mat;
  frontMaterial: Mat;
  /** Full external cabinet depth (cm) — envelope boards span it. */
  fullD: number;
  backThicknessCm: number;
  joint: JointMethod;
  topVariant?: 'standard' | 'sink-open';
  sinkTraverseWidthCm?: number;
  hasBack: boolean;
  hasBottom: boolean;
  interiorById: InteriorById;
  cellInteriorById?: CellInteriorById;
  partitionsById?: ReadonlyMap<string, boolean>;
}

/** The per-body carcass boards for a cabinet's 2D body sketch, keyed by box.id.
 *
 *  This is the SINGLE implementation of the 2D body-board emission: the live
 *  sketch (`CabinetSketch.tsx`) renders it, and the render-parity test censuses
 *  it — so the two can never drift (Gotcha #8). It mirrors the cut-list
 *  (`cabinetCompute`) and 3D (`cabinetBoards3D`) per-box loops board-for-board.
 *
 *  Returns ALL boards, including `envelope-left` / `envelope-right`. The
 *  component draws those two as full-height rects and therefore filters them at
 *  render time — but they are real cut pieces and belong in the model (the cut
 *  list and 3D both carry them). Plinth boards are NOT here: the body sketch
 *  draws the plinth as one rect at the cabinet level, never as per-body boards. */
export function buildSketchBoards(
  boxes: Box[],
  ctx: SketchBoardContext,
): Map<string, Board[]> {
  const out = new Map<string, Board[]>();
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    const hasPartition = ctx.partitionsById?.get(box.id) === true;
    const cells = ctx.cellInteriorById?.[box.id];
    const items = ctx.interiorById[box.id] ?? [];
    // 4th arg threads the wall-cabinet (קלפה) flag so the top+bottom caps emit
    // as front-material envelope boards — same call the cut list makes.
    const env = deriveEnvelopeFlags(box, ctx.shellSides, ctx.hasEnvelopeTop, ctx.wallEnvelopeCm > 0);
    const boards = buildBoardModel({
      box,
      bodyMaterial: ctx.bodyMaterial,
      frontMaterial: ctx.frontMaterial,
      hasEnvelopeLeft: env.hasEnvelopeLeft,
      hasEnvelopeRight: env.hasEnvelopeRight,
      hasEnvelopeTop: env.hasEnvelopeTop,
      hasEnvelopeBottom: env.hasEnvelopeBottom,
      items,
      hasPartition,
      ...(hasPartition && cells
        ? { cellItems: [cells[0] ?? [], cells[1] ?? []] as [InteriorItem[], InteriorItem[]] }
        : {}),
      hasBack: ctx.hasBack,
      hasBottom: ctx.hasBottom,
      envelopeDepth: ctx.fullD,
      backThicknessCm: ctx.backThicknessCm,
      joint: ctx.joint,
      ...(ctx.topVariant ? { topVariant: ctx.topVariant } : {}),
      ...(ctx.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: ctx.sinkTraverseWidthCm } : {}),
    });
    out.set(box.id, boards);
  }
  return out;
}

/** Every 2D body-sketch board of a cabinet, flattened — the pure entry the
 *  render-parity census uses. Decomposes the carcass the SAME way the cut list
 *  (`cabinetCompute`) does, then runs the shared {@link buildSketchBoards}, so a
 *  census of the result is a true apples-to-apples comparison against the cut
 *  list's carcass/envelope/back boards (the body sketch omits plinth boards by
 *  design). */
export function cabinetSketchBoards(
  input: CabinetInput,
  state: SavedCabinetState,
  customMaterials: CustomMaterial[] = [],
): Board[] {
  if (input.W <= 0 || input.H <= 0 || input.D <= 0) return [];

  const bodyMaterial = getMaterialWithCustom(input.bodyMaterialId, customMaterials);
  const frontMaterial = getMaterialWithCustom(input.frontMaterialId, customMaterials);
  const tFront = frontMaterial.thickness / 10;
  const shellSides = getShellSides(input);
  const hasAnyShell = shellSides.left || shellSides.right;
  const innerW = computeInnerWidth(input.W, shellSides, tFront);
  const carcassD = computeCarcassDepth(input.D, input.backThickness, HINGE_GAP_CM, tFront);
  const wallEnv = input.hasWallEnvelope === true && input.mount === 'wall';
  const wallEnvelopeCm = wallEnv ? tFront : 0;
  const envelopeTopH = ((input.hasEnvelopeTop && hasAnyShell) || wallEnv) ? tFront : 0;
  const envelopeBottomH = wallEnv ? tFront : 0;

  const rawBoxes = decomposeBoxes(
    innerW, input.H, carcassD,
    input.lowerDoorH, input.plinth, input.doorsPerColumn, input.middleDoorH,
    envelopeTopH, envelopeBottomH, isCorner(input),
  );
  const ovr = new Map(Object.entries(state.boxDimensionOverrides ?? {}));
  const boxes = ovr.size === 0 ? rawBoxes : rawBoxes.map(box => {
    const o = ovr.get(boxStableKey(box));
    if (!o) return box;
    return {
      ...box,
      ...(o.W !== undefined ? { W: o.W } : {}),
      ...(o.H !== undefined ? { H: o.H } : {}),
      ...(o.D !== undefined ? { D: o.D } : {}),
    };
  });

  // Translate saved-state Records (keyed by boxStableKey) to the ad-hoc box.id
  // this decomposition produced — same translation `buildCabinetSketchModel` does.
  const interiorById: InteriorById = {};
  const cellInteriorById: CellInteriorById = {};
  const partitionsById = new Map<string, boolean>();
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    const key = boxStableKey(box);
    const items = state.interior[key];
    if (items) interiorById[box.id] = items as InteriorItem[];
    const cells = state.cellInterior?.[key];
    if (cells) cellInteriorById[box.id] = cells as InteriorItem[][];
    if (state.partitions?.[key]) partitionsById.set(box.id, true);
  }

  const byBox = buildSketchBoards(boxes, {
    shellSides,
    hasEnvelopeTop: !!input.hasEnvelopeTop,
    wallEnvelopeCm,
    bodyMaterial,
    frontMaterial,
    fullD: input.D,
    backThicknessCm: input.backThickness,
    joint: resolveCabinetJointMethod(input.W, input.H),
    ...(input.topVariant ? { topVariant: input.topVariant } : {}),
    ...(input.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: input.sinkTraverseWidthCm } : {}),
    hasBack: input.hasBack ?? true,
    hasBottom: input.hasBottom ?? true,
    interiorById,
    cellInteriorById,
    partitionsById,
  });
  return [...byBox.values()].flat();
}
