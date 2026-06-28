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
    const result = initInteriorFromBoxes(boxes);
    expect(result['b0']).toEqual([]);
    expect(result['b1']).toEqual([]);
  });

  it('plinth boxes are ignored', () => {
    const boxes: Box[] = [
      { id: 'b0', W: 60, H: 170, D: 60, position: 'single', level: 'single' },
      { id: 'b1', W: 60, H: 10,  D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes);
    expect(result['b0']).toEqual([]);
    expect(Object.keys(result)).not.toContain('b1');
  });

  it('converts internalShelves to body-relative ShelfItems', () => {
    // top body H=70, internalShelves are body-local: [50] = midH
    const boxes: Box[] = [
      { id: 'b0', W: 60, H: 70,  D: 60, position: 'single', level: 'top', internalShelves: [50] },
      { id: 'b1', W: 60, H: 165, D: 60, position: 'single', level: 'bottom' },
      { id: 'b2', W: 60, H: 5,   D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes);
    expect(result['b0']).toHaveLength(1);
    expect(result['b0']![0]!.type).toBe('shelf');
    expect((result['b0']![0] as { heightFromFloor: number }).heightFromFloor).toBeCloseTo(50);
  });

  it('multi-column: each box gets its own entry', () => {
    const boxes: Box[] = [
      { id: 'b0', W: 80, H: 70, D: 60, position: 'left',  level: 'top', internalShelves: [50] },
      { id: 'b1', W: 80, H: 70, D: 60, position: 'right', level: 'top', internalShelves: [50] },
      { id: 'b2', W: 60, H: 165, D: 60, position: 'single', level: 'bottom' },
      { id: 'b3', W: 60, H: 5,   D: 60, position: 'single', level: 'plinth' },
    ];
    const result = initInteriorFromBoxes(boxes);
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
    const result = initInteriorFromBoxes(boxes);
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
      { type: 'drawer', id: 'a', heightFromFloor: 20, drawerHeight: 20, mount: 'internal' },
    ];
    const shelf = defaultShelfPlacement(items, 100);
    // free: [0,20] (20) and [40,100] (60)
    expect(shelf.heightFromFloor).toBeCloseTo(70); // center of [40,100]
  });
});

// ── defaultDrawerPlacement ────────────────────────────────────────────────────

describe('defaultDrawerPlacement', () => {
  it('first drawer (no rod): centered in body', () => {
    const { drawer, warnings } = defaultDrawerPlacement([], 100);
    expect(drawer.type).toBe('drawer');
    expect(drawer.drawerHeight).toBe(20);
    expect(drawer.heightFromFloor).toBeCloseTo(40); // (100-20)/2
    expect(warnings).toEqual([]);
  });

  it('second drawer: 3cm gap below first', () => {
    const { drawer: first } = defaultDrawerPlacement([], 100);
    const { drawer: second } = defaultDrawerPlacement([first], 100);
    expect(second.heightFromFloor).toBeCloseTo(17); // 40-20-3
  });

  it('clamps to 0 when stacking below tiny body', () => {
    const { drawer: first } = defaultDrawerPlacement([], 30);
    const { drawer: second } = defaultDrawerPlacement([first], 30);
    expect(second.heightFromFloor).toBe(0);
  });

  it('drawer with rod: placed at rodH − 80 − drawerHeight (gap = 80)', () => {
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 160 };
    const { drawer, warnings } = defaultDrawerPlacement([rod], 170);
    // 160 − 80 − 20 = 60. Drawer top at 80, gap = 80.
    expect(drawer.heightFromFloor).toBeCloseTo(60);
    expect(warnings).toEqual([]);
  });

  it('drawer with high rod: room for default + extra → place at rodH − 80 − drawerH', () => {
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 250 };
    const { drawer, warnings } = defaultDrawerPlacement([rod], 300);
    expect(drawer.heightFromFloor).toBeCloseTo(150); // 250 − 80 − 20
    expect(warnings).toEqual([]);
  });

  it('drawer with rod too low for hanger → drawer at floor, rod_drawer_close warning', () => {
    // Body 80, rod at 70. desired drawerH = 70-80-20 = -30 → place at 0.
    // gap = 70 - 20 = 50 → warn.
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 70 };
    const { drawer, warnings } = defaultDrawerPlacement([rod], 80);
    expect(drawer.heightFromFloor).toBe(0);
    expect(warnings).toHaveLength(1);
    if (warnings[0]!.kind === 'rod_drawer_close') {
      expect(warnings[0]!.gap).toBe(50);
      expect(warnings[0]!.rodId).toBe('r');
    }
  });

  it('second drawer with rod: stacks below first (no rod-aware logic)', () => {
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 160 };
    const { drawer: first } = defaultDrawerPlacement([rod], 170);  // at 60
    const { drawer: second, warnings } = defaultDrawerPlacement([rod, first], 170);
    expect(second.heightFromFloor).toBeCloseTo(37); // 60-20-3
    expect(warnings).toEqual([]);
  });
});

