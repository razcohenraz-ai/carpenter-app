import { describe, it, expect } from 'vitest';
import { deriveDrawerFronts, getDrawerFrontVisualHeight } from './doorUtils';
import type { Box } from '../../types/geometry';
import type { DrawerItem, InteriorItem } from '../../types/interior';

// ── Test fixtures ────────────────────────────────────────────────────────────

function box(id: string, W: number, H: number, level: Box['level'] = 'single', position: Box['position'] = 'single'): Box {
  return { id, W, H, D: 60, position, level };
}

function ext(id: string, hf: number, h: number): DrawerItem {
  return { type: 'drawer', id, heightFromFloor: hf, drawerHeight: h, mount: 'external' };
}

function int(id: string, hf: number, h: number): DrawerItem {
  return { type: 'drawer', id, heightFromFloor: hf, drawerHeight: h, mount: 'internal' };
}

const baseInput = {
  doorCoversPlinth: false,
  doorGapMm: 2,
  tBody: 1.8,
};

// ── No externals → empty map ──────────────────────────────────────────────────

describe('deriveDrawerFronts — no externals', () => {
  it('empty interior → empty map', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200)],
      interiorById: { b0: [] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('only internal drawers → empty map', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200)],
      interiorById: { b0: [int('d1', 50, 20), int('d2', 30, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ── Body-wide externals ────────────────────────────────────────────────────────

describe('deriveDrawerFronts — body-wide externals', () => {
  it('1 external in a single-front body', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200)],
      interiorById: { b0: [ext('d1', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
    });
    const front = result['d1'];
    expect(front).toBeDefined();
    expect(front!.positionFromBoxBottom).toBe(0);
    expect(front!.height).toBe(20);
    expect(front!.frontIndex).toBe(0);
    expect(front!.cellIndex).toBeUndefined();
    expect(front!.coversSkirt).toBe(false);
    expect(front!.width).toBe(60); // body-wide, full box.W
  });

  it('bug-regression: numFronts>1 without partition → single DrawerFront at full body width', () => {
    // Bug: in a 240cm cabinet with 3 bodies of 80cm (each numFronts=2),
    // adding an external drawer to a non-partitioned body produced 2 separate
    // fronts at door width. The fix: one DrawerFront per drawer at box.W.
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 80, 200)],
      interiorById: { b0: [ext('d1', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),  // ← no partition
      numFrontsPerBox: new Map([['b0', 2]]),  // ← 2 doors but 1 drawer-front
      ...baseInput,
    });
    expect(Object.keys(result)).toEqual(['d1']);
    expect(result['d1']!.width).toBe(80);     // full body, NOT door width (~39.8)
    expect(result['d1']!.cellIndex).toBeUndefined();
  });

  it('3 externals stack: positions follow sum + i×gap', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200)],
      interiorById: { b0: [ext('a', 10, 20), ext('b', 30, 15), ext('c', 60, 10)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
    });
    expect(result['a']!.positionFromBoxBottom).toBe(0);
    expect(result['b']!.positionFromBoxBottom).toBeCloseTo(20 + 0.2);
    expect(result['c']!.positionFromBoxBottom).toBeCloseTo(20 + 15 + 2 * 0.2);
  });

  it('coversSkirt = true on the lowest external when doorCoversPlinth + bottom body', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200, 'bottom')],
      interiorById: { b0: [ext('low', 10, 20), ext('high', 50, 15)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
      doorCoversPlinth: true,
    });
    expect(result['low']!.coversSkirt).toBe(true);
    expect(result['high']!.coversSkirt).toBe(false);
  });

  it('coversSkirt = false when body is not bottom/single, even if doorCoversPlinth', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200, 'top')],
      interiorById: { b0: [ext('d1', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
      doorCoversPlinth: true,
    });
    expect(result['d1']!.coversSkirt).toBe(false);
  });
});

// ── Partition cells ───────────────────────────────────────────────────────────

