import { describe, it, expect } from 'vitest';
import {
  computeRowFrontLayout,
  computeFrontGeometry,
  computeFrontGeometryForSpan,
  getBoxFirstGlobalFrontIndex,
  getTotalFrontsInRow,
  groupBoxesByRow,
  frontColumnsForBox,
} from './frontGeometry';
import type { Box } from '../../types/geometry';

describe('frontColumnsForBox', () => {
  it('splits standard bodies once per maxDoorWidth (ceil)', () => {
    expect(frontColumnsForBox(60, 60)).toBe(1);
    expect(frontColumnsForBox(120, 60)).toBe(2);
    expect(frontColumnsForBox(121, 60)).toBe(3); // ceil(121/60)
    expect(frontColumnsForBox(130, 120)).toBe(2);
  });

  it('never returns less than 1 for a degenerate width', () => {
    expect(frontColumnsForBox(0, 60)).toBe(1);
  });

  it('base mount behaves like the default (splits by width)', () => {
    expect(frontColumnsForBox(130, 120, 'base')).toBe(2);
  });

  it('wall cabinets are pinned to a single front regardless of width', () => {
    // The bug: a wall cabinet widened past maxDoorWidth auto-split into 2 doors.
    expect(frontColumnsForBox(130, 120, 'wall')).toBe(1);
    expect(frontColumnsForBox(300, 60, 'wall')).toBe(1);
    expect(frontColumnsForBox(50, 120, 'wall')).toBe(1);
  });
});

const GAP = 0.2; // cm — standard 2mm cabinet gap

function box(id: string, W: number, H: number, level: Box['level'] = 'single', position: Box['position'] = 'single'): Box {
  return { id, W, H, D: 60, position, level };
}

describe('computeRowFrontLayout', () => {
  it('single front, no shell: W=80, N=1 → frontWidth=79.6, offset=0', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 80, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 1, gapCm: GAP,
    });
    expect(layout.wAvailable).toBe(80);
    expect(layout.frontWidth).toBeCloseTo(79.6);
    expect(layout.cabinetLeftOffset).toBe(0);
  });

  it('three fronts, no shell: W=240, N=3 → frontWidth ≈ 79.73', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 3, gapCm: GAP,
    });
    // (240 − 4·0.2) / 3 = 239.2 / 3 = 79.7333…
    expect(layout.frontWidth).toBeCloseTo(79.7333, 3);
    expect(layout.wAvailable).toBe(240);
  });

  it('six fronts, no shell: W=240, N=6 → frontWidth ≈ 39.77', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 6, gapCm: GAP,
    });
    // (240 − 7·0.2) / 6 = 238.6 / 6 = 39.7666…
    expect(layout.frontWidth).toBeCloseTo(39.7667, 3);
  });

  it('two fronts with shell: W=80, tShell=1.8 → wAvailable=76.4, frontWidth=37.9', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 80, hasOuterShell: true, shellThicknessCm: 1.8,
      totalFrontsInRow: 2, gapCm: GAP,
    });
    expect(layout.wAvailable).toBeCloseTo(76.4);
    expect(layout.frontWidth).toBeCloseTo(37.9);
    expect(layout.cabinetLeftOffset).toBe(1.8);
  });

  it('six fronts with shell: W=240, tShell=1.8 → frontWidth ≈ 39.17', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: true, shellThicknessCm: 1.8,
      totalFrontsInRow: 6, gapCm: GAP,
    });
    // wAvailable = 236.4; (236.4 − 7·0.2) / 6 = 235 / 6 = 39.1666…
    expect(layout.frontWidth).toBeCloseTo(39.1667, 3);
  });

  it('zero fronts returns zero width (no division by zero)', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 80, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 0, gapCm: GAP,
    });
    expect(layout.frontWidth).toBe(0);
  });

  // ── Asymmetric shell (shellSides override) — kitchen units flush to a wall ─
  describe('asymmetric shell via shellSides', () => {
    // The bug closed by this branch: a kitchen unit with shell on one side
    // only (e.g. flush against a wall on the left) was shrinking the door by
    // 2× shell thickness because computeRowFrontLayout used `hasOuterShell`
    // as a binary symmetric flag.

    it('shell on RIGHT only: wAvailable = W − t (not W − 2t), front starts at x=0', () => {
      const layout = computeRowFrontLayout({
        cabinetW: 100, hasOuterShell: true, shellThicknessCm: 1.8,
        shellSides: { left: false, right: true },
        totalFrontsInRow: 1, gapCm: GAP,
      });
      expect(layout.wAvailable).toBeCloseTo(98.2, 3);    // 100 − 1.8
      expect(layout.cabinetLeftOffset).toBe(0);           // no left shell
    });

    it('shell on LEFT only: wAvailable = W − t, front offset by t', () => {
      const layout = computeRowFrontLayout({
        cabinetW: 100, hasOuterShell: true, shellThicknessCm: 1.8,
        shellSides: { left: true, right: false },
        totalFrontsInRow: 1, gapCm: GAP,
      });
      expect(layout.wAvailable).toBeCloseTo(98.2, 3);    // 100 − 1.8
      expect(layout.cabinetLeftOffset).toBeCloseTo(1.8, 3);
    });

    it('shell on BOTH sides via shellSides matches legacy symmetric path', () => {
      const asym = computeRowFrontLayout({
        cabinetW: 100, hasOuterShell: true, shellThicknessCm: 1.8,
        shellSides: { left: true, right: true },
        totalFrontsInRow: 1, gapCm: GAP,
      });
      const sym = computeRowFrontLayout({
        cabinetW: 100, hasOuterShell: true, shellThicknessCm: 1.8,
        totalFrontsInRow: 1, gapCm: GAP,
      });
      expect(asym.wAvailable).toBeCloseTo(sym.wAvailable, 3);
      expect(asym.cabinetLeftOffset).toBe(sym.cabinetLeftOffset);
    });

    it('NO shell via shellSides matches legacy `hasOuterShell:false` path', () => {
      const asym = computeRowFrontLayout({
        cabinetW: 100, hasOuterShell: false, shellThicknessCm: 1.8,
        shellSides: { left: false, right: false },
        totalFrontsInRow: 1, gapCm: GAP,
      });
      expect(asym.wAvailable).toBe(100);
      expect(asym.cabinetLeftOffset).toBe(0);
    });
  });
});

