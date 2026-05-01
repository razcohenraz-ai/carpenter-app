import { useState, useRef } from 'react';
import { decomposeBoxes, calcCuts, calcDoors } from '../../core';
import { initInteriorFromBoxes, boxStableKey, filterItemsForHeight } from '../../core/interior/interiorUtils';
import { getMaterial } from '../../catalog';
import type { Box, CutItem, DoorCalcResult, MaterialId } from '../../types';
import type { InteriorItem, InteriorById } from '../../types/interior';

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
} {
  const [result, setResult] = useState<CabinetResult | null>(null);
  const [interiorById, setInteriorById] = useState<InteriorById>({});

  const interiorRef = useRef<InteriorById>({});
  const prevBoxesRef = useRef<Box[] | null>(null);

  function setInterior(v: InteriorById): void {
    interiorRef.current = v;
    setInteriorById(v);
  }

  function setBoxInterior(boxId: string, items: InteriorItem[]): void {
    setInterior({ ...interiorRef.current, [boxId]: items });
  }

  function calculate(input: CabinetInput): void {
    const { W, H, D, hasShell, materialId, plinth, doorCoversPlinth, lowerDoorH, middleDoorH, doorsPerColumn } = input;
    const material = getMaterial(materialId);
    const t = material.thickness / 10;

    const forceRows: 1 | 2 | 3 | undefined =
      doorsPerColumn === 'auto' ? undefined : doorsPerColumn;

    const boxes = decomposeBoxes(W, H, D, lowerDoorH, plinth, doorsPerColumn, middleDoorH);
    const cuts = calcCuts(
      'cabinet', W, H, D, 0, 0, true, plinth,
      doorCoversPlinth, lowerDoorH, hasShell, t, t,
    );
    const doors = calcDoors(W, H, plinth, doorCoversPlinth, lowerDoorH, hasShell, t, forceRows);

    // Build stable-key → {items, H} map from the previous call
    const prevBoxes = prevBoxesRef.current;
    const currentInterior = interiorRef.current;

    const stableKeyMap = new Map<string, { items: InteriorItem[]; H: number }>();
    if (prevBoxes) {
      for (const box of prevBoxes) {
        if (box.level === 'plinth') continue;
        stableKeyMap.set(boxStableKey(box), {
          items: currentInterior[box.id] ?? [],
          H: box.H,
        });
      }
    }

    // Build new interior keyed by new box IDs, preserving items via stable keys
    const baseline = initInteriorFromBoxes(boxes, plinth);
    const newInterior: InteriorById = {};

    for (const box of boxes) {
      if (box.level === 'plinth') continue;
      const prev = stableKeyMap.get(boxStableKey(box));
      if (prev === undefined) {
        // New structural position — use baseline (internalShelves → shelves)
        newInterior[box.id] = baseline[box.id] ?? [];
      } else if (prev.H === box.H) {
        // Same height — keep items unchanged
        newInterior[box.id] = prev.items;
      } else {
        // Height changed — drop items that no longer fit
        newInterior[box.id] = filterItemsForHeight(prev.items, box.H);
      }
    }

    prevBoxesRef.current = boxes;
    setInterior(newInterior);
    setResult({ boxes, cuts, doors });
  }

  return { result, calculate, interiorById, setBoxInterior };
}