describe('deriveDrawerFronts — partition cells', () => {
  it('cell 0 (right) → frontIndex 0; cell 1 (left) → frontIndex numFronts−1', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 120, 200)],
      interiorById: {},
      cellInteriorById: { b0: [[ext('r', 10, 20)], [ext('l', 10, 15)]] },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: new Map([['b0', 2]]),
      ...baseInput,
    });
    expect(result['r']!.frontIndex).toBe(0);
    expect(result['r']!.cellIndex).toBe(0);
    expect(result['l']!.frontIndex).toBe(1);
    expect(result['l']!.cellIndex).toBe(1);
  });

  it('cell width = (box.W − tBody) / 2', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 120, 200)],
      interiorById: {},
      cellInteriorById: { b0: [[ext('r', 10, 20)], []] },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: new Map([['b0', 2]]),
      ...baseInput,
    });
    expect(result['r']!.width).toBeCloseTo((120 - 1.8) / 2);
  });

  it('partition mode ignores body-wide externals', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 120, 200)],
      interiorById: { b0: [ext('body', 10, 20)] },
      cellInteriorById: { b0: [[], []] },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: new Map([['b0', 2]]),
      ...baseInput,
    });
    expect(result['body']).toBeUndefined();
  });

  it('coversSkirt applies only to the lowest external in each cell', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 120, 200, 'bottom')],
      interiorById: {},
      cellInteriorById: {
        b0: [
          [ext('r-low', 5, 20), ext('r-high', 50, 15)],
          [ext('l-low', 10, 20)],
        ],
      },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: new Map([['b0', 2]]),
      ...baseInput,
      doorCoversPlinth: true,
    });
    expect(result['r-low']!.coversSkirt).toBe(true);
    expect(result['r-high']!.coversSkirt).toBe(false);
    expect(result['l-low']!.coversSkirt).toBe(true);
  });
});

// ── thicknessOverride passes through ──────────────────────────────────────────

describe('deriveDrawerFronts — frontThicknessOverride', () => {
  it('passes override through when set', () => {
    const drawer: DrawerItem = {
      type: 'drawer', id: 'd', heightFromFloor: 10, drawerHeight: 20, mount: 'external',
      frontThicknessOverride: 'mdf12',
    };
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200)],
      interiorById: { b0: [drawer] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
    });
    expect(result['d']!.thicknessOverride).toBe('mdf12');
  });

  it('omits override when absent (does not set undefined)', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200)],
      interiorById: { b0: [ext('d', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
    });
    expect('thicknessOverride' in result['d']!).toBe(false);
  });
});

// ── getDrawerFrontVisualHeight ────────────────────────────────────────────────

describe('getDrawerFrontVisualHeight', () => {
  it('returns structural height when coversSkirt is false', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200)],
      interiorById: { b0: [ext('d', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
    });
    expect(getDrawerFrontVisualHeight(result['d']!, 10)).toBe(20);
  });

  it('adds (plinth − 1) + gap when coversSkirt is true', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200, 'bottom')],
      interiorById: { b0: [ext('d', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
      doorCoversPlinth: true,
    });
    // plinth=10, gap=0.2 → visualH = 20 + 9 + 0.2 = 29.2
    expect(getDrawerFrontVisualHeight(result['d']!, 10)).toBeCloseTo(29.2);
  });

  it('returns structural height when plinth is 0', () => {
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200, 'bottom')],
      interiorById: { b0: [ext('d', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
      doorCoversPlinth: true,
    });
    expect(getDrawerFrontVisualHeight(result['d']!, 0)).toBe(20);
  });
});

// ── Mixed: internals + externals coexist ──────────────────────────────────────

describe('deriveDrawerFronts — mixed', () => {
  it('internals do not produce drawer fronts; externals do', () => {
    const items: InteriorItem[] = [
      ext('e1', 10, 20),
      int('i1', 50, 20),
      { type: 'shelf', id: 's1', heightFromFloor: 80 },
      { type: 'rod',   id: 'r1', heightFromFloor: 150 },
    ];
    const result = deriveDrawerFronts({
      bodyBoxes: [box('b0', 60, 200)],
      interiorById: { b0: items },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: new Map([['b0', 1]]),
      ...baseInput,
    });
    expect(Object.keys(result)).toEqual(['e1']);
  });
});