// ── defaultRodPlacement ───────────────────────────────────────────────────────

describe('defaultRodPlacement', () => {
  it('rod at 10cm below ceiling when no drawer', () => {
    const { rod, warnings } = defaultRodPlacement(100);
    expect(rod.type).toBe('rod');
    expect(rod.heightFromFloor).toBe(90);
    expect(warnings).toEqual([]);
  });

  it('clamps to 0 for tiny body', () => {
    const { rod } = defaultRodPlacement(5);
    expect(rod.heightFromFloor).toBe(0);
  });

  it('second rod: center between first rod and floor', () => {
    const { rod: first } = defaultRodPlacement(100);
    const { rod: second } = defaultRodPlacement(100, [first]);
    expect(second.heightFromFloor).toBeCloseTo(45);
  });

  it('third rod: bisects largest remaining gap', () => {
    const { rod: first }  = defaultRodPlacement(100);          // 90
    const { rod: second } = defaultRodPlacement(100, [first]);  // 45
    const { rod: third }  = defaultRodPlacement(100, [first, second]);
    expect(third.heightFromFloor).toBeCloseTo(22.5);
  });

  it('rod with drawer below: default position fine → no warning', () => {
    // Body 200, drawer at 30 (top=50). Default rod at 190.
    // requiredH = 50 + 80 = 130. defaultH=190 already ≥ requiredH → place at 190.
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 30, drawerHeight: 20, mount: 'internal' };
    const { rod, warnings } = defaultRodPlacement(200, [drawer]);
    expect(rod.heightFromFloor).toBeCloseTo(190);
    expect(warnings).toEqual([]);
  });

  it('rod with drawer high enough to push rod up', () => {
    // Body 150, drawer at 50 (top=70). defaultH=140. requiredH = 70 + 80 = 150.
    // 150 ≤ bodyH → place at max(140, 150) = 150.
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 50, drawerHeight: 20, mount: 'internal' };
    const { rod, warnings } = defaultRodPlacement(150, [drawer]);
    expect(rod.heightFromFloor).toBeCloseTo(150);
    expect(warnings).toEqual([]);
  });

  it('rod with drawer that leaves no room: rod at default, warning emitted', () => {
    // Body 170, drawer at 75 (top=95). defaultH=160. requiredH = 95 + 80 = 175 > bodyH.
    // Place at 160. gap = 160 - 95 = 65 → warn (gap < 70).
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 75, drawerHeight: 20, mount: 'internal' };
    const { rod, warnings } = defaultRodPlacement(170, [drawer]);
    expect(rod.heightFromFloor).toBeCloseTo(160);
    expect(warnings).toHaveLength(1);
    if (warnings[0]!.kind === 'rod_drawer_close') {
      expect(warnings[0]!.gap).toBe(65);
      expect(warnings[0]!.drawerId).toBe('d');
    }
  });

  it('rod with drawer that leaves marginal room (gap 70-79): rod at default, no warning', () => {
    // Body 175, drawer at 25 (top=45). defaultH=165. requiredH = 45 + 80 = 125 ≤ bodyH.
    // Place at max(165, 125) = 165. gap = 165 - 45 = 120. No warning.
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 25, drawerHeight: 20, mount: 'internal' };
    const { rod, warnings } = defaultRodPlacement(175, [drawer]);
    expect(rod.heightFromFloor).toBeCloseTo(165);
    expect(warnings).toEqual([]);
  });
});

