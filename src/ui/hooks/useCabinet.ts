import { useState, useRef } from 'react';
import { decomposeBoxes, calcCuts, calcDoors } from '../../core';
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
  externalStackChanged,
  getItemsForFront,
} from '../../core/doors/doorUtils';
import { deriveDrawerFronts } from '../../core/doors/drawerFrontsCalc';
import {
  computeRowFrontLayout,
  computeFrontGeometryForSpan,
  getBoxFirstGlobalFrontIndex,
  getTotalFrontsInRow,
  groupBoxesByRow,
  type RowFrontLayout,
} from '../../core/geometry/frontGeometry';
import type { BoxLevel } from '../../types/geometry';
import { calcExternalDrawerFrontCuts } from '../../core/cuts/externalDrawerCuts';
import {
  buildBoardModel,
  boardsToCutItems,
  deriveEnvelopeFlags,
} from '../../core/boards/boardModel';
import { newItemId } from '../../core/interior/interiorUtils';
import { syncFixedShelf } from '../../core/interior/fixedShelfUtils';
import { getMaterial } from '../../catalog';
import type { Box, CutItem, DoorCalcResult, MaterialId } from '../../types';
import type { InteriorItem, InteriorById, CellInteriorById, DrawerItem } from '../../types/interior';
import type { Door, DoorById, DrawerFrontById, Hinge } from '../../types/doors';

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
  tBodyCm: number,
): CutItem[] {
  const cuts: CutItem[] = [];
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    if (!pMap.get(box.id)) continue;
    const nf = nfMap.get(box.id) ?? 1;
    const count = nf - 1;
    if (count <= 0) continue;
    cuts.push({
      name: buildPartitionCutLabel(box),
      qty: count,
      w: box.D * 10,
      h: box.H * 10,
      group: 'body',
      note: `${Math.round(tBodyCm * 10)}mm`,
    });
  }
  return cuts;
}

export interface CabinetInput {
  W: number;
  H: number;
  D: number;
  hasShell: boolean;
  hasEnvelopeTop: boolean;
  bodyMaterialId: MaterialId;
  frontMaterialId: MaterialId;
  plinth: number;
  doorCoversPlinth: boolean;
  lowerDoorH: number | undefined;
  middleDoorH: number | undefined;
  doorsPerColumn: 'auto' | 1 | 2 | 3;
  doorGapMm: number;
  maxDoorWidth: number;
}

export interface CabinetResult {
  boxes: Box[];
  cuts: CutItem[];
  doors: DoorCalcResult;
}