describe('computeFrontGeometry — single column', () => {
  it('W=80, N=1: only column at x=0.2', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 80, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 1, gapCm: GAP,
    });
    const f = computeFrontGeometry({ globalFrontIndexInRow: 0, layout, gapCm: GAP });
    expect(f.x).toBeCloseTo(0.2);
    expect(f.width).toBeCloseTo(79.6);
  });

  it('W=240, N=3: x values are 0.2, ~80.13, ~160.07', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 3, gapCm: GAP,
    });
    expect(computeFrontGeometry({ globalFrontIndexInRow: 0, layout, gapCm: GAP }).x).toBeCloseTo(0.2);
    expect(computeFrontGeometry({ globalFrontIndexInRow: 1, layout, gapCm: GAP }).x).toBeCloseTo(80.1333, 3);
    expect(computeFrontGeometry({ globalFrontIndexInRow: 2, layout, gapCm: GAP }).x).toBeCloseTo(160.0667, 3);
  });

  it('W=240, N=6: x[5] ≈ 200.03', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 6, gapCm: GAP,
    });
    // x_5 = 0.2 + 5·(39.7667 + 0.2) = 0.2 + 5·39.9667 = 200.0333
    expect(computeFrontGeometry({ globalFrontIndexInRow: 5, layout, gapCm: GAP }).x).toBeCloseTo(200.0333, 3);
  });

  it('layout closure: x[N−1] + width + gap = W_available', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 6, gapCm: GAP,
    });
    const last = computeFrontGeometry({ globalFrontIndexInRow: 5, layout, gapCm: GAP });
    expect(last.x + last.width + GAP).toBeCloseTo(layout.wAvailable);
  });
});

describe('computeFrontGeometryForSpan — body-wide drawer panels', () => {
  it('spanLength=1 matches single-column geometry', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 3, gapCm: GAP,
    });
    const single = computeFrontGeometry({ globalFrontIndexInRow: 1, layout, gapCm: GAP });
    const span   = computeFrontGeometryForSpan({ startGlobalIndexInRow: 1, spanLength: 1, layout, gapCm: GAP });
    expect(span.x).toBe(single.x);
    expect(span.width).toBe(single.width);
  });

  it('spanLength=2 covers two columns + one inner gap (no outer gap)', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 80, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 2, gapCm: GAP,
    });
    const span = computeFrontGeometryForSpan({ startGlobalIndexInRow: 0, spanLength: 2, layout, gapCm: GAP });
    // frontWidth = (80 − 3·0.2)/2 = 39.7; span = 2·39.7 + 0.2 = 79.6
    expect(span.x).toBeCloseTo(0.2);
    expect(span.width).toBeCloseTo(79.6);
  });

  it('spanLength=N: drawer covers the full inside width (= wAvailable − 2·gap)', () => {
    const layout = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: 6, gapCm: GAP,
    });
    const span = computeFrontGeometryForSpan({ startGlobalIndexInRow: 0, spanLength: 6, layout, gapCm: GAP });
    expect(span.width).toBeCloseTo(layout.wAvailable - 2 * GAP);
  });
});

describe('getBoxFirstGlobalFrontIndex — within a row', () => {
  const rowBoxes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const numFronts = new Map([['a', 2], ['b', 1], ['c', 3]]);

  it('first box: 0', () => {
    expect(getBoxFirstGlobalFrontIndex({ rowBoxes, numFrontsPerBox: numFronts, targetBoxId: 'a' })).toBe(0);
  });

  it('middle box: sums fronts to its left within the row', () => {
    expect(getBoxFirstGlobalFrontIndex({ rowBoxes, numFrontsPerBox: numFronts, targetBoxId: 'b' })).toBe(2);
  });

  it('last box: sum of all preceding', () => {
    expect(getBoxFirstGlobalFrontIndex({ rowBoxes, numFrontsPerBox: numFronts, targetBoxId: 'c' })).toBe(3);
  });

  it('missing box: -1', () => {
    expect(getBoxFirstGlobalFrontIndex({ rowBoxes, numFrontsPerBox: numFronts, targetBoxId: 'zzz' })).toBe(-1);
  });

  it('default numFronts=1 when missing from map', () => {
    expect(getBoxFirstGlobalFrontIndex({
      rowBoxes, numFrontsPerBox: new Map(), targetBoxId: 'c',
    })).toBe(2);
  });
});

