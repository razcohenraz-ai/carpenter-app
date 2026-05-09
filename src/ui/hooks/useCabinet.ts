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
} from '../../core/doors/doorUtils';
import { newItemId } from '../../core/interior/interiorUtils';
import { getMaterial } from '../../catalog';
import type { Box, CutItem, DoorCalcResult, MaterialId } from '../../types';
import type { InteriorItem, InteriorById } from '../../types/interior';
import type { Door, DoorById, Hinge } from '../../types/doors';

export interface CabinetInput {
  W: number;
  H: number;
  D: number;
  hasShell: boolean;
  materialId: MaterialId;
  plinth: number;
  doorCoversPlinth: boolean;
  lowerDoorH: number | undefined;
  middleDoorH: number | undefined;
  doorsPerColumn: 'auto' | 1 | 2 | 3;
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
  doorsById: DoorById;
  displayNumbers: Map<string, string>;
  setDoorHingeSide: (boxId: string, side: 'left' | 'right') => void;
  setDoorHingeCount: (boxId: string, count: 2 | 3 | 4 | 'auto') => void;
  setHingeManual: (boxId: string, hingeId: string, pos: number) => void;
  resetHingeToAuto: (boxId: string, hingeId: string) => void;
  setDoorHasDoor: (boxId: string, hasDoor: boolean) => void;
  setDoorThickness: (boxId: string, materialId: string) => void;
  setCoversSkirt: (value: boolean) => void;
} {
  const [result, setResult] = useState<CabinetResult | null>(null);
  const [interiorById, setInteriorById] = useState<InteriorById>({});
  const [doorsById, setDoorsById] = useState<DoorById>({});
  const [displayNumbers, setDisplayNumbers] = useState<Map<string, string>>(new Map());

  const interiorRef = useRef<InteriorById>({});
  const doorsRef    = useRef<DoorById>({});
  const prevBoxesRef = useRef<Box[] | null>(null);
  const plinthRef = useRef<number>(0);
  const boxLevelMapRef = useRef<Map<string, string>>(new Map());

  function setInterior(v: InteriorById): void {
    interiorRef.current = v;
    setInteriorById(v);
  }

  function setDoors(v: DoorById, boxes?: Box[]): void {
    doorsRef.current = v;
    setDoorsById(v);
    if (boxes) setDisplayNumbers(assignDoorDisplayNumbers(boxes));
  }

  // ── Interior ──────────────────────────────────────────────────────────────

  function setBoxInterior(boxId: string, items: InteriorItem[]): void {
    const newInterior = { ...interiorRef.current, [boxId]: items };
    setInterior(newInterior);
    const door = doorsRef.current[boxId];
    if (door) {
      const updated = recomputeDoorHinges(door, items, plinthRef.current);
      const newDoors = { ...doorsRef.current, [boxId]: updated };
      doorsRef.current = newDoors;
      setDoorsById(newDoors);
    }
  }

  // ── Door mutations ────────────────────────────────────────────────────────

  function setDoorHingeSide(boxId: string, side: 'left' | 'right'): void {
    const door = doorsRef.current[boxId];
    if (!door) return;
    const n = door.hingeCount === 'auto' ? undefined : door.hingeCount as 1 | 2 | 3 | 4;
    const defaults = computeDefaultHingePositions(door.height, n);
    const reset = Array.from({ length: defaults.length }, (_, i) => {
      const existing = door.hinges[i];
      if (existing?.isManual) return existing;
      return { id: existing?.id ?? newItemId(), positionFromBottom: defaults[i]!, isManual: false };
    });
    const items = interiorRef.current[boxId] ?? [];
    const { hinges } = adjustHingesForInterior(reset, items, door.height);
    _mutateDoor(boxId, { ...door, hingeSide: side, hinges });
  }

  function setDoorHingeCount(boxId: string, count: 2 | 3 | 4 | 'auto'): void {
    const door = doorsRef.current[boxId];
    if (!door) return;
    const n = count === 'auto' ? computeHingeCount(door.height) : count;
    const defaults = computeDefaultHingePositions(door.height, n);
    const hinges: Hinge[] = defaults.map(p => ({
      id: newItemId(),
      positionFromBottom: p,
      isManual: false,
    }));
    const items = interiorRef.current[boxId] ?? [];
    const { hinges: adjusted } = adjustHingesForInterior(hinges, items, door.height);
    _mutateDoor(boxId, { ...door, hingeCount: count, hinges: adjusted });
  }

  function setHingeManual(boxId: string, hingeId: string, pos: number): void {
    const door = doorsRef.current[boxId];
    if (!door) return;
    const hinges = door.hinges.map(h =>
      h.id === hingeId ? { ...h, positionFromBottom: pos, isManual: true } : h,
    );
    _mutateDoor(boxId, { ...door, hinges });
  }

  function resetHingeToAuto(boxId: string, hingeId: string): void {
    const door = doorsRef.current[boxId];
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
    const items = interiorRef.current[boxId] ?? [];
    const { hinges } = adjustHingesForInterior(reset, items, door.height);
    _mutateDoor(boxId, { ...door, hinges });
  }

  function setDoorHasDoor(boxId: string, hasDoor: boolean): void {
    const door = doorsRef.current[boxId];
    if (!door) return;
    _mutateDoor(boxId, { ...door, hasDoor });
  }

  function setDoorThickness(boxId: string, materialId: string): void {
    const door = doorsRef.current[boxId];
    if (!door) return;
    if (materialId) {
      _mutateDoor(boxId, { ...door, thicknessOverride: materialId });
    } else {
      const { thicknessOverride: _removed, ...rest } = door;
      _mutateDoor(boxId, rest as Door);
    }
  }

  function setCoversSkirt(value: boolean): void {
    const plinthH = plinthRef.current;
    const levelMap = boxLevelMapRef.current;
    const currentDoors = doorsRef.current;
    let changed = false;
    const newDoors: DoorById = {};
    for (const [boxId, door] of Object.entries(currentDoors)) {
      const coversSkirt = value && shouldCoverSkirt(levelMap.get(boxId) ?? '');
      if (coversSkirt !== door.coversSkirt) {
        const items = interiorRef.current[boxId] ?? [];
        newDoors[boxId] = recomputeDoorHinges({ ...door, coversSkirt }, items, plinthH);
        changed = true;
      } else {
        newDoors[boxId] = door;
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
    const { W, H, D, hasShell, materialId, plinth, doorCoversPlinth, lowerDoorH, middleDoorH, doorsPerColumn } = input;
    const material = getMaterial(materialId);
    const t = material.thickness / 10;
    const forceRows: 1 | 2 | 3 | undefined = doorsPerColumn === 'auto' ? undefined : doorsPerColumn;

    const boxes = decomposeBoxes(W, H, D, lowerDoorH, plinth, doorsPerColumn, middleDoorH);
    const cuts = calcCuts('cabinet', W, H, D, 0, 0, true, plinth, doorCoversPlinth, lowerDoorH, hasShell, t, t);
    const doors = calcDoors(W, H, plinth, doorCoversPlinth, lowerDoorH, hasShell, t, forceRows);

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
    const stableDoorMap = new Map<string, Door>();
    if (prevBoxes) {
      for (const box of prevBoxes) {
        if (box.level === 'plinth') continue;
        const d = currentDoors[box.id];
        if (d) stableDoorMap.set(boxStableKey(box), d);
      }
    }

    const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
    const allPositions = bodyBoxes.map(b => b.position);
    boxLevelMapRef.current = new Map(bodyBoxes.map(b => [b.id, b.level]));
    const newDoors: DoorById = {};

    for (const box of bodyBoxes) {
      const key = boxStableKey(box);
      const oldDoor = stableDoorMap.get(key);
      const items = newInterior[box.id] ?? [];
      const coversSkirt = doorCoversPlinth && shouldCoverSkirt(box.level);

      if (!oldDoor) {
        // New box — initialize with defaults
        const defaults = computeDefaultHingePositions(box.H);
        const rawHinges: Hinge[] = defaults.map(p => ({ id: newItemId(), positionFromBottom: p, isManual: false }));
        const { hinges } = adjustHingesForInterior(rawHinges, items, box.H);
        newDoors[box.id] = {
          id: box.id, boxId: box.id, height: box.H, width: box.W,
          hingeSide: defaultHingeSide(box.position, allPositions),
          hingeCount: 'auto', hinges, hasDoor: true, coversSkirt,
        };
      } else {
        // Existing box — preserve manual hinges, recompute non-manual
        const recomputed = recomputeDoorHinges(
          { ...oldDoor, id: box.id, boxId: box.id, height: box.H, width: box.W, coversSkirt },
          items,
          plinth,
        );
        newDoors[box.id] = recomputed;
      }
    }

    prevBoxesRef.current = boxes;
    setInterior(newInterior);
    setDoors(newDoors, boxes);
    setResult({ boxes, cuts, doors });
  }

  return {
    result, calculate,
    interiorById, setBoxInterior,
    doorsById, displayNumbers,
    setDoorHingeSide, setDoorHingeCount, setHingeManual, resetHingeToAuto, setDoorHasDoor,
    setDoorThickness, setCoversSkirt,
  };
}
