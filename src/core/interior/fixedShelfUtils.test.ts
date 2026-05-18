import { describe, it, expect } from 'vitest';
import {
  calcFixedShelfHeight,
  hasFixedShelf,
  findFixedShelf,
  syncFixedShelf,
} from './fixedShelfUtils';
import type { InteriorItem, DrawerItem, ShelfItem } from '../../types/interior';

// ── Test fixtures ────────────────────────────────────────────────────────────

function ext(id: string, hf: number, h: number): DrawerItem {
  return { type: 'drawer', id, heightFromFloor: hf, drawerHeight: h, mount: 'external' };
}

function intDrawer(id: string, hf: number, h: number): DrawerItem {
  return { type: 'drawer', id, heightFromFloor: hf, drawerHeight: h, mount: 'internal' };
}

function shelf(id: string, hf: number, opts: Partial<ShelfItem> = {}): ShelfItem {
  return { type: 'shelf', id, heightFromFloor: hf, ...opts };
}

const GAP = 2;       // mm
const THICK = 1.8;   // cm

// ── calcFixedShelfHeight ──────────────────────────────────────────────────────

describe('calcFixedShelfHeight', () => {
  it('1 drawer: top = drawerHeight, shelf bottom = top − thickness', () => {
    // top = 20; shelf bottom = 20 − 1.8 = 18.2
    expect(calcFixedShelfHeight([ext('a', 0, 20)], GAP, THICK)).toBeCloseTo(18.2);
  });

  it('2 drawers: top = sum + 1×gap = 40.2, shelf bottom = 38.4', () => {
    const drawers = [ext('a', 0, 20), ext('b', 0, 20)];
    // top = 20+20 + (2-1)*0.2 = 40.2; bottom = 40.2 − 1.8 = 38.4
    expect(calcFixedShelfHeight(drawers, GAP, THICK)).toBeCloseTo(38.4);
  });

  it('3 drawers of mixed height', () => {
    const drawers = [ext('a', 0, 20), ext('b', 0, 15), ext('c', 0, 10)];
    // top = 20+15+10 + (3-1)*0.2 = 45.4; bottom = 43.6
    expect(calcFixedShelfHeight(drawers, GAP, THICK)).toBeCloseTo(43.6);
  });

  it('empty list returns 0 (defensive)', () => {
    expect(calcFixedShelfHeight([], GAP, THICK)).toBe(0);
  });

  it('different shelf thickness propagates', () => {
    // top = 20; bottom = 20 − 1.2 = 18.8
    expect(calcFixedShelfHeight([ext('a', 0, 20)], GAP, 1.2)).toBeCloseTo(18.8);
  });
});

// ── hasFixedShelf / findFixedShelf ────────────────────────────────────────────

describe('hasFixedShelf / findFixedShelf', () => {
  it('empty list: false / undefined', () => {
    expect(hasFixedShelf([])).toBe(false);
    expect(findFixedShelf([])).toBeUndefined();
  });

  it('regular shelves only: false / undefined', () => {
    const items: InteriorItem[] = [shelf('a', 50), shelf('b', 100, { isManuallyPositioned: true })];
    expect(hasFixedShelf(items)).toBe(false);
    expect(findFixedShelf(items)).toBeUndefined();
  });

  it('one fixed shelf: true / returns the shelf', () => {
    const items: InteriorItem[] = [
      shelf('a', 50),
      shelf('fix', 38.4, { isFixedAboveExternals: true }),
    ];
    expect(hasFixedShelf(items)).toBe(true);
    expect(findFixedShelf(items)?.id).toBe('fix');
  });
});

// ── syncFixedShelf decision table ─────────────────────────────────────────────

