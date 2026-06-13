import { describe, it, expect } from 'vitest';
import { buildDoorCutItems } from './doorCuts';
import { makeDoorId } from '../doors/doorUtils';
import type { Box, BoxLevel, BoxPosition } from '../../types/geometry';
import type { Door } from '../../types/doors';

function mkBox(id: string, level: BoxLevel, position: BoxPosition = 'single', W = 60, H = 80, D = 56): Box {
  return { id, W, H, D, position, level };
}

function mkDoor(boxId: string, fi: number, width: number, height: number, hasDoor = true): Door {
  return {
    id: makeDoorId(boxId, fi), boxId, frontIndex: fi, width, height,
    hingeSide: 'right', hingeCount: 'auto', hinges: [], hasDoor, coversSkirt: false, gapMm: 3,
  };
}

describe('buildDoorCutItems', () => {
  it('emits one cut per door with cm→mm dimensions and group "door"', () => {
    const box = mkBox('box_0', 'single');
    const doors = { [makeDoorId('box_0', 0)]: mkDoor('box_0', 0, 59.4, 78) };
    const cuts = buildDoorCutItems({
      doors, bodyBoxes: [box], numFrontsPerBox: new Map([['box_0', 1]]),
    });
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toMatchObject({ name: 'דלת', qty: 1, w: 594, h: 780, group: 'door' });
  });

  it('deducts the edging perimeter band (2×thickness mm) from each dimension', () => {
    const box = mkBox('box_0', 'single');
    const doors = { [makeDoorId('box_0', 0)]: mkDoor('box_0', 0, 59.4, 78) };
    const cuts = buildDoorCutItems({
      doors, bodyBoxes: [box], numFrontsPerBox: new Map([['box_0', 1]]),
      edging: { thickness: 0.6 },
    });
    expect(cuts[0]!.w).toBeCloseTo(594 - 1.2, 3);
    expect(cuts[0]!.h).toBeCloseTo(780 - 1.2, 3);
  });

  it('skips doors with hasDoor=false (appliance bays)', () => {
    const box = mkBox('box_0', 'single');
    const doors = { [makeDoorId('box_0', 0)]: mkDoor('box_0', 0, 59.4, 78, false) };
    const cuts = buildDoorCutItems({
      doors, bodyBoxes: [box], numFrontsPerBox: new Map([['box_0', 1]]),
    });
    expect(cuts).toHaveLength(0);
  });

  it('names doors by body level for split rows', () => {
    const bottom = mkBox('box_0', 'bottom');
    const top = mkBox('box_1', 'top');
    const doors = {
      [makeDoorId('box_0', 0)]: mkDoor('box_0', 0, 59.4, 40),
      [makeDoorId('box_1', 0)]: mkDoor('box_1', 0, 59.4, 36),
    };
    const cuts = buildDoorCutItems({
      doors, bodyBoxes: [top, bottom],
      numFrontsPerBox: new Map([['box_0', 1], ['box_1', 1]]),
    });
    const names = cuts.map(c => c.name);
    expect(names).toContain('דלת תחתונה');
    expect(names).toContain('דלת עליונה');
  });

  it('emits one CutItem per front (qty=1) for a multi-front body (merge is downstream)', () => {
    const box = mkBox('box_0', 'single', 'single', 120);
    const doors = {
      [makeDoorId('box_0', 0)]: mkDoor('box_0', 0, 58, 78),
      [makeDoorId('box_0', 1)]: mkDoor('box_0', 1, 58, 78),
    };
    const cuts = buildDoorCutItems({
      doors, bodyBoxes: [box], numFrontsPerBox: new Map([['box_0', 2]]),
    });
    expect(cuts).toHaveLength(2);
    expect(cuts.every(c => c.qty === 1)).toBe(true);
  });

  it('door width/height pass through verbatim (×10) — reflecting any override baked into the door', () => {
    // The helper does not recompute geometry; a wider/taller door (e.g. from a
    // box dimension override) is emitted at its actual size.
    const box = mkBox('box_0', 'single', 'single', 130);
    const doors = { [makeDoorId('box_0', 0)]: mkDoor('box_0', 0, 129.4, 58) };
    const cuts = buildDoorCutItems({
      doors, bodyBoxes: [box], numFrontsPerBox: new Map([['box_0', 1]]),
    });
    expect(cuts[0]).toMatchObject({ w: 1294, h: 580 });
  });
});
