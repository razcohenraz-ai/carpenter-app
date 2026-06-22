import { useState, useRef } from 'react';
import { decomposeBoxes, calcDoors } from '../../core';
import { applyBoxDimensionOverrides, plinthOuterWidth } from '../../core/geometry/boxDecomposition';
import { initInteriorFromBoxes, boxStableKey, filterItemsForHeight } from '../../core/interior/interiorUtils';
import {
  recomputeDoorHinges,
  computeHingeCount,
  computeDefaultHingePositions,
  adjustHingesForInterior,
  defaultHingeSide,
  assignDoorDisplayNumbers,
  shouldCoverSkirt,
  makeDoorId,
  salonHingeSide,
  calcMainDoorHeight,
  getSkirtCoveringDrawer,
  getItemsForFront,
} from '../../core/doors/doorUtils';
import { deriveDrawerFronts } from '../../core/doors/drawerFrontsCalc';
import {
  computeRowFrontLayout,
  getTotalFrontsInRow,
  groupBoxesByRow,
  frontColumnsForBox,
  bodyFrontLayout,
  bodySpanGeometry,
  type RowFrontLayout,
} from '../../core/geometry/frontGeometry';
import type { BoxLevel } from '../../types/geometry';
import { calcExternalDrawerFrontCuts } from '../../core/cuts/externalDrawerCuts';
import { buildDoorCutItems } from '../../core/cuts/doorCuts';
import { resolveBoxMaterials, type BoxMaterialOverride } from '../../core/boards/boxMaterials';
import { isCorner, cornerHingeSide, cornerFillerCutItems } from '../../core/product/cornerModule';
import { computePartitionCuts } from '../../core/cuts/partitionCuts';
import { calcHardware } from '../../core/hardware/calcHardware';
import {
  buildBoardModel,
  buildPlinthBoardModel,
  boardsToCutItems,
  deriveEnvelopeFlags,
  resolveCabinetJointMethod,
  computeCarcassDepth,
  computeInnerWidth,
  HINGE_GAP_CM,
  type BoardDimensionKey,
  type BoardOverrides,
  type EdgingContext,
} from '../../core/boards/boardModel';
import { newItemId } from '../../core/interior/interiorUtils';
import { syncFixedShelf } from '../../core/interior/fixedShelfUtils';
import { getMaterialWithCustom } from '../../catalog';
import type { Box, CutItem, DoorCalcResult, MaterialId } from '../../types';
import type { HardwareLineItem } from '../../types/hardware';
import type { CabinetInput } from '../../types/cabinet';
import { getShellSides } from '../../types/cabinet';
import { DEFAULT_EDGING, type Edging } from '../../types/edging';
import type { InteriorItem, InteriorById, CellInteriorById, DrawerItem } from '../../types/interior';
import type { Door, DoorById, DrawerFrontById, Hinge } from '../../types/doors';
import type { BoxSlotId, SavedCabinetState, SavedDoor } from '../../types/project';

export type { CabinetInput };

// ── Box-label helper (used for both partition cuts and board cuts) ──────────

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

// ── Partition helpers ─────────────────────────────────────────────────────────


export interface BoxDimensionOverride {
  W?: number;
  H?: number;
  D?: number;
}

export interface CabinetResult {
  boxes: Box[];
  cuts: CutItem[];
  doors: DoorCalcResult;
  /** Carcass depth in cm — `D − backThickness − HINGE_GAP_CM − tFront`,
   *  produced by {@link computeCarcassDepth}. Exposed so UI consumers
   *  (sketches, the plinth editor, etc.) never re-derive the formula. */
  carcassD: number;
  /** Inner cabinet width in cm — `hasShell ? W − 2·tFront : W`, produced
   *  by {@link computeInnerWidth}. Single source of truth for the front
   *  layout, the body decomposition, and the live sketches. */
  innerW: number;
  hardwareItems: HardwareLineItem[];
  /** Derived (pre-override) dimensions for each body, keyed by boxStableKey.
   *  UI reads this to show the decomposeBoxes value as placeholder in override
   *  inputs, so the component never re-derives the formula. */
  derivedBoxDims: ReadonlyMap<string, { W: number; H: number; D: number }>;
}

