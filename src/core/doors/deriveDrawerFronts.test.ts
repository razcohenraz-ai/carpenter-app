import { describe, it, expect } from 'vitest';
import { deriveDrawerFronts } from './drawerFrontsCalc';
import { getDrawerFrontVisualHeight } from './doorUtils';
import {
  computeRowFrontLayout,
  groupBoxesByRow,
  getTotalFrontsInRow,
  type RowFrontLayout,
} from '../geometry/frontGeometry';
import type { Box, BoxLevel } from '../../types/geometry';
import type { DrawerItem } from '../../types/interior';

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

/** Convenience: builds the per-row layout map for a single-row cabinet (most
 *  tests don't model multiple vertical rows). Cabinet width = sum of body
 *  widths (no shell unless specified). */
function mkLayoutByRow(args: {
  boxes: Box[];
  numFronts: Map<string, number>;
  gapMm?: number;
  hasShell?: boolean;
  tShell?: number;
}): Map<BoxLevel, RowFrontLayout> {
  const { boxes, numFronts, gapMm = 2, hasShell = false, tShell = 0 } = args;
  const cabinetW = boxes.reduce((s, b) => s + b.W, 0) + (hasShell ? 2 * tShell : 0);
  const result = new Map<BoxLevel, RowFrontLayout>();
  for (const [level, rowBoxes] of groupBoxesByRow(boxes)) {
    result.set(level, computeRowFrontLayout({
      cabinetW,
      hasOuterShell: hasShell,
      shellThicknessCm: tShell,
      totalFrontsInRow: getTotalFrontsInRow(rowBoxes, numFronts),
      gapCm: gapMm / 10,
    }));
  }
  return result;
}

const GAP_MM = 2;

// ── No externals → empty map ──────────────────────────────────────────────────

