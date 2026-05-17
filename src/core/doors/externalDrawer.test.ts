import { describe, it, expect } from 'vitest';
import type { InteriorItem, DrawerItem } from '../../types/interior';
import {
  getExternalDrawers,
  calcExternalStackHeight,
  calcMainDoorHeight,
  validateMainDoorHeight,
  isExternalDrawer,
  cellIndexToFrontIndex,
  getSkirtCoveringDrawer,
  getDrawerFrontThicknessCm,
} from './doorUtils';
import { calcExternalDrawerFrontCuts } from '../cuts/externalDrawerCuts';

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeDrawer(
  id: string,
  heightFromFloor: number,
  drawerHeight: number,
  mount: 'internal' | 'external',
): DrawerItem {
  return { type: 'drawer', id, heightFromFloor, drawerHeight, mount };
}

// ── getExternalDrawers ────────────────────────────────────────────────────────

describe('getExternalDrawers', () => {
  it('returns empty array when no items', () => {
    expect(getExternalDrawers([])).toEqual([]);
  });

  it('filters out internal drawers and non-drawer items', () => {
    const items: InteriorItem[] = [
      makeDrawer('a', 0, 20, 'internal'),
      makeDrawer('b', 20, 15, 'external'),
      { type: 'shelf', id: 's', heightFromFloor: 50 },
      makeDrawer('c', 40, 25, 'external'),
    ];
    const result = getExternalDrawers(items);
    expect(result.map(d => d.id)).toEqual(['b', 'c']);
  });

  it('sorts by heightFromFloor ascending (lowest first)', () => {
    const items: InteriorItem[] = [
      makeDrawer('top',    50, 20, 'external'),
      makeDrawer('bot',     0, 20, 'external'),
      makeDrawer('mid',    25, 20, 'external'),
    ];
    expect(getExternalDrawers(items).map(d => d.id)).toEqual(['bot', 'mid', 'top']);
  });
});

// ── isExternalDrawer ──────────────────────────────────────────────────────────

describe('isExternalDrawer', () => {
  it('returns true only for external drawers', () => {
    expect(isExternalDrawer(makeDrawer('a', 0, 20, 'external'))).toBe(true);
    expect(isExternalDrawer(makeDrawer('a', 0, 20, 'internal'))).toBe(false);
    expect(isExternalDrawer({ type: 'shelf', id: 's', heightFromFloor: 0 })).toBe(false);
    expect(isExternalDrawer({ type: 'rod',   id: 'r', heightFromFloor: 0 })).toBe(false);
  });
});

// ── calcExternalStackHeight ───────────────────────────────────────────────────

describe('calcExternalStackHeight', () => {
  it('returns 0 with no external drawers', () => {
    expect(calcExternalStackHeight([], 2)).toBe(0);
    expect(calcExternalStackHeight([makeDrawer('a', 0, 20, 'internal')], 2)).toBe(0);
  });

  it('1 external drawer: sum + 1*gap', () => {
    // 20cm + 0.2cm = 20.2
    const items: InteriorItem[] = [makeDrawer('a', 0, 20, 'external')];
    expect(calcExternalStackHeight(items, 2)).toBeCloseTo(20.2);
  });

  it('3 external drawers of 20cm with gap=2mm: 60 + 3*0.2 = 60.6', () => {
    const items: InteriorItem[] = [
      makeDrawer('a', 0,  20, 'external'),
      makeDrawer('b', 20, 20, 'external'),
      makeDrawer('c', 40, 20, 'external'),
    ];
    expect(calcExternalStackHeight(items, 2)).toBeCloseTo(60.6);
  });

  it('mixed external + internal: only externals count', () => {
    const items: InteriorItem[] = [
      makeDrawer('a', 0,  20, 'external'),
      makeDrawer('b', 30, 30, 'internal'),
      makeDrawer('c', 60, 15, 'external'),
    ];
    // 20 + 15 + 2*0.2 = 35.4
    expect(calcExternalStackHeight(items, 2)).toBeCloseTo(35.4);
  });
});

// ── calcMainDoorHeight ────────────────────────────────────────────────────────

