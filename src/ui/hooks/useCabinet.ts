import { useState, useRef } from 'react';
import { decomposeBoxes, calcCuts, calcDoors } from '../../core';
import { initInteriorFromBoxes, filterItemsForHeight } from '../../core/interior/interiorUtils';
import { getMaterial } from '../../catalog';
import type { Box, CutItem, DoorCalcResult, MaterialId } from '../../types';
import type { BodyLevel, InteriorItem, InteriorByLevel } from '../../types/interior';

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

function getLevelHeightMap(boxes: Box[]): Map<BodyLevel, number> {
  const map = new Map<BodyLevel, number>();
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    const lvl = box.level as BodyLevel;
    if (!map.has(lvl)) map.set(lvl, box.H);
  }
  return map;
}

function sameBodyLevels(a: Box[], b: Box[]): boolean {
  const levelsA = new Set(a.filter(x => x.level !== 'plinth').map(x => x.level));
  const levelsB = new Set(b.filter(x => x.level !== 'plinth').map(x => x.level));
  if (levelsA.size !== levelsB.size) return false;
  for (const l of levelsA) if (!levelsB.has(l)) return false;
  return true;
}

export function useCabinet(): {
  result: CabinetResult | null;
  calculate: (input: CabinetInput) => void;
  interiorByLevel: InteriorByLevel;
  setBodyInterior: (level: BodyLevel, items: InteriorItem[]) => void;
} {
  const [result, setResult] = useState<CabinetResult | null>(null);
  const [interiorByLevel, setInteriorByLevel] = useState<InteriorByLevel>({});

  const interiorRef = useRef<InteriorByLevel>({});
  const prevBoxesRef = useRef<Box[] | null>(null);

  function setInterior(v: InteriorByLevel): void {
    interiorRef.current = v;
    setInteriorByLevel(v);
  }

  function setBodyInterior(level: BodyLevel, items: InteriorItem[]): void {
    setInterior({ ...interiorRef.current, [level]: items });
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

    const prev = prevBoxesRef.current;
    let newInterior: InteriorByLevel;

    if (prev === null || !sameBodyLevels(prev, boxes)) {
      newInterior = initInteriorFromBoxes(boxes, plinth);
    } else {
      const oldHeights = getLevelHeightMap(prev);
      const newHeights = getLevelHeightMap(boxes);
      const current = interiorRef.current;
      newInterior = {};
      for (const [level, newH] of newHeights) {
        const prevH = oldHeights.get(level) ?? newH;
        const prevItems = current[level] ?? [];
        newInterior[level] = prevH === newH
          ? prevItems
          : filterItemsForHeight(prevItems, newH);
      }
    }

    prevBoxesRef.current = boxes;
    setInterior(newInterior);
    setResult({ boxes, cuts, doors });
  }

  return { result, calculate, interiorByLevel, setBodyInterior };
}
