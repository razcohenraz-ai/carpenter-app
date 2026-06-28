import { describe, it, expect } from 'vitest';
import { buildBodyDoorCells, makeSavedDoorKey } from './bodyDoors';
import { decomposeBoxes } from '../geometry/boxDecomposition';

describe('buildBodyDoorCells — no shelves (Phase 0 compat)', () => {
  it('single section, single front: one cell, si=0, sectionH=boxH', () => {
    const cells = buildBodyDoorCells('box_0', 1, { hasTopGap: true, hasBottomGap: true, boxH: 200 });
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ fi: 0, si: 0, doorId: 'box_0', sectionH: 200, sectionY0: 0 });
    expect(cells[0]!.hasTopGap).toBe(true);
    expect(cells[0]!.hasBottomGap).toBe(true);
  });

  it('single section, two fronts: two cells', () => {
    const cells = buildBodyDoorCells('box_0', 2, { hasTopGap: true, hasBottomGap: false, boxH: 80 });
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ fi: 0, si: 0, doorId: 'box_0', sectionH: 80 });
    expect(cells[1]).toMatchObject({ fi: 1, si: 0, doorId: 'box_0:1', sectionH: 80 });
  });

  it('doorId backward compat: fi=0,si=0 → boxId; fi=1,si=0 → boxId:1', () => {
    const cells = buildBodyDoorCells('mybox', 2, { boxH: 100 });
    expect(cells[0]!.doorId).toBe('mybox');
    expect(cells[1]!.doorId).toBe('mybox:1');
  });
});

describe('buildBodyDoorCells — with internalShelves (Phase 1)', () => {
  it('one shelf → two sections, correct heights', () => {
    // Box H=170, shelf at box-local 120 (= abs floor 120 when plinth=0)
    const cells = buildBodyDoorCells('box_0', 1, {
      hasTopGap: true,
      hasBottomGap: true,
      shelvesCm: [120],
      boxH: 170,
    });
    expect(cells).toHaveLength(2);
    const [bottom, top] = cells;
    expect(bottom).toMatchObject({ fi: 0, si: 0, sectionH: 120, sectionY0: 0 });
    expect(top).toMatchObject({ fi: 0, si: 1, sectionH: 50, sectionY0: 120 });
    // gap rules
    expect(bottom!.hasTopGap).toBe(false);   // inner boundary — no top gap
    expect(bottom!.hasBottomGap).toBe(true);  // body bottom gap
    expect(top!.hasTopGap).toBe(true);        // body top gap
    expect(top!.hasBottomGap).toBe(true);     // inner boundary — bottom gap
  });

  it('two shelves → three sections', () => {
    const cells = buildBodyDoorCells('box_0', 1, {
      hasTopGap: true,
      hasBottomGap: false, // no gap at body bottom (plinth)
      shelvesCm: [120, 165],
      boxH: 170,
    });
    expect(cells).toHaveLength(3);
    expect(cells[0]).toMatchObject({ si: 0, sectionH: 120, sectionY0: 0, hasBottomGap: false, hasTopGap: false });
    expect(cells[1]).toMatchObject({ si: 1, sectionH: 45, sectionY0: 120, hasBottomGap: true, hasTopGap: false });
    expect(cells[2]).toMatchObject({ si: 2, sectionH: 5, sectionY0: 165, hasBottomGap: true, hasTopGap: true });
  });

  it('two fronts × two shelves → 6 cells', () => {
    const cells = buildBodyDoorCells('box_0', 2, {
      hasTopGap: true,
      hasBottomGap: true,
      shelvesCm: [80],
      boxH: 150,
    });
    expect(cells).toHaveLength(4); // 2 fronts × 2 sections
    // fi=0, si=0
    expect(cells[0]).toMatchObject({ fi: 0, si: 0, doorId: 'box_0', sectionH: 80 });
    // fi=0, si=1
    expect(cells[1]).toMatchObject({ fi: 0, si: 1, doorId: 'box_0:0:1', sectionH: 70 });
    // fi=1, si=0
    expect(cells[2]).toMatchObject({ fi: 1, si: 0, doorId: 'box_0:1', sectionH: 80 });
    // fi=1, si=1
    expect(cells[3]).toMatchObject({ fi: 1, si: 1, doorId: 'box_0:1:1', sectionH: 70 });
  });

  it('merged body from decomposeBoxes: H=170, dpc=3, lo=120, mid=45 → single box with 2 shelves → 3 sections', () => {
    const boxes = decomposeBoxes(60, 170, 60, 120, 0, 3, 45);
    // Should have 1 body box (all merged) + 0 plinths
    const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
    expect(bodyBoxes).toHaveLength(1);
    const box = bodyBoxes[0]!;
    expect(box.level).toBe('single');
    expect(box.H).toBe(170);
    expect(box.internalShelves).toBeDefined();
    expect(box.internalShelves!.sort((a, b) => a - b)).toEqual([120, 165]);

    // boxBottomFloor = plinth = 0 for a 'single' box
    const shelvesCm = box.internalShelves!.map(s => s - 0).filter(s => s > 0 && s < box.H);
    const cells = buildBodyDoorCells(box.id, 1, {
      hasTopGap: true,
      hasBottomGap: true, // plinth=0 so bottom gap applies
      shelvesCm,
      boxH: box.H,
    });
    expect(cells).toHaveLength(3);
    expect(cells[0]).toMatchObject({ si: 0, sectionH: 120 });
    expect(cells[1]).toMatchObject({ si: 1, sectionH: 45 });
    expect(cells[2]).toMatchObject({ si: 2, sectionH: 5 });
  });
});

describe('makeSavedDoorKey', () => {
  it('si=0 is backward-compat with old format', () => {
    expect(makeSavedDoorKey('single:single', 0, 0)).toBe('single:single:0');
    expect(makeSavedDoorKey('single:single', 1, 0)).toBe('single:single:1');
  });

  it('si>0 appends section', () => {
    expect(makeSavedDoorKey('single:single', 0, 1)).toBe('single:single:0:1');
    expect(makeSavedDoorKey('single:single', 1, 2)).toBe('single:single:1:2');
  });
});