describe('syncFixedShelf', () => {
  it('newCount=0, no fixed shelf: items unchanged', () => {
    const before: InteriorItem[] = [shelf('s1', 50)];
    const after:  InteriorItem[] = [shelf('s1', 50)];
    expect(syncFixedShelf(before, after, GAP, THICK)).toBe(after);
  });

  it('newCount=0, fixed shelf exists: fixed shelf removed', () => {
    const before: InteriorItem[] = [ext('d', 0, 20), shelf('fix', 18.2, { isFixedAboveExternals: true })];
    const after:  InteriorItem[] = [shelf('fix', 18.2, { isFixedAboveExternals: true })]; // user removed drawer
    const out = syncFixedShelf(before, after, GAP, THICK);
    expect(out.some(i => i.id === 'fix')).toBe(false);
  });

  it('first external added (newCount=1, oldCount=0, no fixed): create fixed shelf', () => {
    const before: InteriorItem[] = [];
    const after:  InteriorItem[] = [ext('d', 0, 20)];
    const out = syncFixedShelf(before, after, GAP, THICK);
    expect(out).toHaveLength(2);
    const fixed = findFixedShelf(out);
    expect(fixed).toBeDefined();
    expect(fixed!.heightFromFloor).toBeCloseTo(18.2); // 20 − 1.8
    expect(fixed!.isFixedAboveExternals).toBe(true);
    // appended at end
    expect(out[out.length - 1]!.id).toBe(fixed!.id);
  });

  it('second external added (newCount=2, oldCount=1, existing fixed): update height', () => {
    const before: InteriorItem[] = [
      ext('d1', 0, 20),
      shelf('fix', 18.2, { isFixedAboveExternals: true }),
    ];
    const after:  InteriorItem[] = [
      ext('d1', 0, 20),
      ext('d2', 0, 20),
      shelf('fix', 18.2, { isFixedAboveExternals: true }),
    ];
    const out = syncFixedShelf(before, after, GAP, THICK);
    const fixed = findFixedShelf(out);
    // 2 drawers: top = 40.2; bottom = 38.4
    expect(fixed!.heightFromFloor).toBeCloseTo(38.4);
    expect(fixed!.id).toBe('fix'); // same id preserved
  });

  it('manual removal then add another external: do NOT recreate', () => {
    // Previous state had 1 external + fixed shelf; user removed fixed shelf
    // (oldCount=1, oldHasFixed=false); now adding 2nd external.
    const before: InteriorItem[] = [ext('d1', 0, 20)];
    const after:  InteriorItem[] = [ext('d1', 0, 20), ext('d2', 0, 20)];
    const out = syncFixedShelf(before, after, GAP, THICK);
    expect(hasFixedShelf(out)).toBe(false);
  });

  it('removing last external: fixed shelf goes away', () => {
    const before: InteriorItem[] = [
      ext('d', 0, 20),
      shelf('fix', 18.2, { isFixedAboveExternals: true }),
    ];
    const after:  InteriorItem[] = [shelf('fix', 18.2, { isFixedAboveExternals: true })];
    const out = syncFixedShelf(before, after, GAP, THICK);
    expect(out).toHaveLength(0);
  });

  it('drawer height change with existing fixed: height updates', () => {
    const before: InteriorItem[] = [
      ext('d', 0, 20),
      shelf('fix', 18.2, { isFixedAboveExternals: true }),
    ];
    const after:  InteriorItem[] = [
      ext('d', 0, 30), // user enlarged drawer
      shelf('fix', 18.2, { isFixedAboveExternals: true }),
    ];
    const out = syncFixedShelf(before, after, GAP, THICK);
    const fixed = findFixedShelf(out);
    expect(fixed!.heightFromFloor).toBeCloseTo(28.2); // 30 − 1.8
  });

  it('internal drawers do not trigger fixed-shelf creation', () => {
    const before: InteriorItem[] = [];
    const after:  InteriorItem[] = [intDrawer('d', 30, 20)];
    const out = syncFixedShelf(before, after, GAP, THICK);
    expect(hasFixedShelf(out)).toBe(false);
    expect(out).toHaveLength(1);
  });

  it('manual shelves coexist with auto-created fixed shelf', () => {
    const before: InteriorItem[] = [shelf('manual', 100, { isManuallyPositioned: true })];
    const after:  InteriorItem[] = [
      shelf('manual', 100, { isManuallyPositioned: true }),
      ext('d', 0, 20),
    ];
    const out = syncFixedShelf(before, after, GAP, THICK);
    expect(out).toHaveLength(3); // manual + drawer + new fixed
    expect(hasFixedShelf(out)).toBe(true);
  });
});