// ── validateInterior ──────────────────────────────────────────────────────────

describe('validateInterior', () => {
  it('valid items → no warnings', () => {
    const items: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 50 },
      { type: 'drawer', id: 'b', heightFromFloor: 10, drawerHeight: 20, mount: 'internal' },
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
      { type: 'drawer', id: 'a', heightFromFloor: 85, drawerHeight: 20, mount: 'internal' },
    ];
    const warnings = validateInterior(items, 100);
    expect(warnings.some(w => w.kind === 'outOfBounds')).toBe(true);
  });

  it('overlapping drawers → drawerOverlap warning', () => {
    const items: InteriorItem[] = [
      { type: 'drawer', id: 'a', heightFromFloor: 30, drawerHeight: 20, mount: 'internal' }, // [30,50]
      { type: 'drawer', id: 'b', heightFromFloor: 40, drawerHeight: 20, mount: 'internal' }, // [40,60] overlaps
    ];
    const warnings = validateInterior(items, 100);
    expect(warnings.some(w => w.kind === 'drawerOverlap')).toBe(true);
  });

  it('non-overlapping drawers → no drawerOverlap warning', () => {
    const items: InteriorItem[] = [
      { type: 'drawer', id: 'a', heightFromFloor: 30, drawerHeight: 20, mount: 'internal' }, // [30,50]
      { type: 'drawer', id: 'b', heightFromFloor: 53, drawerHeight: 20, mount: 'internal' }, // [53,73] 3cm gap
    ];
    expect(validateInterior(items, 100).filter(w => w.kind === 'drawerOverlap')).toHaveLength(0);
  });
});

// ── redistributeShelves / addShelfRedistributed ───────────────────────────────

describe('addShelfRedistributed', () => {
  it('א: first shelf → bodyH/2', () => {
    const { items } = addShelfRedistributed([], 180);
    const shelves = items.filter(i => i.type === 'shelf');
    expect(shelves).toHaveLength(1);
    expect(shelves[0]!.heightFromFloor).toBeCloseTo(90);
  });

  it('ב: second shelf → 60 and 120', () => {
    const { items: after1 } = addShelfRedistributed([], 180);
    const { items: after2 } = addShelfRedistributed(after1, 180);
    const positions = after2
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeCloseTo(60);
    expect(positions[1]).toBeCloseTo(120);
  });

  it('ג: third shelf → 45, 90, 135', () => {
    let items = addShelfRedistributed([], 180).items;
    items = addShelfRedistributed(items, 180).items;
    items = addShelfRedistributed(items, 180).items;
    const positions = items
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(45);
    expect(positions[1]).toBeCloseTo(90);
    expect(positions[2]).toBeCloseTo(135);
  });

  it('ה: manual shelf stays, auto shelves split round-robin across zones', () => {
    // Manual shelf at 50 occupies [50, 51.8]. Free zones: [0,50] (size 50) and
    // [51.8,180] (size 128.2). Round-robin (sorted desc): shelf 1 → upper zone,
    // shelf 2 → lower zone.
    const initial: InteriorItem[] = [
      { type: 'shelf', id: 'a', heightFromFloor: 50, isManuallyPositioned: true },
      { type: 'shelf', id: 'b', heightFromFloor: 120, isManuallyPositioned: false },
    ];
    const { items } = addShelfRedistributed(initial, 180);
    const shelves = items.filter(i => i.type === 'shelf');
    const manualShelf = shelves.find(i => i.id === 'a');
    expect(manualShelf!.heightFromFloor).toBeCloseTo(50); // unchanged
    const autoPositions = shelves
      .filter(i => i.id !== 'a')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(autoPositions).toHaveLength(2);
    expect(autoPositions[0]).toBeCloseTo(25);                // lower zone center
    expect(autoPositions[1]).toBeCloseTo(51.8 + 128.2 / 2);  // ≈ 115.9
  });

  it('ח: drawer stays put when shelf added', () => {
    const drawer: InteriorItem = { type: 'drawer', id: 'dr', heightFromFloor: 30, drawerHeight: 20, mount: 'internal' };
    const { items } = addShelfRedistributed([drawer], 180);
    const foundDrawer = items.find(i => i.id === 'dr')!;
    expect(foundDrawer.type).toBe('drawer');
    expect(foundDrawer.heightFromFloor).toBe(30);
  });
});

