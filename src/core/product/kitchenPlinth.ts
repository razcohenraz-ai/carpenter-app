import type { KitchenUnit } from '../../types/project';
import type { CutItem } from '../../types/cuts';
import type { Box } from '../../types/geometry';
import type { Board } from '../boards/boardModel';
import type { CustomMaterial } from '../../types/materials';
import { buildPlinthBoardModel, boardsToCutItems, computeCarcassDepth, HINGE_GAP_CM } from '../boards/boardModel';
import { getMaterialWithCustom } from '../../catalog/materialCombiner';
import { MAX_PLINTH_W, splitWidth } from '../geometry/boxDecomposition';
import { unitOuterW } from './kitchenFootprint';
import { roundInternal } from '../utils/round';

/** Adjacent units sharing the same plinth attributes share a single physical
 *  plinth that spans them. This is the unit-level definition for grouping —
 *  if any of these attributes differs between two adjacent units, they go
 *  into separate groups. Units with `plinth === 0` (no plinth) break a group. */
interface PlinthKey {
  plinthH: number;
  plinthRecess: number;
  bodyMaterialId: string;
  frontMaterialId: string;
  D: number;
  backThickness: number;
}

export interface KitchenPlinthGroup {
  units: KitchenUnit[];
  /** Sum of unit EFFECTIVE widths in the group (cm) — `unitOuterW`, so a
   *  per-body W override grows the plinth in step with the layout/3D/elevation
   *  (which all space units by the same `unitOuterW`), not the raw `input.W`. */
  totalW: number;
  key: PlinthKey;
}

function plinthKeyOf(unit: KitchenUnit): PlinthKey | null {
  const inp = unit.cabinet.input;
  if ((inp.plinth ?? 0) <= 0) return null;
  return {
    plinthH: inp.plinth,
    plinthRecess: inp.plinthRecess ?? 0,
    bodyMaterialId: inp.bodyMaterialId,
    frontMaterialId: inp.frontMaterialId,
    D: inp.D,
    backThickness: inp.backThickness,
  };
}

function sameKey(a: PlinthKey, b: PlinthKey): boolean {
  return a.plinthH === b.plinthH
    && a.plinthRecess === b.plinthRecess
    && a.bodyMaterialId === b.bodyMaterialId
    && a.frontMaterialId === b.frontMaterialId
    && a.D === b.D
    && a.backThickness === b.backThickness;
}

/** Groups adjacent kitchen units sharing plinth attributes into one plinth
 *  group each. Units with `plinth === 0` are skipped (no plinth) and break
 *  the run. Order is preserved from the units array. */
export function groupKitchenUnitsForPlinth(units: KitchenUnit[]): KitchenPlinthGroup[] {
  const groups: KitchenPlinthGroup[] = [];
  let current: KitchenPlinthGroup | null = null;
  for (const u of units) {
    const key = plinthKeyOf(u);
    if (!key) { current = null; continue; }
    if (current && sameKey(current.key, key)) {
      current.units.push(u);
      current.totalW += unitOuterW(u);
    } else {
      current = { units: [u], totalW: unitOuterW(u), key };
      groups.push(current);
    }
  }
  return groups;
}

/** Synthetic bottom-row boxes for a unified kitchen plinth, using the
 *  cabinet-style width-splitting rule (MAX_BOX_W=100 cm). This is what
 *  `calcPlinthGables` reads to place internal joint + mid-body gables, so
 *  the kitchen plinth ends up with the same gable distribution a normal
 *  cabinet of width `totalW` would have. The result feeds both the cut
 *  list and the kitchen-level PlinthEditor. */
export function buildKitchenPlinthBoxes(totalW: number, plinthH: number, D: number): Box[] {
  const protos = splitWidth(totalW, plinthH, D, 'bottom');
  return protos.map((p, i): Box => ({
    id: `kp-${i}`,
    W: p.W,
    H: p.H,
    D: p.D,
    position: p.position,
    level: 'bottom',
    ...(p.unitIndex !== undefined ? { unitIndex: p.unitIndex } : {}),
    ...(p.unitTotal !== undefined ? { unitTotal: p.unitTotal } : {}),
  }));
}

/** Returns the piece-width array for a group: split into N=ceil(totalW/MAX) equal
 *  pieces, each ≤ MAX_PLINTH_W. Cuts at unit boundaries are not enforced — the
 *  pieces split evenly across the group's total width. */
export function plinthPieceWidths(totalW: number): number[] {
  const n = Math.max(1, Math.ceil(totalW / MAX_PLINTH_W));
  const pieceW = roundInternal(totalW / n);
  // Last piece absorbs any rounding residue so the sum equals totalW exactly.
  const pieces: number[] = [];
  for (let i = 0; i < n - 1; i++) pieces.push(pieceW);
  pieces.push(roundInternal(totalW - pieceW * (n - 1)));
  return pieces;
}

/** Builds cut items for one kitchen plinth group. Gables are emitted once
 *  for the group (at unit joints + outer edges + mid-bodies). Plinth-front,
 *  plinth-back and cladding are split into N pieces if `totalW > MAX_PLINTH_W`. */
export function buildKitchenPlinthCuts(
  group: KitchenPlinthGroup,
  customMaterials: CustomMaterial[] = [],
): CutItem[] {
  const { totalW, key } = group;
  const bodyMaterial = getMaterialWithCustom(key.bodyMaterialId, customMaterials);
  const frontMaterial = getMaterialWithCustom(key.frontMaterialId, customMaterials);
  const tFront = frontMaterial.thickness / 10;
  const carcassD = computeCarcassDepth(key.D, key.backThickness, HINGE_GAP_CM, tFront);

  // Synthetic boxes that produce CABINET-style gable distribution: the
  // group's total width is split by MAX_BOX_W (100 cm) using the same
  // `splitWidth` rule a normal cabinet uses for its bottom-row bodies.
  // Result: edge gables + joints between sub-boxes + mid-body gables for
  // each sub-box > 80 cm. Independent of the actual KitchenUnit widths.
  const syntheticBoxes = buildKitchenPlinthBoxes(totalW, key.plinthH, key.D);

  const boards = buildPlinthBoardModel({
    cabinetW: totalW,
    cabinetD: carcassD,
    plinthHeight: key.plinthH,
    bodyMaterial,
    frontMaterial,
    boxes: syntheticBoxes,
    ...(key.plinthRecess > 0 ? { recessCm: key.plinthRecess } : {}),
  });

  // Split plinth-front / plinth-back / cladding into N equal pieces (with the
  // last piece absorbing rounding residue) when totalW exceeds MAX_PLINTH_W.
  // Each piece is a separate physical board the saw cuts. Gables stay as-is —
  // they're at fixed positions (unit joints + edges) regardless of how the
  // long facade is sub-divided.
  const pieces = plinthPieceWidths(totalW);
  if (pieces.length === 1) {
    return boardsToCutItems(boards, '');
  }

  const splitRoles = new Set(['plinth-front', 'plinth-back', 'plinth-front-cladding']);
  const splitBoards: Board[] = [];
  for (const b of boards) {
    if (!splitRoles.has(b.role)) {
      splitBoards.push(b);
      continue;
    }
    pieces.forEach((pieceW, i) => {
      splitBoards.push({ ...b, id: `${b.id}-pc${i}`, length: pieceW });
    });
  }
  return boardsToCutItems(splitBoards, '');
}
