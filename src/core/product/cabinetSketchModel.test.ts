import { describe, it, expect } from 'vitest';
import { buildCabinetSketchModel } from './cabinetSketchModel';
import { defaultInputForType, emptyCabinetState } from './productDefaults';
import type { CabinetInput, SavedCabinetState } from '../../types';
import type { ShelfItem } from '../../types/interior';

// doorsPerColumn:1 forces a single body → its stable slot key is 'single:single'
// (decomposeBoxes: needsSplit=false). Default 'auto' at H220 splits top/bottom.
function singleBodyInput(): CabinetInput {
  return { ...defaultInputForType('wardrobe'), doorsPerColumn: 1 };
}

describe('buildCabinetSketchModel', () => {
  it('single body, no shell: dims from input, one front column', () => {
    const m = buildCabinetSketchModel(singleBodyInput(), emptyCabinetState() as SavedCabinetState, []);
    expect(m.effW).toBe(60);
    expect(m.effH).toBe(220);
    expect(m.outerCabW).toBe(60);            // no shell → no envelope width
    expect(m.hasAnyShell).toBe(false);
    expect(m.numFrontsPerBox.size).toBe(1);  // one body, 60 ≤ maxDoorWidth 60 → one column
  });

  it('single-body W override lifts effW + outerCabW', () => {
    const state = {
      ...emptyCabinetState(),
      boxDimensionOverrides: { 'single:single': { W: 80 } },
    } as unknown as SavedCabinetState;
    const m = buildCabinetSketchModel(singleBodyInput(), state, []);
    expect(m.effW).toBe(80);
    expect(m.outerCabW).toBe(80);
  });

  it('interior items keyed by the stable slot land in interiorById', () => {
    const shelf: ShelfItem = { id: 'sh1', type: 'shelf', heightFromFloor: 100 };
    const state = {
      ...emptyCabinetState(),
      interior: { 'single:single': [shelf] },
    } as unknown as SavedCabinetState;
    const m = buildCabinetSketchModel(singleBodyInput(), state, []);
    expect(Object.values(m.interiorById).flat()).toContainEqual(shelf);
  });

  it('partition flag keyed by the stable slot lands in partitionsById', () => {
    const state = {
      ...emptyCabinetState(),
      partitions: { 'single:single': true },
    } as unknown as SavedCabinetState;
    const m = buildCabinetSketchModel(singleBodyInput(), state, []);
    expect([...m.partitionsById.values()]).toContain(true);
  });
});
