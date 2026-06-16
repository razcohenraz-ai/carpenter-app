import type { CabinetInput, SavedCabinetState } from '../../types';
import type { CustomMaterial } from '../../types/materials';
import type { InteriorItem, InteriorById, CellInteriorById } from '../../types/interior';
import type { BoxLevel } from '../../types/geometry';
import {
  computeRowFrontLayout, getTotalFrontsInRow, groupBoxesByRow,
  frontColumnsForBox, type RowFrontLayout,
} from '../geometry/frontGeometry';
import { decomposeBoxes } from '../geometry/boxDecomposition';
import { computeInnerWidth, computeCarcassDepth, HINGE_GAP_CM, type BoardOverrides } from '../boards/boardModel';
import { boxStableKey } from '../interior/interiorUtils';
import { getShellSides } from '../../types/cabinet';
import { getMaterialWithCustom } from '../../catalog';

/** Everything a {@link CabinetSketch} needs to render a cabinet's body+interior
 *  elevation, derived purely from its saved `input` + `state`. */
export interface CabinetSketchModel {
  interiorById: InteriorById;
  cellInteriorById: CellInteriorById;
  partitionsById: Map<string, boolean>;
  frontLayoutByRow: Map<BoxLevel, RowFrontLayout>;
  numFrontsPerBox: Map<string, number>;
  boardOverrides: Map<string, BoardOverrides>;
  boxDimensionOverrides: Map<string, { W?: number; H?: number; D?: number }>;
  /** Effective outer dimensions (after the single-body W/H override), cm. */
  effW: number;
  effH: number;
  /** Outer width including the shell envelope on each present side, cm. */
  outerCabW: number;
  /** Front-material thickness, cm. */
  tFront: number;
  sides: { left: boolean; right: boolean };
  hasAnyShell: boolean;
}

/** Builds the render model for a single cabinet's elevation (the prop bundle
 *  `CabinetSketch` consumes). Extracted verbatim from `KitchenOverview.UnitsView`
 *  so the kitchen overview, the single-cabinet form, and the room's detailed
 *  elevation all derive these props from ONE place (single source).
 *
 *  Note: box decomposition runs at the INPUT dimensions, then per-body
 *  overrides are applied by `boxStableKey` — mirrors `useCabinet`/`cabinetCompute`
 *  and the body editor. Decomposing at the post-override width would re-split a
 *  single body whose width was overridden past MAX_BOX_W. */
export function buildCabinetSketchModel(
  input: CabinetInput,
  state: SavedCabinetState,
  customMaterials: CustomMaterial[],
): CabinetSketchModel {
  const single = state.boxDimensionOverrides?.['single:single'];
  const effW = single?.W ?? input.W;
  const effH = single?.H ?? input.H;

  const frontMat = getMaterialWithCustom(input.frontMaterialId, customMaterials);
  const tFront = frontMat.thickness / 10;
  const sides = getShellSides(input);
  const hasAnyShell = sides.left || sides.right;

  const innerW = computeInnerWidth(input.W, sides, tFront);
  const carcassD = computeCarcassDepth(input.D, input.backThickness, HINGE_GAP_CM, tFront);
  const envelopeTopH = (input.hasEnvelopeTop && hasAnyShell) ? tFront : 0;

  const boxDimensionOverrides = new Map(Object.entries(state.boxDimensionOverrides ?? {}));
  const rawBoxes = decomposeBoxes(innerW, input.H, carcassD, input.lowerDoorH, input.plinth, input.doorsPerColumn, input.middleDoorH, envelopeTopH);
  const boxes = boxDimensionOverrides.size === 0 ? rawBoxes : rawBoxes.map(box => {
    const o = boxDimensionOverrides.get(boxStableKey(box));
    if (!o) return box;
    return {
      ...box,
      ...(o.W !== undefined ? { W: o.W } : {}),
      ...(o.H !== undefined ? { H: o.H } : {}),
      ...(o.D !== undefined ? { D: o.D } : {}),
    };
  });
  const bodyBoxes = boxes.filter(b => b.level !== 'plinth');

  const numFrontsPerBox = new Map<string, number>();
  for (const box of bodyBoxes) {
    numFrontsPerBox.set(box.id, frontColumnsForBox(box.W, input.maxDoorWidth, input.mount, input.singleFront));
  }

  const cabinetGapCm = input.doorGapMm / 10;
  const rowsByLevel = groupBoxesByRow(bodyBoxes);
  const frontLayoutByRow = new Map<BoxLevel, RowFrontLayout>();
  for (const [level, rowBoxes] of rowsByLevel) {
    const totalFronts = getTotalFrontsInRow(rowBoxes, numFrontsPerBox);
    frontLayoutByRow.set(level, computeRowFrontLayout({
      cabinetW: effW,
      hasOuterShell: hasAnyShell,
      shellSides: sides,
      shellThicknessCm: tFront,
      totalFrontsInRow: totalFronts,
      gapCm: cabinetGapCm,
    }));
  }

  // Translate saved-state Records (keyed by boxStableKey) to runtime Maps keyed
  // by the ad-hoc box.id that this decomposeBoxes call produced.
  const interiorById: InteriorById = {};
  const cellInteriorById: CellInteriorById = {};
  const partitionsById = new Map<string, boolean>();
  for (const box of bodyBoxes) {
    const slotKey = boxStableKey(box);
    const items = state.interior[slotKey];
    if (items) interiorById[box.id] = items as InteriorItem[];
    const cells = state.cellInterior[slotKey];
    if (cells) cellInteriorById[box.id] = cells as InteriorItem[][];
    if (state.partitions[slotKey]) partitionsById.set(box.id, true);
  }

  const boardOverrides = new Map(Object.entries(state.boardOverrides ?? {}));
  const outerCabW = effW + (sides.left ? tFront : 0) + (sides.right ? tFront : 0);

  return {
    interiorById, cellInteriorById, partitionsById,
    frontLayoutByRow, numFrontsPerBox, boardOverrides, boxDimensionOverrides,
    effW, effH, outerCabW, tFront, sides, hasAnyShell,
  };
}
