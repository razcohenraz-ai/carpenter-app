import { useState } from 'react';
import { decomposeBoxes, calcCuts, calcDoors } from '../../core';
import { getMaterial } from '../../catalog';
import type { Box, CutItem, DoorCalcResult, MaterialId } from '../../types';

export interface CabinetInput {
  W: number;
  H: number;
  D: number;
  hasShell: boolean;
  materialId: MaterialId;
  plinth: number;
  doorCoversPlinth: boolean;
  lowerDoorH: number | undefined;
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
} {
  const [result, setResult] = useState<CabinetResult | null>(null);

  function calculate(input: CabinetInput): void {
    const { W, H, D, hasShell, materialId, plinth, doorCoversPlinth, lowerDoorH, doorsPerColumn } = input;
    const material = getMaterial(materialId);
    const t = material.thickness / 10; // mm → cm

    const forceRows: 1 | 2 | 3 | undefined =
      doorsPerColumn === 'auto' ? undefined : doorsPerColumn;

    const boxes = decomposeBoxes(W, H, D, lowerDoorH, plinth);
    const cuts = calcCuts(
      'cabinet', W, H, D,
      0,               // shelves
      0,               // drawers
      true,            // hasBack
      plinth,
      doorCoversPlinth,
      lowerDoorH,
      hasShell,
      t,               // tShell
      t,               // tBody
    );
    const doors = calcDoors(W, H, plinth, doorCoversPlinth, lowerDoorH, hasShell, t, forceRows);

    setResult({ boxes, cuts, doors });
  }

  return { result, calculate };
}