describe('redistributeShelves — free-zone awareness', () => {
  it('bug: shelf no longer lands inside drawer (body 88.2, drawer at 34.1 h20)', () => {
    // Drawer zone [34.1, 54.1]. Free zones: [0,34.1] and [54.1,88.2] — equal size.
    // Tiebreaker: prefer higher zone → [54.1, 88.2]. Shelf at center = 71.15.
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 34.1, drawerHeight: 20, mount: 'internal' };
    const { items } = addShelfRedistributed([drawer], 88.2);
    const shelf = items.find(i => i.type === 'shelf')!;
    expect(shelf.heightFromFloor).toBeGreaterThanOrEqual(54.1);
    expect(shelf.heightFromFloor).toBeCloseTo(71.2, 1); // (54.1+88.2)/2 rounded to 1 decimal
  });

  it('drawer + shelf → redistribution moves shelf above drawer', () => {
    // Body 180, drawer at [60,80]. Free zones: [0,60] and [80,180].
    // Largest: [80,180]. One auto shelf → center = 130.
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 60, drawerHeight: 20, mount: 'internal' };
    const shelf: InteriorItem  = { type: 'shelf',  id: 's', heightFromFloor: 90 };
    const { items } = redistributeShelves([drawer, shelf], 180);
    const found = items.find(i => i.id === 's')!;
    expect(found.heightFromFloor).toBeCloseTo(130);
  });

  it('no blockers → even distribution', () => {
    let items = addShelfRedistributed([], 180).items;
    items = addShelfRedistributed(items, 180).items;
    items = addShelfRedistributed(items, 180).items;
    const positions = items
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(45);
    expect(positions[1]).toBeCloseTo(90);
    expect(positions[2]).toBeCloseTo(135);
  });

  it('two drawers + two shelves → round-robin across two valid zones', () => {
    // Body 200. Drawers at [10,30] and [150,170]. Free zones (sizes):
    // [0,10] (10) — too small, [30,150] (120), [170,200] (30).
    // Round-robin between [30,150] and [170,200]: shelf 1 → big zone (center 90),
    // shelf 2 → small zone (center 185).
    const d1: InteriorItem = { type: 'drawer', id: 'd1', heightFromFloor: 10, drawerHeight: 20, mount: 'internal' };
    const d2: InteriorItem = { type: 'drawer', id: 'd2', heightFromFloor: 150, drawerHeight: 20, mount: 'internal' };
    let items: InteriorItem[] = [d1, d2];
    items = addShelfRedistributed(items, 200).items;
    items = addShelfRedistributed(items, 200).items;
    const positions = items
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(90);
    expect(positions[1]).toBeCloseTo(185);
  });
});