export function useCabinet(): {
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

    // External-drawer change → door height, coversSkirt and 'front' cuts may
    // all flip; run the full pipeline rather than a surgical update (Q3).
    if (externalStackChanged(prevItems, synced) && lastInputRef.current) {
      calculate(lastInputRef.current);
      return;
    }

    const nf = numFrontsRef.current.get(boxId) ?? 1;
    const updatedDoors: DoorById = { ...doorsRef.current };
    for (let fi = 0; fi < nf; fi++) {
      const doorId = makeDoorId(boxId, fi);
      const door = doorsRef.current[doorId];
      if (door) updatedDoors[doorId] = recomputeDoorHinges(door, synced, plinthRef.current);
    }
    doorsRef.current = updatedDoors;
    setDoorsById(updatedDoors);
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

    // Mount toggle inside a cell → full recalculate (same rationale as setBoxInterior).
    if (externalStackChanged(prevItems, synced) && lastInputRef.current) {
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
    const { hinges } = adjustHingesForInterior(reset, items, door.height);
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
    const { hinges: adjusted } = adjustHingesForInterior(hinges, items, door.height);
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
    const { hinges } = adjustHingesForInterior(reset, items, door.height);
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

  // ── Calculate ─────────────────────────────────────────────────────────────

  function calculate(input: CabinetInput): void {
    lastInputRef.current = input;

    const { W, H, D, hasShell, hasEnvelopeTop, bodyMaterialId, frontMaterialId, plinth, doorCoversPlinth, lowerDoorH, middleDoorH, doorsPerColumn, doorGapMm, maxDoorWidth } = input;
    const bodyMaterial  = getMaterial(bodyMaterialId);
    const frontMaterial = getMaterial(frontMaterialId);
    const tBody  = bodyMaterial.thickness / 10;   // cm
    const tFront = frontMaterial.thickness / 10;  // cm
    const innerW = hasShell ? W - 2 * tFront : W;
    const forceRows: 1 | 2 | 3 | undefined = doorsPerColumn === 'auto' ? undefined : doorsPerColumn;

    const envelopeTopH = (hasEnvelopeTop && hasShell) ? tFront : 0;
    const boxes = decomposeBoxes(innerW, H, D, lowerDoorH, plinth, doorsPerColumn, middleDoorH, envelopeTopH);
    // calcCuts now emits ONLY doors + drawer-box parts. Carcass / shell /
    // plinth / back / shelves all come from the BoardModel loop below.
    const cuts  = calcCuts('cabinet', innerW, H, D, 0, 0, true, plinth, doorCoversPlinth, lowerDoorH, false, tBody, tBody, doorGapMm, false, tBody, maxDoorWidth);
    const doors = calcDoors(innerW, H, plinth, doorCoversPlinth, lowerDoorH, false, tBody, forceRows);

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

    // ── Interior, partitions, cells preservation ───────────────────────────
    const baselineInterior = initInteriorFromBoxes(boxes, plinth);
    const newInterior: InteriorById = {};
    const newCellInteriorById: CellInteriorById = {};
    const newPartitionsMap = new Map<string, boolean>();
    const newNumFrontsMap = new Map<string, number>();

    const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
    const allPositions = bodyBoxes.map(b => b.position);
    boxLevelMapRef.current = new Map(bodyBoxes.map(b => [b.id, b.level]));

    for (const box of bodyBoxes) {
      const key = boxStableKey(box);
      const numFronts = Math.max(1, Math.ceil(box.W / maxDoorWidth));
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
      layoutByRow.set(level, computeRowFrontLayout({
        cabinetW: W,
        hasOuterShell: hasShell,
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

      // Every door — partition or not — uses its row's frontWidth.
      const rowLayout = layoutByRow.get(box.level);
      const frontW = rowLayout?.frontWidth ?? 0;

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
        const hingeSide = numFronts > 1
          ? salonHingeSide(fi, numFronts)
          : defaultHingeSide(box.position, allPositions);

        if (!oldDoor) {
          const defaults = computeDefaultHingePositions(panelH);
          const rawHinges: Hinge[] = defaults.map(p => ({ id: newItemId(), positionFromBottom: p, isManual: false }));
          const { hinges } = adjustHingesForInterior(rawHinges, itemsForFront, panelH);
          newDoors[doorId] = {
            id: doorId, boxId: box.id, frontIndex: fi,
            height: panelH, width: frontW,
            hingeSide, hingeCount: 'auto', hinges, hasDoor: true, coversSkirt, gapMm: doorGapMm,
          };
        } else {
          const recomputed = recomputeDoorHinges(
            { ...oldDoor, id: doorId, boxId: box.id, frontIndex: fi, height: panelH, width: frontW, coversSkirt, gapMm: doorGapMm },
            itemsForFront, plinth,
          );
          newDoors[doorId] = recomputed;
        }
      }
    }

    // ── External-drawer front cuts ────────────────────────────────────────
    // Width comes from the cabinet-level layout (same source as the doors):
    //   cell drawer (partition):  one column   → layout.frontWidth
    //   body-wide drawer:         N columns    → spanLength = numFronts
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

      if (hasPartition) {
        const cellW = rowLayout.frontWidth;
        for (let ci = 0 as 0 | 1; ci <= 1; ci = (ci + 1) as 0 | 1) {
          const itemsForCell = cellItems?.[ci] ?? [];
          externalDrawerCuts.push(
            ...calcExternalDrawerFrontCuts(
              itemsForCell, cellW, doorGapMm, plinth, originalCoversSkirt, frontMaterial.thickness,
            ),
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
          ...calcExternalDrawerFrontCuts(
            bodyItems, bodyDrawerW, doorGapMm, plinth, originalCoversSkirt, frontMaterial.thickness,
          ),
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
    baseCutsRef.current = cuts;

    numFrontsRef.current = newNumFrontsMap;
    setNumFrontsPerBox(newNumFrontsMap);
    setFrontLayoutByRow(layoutByRow);
    prevBoxesRef.current = boxes;
    setInterior(newInterior);
    setDoors(newDoors, boxes, newNumFrontsMap);
    setDrawerFronts(newDrawerFronts);

    const partitionCuts = computePartitionCuts(bodyBoxes, newNumFrontsMap, newPartitionsMap, tBody);

    // ── Carcass cuts via BoardModel ────────────────────────────────────────
    // One Board[] per body → boardsToCutItems → flat CutItem[]. Replaces the
    // legacy shell+body+plinth+back+shelves output of calcCuts. The
    // 'partition' role is filtered out because `computePartitionCuts` above
    // already emits partition cuts with richer Hebrew labels.
    const boardCuts: CutItem[] = [];
    for (const box of bodyBoxes) {
      const envFlags = deriveEnvelopeFlags(box, hasShell, hasEnvelopeTop);
      const items = newInterior[box.id] ?? [];
      const cellItems = newCellInteriorById[box.id];
      const hasPartitionBox = newPartitionsMap.get(box.id) === true;
      const isBottomRow = box.level === 'bottom' || box.level === 'single';
      const boards = buildBoardModel({
        box,
        bodyMaterial,
        frontMaterial,
        hasEnvelopeLeft: envFlags.hasEnvelopeLeft,
        hasEnvelopeRight: envFlags.hasEnvelopeRight,
        hasEnvelopeTop: envFlags.hasEnvelopeTop,
        items,
        hasPartition: hasPartitionBox,
        ...(hasPartitionBox && cellItems
          ? { cellItems: [cellItems[0] ?? [], cellItems[1] ?? []] as [InteriorItem[], InteriorItem[]] }
          : {}),
        plinthHeight: isBottomRow ? plinth : 0,
        hasBack: true,
      }).filter(b => b.role !== 'partition'); // partition emitted separately
      boardCuts.push(...boardsToCutItems(boards, buildBoxLabel(box)));
    }

    const allCuts = [...cuts, ...boardCuts, ...partitionCuts, ...externalDrawerCuts];
    setResult({ boxes, cuts: allCuts, doors });
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
  };
}
