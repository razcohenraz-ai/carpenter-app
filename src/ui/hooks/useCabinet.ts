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
  getDoorWidth,
  getDoorHeight,
  makeDoorId,
  salonHingeSide,
} from '../../core/doors/doorUtils';
import { newItemId } from '../../core/interior/interiorUtils';
import { getMaterial } from '../../catalog';
import type { Box, CutItem, DoorCalcResult, MaterialId } from '../../types';
import type { InteriorItem, InteriorById, CellInteriorById } from '../../types/interior';
import type { Door, DoorById, Hinge } from '../../types/doors';

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
  displayNumbers: Map<string, string>;
  numFrontsPerBox: Map<string, number>;
  partitionsById: Map<string, boolean>;
  setBoxPartitions: (boxId: string, value: boolean) => void;
  setDoorHingeSide: (doorId: string, side: 'left' | 'right') => void;
  setDoorHingeCount: (doorId: string, count: 2 | 3 | 4 | 'auto') => void;
  setHingeManual: (doorId: string, hingeId: string, pos: number) => void;
  resetHingeToAuto: (doorId: string, hingeId: string) => void;
  setDoorHasDoor: (doorId: string, hasDoor: boolean) => void;
  setDoorThickness: (doorId: string, materialId: string) => void;
  setCoversSkirt: (value: boolean) => void;
} {
  const [result, setResult] = useState<CabinetResult | null>(null);
  const [interiorById, setInteriorById] = useState<InteriorById>({});
  const [cellInteriorById, setCellInteriorById] = useState<CellInteriorById>({});
  const [doorsById, setDoorsById] = useState<DoorById>({});
  const [displayNumbers, setDisplayNumbers] = useState<Map<string, string>>(new Map());
  const [numFrontsPerBox, setNumFrontsPerBox] = useState<Map<string, number>>(new Map());
  const [partitionsById, setPartitionsById] = useState<Map<string, boolean>>(new Map());

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

  // ── Interior ──────────────────────────────────────────────────────────────

  function setBoxInterior(boxId: string, items: InteriorItem[]): void {
    const newInterior = { ...interiorRef.current, [boxId]: items };
    setInterior(newInterior);
    const nf = numFrontsRef.current.get(boxId) ?? 1;
    const updatedDoors: DoorById = { ...doorsRef.current };
    for (let fi = 0; fi < nf; fi++) {
      const doorId = makeDoorId(boxId, fi);
      const door = doorsRef.current[doorId];
      if (door) updatedDoors[doorId] = recomputeDoorHinges(door, items, plinthRef.current);
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
    setPartitionsById(new Map(newMap));

    const boxes = prevBoxesRef.current ?? [];
    const partitionCuts = computePartitionCuts(boxes, numFrontsRef.current, newMap, tBodyRef.current);
    setResult(prev => prev ? { ...prev, cuts: [...baseCutsRef.current, ...partitionCuts] } : null);
  }

  function addPartition(boxId: string): void {
    const newMap = new Map(partitionsRef.current);
    newMap.set(boxId, true);
    partitionsRef.current = newMap;
    setPartitionsById(new Map(newMap));

    // Clear regular items for this box
    const newInterior = { ...interiorRef.current };
    delete newInterior[boxId];
    interiorRef.current = newInterior;
    setInteriorById(newInterior);

    // Initialize empty cell items (2 cells: right=0, left=1)
    const newCellInterior = { ...cellInteriorRef.current, [boxId]: [[], []] as InteriorItem[][] };
    cellInteriorRef.current = newCellInterior;
    setCellInteriorById(newCellInterior);

    const boxes = prevBoxesRef.current ?? [];
    const partitionCuts = computePartitionCuts(boxes, numFrontsRef.current, newMap, tBodyRef.current);
    setResult(prev => prev ? { ...prev, cuts: [...baseCutsRef.current, ...partitionCuts] } : null);
  }

  function removePartition(boxId: string): void {
    const newMap = new Map(partitionsRef.current);
    newMap.delete(boxId);
    partitionsRef.current = newMap;
    setPartitionsById(new Map(newMap));

    // Clear cell items for this box
    const newCellInterior = { ...cellInteriorRef.current };
    delete newCellInterior[boxId];
    cellInteriorRef.current = newCellInterior;
    setCellInteriorById(newCellInterior);

    const boxes = prevBoxesRef.current ?? [];
    const partitionCuts = computePartitionCuts(boxes, numFrontsRef.current, newMap, tBodyRef.current);
    setResult(prev => prev ? { ...prev, cuts: [...baseCutsRef.current, ...partitionCuts] } : null);
  }

  function setCellItems(boxId: string, cellIndex: number, items: InteriorItem[]): void {
    const current = cellInteriorRef.current[boxId] ?? [[], []];
    const updated: InteriorItem[][] = current.map((c, i) => i === cellIndex ? items : c);
    const newCellInterior = { ...cellInteriorRef.current, [boxId]: updated };
    cellInteriorRef.current = newCellInterior;
    setCellInteriorById(newCellInterior);
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

  // ── Calculate ─────────────────────────────────────────────────────────────

  function calculate(input: CabinetInput): void {
    const { W, H, D, hasShell, hasEnvelopeTop, bodyMaterialId, frontMaterialId, plinth, doorCoversPlinth, lowerDoorH, middleDoorH, doorsPerColumn, doorGapMm, maxDoorWidth } = input;
    const bodyMaterial  = getMaterial(bodyMaterialId);
    const frontMaterial = getMaterial(frontMaterialId);
    const tBody  = bodyMaterial.thickness / 10;   // cm
    const tFront = frontMaterial.thickness / 10;  // cm
    const innerW = hasShell ? W - 2 * tFront : W;
    const forceRows: 1 | 2 | 3 | undefined = doorsPerColumn === 'auto' ? undefined : doorsPerColumn;

    const envelopeTopH = (hasEnvelopeTop && hasShell) ? tFront : 0;
    const boxes = decomposeBoxes(innerW, H, D, lowerDoorH, plinth, doorsPerColumn, middleDoorH, envelopeTopH);
    const cuts  = calcCuts('cabinet', innerW, H, D, 0, 0, true, plinth, doorCoversPlinth, lowerDoorH, false, tBody, tBody, doorGapMm, false, tBody, maxDoorWidth);
    const doors = calcDoors(innerW, H, plinth, doorCoversPlinth, lowerDoorH, false, tBody, forceRows);

    if (hasShell) {
      cuts.push({ name: 'מעטפת — צד ימין', qty: 1, w: D * 10, h: H * 10, group: 'shell' });
      cuts.push({ name: 'מעטפת — צד שמאל', qty: 1, w: D * 10, h: H * 10, group: 'shell' });
      if (hasEnvelopeTop) {
        cuts.push({ name: 'מעטפת תקרה', qty: 1, w: innerW * 10, h: D * 10, group: 'shell' });
      }
    }

    // ── Interior preservation ──────────────────────────────────────────────
    const prevBoxes = prevBoxesRef.current;
    const currentInterior = interiorRef.current;
    const stableInteriorMap = new Map<string, { items: InteriorItem[]; H: number }>();
    if (prevBoxes) {
      for (const box of prevBoxes) {
        if (box.level === 'plinth') continue;
        stableInteriorMap.set(boxStableKey(box), { items: currentInterior[box.id] ?? [], H: box.H });
      }
    }
    const baselineInterior = initInteriorFromBoxes(boxes, plinth);
    const newInterior: InteriorById = {};
    for (const box of boxes) {
      if (box.level === 'plinth') continue;
      const prev = stableInteriorMap.get(boxStableKey(box));
      if (!prev) {
        newInterior[box.id] = baselineInterior[box.id] ?? [];
      } else if (prev.H === box.H) {
        newInterior[box.id] = prev.items;
      } else {
        newInterior[box.id] = filterItemsForHeight(prev.items, box.H);
      }
    }

    // ── Door preservation ──────────────────────────────────────────────────
    plinthRef.current = plinth;
    const currentDoors = doorsRef.current;
    const prevNumFronts = numFrontsRef.current;

    // Stable map: "${boxStableKey}:${fi}" → Door
    const stableDoorMap = new Map<string, Door>();
    if (prevBoxes) {
      for (const box of prevBoxes) {
        if (box.level === 'plinth') continue;
        const nf = prevNumFronts.get(box.id) ?? 1;
        for (let fi = 0; fi < nf; fi++) {
          const d = currentDoors[makeDoorId(box.id, fi)];
          if (d) stableDoorMap.set(`${boxStableKey(box)}:${fi}`, d);
        }
      }
    }

    const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
    const allPositions = bodyBoxes.map(b => b.position);
    boxLevelMapRef.current = new Map(bodyBoxes.map(b => [b.id, b.level]));

    const newNumFrontsMap = new Map<string, number>();
    const newDoors: DoorById = {};

    for (const box of bodyBoxes) {
      const coversSkirt = doorCoversPlinth && shouldCoverSkirt(box.level);
      const isBottomMost = box.level === 'bottom' || box.level === 'single';
      const hasBottomGap = !(isBottomMost && plinth > 0 && !coversSkirt);
      const hasTopGap = box.level === 'top' || box.level === 'single';
      const panelH = getDoorHeight(box.H, doorGapMm, hasBottomGap, hasTopGap);

      const numFronts = Math.max(1, Math.ceil(box.W / maxDoorWidth));
      const frontW = getDoorWidth(box.W, numFronts, doorGapMm);
      newNumFrontsMap.set(box.id, numFronts);

      const items = newInterior[box.id] ?? [];

      for (let fi = 0; fi < numFronts; fi++) {
        const doorId = makeDoorId(box.id, fi);
        const oldDoor = stableDoorMap.get(`${boxStableKey(box)}:${fi}`);
        const hingeSide = numFronts > 1
          ? salonHingeSide(fi, numFronts)
          : defaultHingeSide(box.position, allPositions);

        if (!oldDoor) {
          const defaults = computeDefaultHingePositions(panelH);
          const rawHinges: Hinge[] = defaults.map(p => ({ id: newItemId(), positionFromBottom: p, isManual: false }));
          const { hinges } = adjustHingesForInterior(rawHinges, items, panelH);
          newDoors[doorId] = {
            id: doorId, boxId: box.id, frontIndex: fi,
            height: panelH, width: frontW,
            hingeSide, hingeCount: 'auto', hinges, hasDoor: true, coversSkirt, gapMm: doorGapMm,
          };
        } else {
          const recomputed = recomputeDoorHinges(
            { ...oldDoor, id: doorId, boxId: box.id, frontIndex: fi, height: panelH, width: frontW, coversSkirt, gapMm: doorGapMm },
            items, plinth,
          );
          newDoors[doorId] = recomputed;
        }
      }
    }

    // ── Partition preservation ─────────────────────────────────────────────
    const stablePartitionsMap = new Map<string, boolean>();
    if (prevBoxes) {
      for (const box of prevBoxes) {
        if (box.level === 'plinth') continue;
        if (partitionsRef.current.get(box.id)) stablePartitionsMap.set(boxStableKey(box), true);
      }
    }
    const newPartitionsMap = new Map<string, boolean>();
    for (const box of bodyBoxes) {
      if (stablePartitionsMap.get(boxStableKey(box))) {
        const nf = newNumFrontsMap.get(box.id) ?? 1;
        if (nf > 1) newPartitionsMap.set(box.id, true);
      }
    }
    partitionsRef.current = newPartitionsMap;
    setPartitionsById(new Map(newPartitionsMap));

    // ── Cell interior preservation ─────────────────────────────────────────
    const stableCellMap = new Map<string, InteriorItem[][]>();
    if (prevBoxes) {
      for (const box of prevBoxes) {
        if (box.level === 'plinth') continue;
        const cellItems = cellInteriorRef.current[box.id];
        if (cellItems) stableCellMap.set(boxStableKey(box), cellItems);
      }
    }
    const newCellInteriorById: CellInteriorById = {};
    for (const box of bodyBoxes) {
      if (!newPartitionsMap.get(box.id)) continue;
      newCellInteriorById[box.id] = stableCellMap.get(boxStableKey(box)) ?? [[], []];
    }
    cellInteriorRef.current = newCellInteriorById;
    setCellInteriorById(newCellInteriorById);

    tBodyRef.current = tBody;
    baseCutsRef.current = cuts;

    numFrontsRef.current = newNumFrontsMap;
    setNumFrontsPerBox(newNumFrontsMap);
    prevBoxesRef.current = boxes;
    setInterior(newInterior);
    setDoors(newDoors, boxes, newNumFrontsMap);
    const allCuts = [...cuts, ...computePartitionCuts(bodyBoxes, newNumFrontsMap, newPartitionsMap, tBody)];
    setResult({ boxes, cuts: allCuts, doors });
  }

  return {
    result, calculate,
    interiorById, setBoxInterior,
    cellInteriorById, addPartition, removePartition, setCellItems,
    doorsById, displayNumbers, numFrontsPerBox,
    partitionsById, setBoxPartitions,
    setDoorHingeSide, setDoorHingeCount, setHingeManual, resetHingeToAuto, setDoorHasDoor,
    setDoorThickness, setCoversSkirt,
  };
}