describe('getTotalFrontsInRow', () => {
  it('sums numFronts across the row', () => {
    const rowBoxes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const map = new Map([['a', 2], ['b', 1], ['c', 3]]);
    expect(getTotalFrontsInRow(rowBoxes, map)).toBe(6);
  });

  it('defaults to 1 when a box is missing from the map', () => {
    expect(getTotalFrontsInRow([{ id: 'a' }, { id: 'b' }], new Map())).toBe(2);
  });
});

describe('groupBoxesByRow', () => {
  it('one box per level: all become singletons', () => {
    const boxes = [box('a', 80, 100, 'bottom'), box('b', 80, 100, 'top')];
    const groups = groupBoxesByRow(boxes);
    expect(groups.get('bottom')).toEqual([boxes[0]]);
    expect(groups.get('top')).toEqual([boxes[1]]);
    expect(groups.size).toBe(2);
  });

  it('preserves left-to-right order within each level', () => {
    const boxes = [
      box('a', 80, 100, 'bottom', 'left'),
      box('b', 80, 100, 'bottom', `unit_1`),
      box('c', 80, 100, 'bottom', 'right'),
    ];
    expect(groupBoxesByRow(boxes).get('bottom')!.map(b => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips plinth boxes', () => {
    const boxes = [box('a', 80, 100, 'single'), box('p', 80, 10, 'plinth')];
    const groups = groupBoxesByRow(boxes);
    expect(groups.has('plinth')).toBe(false);
    expect(groups.get('single')).toEqual([boxes[0]]);
  });
});

// ── Multi-row cabinet: each row spreads independently across the full width ──

describe('per-row layout in a multi-row cabinet', () => {
  it('W=240, 2 rows (bottom+top), 3 bodies×numFronts=2 each → frontWidth ≈ 39.77 in BOTH rows', () => {
    const boxes = [
      box('b1', 80, 100, 'bottom'), box('b2', 80, 100, 'bottom'), box('b3', 80, 100, 'bottom'),
      box('t1', 80, 100, 'top'),    box('t2', 80, 100, 'top'),    box('t3', 80, 100, 'top'),
    ];
    const numFronts = new Map<string, number>(boxes.map(b => [b.id, 2]));
    const groups = groupBoxesByRow(boxes);
    const bottomRow = groups.get('bottom')!;
    const topRow = groups.get('top')!;
    expect(bottomRow.length).toBe(3);
    expect(topRow.length).toBe(3);

    const layoutB = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: getTotalFrontsInRow(bottomRow, numFronts), gapCm: GAP,
    });
    const layoutT = computeRowFrontLayout({
      cabinetW: 240, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: getTotalFrontsInRow(topRow, numFronts), gapCm: GAP,
    });
    // Each row should spread its 6 fronts across the full 240cm.
    expect(layoutB.frontWidth).toBeCloseTo(39.7667, 3);
    expect(layoutT.frontWidth).toBeCloseTo(39.7667, 3);
    // First front in each row at x=0.2; last front ends at wAvailable − gap.
    const firstB = computeFrontGeometry({ globalFrontIndexInRow: 0, layout: layoutB, gapCm: GAP });
    const lastB  = computeFrontGeometry({ globalFrontIndexInRow: 5, layout: layoutB, gapCm: GAP });
    expect(firstB.x).toBeCloseTo(0.2);
    expect(lastB.x + lastB.width + GAP).toBeCloseTo(240);
  });

  it('regression: rows do NOT share a single 12-front layout (would halve frontWidth)', () => {
    // Before the per-row fix, summing fronts across all rows gave N=12 and
    // frontWidth ≈ 19.78, leaving the top row clustered on the left and the
    // bottom row on the right (or vice-versa).
    const boxes = [
      box('b1', 80, 100, 'bottom'), box('t1', 80, 100, 'top'),
    ];
    const numFronts = new Map([['b1', 2], ['t1', 2]]);
    const groups = groupBoxesByRow(boxes);
    const layoutB = computeRowFrontLayout({
      cabinetW: 80, hasOuterShell: false, shellThicknessCm: 0,
      totalFrontsInRow: getTotalFrontsInRow(groups.get('bottom')!, numFronts), gapCm: GAP,
    });
    // Just the bottom row: 2 fronts in 80cm cabinet → (80 − 3·0.2)/2 = 39.7
    expect(layoutB.frontWidth).toBeCloseTo(39.7);
    // If we'd lumped both rows into one layout: N=4 → (80 − 5·0.2)/4 = 19.75 (wrong).
    expect(layoutB.frontWidth).not.toBeCloseTo(19.75);
  });
});
