/**
 * Pure compute for cabinet cuts + hardware.
 *
 * Mirrors the cuts/hardware logic from useCabinet.calculate() but without
 * React state/refs. Used by KitchenOverview to aggregate cuts/hardware
 * across multiple kitchen units (where useCabinet can't be called in a loop).
 *
 * NOTE: This currently uses an EMPTY override layer (boxDimensionOverrides,
 * bodyEdgingOverrides, boardOverrides, plinthGableOverrides). Saved state's
 * overrides ARE applied where they live in SavedCabinetState.
 *
 * If logic in useCabinet.calculate() changes, this function must be kept in
 * sync — see DECISIONS_LOG entry for the rationale of duplicating vs. refactor.
 */

import { decomposeBoxes } from './index';
import { buildDoorCutItems } from './cuts/doorCuts';
import { isCorner, cornerHingeSide, cornerFillerCutItems } from './product/cornerModule';
import { boxStableKey } from './interior/interiorUtils';
import { shouldCoverSkirt, makeDoorId, getItemsForFront, calcMainDoorHeight, getSkirtCoveringDrawer, defaultHingeSide, salonHingeSide, computeDefaultHingePositions, adjustHingesForInterior } from './doors/doorUtils';
import {
  computeRowFrontLayout,
  getBoxFirstGlobalFrontIndex,
  getTotalFrontsInRow,
  groupBoxesByRow,
  computeFrontGeometryForSpan,
  frontColumnsForBox,
  type RowFrontLayout,
} from './geometry/frontGeometry';
import type { BoxLevel } from '../types/geometry';
import { calcExternalDrawerFrontCuts } from './cuts/externalDrawerCuts';
import { calcHardware } from './hardware/calcHardware';
import {
  buildBoardModel,
  buildPlinthBoardModel,
  boardsToCutItems,
  deriveEnvelopeFlags,
  resolveCabinetJointMethod,
  computeCarcassDepth,
  computeInnerWidth,
  HINGE_GAP_CM,
} from './boards/boardModel';
import { newItemId } from './interior/interiorUtils';
import { resolveBoxMaterials } from './boards/boxMaterials';
import { getMaterialWithCustom } from '../catalog';
import type { Box, CutItem, MaterialId } from '../types';
import type { HardwareLineItem } from '../types/hardware';
import type { CabinetInput } from '../types/cabinet';
import { getShellSides } from '../types/cabinet';
import { DEFAULT_EDGING } from '../types/edging';
import type { InteriorItem, InteriorById, CellInteriorById } from '../types/interior';
import type { DoorById, Hinge } from '../types/doors';
import type { CustomMaterial } from '../types/materials';
import type { SavedCabinetState } from '../types/project';

// ── Label helpers (duplicated from useCabinet.ts — keep in sync) ────────────

function buildBoxLabel(box: Box): string {
  if (box.position === 'single' && box.level === 'single') return '';
  const parts: string[] = [];
  const levelMap: Record<string, string> = { top: 'עליון', middle: 'אמצעי', bottom: 'תחתון' };
  if (box.level !== 'single' && levelMap[box.level]) parts.push(levelMap[box.level]!);
  if (box.position === 'left') parts.push('שמאל');
  else if (box.position === 'right') parts.push('ימין');
  else if (box.unitIndex !== undefined) parts.push(`יחידה ${box.unitIndex}`);
  return parts.join(' — ');
}

function buildPartitionCutLabel(box: Box): string {
  const parts: string[] = ['מחיצה פנימית'];
  const levelMap: Record<string, string> = { top: 'עליונה', middle: 'אמצעית', bottom: 'תחתונה' };
  if (box.level !== 'single' && levelMap[box.level]) parts.push(levelMap[box.level]!);
  if (box.position === 'left') parts.push('שמאל');
  else if (box.position === 'right') parts.push('ימין');
  else if (box.unitIndex !== undefined) parts.push(`יחידה ${box.unitIndex}`);
  return parts.join(' — ');
}

