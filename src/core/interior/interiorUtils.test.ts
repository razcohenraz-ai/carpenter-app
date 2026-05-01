import { describe, it, expect } from 'vitest';
import {
  computeBodyFloors,
  initInteriorFromBoxes,
  defaultShelfPlacement,
  defaultDrawerPlacement,
  defaultRodPlacement,
  validateInterior,
  filterItemsForHeight,
} from './interiorUtils';
import type { BodyLevel, InteriorItem } from '../../types/interior';
import type { Box } from '../../types/geometry';

// ── computeBodyFloors ─────────────────────────────────────────────────────────

describe('computeBodyFloors', () => {
  it('single body: floor = 0', () => {
    const map = new Map<BodyLevel, number>([['single', 200]]);
    const floors = computeBodyFloors(map);
    expect(floors.get('single')).toBe(0);
  });

  it('top+bottom: bottom floor=0, top floor=bottomH', () => {
    const map = new Map<BodyLevel, number>([['top', 110], ['bottom', 90]]);
    const floors = computeBodyFloors(map);
    expect(floors.get('bottom')).toBe(0);
    expect(floors.get('top')).toBe(90);
  });

  it('top+middle+bottom: accumulated correctly', () => {
    const map = new Map<BodyLevel, number>([['top', 80], ['middle', 80], ['bottom', 75]]);
    const floors = computeBodyFloors(map);
    expect(floors.get('bottom')).toBe(0);
    expect(floors.get('middle')).toBe(75);
    expect(floors.get('top')).toBe(155);
  });
});

// ── initInteriorFromBoxes ────────────────────────────────────────────────────

