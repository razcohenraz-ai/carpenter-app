import { describe, it, expect } from 'vitest';
import {
  computeBodyFloors,
  initInteriorFromBoxes,
  boxStableKey,
  defaultShelfPlacement,
  defaultDrawerPlacement,
  defaultRodPlacement,
  validateInterior,
  filterItemsForHeight,
  redistributeShelves,
  addShelfRedistributed,
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
  it('no internalShelves → empty array per box', () => {
    const boxes: Box[] = [
      { id: 'b0', W: 60, H: 100, D: 60, position: 'single', level: 'top' },
      { id: 'b1', W: 60, H: 80,  D: 60, position: 'single', level: 'bottom' },
    ];
    const result = initInteriorFromBoxes(boxes, 0);
    expect(result['b0']).toEqual([]);
    expect(result['b1']).toEqual([]);
  });

  it('plinth boxes are ignored', () => {
    const boxes: Box[] = [
      { id: 'b0', W: 60, H: 170, D: 60, position: 'single', level: 'single' },
      { id: 'b1', W: 60, H: 10,  D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes, 10);
    expect(result['b0']).toEqual([]);
    expect(Object.keys(result)).not.toContain('b1');
  });

  it('converts internalShelves to body-relative ShelfItems', () => {
    // top body H=70, bottom body H=165, plinth=5
    // top body floor = 165; bodyRelative = 220 - 5 - 165 = 50
    const boxes: Box[] = [
      { id: 'b0', W: 60, H: 70,  D: 60, position: 'single', level: 'top', internalShelves: [220] },
      { id: 'b1', W: 60, H: 165, D: 60, position: 'single', level: 'bottom' },
      { id: 'b2', W: 60, H: 5,   D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes, 5);
    expect(result['b0']).toHaveLength(1);
    expect(result['b0']![0]!.type).toBe('shelf');
    expect((result['b0']![0] as { heightFromFloor: number }).heightFromFloor).toBeCloseTo(50);
  });

  it('multi-column: each box gets its own entry', () => {
    const boxes: Box[] = [
      { id: 'b0', W: 80, H: 70, D: 60, position: 'left',  level: 'top', internalShelves: [220] },
      { id: 'b1', W: 80, H: 70, D: 60, position: 'right', level: 'top', internalShelves: [220] },
      { id: 'b2', W: 60, H: 165, D: 60, position: 'single', level: 'bottom' },
      { id: 'b3', W: 60, H: 5,   D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes, 5);
    expect(result['b0']).toHaveLength(1);
    expect(result['b1']).toHaveLength(1);
    expect(result['b2']).toEqual([]);
    expect(Object.keys(result)).not.toContain('b3');
  });

  it('7 boxes → 7 entries (no plinth)', () => {
    // Simulate 7 body boxes + 2 plinth boxes
    const boxes: Box[] = [
      { id: 'b0', W: 80, H: 110, D: 60, position: 'left',   level: 'bottom' },
      { id: 'b1', W: 80, H: 110, D: 60, position: 'right',  level: 'bottom' },
      { id: 'b2', W: 80, H: 80,  D: 60, position: 'left',   level: 'middle' },
      { id: 'b3', W: 80, H: 80,  D: 60, position: 'right',  level: 'middle' },
      { id: 'b4', W: 80, H: 30,  D: 60, position: 'left',   level: 'top' },
      { id: 'b5', W: 80, H: 30,  D: 60, position: 'right',  level: 'top' },
      { id: 'b6', W: 160, H: 30, D: 60, position: 'single', level: 'top' }, // extra
      { id: 'p0', W: 80, H: 10,  D: 60, position: 'left',   level: 'plinth' },
      { id: 'p1', W: 80, H: 10,  D: 60, position: 'right',  level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes, 10);
    const bodyKeys = Object.keys(result);
    expect(bodyKeys).toHaveLength(7);
    expect(bodyKeys).not.toContain('p0');
    expect(bodyKeys).not.toContain('p1');
  });
});

// ── boxStableKey ──────────────────────────────────────────────────────────────

describe('boxStableKey', () => {
  it('encodes level and position', () => {
    const box: Box = { id: 'b0', W: 60, H: 100, D: 60, position: 'left', level: 'bottom' };
    expect(boxStableKey(box)).toBe('bottom:left');
  });

  it('two boxes same structure → same key regardless of id', () => {
    const a: Box = { id: 'box_0', W: 60, H: 100, D: 60, position: 'right', level: 'top' };
    const b: Box = { id: 'box_5', W: 60, H: 100, D: 60, position: 'right', level: 'top' };
    expect(boxStableKey(a)).toBe(boxStableKey(b));
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

  it('second rod: center between first rod and floor', () => {
    const first = defaultRodPlacement(100);
    // first at 90
    const second = defaultRodPlacement(100, [first]);
    // largest gap between {0, 90} is [0,90] → center = 45
    expect(second.heightFromFloor).toBeCloseTo(45);
  });

  it('third rod: bisects largest remaining gap', () => {
    const first  = defaultRodPlacement(100);          // 90
    const second = defaultRodPlacement(100, [first]);  // 45
    const third  = defaultRodPlacement(100, [first, second]);
    // gaps between {0, 45, 90}: [0,45]=45 and [45,90]=45 → bisect first = 22.5
    expect(third.heightFromFloor).toBeCloseTo(22.5);
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

// ── redistributeShelves / addShelfRedistributed ───────────────────────────────

describe('addShelfRedistributed', () => {
  it('א: first shelf → bodyH/2', () => {
    const result = addShelfRedistributed([], 180);
    const shelves = result.filter(i => i.type === 'shelf');
    expect(shelves).toHaveLength(1);
    expect(shelves[0]!.heightFromFloor).toBeCloseTo(90);
  });

  it('ב: second shelf → 60 and 120', () => {
    const after1 = addShelfRedistributed([], 180);
    const after2 = addShelfRedistributed(after1, 180);
    const positions = after2
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeCloseTo(60);
    expect(positions[1]).toBeCloseTo(120);
  });

  it('ג: third shelf → 45, 90, 135', () => {
    let items = addShelfRedistributed([], 180);
    items = addShelfRedistributed(items, 180);
    items = addShelfRedistributed(items, 180);
    const positions = items
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(45);
    expect(positions[1]).toBeCloseTo(90);
    expect(positions[2]).toBeCloseTo(135);
  });

  it('ה: manual shelf stays, auto shelves redistribute in largest free zone above it', () => {
    // Manual shelf at 50 occupies [50, 51.8]. Free zones: [0,50] and [51.8,180].
    // Largest zone: [51.8, 180] (size 128.2). Two auto shelves divide it evenly.
    const initial: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 50, isManuallyPositioned: true },
      { type: 'shelf', id: 'b', heightFromFloor: 120, isManuallyPositioned: false },
    ];
    const result = addShelfRedistributed(initial, 180);
    const shelves = result.filter(i => i.type === 'shelf');
    const manualShelf = shelves.find(i => i.id === 'a');
    expect(manualShelf!.heightFromFloor).toBeCloseTo(50); // unchanged
    const autoPositions = shelves
      .filter(i => i.id !== 'a')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(autoPositions).toHaveLength(2);
    expect(autoPositions[0]).toBeCloseTo(51.8 + 128.2 / 3);  // ≈ 94.5
    expect(autoPositions[1]).toBeCloseTo(51.8 + 128.2 * 2 / 3); // ≈ 137.3
  });

  it('ח: drawer stays put when shelf added', () => {
    const drawer: InteriorItem = { type: 'drawer', id: 'dr', heightFromFloor: 30, drawerHeight: 20 };
    const result = addShelfRedistributed([drawer], 180);
    const foundDrawer = result.find(i => i.id === 'dr')!;
    expect(foundDrawer.type).toBe('drawer');
    expect(foundDrawer.heightFromFloor).toBe(30);
  });
});

describe('redistributeShelves — free-zone awareness', () => {
  it('bug: shelf no longer lands inside drawer (body 88.2, drawer at 34.1 h20)', () => {
    // Drawer zone [34.1, 54.1]. Free zones: [0,34.1] and [54.1,88.2] — equal size.
    // Tiebreaker: prefer higher zone → [54.1, 88.2]. Shelf at center = 71.15.
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 34.1, drawerHeight: 20 };
    const result = addShelfRedistributed([drawer], 88.2);
    const shelf = result.find(i => i.type === 'shelf')!;
    expect(shelf.heightFromFloor).toBeGreaterThanOrEqual(54.1);
    expect(shelf.heightFromFloor).toBeCloseTo((54.1 + 88.2) / 2); // 71.15
  });

  it('ד: rod at 170 → shelf lands in large zone [0, 168.5]', () => {
    // Rod zone [168.5, 171.5]. Largest free zone [0, 168.5].
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 170 };
    const result = addShelfRedistributed([rod], 180);
    const shelf = result.find(i => i.type === 'shelf')!;
    expect(shelf.heightFromFloor).toBeCloseTo(168.5 / 2); // 84.25
  });

  it('drawer + shelf → redistribution moves shelf above drawer', () => {
    // Body 180, drawer at [60,80]. Free zones: [0,60] and [80,180].
    // Largest: [80,180]. One auto shelf → center = 130.
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 60, drawerHeight: 20 };
    const shelf: InteriorItem  = { type: 'shelf',  id: 's', heightFromFloor: 90 };
    const result = redistributeShelves([drawer, shelf], 180);
    const found = result.find(i => i.id === 's')!;
    expect(found.heightFromFloor).toBeCloseTo(130);
  });

  it('no blockers → same even distribution as before', () => {
    let items = addShelfRedistributed([], 180);
    items = addShelfRedistributed(items, 180);
    items = addShelfRedistributed(items, 180);
    const positions = items
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(45);
    expect(positions[1]).toBeCloseTo(90);
    expect(positions[2]).toBeCloseTo(135);
  });

  it('two drawers → shelves land in largest gap between them', () => {
    // Body 200. Drawers at [10,30] and [150,170]. Gaps: [0,10], [30,150], [170,200].
    // Largest: [30,150] (size 120). Two shelves: 30+40=70 and 30+80=110.
    const d1: InteriorItem = { type: 'drawer', id: 'd1', heightFromFloor: 10, drawerHeight: 20 };
    const d2: InteriorItem = { type: 'drawer', id: 'd2', heightFromFloor: 150, drawerHeight: 20 };
    let items: InteriorItem[] = [d1, d2];
    items = addShelfRedistributed(items, 200);
    items = addShelfRedistributed(items, 200);
    const positions = items
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(70);
    expect(positions[1]).toBeCloseTo(110);
  });
});

describe('redistributeShelves', () => {
  it('ז: delete middle shelf from 3 → remaining 2 split evenly', () => {
    const items: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 45 },
      { type: 'shelf', id: 'b', heightFromFloor: 90 },
      { type: 'shelf', id: 'c', heightFromFloor: 135 },
    ];
    const filtered = items.filter(i => i.id !== 'b');
    const result = redistributeShelves(filtered, 180);
    const positions = result
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(60);
    expect(positions[1]).toBeCloseTo(120);
  });

  it('deleted manual shelf: remaining auto shelves redistribute normally', () => {
    const items: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 50, isManuallyPositioned: true },
      { type: 'shelf', id: 'b', heightFromFloor: 60 },
      { type: 'shelf', id: 'c', heightFromFloor: 120 },
    ];
    const filtered = items.filter(i => i.id !== 'a');
    const result = redistributeShelves(filtered, 180);
    const positions = result
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(60);
    expect(positions[1]).toBeCloseTo(120);
  });

  it('only manual shelves → no redistribution, items unchanged', () => {
    const items: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 30, isManuallyPositioned: true },
      { type: 'shelf', id: 'b', heightFromFloor: 80, isManuallyPositioned: true },
    ];
    const result = redistributeShelves(items, 180);
    const positions = result
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(30);
    expect(positions[1]).toBeCloseTo(80);
  });

  it('rod stays put when shelf redistributed', () => {
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 160 };
    const shelf: InteriorItem = { type: 'shelf', id: 's', heightFromFloor: 90 };
    const result = redistributeShelves([rod, shelf], 180);
    const foundRod = result.find(i => i.id === 'r')!;
    expect(foundRod.heightFromFloor).toBe(160);
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