describe('deriveDrawerFronts — no externals', () => {
  it('empty interior → empty map', () => {
    const boxes = [box('b0', 60, 200)];
    const nf = new Map([['b0', 1]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('only internal drawers → empty map', () => {
    const boxes = [box('b0', 60, 200)];
    const nf = new Map([['b0', 1]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [int('d1', 50, 20), int('d2', 30, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ── Body-wide externals ────────────────────────────────────────────────────────

describe('deriveDrawerFronts — body-wide externals', () => {
  it('1 external in a single-front body: width = layout.frontWidth', () => {
    const boxes = [box('b0', 60, 200)];
    const nf = new Map([['b0', 1]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('d1', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    const front = result['d1'];
    expect(front).toBeDefined();
    expect(front!.positionFromBoxBottom).toBe(0);
    expect(front!.height).toBe(20);
    expect(front!.frontIndex).toBe(0);
    expect(front!.cellIndex).toBeUndefined();
    expect(front!.coversSkirt).toBe(false);
    // 1 front in a 60cm cabinet, gap=2mm: (60 − 2·0.2)/1 = 59.6
    expect(front!.width).toBeCloseTo(59.6);
  });

  it('numFronts>1 without partition → one DrawerFront spanning all columns', () => {
    // Single-box cabinet of 80cm, 2 columns, gap=2mm:
    //   layout.frontWidth = (80 − 3·0.2)/2 = 39.7
    //   spanLength = 2 → width = 2·39.7 + 0.2 = 79.6
    const boxes = [box('b0', 80, 200)];
    const nf = new Map([['b0', 2]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('d1', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(Object.keys(result)).toEqual(['d1']);
    expect(result['d1']!.width).toBeCloseTo(79.6);
    expect(result['d1']!.cellIndex).toBeUndefined();
  });

  it('body-wide drawer width with no shell, gap=0 → equals full body width', () => {
    const boxes = [box('b0', 100, 200)];
    const nf = new Map([['b0', 1]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('d', 0, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: 0,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf, gapMm: 0 }),
    });
    expect(result['d']!.width).toBeCloseTo(100);
  });

  it('3-body cabinet: middle box body-wide drawer spans its 2 columns only', () => {
    // 3 bodies of 80cm × numFronts=2 → 6 columns in a 240cm cabinet,
    // gap=2mm. layout.frontWidth = (240 − 7·0.2)/6 ≈ 39.7667; a 2-column
    // span = 2·39.7667 + 1·0.2 ≈ 79.7333.
    const boxes = [box('a', 80, 200), box('b', 80, 200), box('c', 80, 200)];
    const nf = new Map([['a', 2], ['b', 2], ['c', 2]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b: [ext('drawer-in-b', 0, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['drawer-in-b']!.width).toBeCloseTo(79.7333, 3);
    expect(result['drawer-in-b']!.boxId).toBe('b');
  });

  it('3 externals stack: positions follow sum + i×gap', () => {
    const boxes = [box('b0', 60, 200)];
    const nf = new Map([['b0', 1]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('a', 10, 20), ext('b', 30, 15), ext('c', 60, 10)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['a']!.positionFromBoxBottom).toBe(0);
    expect(result['b']!.positionFromBoxBottom).toBeCloseTo(20 + 0.2);
    expect(result['c']!.positionFromBoxBottom).toBeCloseTo(20 + 15 + 2 * 0.2);
  });

  it('coversSkirt = true on the lowest external when doorCoversPlinth + bottom body', () => {
    const boxes = [box('b0', 60, 200, 'bottom')];
    const nf = new Map([['b0', 1]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('low', 10, 20), ext('high', 50, 15)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: true,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['low']!.coversSkirt).toBe(true);
    expect(result['high']!.coversSkirt).toBe(false);
  });

  it('coversSkirt = false when body is not bottom/single, even if doorCoversPlinth', () => {
    const boxes = [box('b0', 60, 200, 'top')];
    const nf = new Map([['b0', 1]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('d1', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: true,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['d1']!.coversSkirt).toBe(false);
  });
});

// ── Partition cells ───────────────────────────────────────────────────────────

describe('deriveDrawerFronts — partition cells', () => {
  it('cell 0 (right) → frontIndex 0; cell 1 (left) → frontIndex numFronts−1', () => {
    const boxes = [box('b0', 120, 200)];
    const nf = new Map([['b0', 2]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: {},
      cellInteriorById: { b0: [[ext('r', 10, 20)], [ext('l', 10, 15)]] },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['r']!.frontIndex).toBe(0);
    expect(result['r']!.cellIndex).toBe(0);
    expect(result['l']!.frontIndex).toBe(1);
    expect(result['l']!.cellIndex).toBe(1);
  });

  it('cell drawer width = layout.frontWidth (single column, partition is overlay)', () => {
    // 1-box cabinet of 120cm, numFronts=2, gap=2mm:
    //   layout.frontWidth = (120 − 3·0.2)/2 = 59.7
    const boxes = [box('b0', 120, 200)];
    const nf = new Map([['b0', 2]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: {},
      cellInteriorById: { b0: [[ext('r', 10, 20)], []] },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['r']!.width).toBeCloseTo(59.7);
  });

  it('W=80 + partition + gap=2mm: cell drawer = 39.7 (= (80−0.6)/2)', () => {
    const boxes = [box('b0', 80, 200)];
    const nf = new Map([['b0', 2]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: {},
      cellInteriorById: { b0: [[ext('r', 0, 20)], []] },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['r']!.width).toBeCloseTo(39.7);
  });

  it('partition mode ignores body-wide externals', () => {
    const boxes = [box('b0', 120, 200)];
    const nf = new Map([['b0', 2]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('body', 10, 20)] },
      cellInteriorById: { b0: [[], []] },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['body']).toBeUndefined();
  });

  it('coversSkirt applies only to the lowest external in each cell', () => {
    const boxes = [box('b0', 120, 200, 'bottom')];
    const nf = new Map([['b0', 2]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: {},
      cellInteriorById: {
        b0: [
          [ext('r-low', 5, 20), ext('r-high', 50, 15)],
          [ext('l-low', 10, 20)],
        ],
      },
      partitionsById: new Map([['b0', true]]),
      numFrontsPerBox: nf,
      doorCoversPlinth: true,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['r-low']!.coversSkirt).toBe(true);
    expect(result['r-high']!.coversSkirt).toBe(false);
    expect(result['l-low']!.coversSkirt).toBe(true);
  });
});

// ── thicknessOverride passes through ──────────────────────────────────────────

describe('deriveDrawerFronts — frontThicknessOverride', () => {
  it('passes override through when set', () => {
    const boxes = [box('b0', 60, 200)];
    const nf = new Map([['b0', 1]]);
    const drawer: DrawerItem = {
      type: 'drawer', id: 'd', heightFromFloor: 10, drawerHeight: 20, mount: 'external',
      frontThicknessOverride: 'mdf12',
    };
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [drawer] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect(result['d']!.thicknessOverride).toBe('mdf12');
  });

  it('omits override when absent (does not set undefined)', () => {
    const boxes = [box('b0', 60, 200)];
    const nf = new Map([['b0', 1]]);
    const result = deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('d', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth: false,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
    expect('thicknessOverride' in result['d']!).toBe(false);
  });
});

// ── getDrawerFrontVisualHeight ────────────────────────────────────────────────

describe('getDrawerFrontVisualHeight', () => {
  function deriveOne(boxLevel: Box['level'] = 'single', doorCoversPlinth = false) {
    const boxes = [box('b0', 60, 200, boxLevel)];
    const nf = new Map([['b0', 1]]);
    return deriveDrawerFronts({
      bodyBoxes: boxes,
      interiorById: { b0: [ext('d', 10, 20)] },
      cellInteriorById: {},
      partitionsById: new Map(),
      numFrontsPerBox: nf,
      doorCoversPlinth,
      doorGapMm: GAP_MM,
      layoutByRow: mkLayoutByRow({ boxes, numFronts: nf }),
    });
  }

  it('returns structural height when coversSkirt is false', () => {
    expect(getDrawerFrontVisualHeight(deriveOne()['d']!, 10)).toBe(20);
  });

  it('adds (plinth − 1) + gap when coversSkirt is true', () => {
    expect(getDrawerFrontVisualHeight(deriveOne('bottom', true)['d']!, 10)).toBeCloseTo(29.2);
  });

  it('returns structural height when plinth is 0', () => {
    expect(getDrawerFrontVisualHeight(deriveOne('bottom', true)['d']!, 0)).toBe(20);
  });
});