describe('calcMainDoorHeight', () => {
  it('no externals: equals getDoorHeight', () => {
    // box.H=100, gap=2mm, both gaps → doorH = 100 - 0.2 - 0.2 = 99.6
    expect(calcMainDoorHeight(100, [], 2)).toBeCloseTo(99.6);
  });

  it('1 external drawer of 20cm: 99.6 - 20.2 = 79.4', () => {
    const items: InteriorItem[] = [makeDrawer('a', 0, 20, 'external')];
    expect(calcMainDoorHeight(100, items, 2)).toBeCloseTo(79.4);
  });

  it('hasBottomGap=false: full top side only', () => {
    // box.H=100, gap=2mm, no bottom gap → frontArea = 100 - 0.2 = 99.8
    expect(calcMainDoorHeight(100, [], 2, false, true)).toBeCloseTo(99.8);
  });

  it('scenario (i): 2 externals filling exactly the body → mainDoor ≤ 0', () => {
    // box.H=40.6 cm, gap=2mm. Two 20cm externals: stack=40.4. frontArea=40.2.
    // mainDoor = 40.2 - 40.4 = -0.2 (≤ 0 → absent).
    const items: InteriorItem[] = [
      makeDrawer('a', 0,  20, 'external'),
      makeDrawer('b', 20, 20, 'external'),
    ];
    const main = calcMainDoorHeight(40.6, items, 2);
    expect(main).toBeLessThanOrEqual(0);
  });

  it('scenario (ii): 3 externals leaving small main → 0 < mainDoor < 10 (warning)', () => {
    // box.H = 64 cm, gap=2mm. 3x20 + 3*0.2 = 60.6. frontArea = 64 - 0.4 = 63.6.
    // mainDoor = 63.6 - 60.6 = 3
    const items: InteriorItem[] = [
      makeDrawer('a', 0,  20, 'external'),
      makeDrawer('b', 20, 20, 'external'),
      makeDrawer('c', 40, 20, 'external'),
    ];
    const main = calcMainDoorHeight(64, items, 2);
    expect(main).toBeCloseTo(3);
    expect(main).toBeGreaterThan(0);
    expect(main).toBeLessThan(10);
  });

  it('scenario (iii): 4 externals exceeding body → mainDoor < 0', () => {
    // box.H = 60, gap=2mm. 4x20 + 4*0.2 = 80.8. frontArea = 59.6.
    // mainDoor = 59.6 - 80.8 = −21.2
    const items: InteriorItem[] = [
      makeDrawer('a', 0,  20, 'external'),
      makeDrawer('b', 20, 20, 'external'),
      makeDrawer('c', 40, 20, 'external'),
      makeDrawer('d', 60, 20, 'external'),
    ];
    const main = calcMainDoorHeight(60, items, 2);
    expect(main).toBeLessThan(0);
  });
});

// ── validateMainDoorHeight ────────────────────────────────────────────────────

describe('validateMainDoorHeight', () => {
  it('returns main_door_absent for ≤0', () => {
    expect(validateMainDoorHeight(0)).toBe('main_door_absent');
    expect(validateMainDoorHeight(-5)).toBe('main_door_absent');
  });

  it('returns main_door_too_short for 0 < h < 10', () => {
    expect(validateMainDoorHeight(0.1)).toBe('main_door_too_short');
    expect(validateMainDoorHeight(5)).toBe('main_door_too_short');
    expect(validateMainDoorHeight(9.99)).toBe('main_door_too_short');
  });

  it('returns null for h ≥ 10', () => {
    expect(validateMainDoorHeight(10)).toBeNull();
    expect(validateMainDoorHeight(50)).toBeNull();
    expect(validateMainDoorHeight(200)).toBeNull();
  });
});

// ── cellIndexToFrontIndex ─────────────────────────────────────────────────────

describe('cellIndexToFrontIndex', () => {
  it('cellIndex 0 (right) → frontIndex = numFronts − 1', () => {
    expect(cellIndexToFrontIndex(0, 2)).toBe(1);
    expect(cellIndexToFrontIndex(0, 3)).toBe(2);
  });

  it('cellIndex 1 (left) → frontIndex = 0', () => {
    expect(cellIndexToFrontIndex(1, 2)).toBe(0);
    expect(cellIndexToFrontIndex(1, 3)).toBe(0);
  });
});

// ── getSkirtCoveringDrawer ────────────────────────────────────────────────────