function computePartitionCuts(
  boxes: Box[],
  nfMap: Map<string, number>,
  pMap: Map<string, boolean>,
  /** Per-body effective body material (id for cut grouping, thickness in cm for
   *  the note) — a partition inherits its body's (possibly overridden) material. */
  bodyMatForBox: (box: Box) => { id: MaterialId | string; tCm: number },
): CutItem[] {
  const cuts: CutItem[] = [];
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    if (!pMap.get(box.id)) continue;
    const nf = nfMap.get(box.id) ?? 1;
    const count = nf - 1;
    if (count <= 0) continue;
    const mat = bodyMatForBox(box);
    cuts.push({
      name: buildPartitionCutLabel(box),
      qty: count,
      w: box.D * 10,
      h: box.H * 10,
      group: 'body',
      note: `${Math.round(mat.tCm * 10)}mm`,
      materialId: mat.id,
    });
  }
  return cuts;
}

// ── Main compute function ────────────────────────────────────────────────────

export interface UnitComputeResult {
  cuts: CutItem[];
  hardwareItems: HardwareLineItem[];
}

/**
 * Compute cuts + hardware for a single unit, given input + saved state.
 * Pure (no React, no refs). Suitable for batch/loop use.
 */
export function computeUnitCutsAndHardware(
  input: CabinetInput,
  savedState: SavedCabinetState,
  customMaterials: CustomMaterial[] = [],
  /** When true, skip emitting plinth boards (front/back/cladding/gables).
   *  Used by KitchenOverview to aggregate plinths at the kitchen level —
   *  adjacent units sharing plinth attributes get a single unified plinth
   *  instead of one per unit. */
  options?: { skipPlinth?: boolean },
): UnitComputeResult {
  const {
    W, H, D, backThickness, hasEnvelopeTop,
    bodyMaterialId, frontMaterialId,
    plinth, plinthRecess, doorCoversPlinth,
    lowerDoorH, middleDoorH, doorsPerColumn,
    doorGapMm, maxDoorWidth,
  } = input;

  const bodyMaterial = getMaterialWithCustom(bodyMaterialId, customMaterials);
  const frontMaterial = getMaterialWithCustom(frontMaterialId, customMaterials);
  const tBody = bodyMaterial.thickness / 10;
  const tFront = frontMaterial.thickness / 10;
  // Per-side shell flags (kitchen units may disable a single side).
  const shellSides = getShellSides(input);
  const hasAnyShell = shellSides.left || shellSides.right;
  const innerW = computeInnerWidth(W, shellSides, tFront);
  const carcassD = computeCarcassDepth(D, backThickness, HINGE_GAP_CM, tFront);
  // Wall-cabinet (קלפה) top+bottom envelope — independent of the side shell.
  // Gated by mount==='wall' so a stray flag on a base cabinet has no effect.
  const wallEnv = input.hasWallEnvelope === true && input.mount === 'wall';
  const envelopeTopH = ((hasEnvelopeTop && hasAnyShell) || wallEnv) ? tFront : 0;
  const envelopeBottomH = wallEnv ? tFront : 0;

  const rawBoxes = decomposeBoxes(
    innerW, H, carcassD,
    lowerDoorH, plinth, doorsPerColumn, middleDoorH, envelopeTopH, envelopeBottomH,
    isCorner(input), // corner (פינה): one wide carcass, no 100 cm column split
  );

  // Apply box dimension overrides from saved state
  const boxDimOvr = new Map(Object.entries(savedState.boxDimensionOverrides ?? {}));
  const boxes = boxDimOvr.size === 0 ? rawBoxes : rawBoxes.map(box => {
    const ovr = boxDimOvr.get(boxStableKey(box));
    if (!ovr) return box;
    return {
      ...box,
      ...(ovr.W !== undefined ? { W: ovr.W } : {}),
      ...(ovr.H !== undefined ? { H: ovr.H } : {}),
      ...(ovr.D !== undefined ? { D: ovr.D } : {}),
    };
  });

  const cabinetEdging = input.edging ?? DEFAULT_EDGING;
  const bodyEdgingOverrides = new Map(Object.entries(savedState.bodyEdgingOverrides ?? {}));
  const boardOverrides = new Map(Object.entries(savedState.boardOverrides ?? {}));
  // Per-body material + back-thickness overrides (resolved per box below).
  const boxMaterialOvr = new Map(Object.entries(savedState.boxMaterialOverrides ?? {}));
  const edgingCtx = {
    cabinetDefault: cabinetEdging,
    bodyOverrides: bodyEdgingOverrides,
    boardOverrides,
  };

  // Door cuts are derived from `newDoors` AFTER the door loop (single source of
  // truth — see core/cuts/doorCuts.ts), so they track per-body W/H overrides
  // (applied to `boxes` above) and external-drawer shortening. hasFronts=false
  // (appliance bays) → doors get hasDoor=false, which buildDoorCutItems skips.
  const skipFronts = (input.hasFronts ?? true) === false;

  // ── Build interior/cells/partitions/doors maps from saved state ─────────────
  const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
  // Effective per-body materials (override ?? cabinet default) — one lookup
  // shared by the carcass, partition, door and external-front cut emitters.
  const boxMaterials = new Map(
    bodyBoxes.map(b => [b.id, resolveBoxMaterials(b, input, boxMaterialOvr, customMaterials)] as const),
  );
  const allPositions = bodyBoxes.map(b => b.position);
  const newInterior: InteriorById = {};
  const newCellInteriorById: CellInteriorById = {};
  const newPartitionsMap = new Map<string, boolean>();
  const newNumFrontsMap = new Map<string, number>();

  for (const box of bodyBoxes) {
    const key = boxStableKey(box);
    const numFronts = frontColumnsForBox(box.W, maxDoorWidth, input.mount, input.singleFront);
    newNumFrontsMap.set(box.id, numFronts);

    const savedItems = savedState.interior[key];
    newInterior[box.id] = savedItems ?? [];

    if (savedState.partitions[key] && numFronts > 1) {
      newPartitionsMap.set(box.id, true);
      const savedCells = savedState.cellInterior[key];
      newCellInteriorById[box.id] = savedCells ?? [[], []];
    }
  }

  // ── Row-level front layouts ─────────────────────────────────────────────────
  const cabinetGapCm = doorGapMm / 10;
  const rowsByLevel = groupBoxesByRow(bodyBoxes);
  const layoutByRow = new Map<BoxLevel, RowFrontLayout>();
  for (const [level, rowBoxes] of rowsByLevel) {
    const totalFrontsInRow = getTotalFrontsInRow(rowBoxes, newNumFrontsMap);
    // Per-row EFFECTIVE outer width — sum of the row's (possibly overridden)
    // body widths plus the cabinet shell offset (`W − innerW`). Mirrors
    // useCabinet so a per-body W override widens/narrows the fronts to match
    // the body beneath them, both in the live cabinet and in the kitchen
    // overview. Without overrides `rowInnerW === innerW`, so this equals W
    // exactly — no change to un-overridden units.
    const rowInnerW = rowBoxes.reduce((s, b) => s + b.W, 0);
    const rowEffectiveOuterW = (W - innerW) + rowInnerW;
    layoutByRow.set(level, computeRowFrontLayout({
      cabinetW: rowEffectiveOuterW,
      hasOuterShell: hasAnyShell,
      // Per-side flags so an asymmetric shell (e.g. wall-flush kitchen unit)
      // shrinks the door width by 1×t, not 2×t. Mirrors useCabinet.
      shellSides,
      shellThicknessCm: tFront,
      totalFrontsInRow,
      gapCm: cabinetGapCm,
    }));
  }

  // ── Doors ────────────────────────────────────────────────────────────────────
  const newDoors: DoorById = {};

  for (const box of bodyBoxes) {
    const numFronts = newNumFrontsMap.get(box.id)!;
    const hasPartition = newPartitionsMap.has(box.id);
    const bodyItems = newInterior[box.id] ?? [];
    const cellItems = newCellInteriorById[box.id];

    const originalCoversSkirt = doorCoversPlinth && shouldCoverSkirt(box.level);
    const isBottomMost = box.level === 'bottom' || box.level === 'single';
    const hasBottomGap = !(isBottomMost && plinth > 0 && !originalCoversSkirt);
    const hasTopGap = box.level === 'top' || box.level === 'single';

    const rowLayout = layoutByRow.get(box.level);
    // Corner unit (פינה): the single door is a fixed `doorWidthCm` at the chosen
    // edge (not the equal-split row width), and its hinges always land on the
    // filler side. See core/product/cornerModule.ts.
    const cornerCf = isCorner(input) ? input.cornerFiller! : null;
    const frontW = cornerCf ? cornerCf.doorWidthCm : (rowLayout?.frontWidth ?? 0);

    for (let fi = 0; fi < numFronts; fi++) {
      const doorId = makeDoorId(box.id, fi);
      const itemsForFront = getItemsForFront(fi, numFronts, hasPartition, bodyItems, cellItems);
      const panelH = calcMainDoorHeight(box.H, itemsForFront, doorGapMm, hasBottomGap, hasTopGap);

      const skirtDrawer = getSkirtCoveringDrawer(itemsForFront, originalCoversSkirt);
      const coversSkirt = originalCoversSkirt && skirtDrawer === null;

      const hingeSide = cornerCf
        ? cornerHingeSide(cornerCf)
        : numFronts > 1
          ? salonHingeSide(fi, numFronts)
          : defaultHingeSide(box.position, allPositions);

      // For pure compute (no preservation of user-edited hinges), use defaults.
      // Lift-mechanism cabinets (קלפה) open with a single hinged-from-top panel,
      // not cup hinges → emit none (no markers in any sketch; hardware uses the
      // lift-mechanism preset). Driven by `liftMechanism`, not `mount`, so other
      // wall-row modules (e.g. עליון מזווה) keep normal hinges.
      const isWall = input.liftMechanism === true;
      const slotKey = boxStableKey(box);
      const savedDoor = savedState.doors[`${slotKey}:${fi}`];

      if (savedDoor) {
        // Reconstruct from saved state — use saved hinges
        const hinges: Hinge[] = isWall ? [] : savedDoor.hinges.map(h => ({
          id: newItemId(),
          positionFromBottom: h.positionFromBottom,
          isManual: h.isManual,
        }));
        newDoors[doorId] = {
          id: doorId, boxId: box.id, frontIndex: fi,
          height: panelH, width: frontW,
          hingeSide: cornerCf ? cornerHingeSide(cornerCf) : savedDoor.hingeSide,
          hingeCount: isWall ? 0 : savedDoor.hingeCount,
          hinges,
          hasDoor: savedDoor.hasDoor,
          coversSkirt,
          gapMm: doorGapMm,
          ...(savedDoor.thicknessOverride ? { thicknessOverride: savedDoor.thicknessOverride } : {}),
        };
      } else {
        let hinges: Hinge[] = [];
        if (!isWall) {
          const defaults = computeDefaultHingePositions(panelH);
          const rawHinges: Hinge[] = defaults.map(p => ({
            id: newItemId(), positionFromBottom: p, isManual: false,
          }));
          hinges = adjustHingesForInterior(rawHinges, itemsForFront, doorGapMm, panelH).hinges;
        }
        newDoors[doorId] = {
          id: doorId, boxId: box.id, frontIndex: fi,
          height: panelH, width: frontW,
          hingeSide, hingeCount: isWall ? 0 : 'auto', hinges, hasDoor: !skipFronts,
          coversSkirt, gapMm: doorGapMm,
        };
      }
    }
  }

  // ── Door cuts (derived from the finished doors — single source of truth) ──
  const doorCuts = buildDoorCutItems({
    doors: newDoors, bodyBoxes, numFrontsPerBox: newNumFrontsMap, edging: cabinetEdging,
    frontMaterialForBox: id => boxMaterials.get(id)?.frontMaterial.id,
  });

  // ── Corner filler (פינה): face flange + perpendicular hinge-post return ──
  const cornerFillerCuts: CutItem[] = [];
  if (isCorner(input)) {
    const cornerBox = bodyBoxes[0];
    const cornerDoor = cornerBox ? newDoors[makeDoorId(cornerBox.id, 0)] : undefined;
    if (cornerBox && cornerDoor) {
      const cornerFrontMatId = boxMaterials.get(cornerBox.id)?.frontMaterial.id;
      cornerFillerCuts.push(...cornerFillerCutItems({
        cabinetWcm: cornerBox.W, gapCm: cabinetGapCm, cf: input.cornerFiller!,
        doorHeightCm: cornerDoor.height, innerHeightCm: Math.max(0, cornerBox.H - 2 * tBody),
        edging: cabinetEdging,
      }).map(c => (cornerFrontMatId !== undefined ? { ...c, materialId: cornerFrontMatId } : c)));
    }
  }

  // ── External-drawer front cuts ─────────────────────────────────────────────
  const externalDrawerCuts: CutItem[] = [];
  for (const box of bodyBoxes) {
    const numFronts = newNumFrontsMap.get(box.id)!;
    const hasPartition = newPartitionsMap.has(box.id);
    const bodyItems = newInterior[box.id] ?? [];
    const cellItems = newCellInteriorById[box.id];
    const originalCoversSkirt = doorCoversPlinth && shouldCoverSkirt(box.level);

    const rowLayout = layoutByRow.get(box.level);
    if (!rowLayout) continue;
    const rowBoxes = rowsByLevel.get(box.level) ?? [];
    // External-drawer faces are this body's fronts → its (overridden) front
    // material, both for the panel thickness and the cut-list grouping.
    const boxFront = boxMaterials.get(box.id)!.frontMaterial;
    const tagFront = (cs: CutItem[]): CutItem[] => cs.map(c => ({ ...c, materialId: boxFront.id }));

    if (hasPartition) {
      const cellW = rowLayout.frontWidth;
      for (let ci = 0 as 0 | 1; ci <= 1; ci = (ci + 1) as 0 | 1) {
        const itemsForCell = cellItems?.[ci] ?? [];
        externalDrawerCuts.push(
          ...tagFront(calcExternalDrawerFrontCuts(
            itemsForCell, cellW, doorGapMm, plinth, originalCoversSkirt,
            boxFront.thickness, undefined, cabinetEdging,
          )),
        );
      }
    } else {
      const boxFirstGlobalIndexInRow = getBoxFirstGlobalFrontIndex({
        rowBoxes, numFrontsPerBox: newNumFrontsMap, targetBoxId: box.id,
      });
      const bodyDrawerW = computeFrontGeometryForSpan({
        startGlobalIndexInRow: boxFirstGlobalIndexInRow,
        spanLength: numFronts,
        layout: rowLayout,
        gapCm: cabinetGapCm,
      }).width;
      externalDrawerCuts.push(
        ...tagFront(calcExternalDrawerFrontCuts(
          bodyItems, bodyDrawerW, doorGapMm, plinth, originalCoversSkirt,
          boxFront.thickness, undefined, cabinetEdging,
        )),
      );
    }
  }

  const partitionCuts = computePartitionCuts(bodyBoxes, newNumFrontsMap, newPartitionsMap, box => {
    const m = boxMaterials.get(box.id)!;
    return { id: m.bodyMaterial.id, tCm: m.bodyMaterial.thickness / 10 };
  });

  // ── Carcass boards ──────────────────────────────────────────────────────────
  const cabinetJoint = resolveCabinetJointMethod(W, H);
  const boardCuts: CutItem[] = [];
  for (const box of bodyBoxes) {
    const envFlags = deriveEnvelopeFlags(box, shellSides, hasEnvelopeTop, wallEnv);
    const items = newInterior[box.id] ?? [];
    const cellItems = newCellInteriorById[box.id];
    const hasPartitionBox = newPartitionsMap.get(box.id) === true;
    // Per-body material override: this body's carcass / envelope / back boards
    // are cut from its own materials (falling back to the cabinet default).
    const boxMat = boxMaterials.get(box.id)!;
    const boards = buildBoardModel({
      box,
      bodyMaterial: boxMat.bodyMaterial,
      frontMaterial: boxMat.frontMaterial,
      hasEnvelopeLeft: envFlags.hasEnvelopeLeft,
      hasEnvelopeRight: envFlags.hasEnvelopeRight,
      hasEnvelopeTop: envFlags.hasEnvelopeTop,
      hasEnvelopeBottom: envFlags.hasEnvelopeBottom,
      items,
      hasPartition: hasPartitionBox,
      ...(hasPartitionBox && cellItems
        ? { cellItems: [cellItems[0] ?? [], cellItems[1] ?? []] as [InteriorItem[], InteriorItem[]] }
        : {}),
      hasBack: input.hasBack ?? true,
      hasBottom: input.hasBottom ?? true,
      envelopeDepth: D,
      backThicknessCm: boxMat.backThicknessCm,
      cabinetTotalH: H,
      joint: cabinetJoint,
      ...(input.topVariant ? { topVariant: input.topVariant } : {}),
      ...(input.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: input.sinkTraverseWidthCm } : {}),
    }).filter(b => b.role !== 'partition');
    boardCuts.push(...boardsToCutItems(
      boards, buildBoxLabel(box), boardOverrides, edgingCtx, boxStableKey(box),
    ));
  }

  // Plinth boards — skipped when the caller (KitchenOverview) aggregates
  // plinths at the kitchen level across adjacent units.
  if (!options?.skipPlinth) {
    const bottomRowBoxes = bodyBoxes.filter(b => b.level === 'bottom' || b.level === 'single');
    const plinthGableOverrides = new Map(Object.entries(savedState.plinthGableOverrides ?? {}));
    const plinthBoards = buildPlinthBoardModel({
      cabinetW: W,
      cabinetD: carcassD,
      plinthHeight: plinth,
      bodyMaterial,
      frontMaterial,
      boxes: bottomRowBoxes,
      ...(plinthGableOverrides.size > 0 ? { gableOverrides: plinthGableOverrides } : {}),
      ...(plinthRecess > 0 ? { recessCm: plinthRecess } : {}),
    });
    boardCuts.push(...boardsToCutItems(plinthBoards, '', boardOverrides, edgingCtx));
  }

  // ── Enrich cuts with materialId ────────────────────────────────────────────
  function materialForGroup(group: CutItem['group']): MaterialId | undefined {
    switch (group) {
      case 'shell':
      case 'door':
      case 'front':
        return frontMaterialId;
      case 'body':
      case 'back':
      case 'plinth':
        return bodyMaterialId;
      default:
        return undefined;
    }
  }
  function enrich(items: CutItem[]): CutItem[] {
    return items.map(c => {
      if (c.materialId !== undefined) return c;
      const mid = materialForGroup(c.group);
      return mid !== undefined ? { ...c, materialId: mid } : c;
    });
  }

  const allCuts = [
    ...enrich(doorCuts),
    ...enrich(cornerFillerCuts),
    ...boardCuts,
    ...enrich(partitionCuts),
    ...enrich(externalDrawerCuts),
  ];

  const hardwareItems = calcHardware(
    newDoors, newInterior, newCellInteriorById,
    input.liftMechanism === true ? 'wall_cabinet' : 'cabinet',
  );

  return { cuts: allCuts, hardwareItems };
}