export function useCabinet(settings?: {
  customMaterials?: import('../../types/materials').CustomMaterial[];
}): {
  result: CabinetResult | null;
  calculate: (input: CabinetInput) => void;
  interiorById: InteriorById;
  setBoxInterior: (boxId: string, items: InteriorItem[]) => void;
  cellInteriorById: CellInteriorById;
  addPartition: (boxId: string) => void;
  removePartition: (boxId: string) => void;
  setCellItems: (boxId: string, cellIndex: number, items: InteriorItem[]) => void;
  doorsById: DoorById;
  drawerFrontsById: DrawerFrontById;
  displayNumbers: Map<string, string>;
  numFrontsPerBox: Map<string, number>;
  partitionsById: Map<string, boolean>;
  frontLayoutByRow: Map<BoxLevel, RowFrontLayout>;
  setBoxPartitions: (boxId: string, value: boolean) => void;
  setDoorHingeSide: (doorId: string, side: 'left' | 'right') => void;
  setDoorHingeCount: (doorId: string, count: 2 | 3 | 4 | 'auto') => void;
  setHingeManual: (doorId: string, hingeId: string, pos: number) => void;
  resetHingeToAuto: (doorId: string, hingeId: string) => void;
  setDoorHasDoor: (doorId: string, hasDoor: boolean) => void;
  setDoorThickness: (doorId: string, materialId: string) => void;
  setCoversSkirt: (value: boolean) => void;
  setDrawerHeight: (drawerId: string, drawerHeight: number) => void;
  setDrawerFrontThickness: (drawerId: string, materialId: string | undefined) => void;
  deleteDrawer: (drawerId: string) => void;
  /** Per-gable Panel-A x override map (cm). Lives outside `result` because
   *  it's a "soft" position change that does not invalidate the rest of
   *  the calculation; the cuts list refreshes automatically as each setter
   *  triggers re-render via `calculate(lastInputRef.current)`. */
  plinthGableOverrides: ReadonlyMap<string, number>;
  /** Set or clear (when `x === undefined`) a single gable's override. */
  setPlinthGableOverride: (gableId: string, x: number | undefined) => void;
  /** Drop every override at once. */
  resetPlinthGableOverrides: () => void;
  /** Per-board override layer keyed by `Board.stableId`. Holds dimension
   *  and material-id overrides; the derived (carpentry-rule) values live
   *  inside `buildBoardModel` / `buildPlinthBoardModel` and stay untouched.
   *  Effective values are read via `getDimension` / `getMaterial` from
   *  `core/boards/boardModel`. */
  boardOverridesByStableId: ReadonlyMap<string, BoardOverrides>;
  /** Set one dimension override on a single board. */
  setBoardDimensionOverride: (stableId: string, key: BoardDimensionKey, value: number) => void;
  /** Drop a single dimension override; reverts to derived. */
  resetBoardDimensionOverride: (stableId: string, key: BoardDimensionKey) => void;
  /** Set the material id override for a single board (e.g. real-wood back
   *  in an otherwise-MDF cabinet). */
  setBoardMaterialOverride: (stableId: string, materialId: MaterialId) => void;
  /** Drop the material id override; reverts to derived. */
  resetBoardMaterialOverride: (stableId: string) => void;
  /** Drop every board-level override (dimensions and materials) at once. */
  resetAllBoardOverrides: () => void;
  /** Per-body edging override layer keyed by `boxStableKey(box)` (the
   *  current `BoxSlotId` placeholder). When absent for a body, the cabinet
   *  default from `CabinetInput.edging` applies. */
  bodyEdgingOverrides: ReadonlyMap<BoxSlotId, Edging>;
  /** Set the per-body edging override. Pass `undefined` to revert to the
   *  cabinet default. */
  setBodyEdgingOverride: (boxSlotId: BoxSlotId, edging: Edging | undefined) => void;
  /** Per-body dimension overrides keyed by `boxStableKey(box)`. Each entry
   *  holds only the axes that were overridden — absent axes fall back to the
   *  value produced by `decomposeBoxes`. */
  boxDimensionOverrides: ReadonlyMap<BoxSlotId, BoxDimensionOverride>;
  /** Set one dimension (W/H/D) for a body. Pass `undefined` to revert. */
  setBoxDimension: (boxSlotId: BoxSlotId, axis: 'W' | 'H' | 'D', value: number | undefined) => void;
  /** Drop all dimension overrides for a body at once. */
  resetBoxDimensions: (boxSlotId: BoxSlotId) => void;
  /** Per-body material overrides (body/front material + back thickness) keyed by
   *  `boxStableKey(box)`. Absent fields fall back to the cabinet default. */
  boxMaterialOverrides: ReadonlyMap<BoxSlotId, BoxMaterialOverride>;
  /** Merge a partial material override for a body. A field set to `undefined`
   *  reverts to the cabinet default; an empty result drops the body's entry. */
  setBoxMaterial: (boxSlotId: BoxSlotId, patch: { [K in keyof BoxMaterialOverride]?: BoxMaterialOverride[K] | undefined }) => void;
  /** Drop all material overrides for a body at once. */
  resetBoxMaterials: (boxSlotId: BoxSlotId) => void;
  /** The last CabinetInput passed to `calculate()`. Useful for consumers that
   *  need to know the current input without re-deriving it from form state. */
  getLastInput: () => import('../../types/cabinet').CabinetInput | null;
  /** Snapshot of all current user choices as a serialisable {@link SavedCabinetState}.
   *  Called synchronously — safe to call immediately after `calculate()`. */
  getSnapshot: () => SavedCabinetState;
  /** Restore a previously-saved state. Resets all override refs then
   *  re-runs `calculate()` so boxes and boards reflect the restored values.
   *  Requires `lastInputRef` to be set (i.e. `calculate` was called at least
   *  once with the matching `CabinetInput`). */
  restoreState: (state: SavedCabinetState) => void;
} {
  const [result, setResult] = useState<CabinetResult | null>(null);
  const [interiorById, setInteriorById] = useState<InteriorById>({});
  const [cellInteriorById, setCellInteriorById] = useState<CellInteriorById>({});
  const [doorsById, setDoorsById] = useState<DoorById>({});
  const [displayNumbers, setDisplayNumbers] = useState<Map<string, string>>(new Map());
  const [numFrontsPerBox, setNumFrontsPerBox] = useState<Map<string, number>>(new Map());
  const [partitionsById, setPartitionsById] = useState<Map<string, boolean>>(new Map());
  const [frontLayoutByRow, setFrontLayoutByRow] = useState<Map<BoxLevel, RowFrontLayout>>(new Map());
  const [drawerFrontsById, setDrawerFrontsByIdState] = useState<DrawerFrontById>({});
  const [plinthGableOverrides, setPlinthGableOverridesState] = useState<ReadonlyMap<string, number>>(new Map());
  const plinthGableOverridesRef = useRef<ReadonlyMap<string, number>>(new Map());
  const [boardOverridesByStableId, setBoardOverridesState] = useState<ReadonlyMap<string, BoardOverrides>>(new Map());
  const boardOverridesRef = useRef<ReadonlyMap<string, BoardOverrides>>(new Map());
  // Per-body edging overrides keyed by `boxStableKey(box)` (the current
  // `BoxSlotId` placeholder). State+ref pattern matches the other override
  // layers; setter triggers a full re-calculate so the CutItem dimensions
  // update through `boardsToCutItems` → `resolveEdging`.
  const [bodyEdgingOverrides, setBodyEdgingOverridesState] = useState<ReadonlyMap<BoxSlotId, Edging>>(new Map());
  const bodyEdgingOverridesRef = useRef<ReadonlyMap<BoxSlotId, Edging>>(new Map());
  const [boxDimensionOverrides, setBoxDimensionOverridesState] = useState<ReadonlyMap<BoxSlotId, BoxDimensionOverride>>(new Map());
  const boxDimensionOverridesRef = useRef<ReadonlyMap<BoxSlotId, BoxDimensionOverride>>(new Map());
  // Per-body material overrides (body/front material + back thickness) keyed by
  // `boxStableKey(box)`. Same state+ref+persistence pattern as the dimension
  // layer; the setter re-calculates so the cut list, sketch and 3D pick it up.
  const [boxMaterialOverrides, setBoxMaterialOverridesState] = useState<ReadonlyMap<BoxSlotId, BoxMaterialOverride>>(new Map());
  const boxMaterialOverridesRef = useRef<ReadonlyMap<BoxSlotId, BoxMaterialOverride>>(new Map());
  /** Pending state to restore on the next `calculate()` call (first-run only).
   *  Set by `restoreState()`; consumed and cleared inside `calculate()`. */
  const pendingRestoreRef = useRef<SavedCabinetState | null>(null);

  const interiorRef = useRef<InteriorById>({});
  const cellInteriorRef = useRef<CellInteriorById>({});
  const doorsRef    = useRef<DoorById>({});
  const prevBoxesRef = useRef<Box[] | null>(null);
  const plinthRef = useRef<number>(0);
  const boxLevelMapRef = useRef<Map<string, string>>(new Map());
  const numFrontsRef = useRef<Map<string, number>>(new Map());
  const partitionsRef = useRef<Map<string, boolean>>(new Map());
  const baseCutsRef = useRef<CutItem[]>([]);
  const tBodyRef = useRef<number>(1.8);
  // Stored input enables full re-calculate when an external-drawer mount
  // toggle reaches setBoxInterior/setCellItems (see Q3 of stage 2.1).
  const lastInputRef = useRef<CabinetInput | null>(null);
  // IDs of external drawers that inherited coversSkirt from their main door.
  // Read by 2.2 visualization through `drawerFrontsById` (each DrawerFront
  // carries its own `coversSkirt` flag); kept here for legacy callers that
  // want the raw set.
  const skirtCoveringDrawerIdsRef = useRef<Set<string>>(new Set());
  const drawerFrontsRef = useRef<DrawerFrontById>({});

  function setInterior(v: InteriorById): void {
    interiorRef.current = v;
    setInteriorById(v);
  }

  function setDoors(v: DoorById, boxes?: Box[], nfMap?: Map<string, number>): void {
    doorsRef.current = v;
    setDoorsById(v);
    if (boxes) {
      const nm = nfMap ?? numFrontsRef.current;
      setDisplayNumbers(assignDoorDisplayNumbers(boxes, nm));
    }
  }

  function setDrawerFronts(v: DrawerFrontById): void {
    drawerFrontsRef.current = v;
    setDrawerFrontsByIdState(v);
  }

  // ── Interior ──────────────────────────────────────────────────────────────

  function setBoxInterior(boxId: string, items: InteriorItem[]): void {
    const prevItems = interiorRef.current[boxId] ?? [];
    // Reconcile the auto fixed shelf (above external drawers) BEFORE storing.
    // syncFixedShelf inspects external-drawer transitions and creates/updates/
    // removes the shelf so downstream consumers (sketches, cuts) see a
    // coherent items list.
    const gapMm = lastInputRef.current?.doorGapMm ?? 2;
    const synced = syncFixedShelf(prevItems, items, gapMm, tBodyRef.current);
    const newInterior = { ...interiorRef.current, [boxId]: synced };
    setInterior(newInterior);

    // Interior changes feed BOTH cuts (shelves are boards in the cut list)
    // and door hinges (gaps depend on items). Run the full pipeline so
    // result.cuts and door hinges refresh together — was previously gated on
    // externalStackChanged, which made user-added shelves silently invisible
    // in the cut list.
    void prevItems;
    if (lastInputRef.current) {
      calculate(lastInputRef.current);
    }
  }

  // ── Partitions ────────────────────────────────────────────────────────────

  function setBoxPartitions(boxId: string, value: boolean): void {
    const newMap = new Map(partitionsRef.current);
    if (value) newMap.set(boxId, true);
    else newMap.delete(boxId);
    partitionsRef.current = newMap;

    if (lastInputRef.current) {
      calculate(lastInputRef.current);
      return;
    }
    setPartitionsById(new Map(newMap));
    const boxes = prevBoxesRef.current ?? [];
    const partitionCuts = computePartitionCuts(boxes, numFrontsRef.current, newMap, tBodyRef.current);
    setResult(prev => prev ? { ...prev, cuts: [...baseCutsRef.current, ...partitionCuts] } : null);
  }

  function addPartition(boxId: string): void {
    const newMap = new Map(partitionsRef.current);
    newMap.set(boxId, true);
    partitionsRef.current = newMap;

    // Clear regular items for this box (interior moves into cells)
    const newInterior = { ...interiorRef.current };
    delete newInterior[boxId];
    interiorRef.current = newInterior;

    // Initialize empty cell items (2 cells: right=0, left=1)
    const newCellInterior = { ...cellInteriorRef.current, [boxId]: [[], []] as InteriorItem[][] };
    cellInteriorRef.current = newCellInterior;

    if (lastInputRef.current) {
      calculate(lastInputRef.current);
      return;
    }
    setPartitionsById(new Map(newMap));
    setInteriorById(newInterior);
    setCellInteriorById(newCellInterior);
    const boxes = prevBoxesRef.current ?? [];
    const partitionCuts = computePartitionCuts(boxes, numFrontsRef.current, newMap, tBodyRef.current);
    setResult(prev => prev ? { ...prev, cuts: [...baseCutsRef.current, ...partitionCuts] } : null);
  }

  function removePartition(boxId: string): void {
    const newMap = new Map(partitionsRef.current);
    newMap.delete(boxId);
    partitionsRef.current = newMap;

    // Clear cell items for this box (cell interior is forgotten on remove)
    const newCellInterior = { ...cellInteriorRef.current };
    delete newCellInterior[boxId];
    cellInteriorRef.current = newCellInterior;

    if (lastInputRef.current) {
      calculate(lastInputRef.current);
      return;
    }
    setPartitionsById(new Map(newMap));
    setCellInteriorById(newCellInterior);
    const boxes = prevBoxesRef.current ?? [];
    const partitionCuts = computePartitionCuts(boxes, numFrontsRef.current, newMap, tBodyRef.current);
    setResult(prev => prev ? { ...prev, cuts: [...baseCutsRef.current, ...partitionCuts] } : null);
  }

  function setCellItems(boxId: string, cellIndex: number, items: InteriorItem[]): void {
    const current = cellInteriorRef.current[boxId] ?? [[], []];
    const prevItems = current[cellIndex] ?? [];
    // Each cell maintains its own fixed shelf independently.
    const gapMm = lastInputRef.current?.doorGapMm ?? 2;
    const synced = syncFixedShelf(prevItems, items, gapMm, tBodyRef.current);
    const updated: InteriorItem[][] = current.map((c, i) => i === cellIndex ? synced : c);
    const newCellInterior = { ...cellInteriorRef.current, [boxId]: updated };
    cellInteriorRef.current = newCellInterior;
    setCellInteriorById(newCellInterior);

    // Same rationale as setBoxInterior: shelves added in a cell are boards in
    // the cut list, so always recompute. The externalStackChanged shortcut
    // hid them from the cut list.
    void prevItems;
    if (lastInputRef.current) {
      calculate(lastInputRef.current);
    }
  }

  // ── Door mutations ────────────────────────────────────────────────────────

  function setDoorHingeSide(doorId: string, side: 'left' | 'right'): void {
    const door = doorsRef.current[doorId];
    if (!door) return;
    const n = door.hingeCount === 'auto' ? undefined : door.hingeCount as 1 | 2 | 3 | 4;
    const defaults = computeDefaultHingePositions(door.height, n);
    const reset = Array.from({ length: defaults.length }, (_, i) => {
      const existing = door.hinges[i];
      if (existing?.isManual) return existing;
      return { id: existing?.id ?? newItemId(), positionFromBottom: defaults[i]!, isManual: false };
    });
    const items = interiorRef.current[door.boxId] ?? [];
    const { hinges } = adjustHingesForInterior(reset, items, door.gapMm ?? 0, door.height);
    _mutateDoor(doorId, { ...door, hingeSide: side, hinges });
  }

  function setDoorHingeCount(doorId: string, count: 2 | 3 | 4 | 'auto'): void {
    const door = doorsRef.current[doorId];
    if (!door) return;
    const n = count === 'auto' ? computeHingeCount(door.height) : count;
    const defaults = computeDefaultHingePositions(door.height, n);
    const hinges: Hinge[] = defaults.map(p => ({
      id: newItemId(),
      positionFromBottom: p,
      isManual: false,
    }));
    const items = interiorRef.current[door.boxId] ?? [];
    const { hinges: adjusted } = adjustHingesForInterior(hinges, items, door.gapMm ?? 0, door.height);
    _mutateDoor(doorId, { ...door, hingeCount: count, hinges: adjusted });
  }

  function setHingeManual(doorId: string, hingeId: string, pos: number): void {
    const door = doorsRef.current[doorId];
    if (!door) return;
    const hinges = door.hinges.map(h =>
      h.id === hingeId ? { ...h, positionFromBottom: pos, isManual: true } : h,
    );
    _mutateDoor(doorId, { ...door, hinges });
  }

  function resetHingeToAuto(doorId: string, hingeId: string): void {
    const door = doorsRef.current[doorId];
    if (!door) return;
    const hingeIdx = door.hinges.findIndex(h => h.id === hingeId);
    if (hingeIdx === -1) return;
    const n = door.hingeCount === 'auto' ? undefined : door.hingeCount as 1 | 2 | 3 | 4;
    const defaults = computeDefaultHingePositions(door.height, n);
    const reset = door.hinges.map((h, i) =>
      h.id === hingeId
        ? { ...h, positionFromBottom: defaults[i] ?? h.positionFromBottom, isManual: false }
        : h,
    );
    const items = interiorRef.current[door.boxId] ?? [];
    const { hinges } = adjustHingesForInterior(reset, items, door.gapMm ?? 0, door.height);
    _mutateDoor(doorId, { ...door, hinges });
  }

  function setDoorHasDoor(doorId: string, hasDoor: boolean): void {
    const door = doorsRef.current[doorId];
    if (!door) return;
    _mutateDoor(doorId, { ...door, hasDoor });
  }

  function setDoorThickness(doorId: string, materialId: string): void {
    const door = doorsRef.current[doorId];
    if (!door) return;
    if (materialId) {
      _mutateDoor(doorId, { ...door, thicknessOverride: materialId });
    } else {
      const { thicknessOverride: _removed, ...rest } = door;
      _mutateDoor(doorId, rest as Door);
    }
  }

  function setCoversSkirt(value: boolean): void {
    const plinthH = plinthRef.current;
    const levelMap = boxLevelMapRef.current;
    const currentDoors = doorsRef.current;
    let changed = false;
    const newDoors: DoorById = {};
    for (const [doorId, door] of Object.entries(currentDoors)) {
      const coversSkirt = value && shouldCoverSkirt(levelMap.get(door.boxId) ?? '');
      if (coversSkirt !== door.coversSkirt) {
        const items = interiorRef.current[door.boxId] ?? [];
        newDoors[doorId] = recomputeDoorHinges({ ...door, coversSkirt }, items, plinthH);
        changed = true;
      } else {
        newDoors[doorId] = door;
      }
    }
    if (changed) {
      doorsRef.current = newDoors;
      setDoorsById(newDoors);
    }
  }

  function _mutateDoor(boxId: string, updated: Door): void {
    const newDoors = { ...doorsRef.current, [boxId]: updated };
    doorsRef.current = newDoors;
    setDoorsById(newDoors);
  }

  // ── Drawer (external) mutations ───────────────────────────────────────────
  // These mutate an existing DrawerItem in interior or cell-interior state and
  // re-run the full pipeline (drawer height / coversSkirt / cuts all flip).

  function _findDrawerLocation(drawerId: string): { boxId: string; cellIndex?: 0 | 1 } | null {
    for (const [boxId, items] of Object.entries(interiorRef.current)) {
      if (items.some(i => i.id === drawerId)) return { boxId };
    }
    for (const [boxId, cells] of Object.entries(cellInteriorRef.current)) {
      for (let ci = 0; ci < cells.length; ci++) {
        if ((cells[ci] ?? []).some(i => i.id === drawerId)) return { boxId, cellIndex: ci as 0 | 1 };
      }
    }
    return null;
  }

  function _updateDrawerInItems(
    items: InteriorItem[],
    drawerId: string,
    patch: Partial<DrawerItem>,
  ): InteriorItem[] {
    return items.map(i => {
      if (i.id !== drawerId || i.type !== 'drawer') return i;
      const merged = { ...i, ...patch } as DrawerItem;
      // Drop frontThicknessOverride when explicitly cleared (undefined).
      if ('frontThicknessOverride' in patch && patch.frontThicknessOverride === undefined) {
        delete (merged as { frontThicknessOverride?: MaterialId }).frontThicknessOverride;
      }
      return merged;
    });
  }

  function setDrawerHeight(drawerId: string, drawerHeight: number): void {
    if (!Number.isFinite(drawerHeight) || drawerHeight <= 0) return;
    const loc = _findDrawerLocation(drawerId);
    if (!loc) return;
    if (loc.cellIndex === undefined) {
      const prev = interiorRef.current[loc.boxId] ?? [];
      const next = _updateDrawerInItems(prev, drawerId, { drawerHeight });
      setBoxInterior(loc.boxId, next);
    } else {
      const prev = cellInteriorRef.current[loc.boxId]?.[loc.cellIndex] ?? [];
      const next = _updateDrawerInItems(prev, drawerId, { drawerHeight });
      setCellItems(loc.boxId, loc.cellIndex, next);
    }
  }

  function setDrawerFrontThickness(drawerId: string, materialId: string | undefined): void {
    const loc = _findDrawerLocation(drawerId);
    if (!loc) return;
    // `exactOptionalPropertyTypes`: build the patch with the field present
    // only when a materialId is provided; absence signals "clear".
    const patch: Partial<DrawerItem> = materialId !== undefined
      ? { frontThicknessOverride: materialId as MaterialId }
      : { frontThicknessOverride: undefined as unknown as MaterialId };
    if (loc.cellIndex === undefined) {
      const prev = interiorRef.current[loc.boxId] ?? [];
      const next = _updateDrawerInItems(prev, drawerId, patch);
      setBoxInterior(loc.boxId, next);
    } else {
      const prev = cellInteriorRef.current[loc.boxId]?.[loc.cellIndex] ?? [];
      const next = _updateDrawerInItems(prev, drawerId, patch);
      setCellItems(loc.boxId, loc.cellIndex, next);
    }
  }

  function deleteDrawer(drawerId: string): void {
    const loc = _findDrawerLocation(drawerId);
    if (!loc) return;
    if (loc.cellIndex === undefined) {
      const prev = interiorRef.current[loc.boxId] ?? [];
      setBoxInterior(loc.boxId, prev.filter(i => i.id !== drawerId));
    } else {
      const prev = cellInteriorRef.current[loc.boxId]?.[loc.cellIndex] ?? [];
      setCellItems(loc.boxId, loc.cellIndex, prev.filter(i => i.id !== drawerId));
    }
  }

  // ── Plinth gable overrides ────────────────────────────────────────────────
  // The override map is "soft" state: it changes only the plinth board model's
  // gable positions, nothing else. We re-run the full calculate so the cut
  // list refreshes (gable boards carry the new xFrom/xTo).

  function setPlinthGableOverride(gableId: string, x: number | undefined): void {
    const next = new Map(plinthGableOverridesRef.current);
    if (x === undefined) next.delete(gableId);
    else next.set(gableId, x);
    plinthGableOverridesRef.current = next;
    setPlinthGableOverridesState(next);
    if (lastInputRef.current) {
      calculate(lastInputRef.current);
    }
  }

  function resetPlinthGableOverrides(): void {
    const empty: ReadonlyMap<string, number> = new Map();
    plinthGableOverridesRef.current = empty;
    setPlinthGableOverridesState(empty);
    if (lastInputRef.current) {
      calculate(lastInputRef.current);
    }
  }

  // ── Per-board overrides (dimensions + materialId) ─────────────────────────
  // The override layer is "soft" state: it never changes box decomposition
  // or board emission — only the effective values consumers see at read
  // time. Each write triggers a recalculate so the cut list and sketches
  // pull the latest derived board list with overrides applied downstream.

  /** Internal commit — copy ref to state, optionally recalculate. */
  function _commitBoardOverrides(next: ReadonlyMap<string, BoardOverrides>): void {
    boardOverridesRef.current = next;
    setBoardOverridesState(next);
    if (lastInputRef.current) {
      calculate(lastInputRef.current);
    }
  }

  function setBoardDimensionOverride(stableId: string, key: BoardDimensionKey, value: number): void {
    const next = new Map(boardOverridesRef.current);
    const existing = next.get(stableId) ?? {};
    const dimensions = { ...(existing.dimensions ?? {}), [key]: value };
    next.set(stableId, { ...existing, dimensions });
    _commitBoardOverrides(next);
  }

  function resetBoardDimensionOverride(stableId: string, key: BoardDimensionKey): void {
    const existing = boardOverridesRef.current.get(stableId);
    if (!existing?.dimensions || existing.dimensions[key] === undefined) return;
    const dimensions = { ...existing.dimensions };
    delete dimensions[key];
    const next = new Map(boardOverridesRef.current);
    if (Object.keys(dimensions).length > 0) {
      next.set(stableId, { ...existing, dimensions });
    } else if (existing.materialId !== undefined) {
      // Strip the empty dimensions object to keep the entry minimal.
      next.set(stableId, { materialId: existing.materialId });
    } else {
      next.delete(stableId);
    }
    _commitBoardOverrides(next);
  }

  function setBoardMaterialOverride(stableId: string, materialId: MaterialId): void {
    const next = new Map(boardOverridesRef.current);
    const existing = next.get(stableId) ?? {};
    next.set(stableId, { ...existing, materialId });
    _commitBoardOverrides(next);
  }

  function resetBoardMaterialOverride(stableId: string): void {
    const existing = boardOverridesRef.current.get(stableId);
    if (existing?.materialId === undefined) return;
    const next = new Map(boardOverridesRef.current);
    if (existing.dimensions && Object.keys(existing.dimensions).length > 0) {
      next.set(stableId, { dimensions: existing.dimensions });
    } else {
      next.delete(stableId);
    }
    _commitBoardOverrides(next);
  }

  function resetAllBoardOverrides(): void {
    _commitBoardOverrides(new Map());
  }

  function setBodyEdgingOverride(boxSlotId: BoxSlotId, edging: Edging | undefined): void {
    const next = new Map(bodyEdgingOverridesRef.current);
    if (edging === undefined) next.delete(boxSlotId);
    else next.set(boxSlotId, edging);
    bodyEdgingOverridesRef.current = next;
    setBodyEdgingOverridesState(next);
    if (lastInputRef.current) calculate(lastInputRef.current);
  }

  function setBoxDimension(boxSlotId: BoxSlotId, axis: 'W' | 'H' | 'D', value: number | undefined): void {
    const current = boxDimensionOverridesRef.current;
    const existing = current.get(boxSlotId) ?? {};
    const updated: BoxDimensionOverride = { ...existing, [axis]: value };
    // If all axes are undefined after the change, remove the entry entirely
    if (updated.W === undefined && updated.H === undefined && updated.D === undefined) {
      const next = new Map(current);
      next.delete(boxSlotId);
      boxDimensionOverridesRef.current = next;
      setBoxDimensionOverridesState(next);
    } else {
      const next = new Map(current);
      next.set(boxSlotId, updated);
      boxDimensionOverridesRef.current = next;
      setBoxDimensionOverridesState(next);
    }
    if (lastInputRef.current) calculate(lastInputRef.current);
  }

  function resetBoxDimensions(boxSlotId: BoxSlotId): void {
    const next = new Map(boxDimensionOverridesRef.current);
    next.delete(boxSlotId);
    boxDimensionOverridesRef.current = next;
    setBoxDimensionOverridesState(next);
    if (lastInputRef.current) calculate(lastInputRef.current);
  }

  function setBoxMaterial(boxSlotId: BoxSlotId, patch: { [K in keyof BoxMaterialOverride]?: BoxMaterialOverride[K] | undefined }): void {
    const existing = boxMaterialOverridesRef.current.get(boxSlotId) ?? {};
    // Build loosely so a field can be set to `undefined`, then strip those keys
    // (undefined = revert to the cabinet default).
    const merged: Record<string, unknown> = { ...existing, ...patch };
    for (const k of Object.keys(merged)) {
      if (merged[k] === undefined) delete merged[k];
    }
    const next = new Map(boxMaterialOverridesRef.current);
    if (Object.keys(merged).length === 0) next.delete(boxSlotId);
    else next.set(boxSlotId, merged as BoxMaterialOverride);
    boxMaterialOverridesRef.current = next;
    setBoxMaterialOverridesState(next);
    if (lastInputRef.current) calculate(lastInputRef.current);
  }

  function resetBoxMaterials(boxSlotId: BoxSlotId): void {
    const next = new Map(boxMaterialOverridesRef.current);
    next.delete(boxSlotId);
    boxMaterialOverridesRef.current = next;
    setBoxMaterialOverridesState(next);
    if (lastInputRef.current) calculate(lastInputRef.current);
  }

  // ── Snapshot / Restore ────────────────────────────────────────────────────

  function getSnapshot(): SavedCabinetState {
    const boxes = prevBoxesRef.current ?? [];
    const nfMap = numFrontsRef.current;

    const interior: SavedCabinetState['interior'] = {};
    const cellInterior: SavedCabinetState['cellInterior'] = {};
    const partitions: SavedCabinetState['partitions'] = {};
    const doors: SavedCabinetState['doors'] = {};

    for (const box of boxes) {
      if (box.level === 'plinth') continue;
      const slotKey = boxStableKey(box);

      const items = interiorRef.current[box.id] ?? [];
      if (items.length > 0) interior[slotKey] = items;

      const cells = cellInteriorRef.current[box.id];
      if (cells) cellInterior[slotKey] = cells;

      if (partitionsRef.current.get(box.id)) partitions[slotKey] = true;

      const nf = nfMap.get(box.id) ?? 1;
      for (let fi = 0; fi < nf; fi++) {
        const doorId = makeDoorId(box.id, fi);
        const door = doorsRef.current[doorId];
        if (door) {
          const savedDoor: SavedDoor = {
            hingeSide: door.hingeSide,
            hingeCount: door.hingeCount,
            hinges: door.hinges.map(h => ({ positionFromBottom: h.positionFromBottom, isManual: h.isManual })),
            hasDoor: door.hasDoor,
            ...(door.thicknessOverride ? { thicknessOverride: door.thicknessOverride as MaterialId } : {}),
          };
          doors[`${slotKey}:${fi}`] = savedDoor;
        }
      }
    }

    const snap: SavedCabinetState = {
      interior,
      cellInterior,
      partitions,
      doors,
      plinthGableOverrides: Object.fromEntries(plinthGableOverridesRef.current),
      boardOverrides: Object.fromEntries(boardOverridesRef.current),
    };
    if (bodyEdgingOverridesRef.current.size > 0)
      snap.bodyEdgingOverrides = Object.fromEntries(bodyEdgingOverridesRef.current);
    if (boxDimensionOverridesRef.current.size > 0)
      snap.boxDimensionOverrides = Object.fromEntries(boxDimensionOverridesRef.current);
    if (boxMaterialOverridesRef.current.size > 0)
      snap.boxMaterialOverrides = Object.fromEntries(boxMaterialOverridesRef.current);
    return snap;
  }

  function restoreState(state: SavedCabinetState): void {
    // Restore overrides that don't need rekeying immediately
    const plinthGables = new Map(Object.entries(state.plinthGableOverrides));
    plinthGableOverridesRef.current = plinthGables;
    setPlinthGableOverridesState(plinthGables);

    const boardOvr = new Map(Object.entries(state.boardOverrides)) as Map<string, import('../../core/boards/boardModel').BoardOverrides>;
    boardOverridesRef.current = boardOvr;
    setBoardOverridesState(boardOvr);

    if (state.bodyEdgingOverrides) {
      const beo = new Map(Object.entries(state.bodyEdgingOverrides));
      bodyEdgingOverridesRef.current = beo;
      setBodyEdgingOverridesState(beo);
    }

    if (state.boxDimensionOverrides) {
      const bdo = new Map(Object.entries(state.boxDimensionOverrides));
      boxDimensionOverridesRef.current = bdo;
      setBoxDimensionOverridesState(bdo);
    }

    if (state.boxMaterialOverrides) {
      const bmo = new Map(Object.entries(state.boxMaterialOverrides));
      boxMaterialOverridesRef.current = bmo;
      setBoxMaterialOverridesState(bmo);
    }

    // Interior / doors / partitions are keyed by boxStableKey — restored
    // in calculate() on the next run via pendingRestoreRef
    pendingRestoreRef.current = state;

    // Reset previous boxes so calculate() treats this as a fresh start
    prevBoxesRef.current = null;

    if (lastInputRef.current) calculate(lastInputRef.current);
  }

  // ── Calculate ─────────────────────────────────────────────────────────────

  function calculate(input: CabinetInput): void {
    lastInputRef.current = input;

    const { W, H, D, backThickness, hasEnvelopeTop, bodyMaterialId, frontMaterialId, plinth, plinthRecess, doorCoversPlinth, lowerDoorH, middleDoorH, doorsPerColumn, doorGapMm, maxDoorWidth } = input;
    // Wall-cabinet (קלפה) top+bottom envelope: independent of the side shell.
    // Gated by `mount === 'wall'` so a stray flag on a base cabinet has no
    // effect. Drives both decomposeBoxes (body shrinks) and deriveEnvelopeFlags
    // (emits envelope-top + envelope-bottom boards).
    const wallEnv = input.hasWallEnvelope === true && input.mount === 'wall';
    // Use getMaterialWithCustom to support both catalog and custom materials
    const allCustomMaterials = settings?.customMaterials ?? [];
    const bodyMaterial  = getMaterialWithCustom(bodyMaterialId, allCustomMaterials);
    const frontMaterial = getMaterialWithCustom(frontMaterialId, allCustomMaterials);
    const tBody  = bodyMaterial.thickness / 10;   // cm
    const tFront = frontMaterial.thickness / 10;  // cm
    // Per-side shell flags (kitchen units may disable a single side). Falls
    // back to symmetric `hasShell` for legacy / non-kitchen cabinets.
    const shellSides = getShellSides(input);
    const hasAnyShell = shellSides.left || shellSides.right;
    const innerW = computeInnerWidth(W, shellSides, tFront);
    // Carcass depth: sides/top/bottom/shelves/partition/back/plinth all stop
    // short of the cabinet's front+back faces. The full cabinet depth D
    // is preserved for the outer envelope only (see buildBoardModel call
    // below — envelopeDepth=D).
    const carcassD = computeCarcassDepth(D, backThickness, HINGE_GAP_CM, tFront);
    const forceRows: 1 | 2 | 3 | undefined = doorsPerColumn === 'auto' ? undefined : doorsPerColumn;

    const envelopeTopH = ((hasEnvelopeTop && hasAnyShell) || wallEnv) ? tFront : 0;
    const envelopeBottomH = wallEnv ? tFront : 0;
    const rawBoxes = decomposeBoxes(innerW, H, carcassD, lowerDoorH, plinth, doorsPerColumn, middleDoorH, envelopeTopH, envelopeBottomH, isCorner(input));
    // Apply per-body dimension overrides (W/H/D). Each override replaces only
    // the axes the carpenter explicitly set; unset axes keep the decomposed value.
    // The override affects only the board model for that body — it does NOT
    // change the global decomposition or adjacent bodies. The carpenter is
    // responsible for ensuring the dimensions stay coherent.
    const boxes = applyBoxDimensionOverrides(
      rawBoxes,
      Object.fromEntries(boxDimensionOverridesRef.current),
    );
    // Cabinet-wide edging default — drives per-board front bands and the
    // perimeter band applied to door / drawer-front cuts. Body and per-board
    // override layers exist on the type surface (stage 2) but no setters
    // wire them yet; an empty bodyOverrides Map still resolves correctly
    // through `resolveEdging`.
    const cabinetEdging: Edging = input.edging ?? DEFAULT_EDGING;
    const edgingCtx: EdgingContext = {
      cabinetDefault: cabinetEdging,
      bodyOverrides: bodyEdgingOverridesRef.current,
      boardOverrides: boardOverridesRef.current,
    };
    // Door cuts are derived from `newDoors` AFTER the door loop (single source
    // of truth — see core/cuts/doorCuts.ts), so they track per-body W/H
    // overrides and external-drawer shortening. The carcass / shell / plinth /
    // back / shelves all come from the BoardModel loop below.
    // hasFronts=false (appliance bays) → doors get hasDoor=false, which
    // buildDoorCutItems skips.
    const skipFronts = (input.hasFronts ?? true) === false;
    const doors = calcDoors(innerW, H, plinth, doorCoversPlinth, lowerDoorH, false, tBody, forceRows, doorGapMm / 10);

    // ── Stable maps from previous state ────────────────────────────────────
    const prevBoxes = prevBoxesRef.current;
    const currentInterior = interiorRef.current;
    const currentCellInterior = cellInteriorRef.current;
    const currentDoors = doorsRef.current;
    const prevNumFronts = numFrontsRef.current;

    const stableInteriorMap   = new Map<string, { items: InteriorItem[]; H: number }>();
    const stableCellMap       = new Map<string, InteriorItem[][]>();
    const stablePartitionsMap = new Map<string, boolean>();
    const stableDoorMap       = new Map<string, Door>();

    if (prevBoxes) {
      for (const box of prevBoxes) {
        if (box.level === 'plinth') continue;
        const key = boxStableKey(box);
        stableInteriorMap.set(key, { items: currentInterior[box.id] ?? [], H: box.H });
        const cells = currentCellInterior[box.id];
        if (cells) stableCellMap.set(key, cells);
        if (partitionsRef.current.get(box.id)) stablePartitionsMap.set(key, true);
        const nf = prevNumFronts.get(box.id) ?? 1;
        for (let fi = 0; fi < nf; fi++) {
          const d = currentDoors[makeDoorId(box.id, fi)];
          if (d) stableDoorMap.set(`${key}:${fi}`, d);
        }
      }
    }

    // ── Restore from saved state (product load) ────────────────────────────
    // When restoreState() was called, pendingRestoreRef is populated and
    // prevBoxes was reset to null so we reach this path. Populate the stable
    // maps directly from the serialised state so the preservation loop below
    // picks them up exactly as if the user had built this state interactively.
    const pendingRestore = pendingRestoreRef.current;
    if (pendingRestore) {
      pendingRestoreRef.current = null;
      for (const box of boxes.filter(b => b.level !== 'plinth')) {
        const slotKey = boxStableKey(box);
        const savedItems = pendingRestore.interior[slotKey];
        if (savedItems) stableInteriorMap.set(slotKey, { items: savedItems, H: box.H });
        const savedCells = pendingRestore.cellInterior[slotKey];
        if (savedCells) stableCellMap.set(slotKey, savedCells);
        if (pendingRestore.partitions[slotKey]) stablePartitionsMap.set(slotKey, true);
        const nf = frontColumnsForBox(box.W, maxDoorWidth, input.mount, input.singleFront);
        for (let fi = 0; fi < nf; fi++) {
          const dsk = `${slotKey}:${fi}`;
          const sd = pendingRestore.doors[dsk];
          if (sd) {
            // Reconstruct a Door from SavedDoor — derived fields (height,
            // width, coversSkirt, gapMm) are filled in during the door loop
            // below; we only need the user-controlled fields here.
            const hinges: Hinge[] = sd.hinges.map(h => ({
              id: newItemId(),
              positionFromBottom: h.positionFromBottom,
              isManual: h.isManual,
            }));
            // Temporarily store as a partial Door keyed by DoorSlotKey so the
            // door loop (which uses stableDoorMap keyed by `${key}:${fi}`) can
            // find it and fill in the derived fields via recomputeDoorHinges.
            stableDoorMap.set(dsk, {
              id: dsk, // placeholder — overwritten in the door loop
              boxId: box.id,
              frontIndex: fi,
              height: 0,   // derived
              width: 0,    // derived
              hingeSide: sd.hingeSide,
              hingeCount: sd.hingeCount,
              hinges,
              hasDoor: sd.hasDoor,
              coversSkirt: false, // derived
              gapMm: doorGapMm,
              ...(sd.thicknessOverride ? { thicknessOverride: sd.thicknessOverride } : {}),
            });
          }
        }
      }
    }

    // ── Interior, partitions, cells preservation ───────────────────────────
    const baselineInterior = initInteriorFromBoxes(boxes, plinth);
    const newInterior: InteriorById = {};
    const newCellInteriorById: CellInteriorById = {};
    const newPartitionsMap = new Map<string, boolean>();
    const newNumFrontsMap = new Map<string, number>();

    const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
    // Effective per-body materials (override ?? cabinet default) — shared by the
    // carcass, partition, door and external-front cut emitters below.
    const boxMaterials = new Map(
      bodyBoxes.map(b => [b.id, resolveBoxMaterials(b, input, boxMaterialOverridesRef.current, allCustomMaterials)] as const),
    );
    const allPositions = bodyBoxes.map(b => b.position);
    boxLevelMapRef.current = new Map(bodyBoxes.map(b => [b.id, b.level]));

    for (const box of bodyBoxes) {
      const key = boxStableKey(box);
      const numFronts = frontColumnsForBox(box.W, maxDoorWidth, input.mount, input.singleFront);
      newNumFrontsMap.set(box.id, numFronts);

      // Interior
      const prev = stableInteriorMap.get(key);
      if (!prev) {
        newInterior[box.id] = baselineInterior[box.id] ?? [];
      } else if (prev.H === box.H) {
        newInterior[box.id] = prev.items;
      } else {
        newInterior[box.id] = filterItemsForHeight(prev.items, box.H);
      }

      // Partitions only valid for numFronts > 1
      if (stablePartitionsMap.get(key) && numFronts > 1) {
        newPartitionsMap.set(box.id, true);
        newCellInteriorById[box.id] = stableCellMap.get(key) ?? [[], []];
      }
    }

    plinthRef.current = plinth;

    // ── Row-level front layouts ────────────────────────────────────────────
    // Each Box.level ('bottom' | 'middle' | 'top' | 'single') is an
    // independent horizontal row: it spreads its own fronts across the full
    // cabinet width, with its own gaps. A multi-row cabinet (e.g. bottom +
    // top) gets TWO layouts — not one shared layout — because each row
    // hosts its own set of fronts.
    const cabinetGapCm = doorGapMm / 10;
    const rowsByLevel = groupBoxesByRow(bodyBoxes);
    const layoutByRow = new Map<BoxLevel, RowFrontLayout>();
    for (const [level, rowBoxes] of rowsByLevel) {
      const totalFrontsInRow = getTotalFrontsInRow(rowBoxes, newNumFrontsMap);
      // Per-row EFFECTIVE outer width. The row's fronts spread across the sum
      // of its (possibly overridden) body widths — not the global input W —
      // so a manual body-size override widens/narrows the fronts to match the
      // body beneath them (single source of truth: the same box.W the bodies
      // sketch uses). `W − innerW` is the cabinet's shell offset (2·tFront when
      // symmetric, tFront for a single-side shell, 0 with none); adding the
      // row's inner width back reproduces the outer width. Without any override
      // `rowInnerW === innerW`, so this equals the global W exactly — no change
      // to existing (un-overridden) cabinets. Note: when bodies in a row differ
      // in width (a per-body override on one of several same-row bodies) the
      // uniform split still divides the row evenly; the fronts fill the full
      // effective width but each column shares the average, not its own body's
      // width. The common cases — a single-body row (e.g. a wall cabinet) or a
      // row of equal bodies — are exact.
      const rowInnerW = rowBoxes.reduce((s, b) => s + b.W, 0);
      const rowEffectiveOuterW = (W - innerW) + rowInnerW;
      layoutByRow.set(level, computeRowFrontLayout({
        cabinetW: rowEffectiveOuterW,
        hasOuterShell: hasAnyShell,
        // Per-side flags so a unit with shell on one side only (e.g. a
        // kitchen unit flush against a wall) loses one shell thickness from
        // the door width, not two.
        shellSides,
        shellThicknessCm: tFront,
        totalFrontsInRow,
        gapCm: cabinetGapCm,
      }));
    }

    // ── Doors (height/coversSkirt aware of external drawers) ────────────────
    const newDoors: DoorById = {};
    const skirtCoveringIds = new Set<string>();

    for (const box of bodyBoxes) {
      const numFronts = newNumFrontsMap.get(box.id)!;
      const hasPartition = newPartitionsMap.has(box.id);
      const bodyItems = newInterior[box.id] ?? [];
      const cellItems = newCellInteriorById[box.id];

      const originalCoversSkirt = doorCoversPlinth && shouldCoverSkirt(box.level);
      const isBottomMost = box.level === 'bottom' || box.level === 'single';
      const hasBottomGap = !(isBottomMost && plinth > 0 && !originalCoversSkirt);
      const hasTopGap = box.level === 'top' || box.level === 'single';

      // Per-body door sizing: each body sizes its doors from its OWN width so a
      // door never straddles a carcass boundary (matters on a per-body W
      // override). Corner unit (פינה): a fixed `doorWidthCm` at the chosen edge
      // with hinges on the filler side (see core/product/cornerModule.ts).
      const doorRowBoxes = rowsByLevel.get(box.level) ?? [];
      const bodyLayout = bodyFrontLayout({ rowBoxes: doorRowBoxes, numFrontsPerBox: newNumFrontsMap, targetBoxId: box.id, gapCm: cabinetGapCm });
      const cornerCf = isCorner(input) ? input.cornerFiller! : null;
      const frontW = cornerCf ? cornerCf.doorWidthCm : bodyLayout.frontWidth;

      for (let fi = 0; fi < numFronts; fi++) {
        const doorId = makeDoorId(box.id, fi);
        const itemsForFront = getItemsForFront(fi, numFronts, hasPartition, bodyItems, cellItems);
        const panelH = calcMainDoorHeight(box.H, itemsForFront, doorGapMm, hasBottomGap, hasTopGap);

        // coversSkirt transfer: if there's a lowest external drawer, it
        // inherits coversSkirt and the door loses it.
        const skirtDrawer = getSkirtCoveringDrawer(itemsForFront, originalCoversSkirt);
        if (skirtDrawer) skirtCoveringIds.add(skirtDrawer.id);
        const coversSkirt = originalCoversSkirt && skirtDrawer === null;

        const oldDoor = stableDoorMap.get(`${boxStableKey(box)}:${fi}`);
        const hingeSide = cornerCf
          ? cornerHingeSide(cornerCf)
          : numFronts > 1
            ? salonHingeSide(fi, numFronts)
            : defaultHingeSide(box.position, allPositions);

        if (!oldDoor) {
          const defaults = computeDefaultHingePositions(panelH);
          const rawHinges: Hinge[] = defaults.map(p => ({ id: newItemId(), positionFromBottom: p, isManual: false }));
          const { hinges } = adjustHingesForInterior(rawHinges, itemsForFront, doorGapMm, panelH);
          newDoors[doorId] = {
            id: doorId, boxId: box.id, frontIndex: fi,
            height: panelH, width: frontW,
            hingeSide, hingeCount: 'auto', hinges, hasDoor: !skipFronts, coversSkirt, gapMm: doorGapMm,
          };
        } else {
          const recomputed = recomputeDoorHinges(
            { ...oldDoor, id: doorId, boxId: box.id, frontIndex: fi, height: panelH, width: frontW, coversSkirt, gapMm: doorGapMm,
              ...(cornerCf ? { hingeSide: cornerHingeSide(cornerCf) } : {}) },
            itemsForFront, plinth,
          );
          newDoors[doorId] = recomputed;
        }
      }
    }

    // ── Lift-mechanism cabinets (קלפה): suppress hinges ───────────────────
    // These cabinets open with a single hinged-from-top panel, not cup hinges.
    // Clear all auto-computed hinges so no markers appear in any sketch or
    // editor. Driven by `liftMechanism`, not `mount`, so other wall-row modules
    // (e.g. עליון מזווה — pantry top) keep their normal hinges.
    if (input.liftMechanism === true) {
      for (const doorId of Object.keys(newDoors)) {
        newDoors[doorId] = { ...newDoors[doorId]!, hinges: [], hingeCount: 0 };
      }
    }

    // A main door with no room above a full external-drawer stack (height ≤ 0)
    // is ABSENT — don't cut it or count its hinges (e.g. a drawers unit whose
    // drawers fill the body). Mirrors the 3D/elevation render, which omits it.
    for (const id in newDoors) if (newDoors[id]!.height <= 0) newDoors[id]!.hasDoor = false;

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

    // ── External-drawer front cuts ────────────────────────────────────────
    // Width comes from the cabinet-level layout (same source as the doors):
    //   cell drawer (partition):  one column   → layout.frontWidth
    //   body-wide drawer:         N columns    → spanLength = numFronts
    const externalDrawerCuts: CutItem[] = [];
    for (const box of bodyBoxes) {
      const hasPartition = newPartitionsMap.has(box.id);
      const bodyItems = newInterior[box.id] ?? [];
      const cellItems = newCellInteriorById[box.id];
      const originalCoversSkirt = doorCoversPlinth && shouldCoverSkirt(box.level);

      const rowLayout = layoutByRow.get(box.level);
      if (!rowLayout) continue;
      const rowBoxes = rowsByLevel.get(box.level) ?? [];
      // Per-body sizing: drawer faces size from this body's own width.
      const drawerLayout = bodyFrontLayout({ rowBoxes, numFrontsPerBox: newNumFrontsMap, targetBoxId: box.id, gapCm: cabinetGapCm });
      // External-drawer faces are this body's fronts → its (overridden) front
      // material, for both the panel thickness and the cut-list grouping.
      const boxFront = boxMaterials.get(box.id)!.frontMaterial;
      const tagFront = (cs: CutItem[]): CutItem[] => cs.map(c => ({ ...c, materialId: boxFront.id }));

      if (hasPartition) {
        const cellW = drawerLayout.frontWidth;
        for (let ci = 0 as 0 | 1; ci <= 1; ci = (ci + 1) as 0 | 1) {
          const itemsForCell = cellItems?.[ci] ?? [];
          externalDrawerCuts.push(
            ...tagFront(calcExternalDrawerFrontCuts(
              itemsForCell, cellW, doorGapMm, plinth, originalCoversSkirt, boxFront.thickness,
              undefined, cabinetEdging,
            )),
          );
        }
      } else {
        const bodyDrawerW = bodySpanGeometry(drawerLayout).width;
        externalDrawerCuts.push(
          ...tagFront(calcExternalDrawerFrontCuts(
            bodyItems, bodyDrawerW, doorGapMm, plinth, originalCoversSkirt, boxFront.thickness,
            undefined, cabinetEdging,
          )),
        );
      }
    }

    // ── Drawer fronts (derived from external drawers) ──────────────────────
    const newDrawerFronts = deriveDrawerFronts({
      bodyBoxes,
      interiorById: newInterior,
      cellInteriorById: newCellInteriorById,
      partitionsById: newPartitionsMap,
      numFrontsPerBox: newNumFrontsMap,
      doorCoversPlinth,
      doorGapMm,
      layoutByRow,
    });

    // ── Finalize ────────────────────────────────────────────────────────────
    tBodyRef.current = tBody;
    partitionsRef.current = newPartitionsMap;
    setPartitionsById(new Map(newPartitionsMap));
    cellInteriorRef.current = newCellInteriorById;
    setCellInteriorById(newCellInteriorById);
    skirtCoveringDrawerIdsRef.current = skirtCoveringIds;
    baseCutsRef.current = doorCuts;

    numFrontsRef.current = newNumFrontsMap;
    setNumFrontsPerBox(newNumFrontsMap);
    setFrontLayoutByRow(layoutByRow);
    prevBoxesRef.current = boxes;
    setInterior(newInterior);
    setDoors(newDoors, boxes, newNumFrontsMap);
    setDrawerFronts(newDrawerFronts);

    const partitionCuts = computePartitionCuts(bodyBoxes, newNumFrontsMap, newPartitionsMap, tBody, box => {
      const m = boxMaterials.get(box.id)!;
      return { id: m.bodyMaterial.id, tCm: m.bodyMaterial.thickness / 10 };
    });

    // ── Carcass cuts via BoardModel ────────────────────────────────────────
    // One Board[] per body → boardsToCutItems → flat CutItem[]. Replaces the
    // legacy shell+body+plinth+back+shelves output of calcCuts. The
    // 'partition' role is filtered out because `computePartitionCuts` above
    // already emits partition cuts with richer Hebrew labels.
    //
    // Joint method (rabbet vs butt) is decided ONCE at cabinet level so every
    // body shares the same top/bottom-panel formula. Without this, a 2-row
    // cabinet whose bottom row dips below the W/2 threshold would flip to
    // butt while the top stayed rabbet — producing inconsistent panel lengths
    // across rows.
    const cabinetJoint = resolveCabinetJointMethod(W, H);
    const boardCuts: CutItem[] = [];
    for (const box of bodyBoxes) {
      const envFlags = deriveEnvelopeFlags(box, shellSides, hasEnvelopeTop, wallEnv);
      const items = newInterior[box.id] ?? [];
      const cellItems = newCellInteriorById[box.id];
      const hasPartitionBox = newPartitionsMap.get(box.id) === true;
      const boxMat = boxMaterials.get(box.id)!; // effective per-body materials
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
        // User's H input is the full external cabinet height (plinth + bodies
        // + envelopeTop). Pass it so envelope-left/right cut to the right
        // length regardless of which body emits them.
        cabinetTotalH: H,
        joint: cabinetJoint,
        ...(input.topVariant ? { topVariant: input.topVariant } : {}),
        ...(input.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: input.sinkTraverseWidthCm } : {}),
      }).filter(b => b.role !== 'partition'); // partition emitted separately
      // BoxSlotId placeholder: the eventual stable per-slot id is deferred
      // (DECISIONS_LOG 2026-05-29). Using boxStableKey here keeps the body
      // override layer plumbing alive — bodyOverrides is empty for now, but
      // the chain resolves correctly the moment a UI surfaces setters.
      boardCuts.push(...boardsToCutItems(
        boards, buildBoxLabel(box), boardOverridesRef.current, edgingCtx, boxStableKey(box),
      ));
    }

    // ── Plinth board model ─────────────────────────────────────────────────
    // The plinth lives at the cabinet level: one cabinet-wide front + back +
    // gables (L-shaped supports). We feed it only the bottom-row bodies so it
    // knows where to place internal gables (joints + mid-body for wide ones).
    const bottomRowBoxes = bodyBoxes.filter(b => b.level === 'bottom' || b.level === 'single');
    // Plinth follows the bottom row's EFFECTIVE (overridden) width, not input.W
    // (`W − innerW` = the shell offset) — mirrors the 3D/2D plinth + PlinthEditor.
    const plinthOuterW = plinthOuterWidth(bottomRowBoxes, W, innerW);
    const plinthBoards = buildPlinthBoardModel({
      cabinetW: plinthOuterW,
      // Plinth depth = carcass depth (same as the body sitting on top), NOT
      // the raw input D. The cabinet's front-facing reductions (back panel,
      // hinge gap, front material) shrink the carcass, and the plinth follows
      // the body footprint so the structure is flush front-to-back.
      cabinetD: carcassD,
      plinthHeight: plinth,
      bodyMaterial,
      // Production cabinets always have a front-material cladding facade so
      // the visible plinth face matches the cabinet doors. Tests opt out by
      // omitting frontMaterial — `buildPlinthBoardModel` skips the cladding
      // board when this is undefined.
      frontMaterial,
      boxes: bottomRowBoxes,
      ...(plinthGableOverridesRef.current.size > 0
        ? { gableOverrides: plinthGableOverridesRef.current }
        : {}),
      ...(plinthRecess > 0 ? { recessCm: plinthRecess } : {}),
    });
    // Plinth boards live at the cabinet level (no slot) — every plinth-*
    // role resolves to pattern 'none' in any case so the deduction is 0.
    boardCuts.push(...boardsToCutItems(plinthBoards, '', boardOverridesRef.current, edgingCtx));

    // Enrich every non-board cut with a materialId so the cut-list view can
    // group by material. boardsToCutItems already sets materialId from
    // board.materialId — these others come from calcCuts / partition /
    // external-drawer producers that don't carry material info, so we set
    // it here by `group`:
    //   shell/door/front → frontMaterialId (envelope, doors, external-drawer fronts)
    //   body/back/plinth → bodyMaterialId
    //   drawer           → no cabinet material (fixed 12mm/6mm drawer-box parts)
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
    const derivedBoxDims = new Map(
      rawBoxes
        .filter(b => b.level !== 'plinth')
        .map(b => [boxStableKey(b), { W: b.W, H: b.H, D: b.D }])
    );
    setResult({ boxes, cuts: allCuts, doors, carcassD, innerW, hardwareItems, derivedBoxDims });
  }

  return {
    result, calculate,
    interiorById, setBoxInterior,
    cellInteriorById, addPartition, removePartition, setCellItems,
    doorsById, drawerFrontsById, displayNumbers, numFrontsPerBox,
    partitionsById, setBoxPartitions,
    frontLayoutByRow,
    setDoorHingeSide, setDoorHingeCount, setHingeManual, resetHingeToAuto, setDoorHasDoor,
    setDoorThickness, setCoversSkirt,
    setDrawerHeight, setDrawerFrontThickness, deleteDrawer,
    plinthGableOverrides, setPlinthGableOverride, resetPlinthGableOverrides,
    boardOverridesByStableId,
    setBoardDimensionOverride, resetBoardDimensionOverride,
    setBoardMaterialOverride, resetBoardMaterialOverride,
    resetAllBoardOverrides,
    bodyEdgingOverrides, setBodyEdgingOverride,
    boxDimensionOverrides, setBoxDimension, resetBoxDimensions,
    boxMaterialOverrides, setBoxMaterial, resetBoxMaterials,
    getLastInput: () => lastInputRef.current,
    getSnapshot, restoreState,
  };
}