describe('getSkirtCoveringDrawer', () => {
  it('returns null when mainDoorCoversSkirt is false', () => {
    const items: InteriorItem[] = [makeDrawer('a', 0, 20, 'external')];
    expect(getSkirtCoveringDrawer(items, false)).toBeNull();
  });

  it('returns null when no external drawers', () => {
    expect(getSkirtCoveringDrawer([], true)).toBeNull();
    expect(getSkirtCoveringDrawer([makeDrawer('a', 0, 20, 'internal')], true)).toBeNull();
  });

  it('returns the lowest external when coversSkirt is true', () => {
    const items: InteriorItem[] = [
      makeDrawer('top', 50, 20, 'external'),
      makeDrawer('bot',  0, 20, 'external'),
      makeDrawer('mid', 25, 20, 'external'),
    ];
    expect(getSkirtCoveringDrawer(items, true)?.id).toBe('bot');
  });

  it('ignores internal drawers when picking the lowest', () => {
    const items: InteriorItem[] = [
      makeDrawer('internal-bot', 0, 20, 'internal'),
      makeDrawer('external-mid', 25, 20, 'external'),
    ];
    expect(getSkirtCoveringDrawer(items, true)?.id).toBe('external-mid');
  });
});

// ── getDrawerFrontThicknessCm ─────────────────────────────────────────────────

describe('getDrawerFrontThicknessCm', () => {
  it('returns global thickness when no override (external)', () => {
    const d = makeDrawer('a', 0, 20, 'external');
    // mdf18 is 18mm = 1.8cm
    expect(getDrawerFrontThicknessCm(d, 'mdf18')).toBeCloseTo(1.8);
  });

  it('returns override thickness when set (external)', () => {
    const d: DrawerItem = {
      ...makeDrawer('a', 0, 20, 'external'),
      frontThicknessOverride: 'mdf12',  // 12mm = 1.2cm
    };
    expect(getDrawerFrontThicknessCm(d, 'mdf18')).toBeCloseTo(1.2);
  });

  it('internal drawers ignore frontThicknessOverride and return global', () => {
    const d: DrawerItem = {
      ...makeDrawer('a', 0, 20, 'internal'),
      frontThicknessOverride: 'mdf12',
    };
    expect(getDrawerFrontThicknessCm(d, 'mdf18')).toBeCloseTo(1.8);
  });
});

// ── calcExternalDrawerFrontCuts ───────────────────────────────────────────────

describe('calcExternalDrawerFrontCuts', () => {
  it('returns empty array when no externals', () => {
    const items: InteriorItem[] = [makeDrawer('a', 0, 20, 'internal')];
    expect(calcExternalDrawerFrontCuts(items, 60, 2, 0, false, 18)).toEqual([]);
  });

  it('1 external (no skirt cover): one cut with drawerHeight as panel height', () => {
    const items: InteriorItem[] = [makeDrawer('a', 0, 20, 'external')];
    const cuts = calcExternalDrawerFrontCuts(items, 60, 2, 0, false, 18);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.qty).toBe(1);
    expect(cuts[0]!.w).toBe(600);  // 60cm → 600mm
    expect(cuts[0]!.h).toBe(200);  // 20cm → 200mm
    expect(cuts[0]!.group).toBe('front');
    expect(cuts[0]!.note).toBe('18mm');
  });

  it('lowest external covers skirt when mainDoorCoversSkirt + plinth>0', () => {
    // plinth=10cm, gap=2mm → visualH = 20 + (10−1) + 0.2 = 29.2 cm
    const items: InteriorItem[] = [
      makeDrawer('bot',  0, 20, 'external'),
      makeDrawer('top', 25, 15, 'external'),
    ];
    const cuts = calcExternalDrawerFrontCuts(items, 60, 2, 10, true, 18);
    expect(cuts).toHaveLength(2);
    // Lowest (id='bot') is iterated first
    expect(cuts[0]!.h).toBeCloseTo(292); // 29.2cm → 292mm
    expect(cuts[1]!.h).toBe(150);        // 15cm → 150mm (not skirt-covering)
  });

  it('per-drawer thickness override is applied in note', () => {
    const items: InteriorItem[] = [
      makeDrawer('a', 0, 20, 'external'),
      makeDrawer('b', 20, 20, 'external'),
    ];
    const overrides = new Map([['b', 12]]);
    const cuts = calcExternalDrawerFrontCuts(items, 60, 2, 0, false, 18, overrides);
    expect(cuts[0]!.note).toBe('18mm');  // 'a' uses global
    expect(cuts[1]!.note).toBe('12mm');  // 'b' uses override
  });
});