describe('redistributeShelves — hanger logic', () => {
  it('rod ≥80, no drawer → first shelf at rod − 80', () => {
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 170 };
    const { items, warnings } = addShelfRedistributed([rod], 180);
    const shelf = items.find(i => i.type === 'shelf')!;
    expect(shelf.heightFromFloor).toBeCloseTo(90); // 170 − 80
    expect(warnings).toEqual([]);
  });

  it('rod at exactly 80, no drawer → first shelf at 0', () => {
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 80 };
    const { items, warnings } = addShelfRedistributed([rod], 180);
    const shelf = items.find(i => i.type === 'shelf')!;
    expect(shelf.heightFromFloor).toBeCloseTo(0);
    expect(warnings).toEqual([]);
  });

  it('rod <80 → rod_low warning, no hanger shelf, round-robin in available zone', () => {
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 60 };
    const { items, warnings } = addShelfRedistributed([rod], 180);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toEqual({ kind: 'rod_low', rodHeight: 60, rodId: 'r' });
    const shelf = items.find(i => i.type === 'shelf')!;
    // Free zones (rod at 60 with ±1.5 → [58.5, 61.5]): [0, 58.5] and [61.5, 180]
    // Largest [61.5, 180] (size 118.5). Single shelf at center, rounded to 1 decimal.
    expect(shelf.heightFromFloor).toBeCloseTo(120.8, 1); // (61.5+180)/2 = 120.75
  });

  it('rod + drawer below rod → shelf always below drawer (consistent regardless of gap)', () => {
    // Body 250, rod at 200, drawer at 80 (top 100). gap = 100 (≥80, no warning).
    // Drawer top serves as hanger floor → first shelf below drawer at 80/2 = 40.
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 200 };
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 80, drawerHeight: 20, mount: 'internal' };
    const { items, warnings } = addShelfRedistributed([rod, drawer], 250);
    const shelf = items.find(i => i.type === 'shelf')!;
    expect(shelf.heightFromFloor).toBeCloseTo(40);
    expect(warnings).toEqual([]);
  });

  it('rod + drawer gap in 70–80 → first shelf below drawer, no warning', () => {
    // Body 200, rod at 155, drawer at 60 (top 80). gap = 75 (70–80, no warning).
    // Drawer top is the hanger floor; first shelf below drawer at 60/2 = 30.
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 155 };
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 60, drawerHeight: 20, mount: 'internal' };
    const { items, warnings } = addShelfRedistributed([rod, drawer], 200);
    const shelf = items.find(i => i.type === 'shelf')!;
    expect(shelf.heightFromFloor).toBeCloseTo(30);
    expect(warnings).toEqual([]);
  });

  it('rod + drawer gap <70 → rod_drawer_close warning', () => {
    // Rod at 100, drawer at 30 (top 50). gap = 50 (<70) → rod_drawer_close.
    // Shelf still placed below drawer at 30/2 = 15. Tight spacing may also
    // trigger a small_zone warning (acceptable; both warnings are informative).
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 100 };
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 30, drawerHeight: 20, mount: 'internal' };
    const { items, warnings } = addShelfRedistributed([rod, drawer], 180);
    expect(warnings.some(w => w.kind === 'rod_drawer_close')).toBe(true);
    const w = warnings.find(w => w.kind === 'rod_drawer_close')!;
    if (w.kind === 'rod_drawer_close') {
      expect(w.gap).toBe(50);
      expect(w.rodId).toBe('r');
      expect(w.drawerId).toBe('d');
    }
    const shelf = items.find(i => i.type === 'shelf')!;
    expect(shelf.heightFromFloor).toBeCloseTo(15);
  });

  it('bug2: shelf placement is identical regardless of add order', () => {
    // Same items, two orderings; the shelf must end up in the same place.
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 200 };
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 80, drawerHeight: 20, mount: 'internal' };
    const a = addShelfRedistributed([rod, drawer], 250).items.find(i => i.type === 'shelf')!;
    const b = addShelfRedistributed([drawer, rod], 250).items.find(i => i.type === 'shelf')!;
    expect(a.heightFromFloor).toBe(b.heightFromFloor);
    expect(a.heightFromFloor).toBeLessThan(80); // below drawer in both cases
  });

  it('multiple shelves with hanger: first = hanger, rest = round-robin', () => {
    // Rod at 180, body 200. Add 3 shelves.
    // First shelf becomes hanger at 100 (180 − 80).
    // After hanger placed: blockers = rod[178.5, 181.5] + hanger[100, 101.8]
    // Free zones: [0, 100], [101.8, 178.5]. Round-robin for 2 remaining:
    //   shelf 2 → larger zone, shelf 3 → smaller zone.
    let items: InteriorItem[] = [{ type: 'rod', id: 'r', heightFromFloor: 180 }];
    items = addShelfRedistributed(items, 200).items;
    items = addShelfRedistributed(items, 200).items;
    items = addShelfRedistributed(items, 200).items;
    const positions = items
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions).toHaveLength(3);
    expect(positions).toContain(100);  // hanger shelf at exactly 100
  });

  it('rod stays put when shelf redistributed', () => {
    const rod: InteriorItem = { type: 'rod', id: 'r', heightFromFloor: 160 };
    const shelf: InteriorItem = { type: 'shelf', id: 's', heightFromFloor: 90 };
    const { items } = redistributeShelves([rod, shelf], 180);
    const foundRod = items.find(i => i.id === 'r')!;
    expect(foundRod.heightFromFloor).toBe(160);
  });
});