describe('initInteriorFromBoxes', () => {
  it('no internalShelves → empty arrays per level', () => {
    const boxes: Box[] = [
      { id: 'b0', W: 60, H: 100, D: 60, position: 'single', level: 'top' },
      { id: 'b1', W: 60, H: 80,  D: 60, position: 'single', level: 'bottom' },
    ];
    const result = initInteriorFromBoxes(boxes, 0);
    expect(result.top).toEqual([]);
    expect(result.bottom).toEqual([]);
  });

  it('plinth boxes are ignored', () => {
    const boxes: Box[] = [
      { id: 'b0', W: 60, H: 170, D: 60, position: 'single', level: 'single' },
      { id: 'b1', W: 60, H: 10,  D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes, 10);
    expect(result.single).toEqual([]);
    // plinth is not a BodyLevel key — must not appear in result
    expect(Object.keys(result)).not.toContain('plinth');
  });

  it('converts internalShelves to body-relative ShelfItems', () => {
    // H=240, plinth=5, loDoor=170, midDoor=50
    // top body H=70, bottom body H=165
    // top internalShelves=[220] (absolute)
    // top body floor (above plinth) = 165; bodyRelative = 220 - 5 - 165 = 50
    const boxes: Box[] = [
      { id: 'b0', W: 60, H: 70,  D: 60, position: 'single', level: 'top', internalShelves: [220] },
      { id: 'b1', W: 60, H: 165, D: 60, position: 'single', level: 'bottom' },
      { id: 'b2', W: 60, H: 5,   D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes, 5);
    expect(result.top).toHaveLength(1);
    expect(result.top![0]!.type).toBe('shelf');
    expect((result.top![0] as { heightFromFloor: number }).heightFromFloor).toBeCloseTo(50);
  });

  it('multi-column: internalShelves only processed once per level', () => {
    const boxes: Box[] = [
      { id: 'b0', W: 80, H: 70, D: 60, position: 'left',  level: 'top', internalShelves: [220] },
      { id: 'b1', W: 80, H: 70, D: 60, position: 'right', level: 'top', internalShelves: [220] },
      { id: 'b2', W: 60, H: 165, D: 60, position: 'single', level: 'bottom' },
      { id: 'b3', W: 60, H: 5,   D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes, 5);
    expect(result.top).toHaveLength(1); // not 2
  });
});

// ── defaultShelfPlacement ─────────────────────────────────────────────────────

describe('defaultShelfPlacement', () => {
  it('empty body → shelf at center', () => {
    const shelf = defaultShelfPlacement([], 100);
    expect(shelf.type).toBe('shelf');
    expect(shelf.heightFromFloor).toBeCloseTo(50);
  });

  it('existing shelf at 50 → new shelf in largest free segment', () => {
    const items: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 50 },
    ];
    const shelf = defaultShelfPlacement(items, 100);
    // free: [0,50] and [50,100], both size 50, first or second both give 25 or 75
    expect(shelf.heightFromFloor).toBeGreaterThan(0);
    expect(shelf.heightFromFloor).toBeLessThan(100);
  });

  it('drawer occupies [20,40] → shelf in largest free space', () => {
    const items: InteriorItem[] = [
      { type: 'drawer', id: 'a', heightFromFloor: 20, drawerHeight: 20 },
    ];
    const shelf = defaultShelfPlacement(items, 100);
    // free: [0,20] (20) and [40,100] (60)
    expect(shelf.heightFromFloor).toBeCloseTo(70); // center of [40,100]
  });
});

// ── defaultDrawerPlacement ────────────────────────────────────────────────────

describe('defaultDrawerPlacement', () => {
  it('first drawer: centered in body', () => {
    const drawer = defaultDrawerPlacement([], 100);
    expect(drawer.type).toBe('drawer');
    expect(drawer.drawerHeight).toBe(20);
    expect(drawer.heightFromFloor).toBeCloseTo(40); // (100-20)/2
  });

  it('second drawer: 3cm gap below first', () => {
    const first = defaultDrawerPlacement([], 100);
    const second = defaultDrawerPlacement([first], 100);
    // first at h=40, second at 40-20-3=17
    expect(second.heightFromFloor).toBeCloseTo(17);
  });

  it('clamps to 0 when body too small', () => {
    const first = defaultDrawerPlacement([], 30);
    // h = (30-20)/2 = 5
    const second = defaultDrawerPlacement([first], 30);
    // 5 - 20 - 3 = -18 → clamped to 0
    expect(second.heightFromFloor).toBe(0);
  });
});

// ── defaultRodPlacement ───────────────────────────────────────────────────────

describe('defaultRodPlacement', () => {
  it('rod at 10cm below ceiling', () => {
    const rod = defaultRodPlacement(100);
    expect(rod.type).toBe('rod');
    expect(rod.heightFromFloor).toBe(90);
  });

  it('clamps to 0 for tiny body', () => {
    const rod = defaultRodPlacement(5);
    expect(rod.heightFromFloor).toBe(0); // max(0, 5-10) = 0
  });
});

// ── validateInterior ──────────────────────────────────────────────────────────

describe('validateInterior', () => {
  it('valid items → no warnings', () => {
    const items: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 50 },
      { type: 'drawer', id: 'b', heightFromFloor: 10, drawerHeight: 20 },
    ];
    expect(validateInterior(items, 100)).toHaveLength(0);
  });

  it('shelf out of bounds → outOfBounds warning', () => {
    const items: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 110 },
    ];
    const warnings = validateInterior(items, 100);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.kind).toBe('outOfBounds');
    expect((warnings[0] as { itemId: string }).itemId).toBe('a');
  });

  it('drawer top exceeds body → outOfBounds warning', () => {
    const items: InteriorItem[] = [
      { type: 'drawer', id: 'a', heightFromFloor: 85, drawerHeight: 20 },
    ];
    const warnings = validateInterior(items, 100);
    expect(warnings.some(w => w.kind === 'outOfBounds')).toBe(true);
  });

  it('overlapping drawers → drawerOverlap warning', () => {
    const items: InteriorItem[] = [
      { type: 'drawer', id: 'a', heightFromFloor: 30, drawerHeight: 20 }, // [30,50]
      { type: 'drawer', id: 'b', heightFromFloor: 40, drawerHeight: 20 }, // [40,60] overlaps
    ];
    const warnings = validateInterior(items, 100);
    expect(warnings.some(w => w.kind === 'drawerOverlap')).toBe(true);
  });

  it('non-overlapping drawers → no drawerOverlap warning', () => {
    const items: InteriorItem[] = [
      { type: 'drawer', id: 'a', heightFromFloor: 30, drawerHeight: 20 }, // [30,50]
      { type: 'drawer', id: 'b', heightFromFloor: 53, drawerHeight: 20 }, // [53,73] 3cm gap
    ];
    expect(validateInterior(items, 100).filter(w => w.kind === 'drawerOverlap')).toHaveLength(0);
  });
});

// ── filterItemsForHeight ──────────────────────────────────────────────────────

describe('filterItemsForHeight', () => {
  it('keeps items within new height', () => {
    const items: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 50 },
      { type: 'shelf', id: 'b', heightFromFloor: 90 },
    ];
    expect(filterItemsForHeight(items, 80)).toHaveLength(1);
    expect(filterItemsForHeight(items, 80)[0]!.id).toBe('a');
  });

  it('removes drawer whose top exceeds new height', () => {
    const items: InteriorItem[] = [
      { type: 'drawer', id: 'a', heightFromFloor: 70, drawerHeight: 20 }, // top=90
    ];
    expect(filterItemsForHeight(items, 85)).toHaveLength(0);
    expect(filterItemsForHeight(items, 95)).toHaveLength(1);
  });
});