// ── Regression: shelf added after rod + external drawer ─────────────────────
// Bug (before convention fix): the external drawer was stored with
// heightFromFloor=10 (center). The hanger-shelf branch then placed a new
// shelf at drawer.heightFromFloor/2 = 5cm — INSIDE the drawer's 0..20 zone.
// After the fix: external heightFromFloor=0 (bottom), the `drawerBottom > 0`
// guard (line 449 in interiorUtils) fails, no hanger shelf is forced into a
// non-existent below-drawer space, and the auto shelf lands in the real free
// zone above the drawer.

describe('redistributeShelves — regression: rod + external drawer + new shelf', () => {
  it('new shelf lands above the external drawer, not inside it', () => {
    const items: InteriorItem[] = [
      { type: 'rod', id: 'r', heightFromFloor: 90 },
      { type: 'drawer', id: 'd', heightFromFloor: 0, drawerHeight: 20, mount: 'external' },
      { type: 'shelf', id: 'f', heightFromFloor: 18.2, isFixedAboveExternals: true },
    ];
    const { items: result } = addShelfRedistributed(items, 100);
    const autoShelves = result.filter(
      (i): i is { type: 'shelf'; id: string; heightFromFloor: number; isFixedAboveExternals?: boolean } =>
        i.type === 'shelf' && (i as { isFixedAboveExternals?: boolean }).isFixedAboveExternals !== true,
    );
    expect(autoShelves).toHaveLength(1);
    // The drawer occupies 0..20; fixed shelf at 18.2..20. Free zone above:
    // [20, 100]. Auto shelf must land within this zone — well above the drawer.
    expect(autoShelves[0]!.heightFromFloor).toBeGreaterThanOrEqual(20);
    expect(autoShelves[0]!.heightFromFloor).toBeLessThanOrEqual(90);
  });
});

describe('redistributeShelves — small zone warnings (post-placement)', () => {
  it('emits small_zone warning when two items are <25cm apart', () => {
    // Body 200. Two drawers leave a 10cm gap between them.
    // d1 physical [10, 30], d2 physical [40, 60] → gap 10cm < 25.
    const d1: InteriorItem = { type: 'drawer', id: 'd1', heightFromFloor: 10, drawerHeight: 20, mount: 'internal' };
    const d2: InteriorItem = { type: 'drawer', id: 'd2', heightFromFloor: 40, drawerHeight: 20, mount: 'internal' };
    const { warnings } = addShelfRedistributed([d1, d2], 200);
    expect(warnings.some(w => w.kind === 'small_zone')).toBe(true);
  });

  it('no small_zone warning when all items are ≥25cm apart', () => {
    const drawer: InteriorItem = { type: 'drawer', id: 'd', heightFromFloor: 60, drawerHeight: 20, mount: 'internal' };
    const { warnings } = addShelfRedistributed([drawer], 180);
    expect(warnings.filter(w => w.kind === 'small_zone')).toHaveLength(0);
  });

  it('bug1: cramming 3 shelves in a 70cm body → small_zone warning', () => {
    // Inter-shelf gaps after round-robin are ~15.7cm (<25cm).
    let items = addShelfRedistributed([], 70).items;
    items = addShelfRedistributed(items, 70).items;
    const result = addShelfRedistributed(items, 70);
    expect(result.warnings.some(w => w.kind === 'small_zone')).toBe(true);
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
    const { items: result } = redistributeShelves(filtered, 180);
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
    const { items: result } = redistributeShelves(filtered, 180);
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
    const { items: result } = redistributeShelves(items, 180);
    const positions = result
      .filter(i => i.type === 'shelf')
      .map(i => i.heightFromFloor)
      .sort((a, b) => a - b);
    expect(positions[0]).toBeCloseTo(30);
    expect(positions[1]).toBeCloseTo(80);
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
      { type: 'drawer', id: 'a', heightFromFloor: 70, drawerHeight: 20, mount: 'internal' }, // top=90
    ];
    expect(filterItemsForHeight(items, 85)).toHaveLength(0);
    expect(filterItemsForHeight(items, 95)).toHaveLength(1);
  });
});
