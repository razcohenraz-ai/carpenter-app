import { describe, it, expect } from 'vitest';
import type { InteriorItem, DrawerItem } from '../../types/interior';
import {
  calcMainDoorHeight,
  calcExternalStackHeight,
  getSkirtCoveringDrawer,
  externalStackChanged,
  externalStackSignature,
  getItemsForFront,
  getDoorHeight,
  getDoorWidth,
  getPartitionDoorWidth,
} from './doorUtils';
import { calcExternalDrawerFrontCuts } from '../cuts/externalDrawerCuts';

// Tests in this file exercise the same composition that `useCabinet.calculate()`
// runs per box / per frontIndex: items → main door height + coversSkirt
// transfer + 'front' cuts. They are unit tests of the wiring contract, not of
// the React hook itself (no React Testing Library in this project).

function makeDrawer(
  id: string,
  heightFromFloor: number,
  drawerHeight: number,
  mount: 'internal' | 'external',
): DrawerItem {
  return { type: 'drawer', id, heightFromFloor, drawerHeight, mount };
}

// ── Scenario 1: single external drawer shortens the door ──────────────────────

describe('useCabinet wiring — scenario 1: single external drawer', () => {
  it('main door height shrinks by drawerHeight + gapMm vs the no-drawer baseline', () => {
    const boxH = 100;
    const gapMm = 2;
    const baseline = getDoorHeight(boxH, gapMm, true, true); // 99.6
    const items: InteriorItem[] = [makeDrawer('d', 0, 20, 'external')];
    const main = calcMainDoorHeight(boxH, items, gapMm, true, true);
    const expectedDelta = 20 + gapMm / 10; // 20.2
    expect(baseline - main).toBeCloseTo(expectedDelta);
  });

  it('one cut produced in the front group with drawer-height in mm', () => {
    const items: InteriorItem[] = [makeDrawer('d', 0, 20, 'external')];
    const cuts = calcExternalDrawerFrontCuts(items, 60, 2, 0, false, 18);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.group).toBe('front');
    expect(cuts[0]!.h).toBe(200);
  });
});

// ── Scenario 2: coversSkirt transferred from main door to lowest drawer ───────

describe('useCabinet wiring — scenario 2: coversSkirt transfer', () => {
  it('door’s effective coversSkirt becomes false when an external drawer takes it', () => {
    const items: InteriorItem[] = [makeDrawer('lo', 0, 20, 'external')];
    const originalCoversSkirt = true;
    const skirtDrawer = getSkirtCoveringDrawer(items, originalCoversSkirt);
    expect(skirtDrawer?.id).toBe('lo');
    // Caller computes: coversSkirt = originalCoversSkirt && skirtDrawer === null
    const finalCoversSkirt = originalCoversSkirt && skirtDrawer === null;
    expect(finalCoversSkirt).toBe(false);
  });

  it('lowest drawer’s cut extends to cover the plinth when transferred', () => {
    // plinth=10, gap=2mm → visualH = 20 + (10−1) + 0.2 = 29.2 cm = 292 mm
    const items: InteriorItem[] = [makeDrawer('lo', 0, 20, 'external')];
    const cuts = calcExternalDrawerFrontCuts(items, 60, 2, 10, true, 18);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.h).toBeCloseTo(292);
  });

  it('door without coversSkirt: skirtDrawer is null, drawer cut stays at drawerHeight', () => {
    const items: InteriorItem[] = [makeDrawer('lo', 0, 20, 'external')];
    expect(getSkirtCoveringDrawer(items, false)).toBeNull();
    const cuts = calcExternalDrawerFrontCuts(items, 60, 2, 10, false, 18);
    expect(cuts[0]!.h).toBe(200);
  });
});

// ── Scenario 3: toggle external → internal restores the original door ─────────

describe('useCabinet wiring — scenario 3: mount toggle back to internal', () => {
  it('externalStackChanged returns true when a drawer flips internal↔external', () => {
    const before: InteriorItem[] = [makeDrawer('d', 0, 20, 'external')];
    const after: InteriorItem[]  = [makeDrawer('d', 0, 20, 'internal')];
    expect(externalStackChanged(before, after)).toBe(true);
  });

  it('main door height returns to the baseline when the drawer goes internal', () => {
    const boxH = 100, gapMm = 2;
    const before: InteriorItem[] = [makeDrawer('d', 0, 20, 'external')];
    const after: InteriorItem[]  = [makeDrawer('d', 0, 20, 'internal')];
    const baseline = getDoorHeight(boxH, gapMm, true, true);
    expect(calcMainDoorHeight(boxH, before, gapMm, true, true)).toBeLessThan(baseline);
    expect(calcMainDoorHeight(boxH, after,  gapMm, true, true)).toBeCloseTo(baseline);
  });

  it('externalStackChanged is false when only an internal drawer’s heightFromFloor moves', () => {
    const before: InteriorItem[] = [makeDrawer('d', 30, 20, 'internal')];
    const after:  InteriorItem[] = [makeDrawer('d', 50, 20, 'internal')];
    expect(externalStackChanged(before, after)).toBe(false);
  });

  it('externalStackChanged is true when an external drawer’s drawerHeight changes', () => {
    const before: InteriorItem[] = [makeDrawer('d', 0, 20, 'external')];
    const after:  InteriorItem[] = [makeDrawer('d', 0, 25, 'external')];
    expect(externalStackChanged(before, after)).toBe(true);
  });
});

// ── Scenario 4: two external drawers stack and shorten the door correctly ─────

describe('useCabinet wiring — scenario 4: stack of two externals', () => {
  it('calcExternalStackHeight = sum + N×gap; door shrinks accordingly', () => {
    const boxH = 100, gapMm = 2;
    const items: InteriorItem[] = [
      makeDrawer('a', 0, 20, 'external'),
      makeDrawer('b', 20, 15, 'external'),
    ];
    expect(calcExternalStackHeight(items, gapMm)).toBeCloseTo(35.4); // 35 + 2*0.2
    const baseline = getDoorHeight(boxH, gapMm, true, true); // 99.6
    expect(calcMainDoorHeight(boxH, items, gapMm, true, true)).toBeCloseTo(baseline - 35.4);
  });

  it('two cuts produced — one per external drawer', () => {
    const items: InteriorItem[] = [
      makeDrawer('a', 0, 20, 'external'),
      makeDrawer('b', 20, 15, 'external'),
    ];
    const cuts = calcExternalDrawerFrontCuts(items, 60, 2, 0, false, 18);
    expect(cuts).toHaveLength(2);
    // Lowest (id='a') iterates first → 200mm; second is 150mm.
    expect(cuts[0]!.h).toBe(200);
    expect(cuts[1]!.h).toBe(150);
  });
});

// ── Scenario 5: external in a cell shortens only the matching frontIndex ──────

describe('useCabinet wiring — scenario 5: partition cell mapping', () => {
  const boxH = 100, gapMm = 2, numFronts = 2;
  const rightCellItems: InteriorItem[] = [makeDrawer('rd', 0, 20, 'external')];
  const leftCellItems:  InteriorItem[] = [];
  const cellItems = [rightCellItems, leftCellItems];

  it('right cell (cellIndex 0) maps to frontIndex 0', () => {
    const items = getItemsForFront(0, numFronts, true, [], cellItems);
    expect(items.map(i => i.id)).toEqual(['rd']);
  });

  it('left cell (cellIndex 1) maps to frontIndex numFronts−1', () => {
    const items = getItemsForFront(1, numFronts, true, [], cellItems);
    expect(items).toEqual([]);
  });

  it('frontIndex 0 main door shortens (has the external); frontIndex 1 keeps baseline', () => {
    const right = getItemsForFront(0, numFronts, true, [], cellItems);
    const left  = getItemsForFront(1, numFronts, true, [], cellItems);
    const baseline = getDoorHeight(boxH, gapMm, true, true);
    expect(calcMainDoorHeight(boxH, right, gapMm, true, true)).toBeLessThan(baseline);
    expect(calcMainDoorHeight(boxH, left,  gapMm, true, true)).toBeCloseTo(baseline);
  });

  it('middle frontIndex (numFronts > 2 + partition) gets [] — no shortening', () => {
    const middle = getItemsForFront(1, 3, true, [], cellItems);
    expect(middle).toEqual([]);
    const baseline = getDoorHeight(boxH, gapMm, true, true);
    expect(calcMainDoorHeight(boxH, middle, gapMm, true, true)).toBeCloseTo(baseline);
  });

  it('no partition: bodyItems drive every front equally', () => {
    const body: InteriorItem[] = [makeDrawer('x', 0, 20, 'external')];
    expect(getItemsForFront(0, 2, false, body, cellItems)).toBe(body);
    expect(getItemsForFront(1, 2, false, body, cellItems)).toBe(body);
  });
});

// ── Signature helper ──────────────────────────────────────────────────────────

describe('externalStackSignature', () => {
  it('order-independent: same set of externals → same signature', () => {
    const a: InteriorItem[] = [
      makeDrawer('a', 0, 20, 'external'),
      makeDrawer('b', 20, 15, 'external'),
    ];
    const b: InteriorItem[] = [
      makeDrawer('b', 20, 15, 'external'),
      makeDrawer('a', 0, 20, 'external'),
    ];
    expect(externalStackSignature(a)).toBe(externalStackSignature(b));
  });

  it('ignores non-external items', () => {
    const ext: InteriorItem[] = [makeDrawer('a', 0, 20, 'external')];
    const mixed: InteriorItem[] = [
      makeDrawer('a', 0, 20, 'external'),
      makeDrawer('b', 50, 20, 'internal'),
      { type: 'shelf', id: 's', heightFromFloor: 30 },
      { type: 'rod',   id: 'r', heightFromFloor: 80 },
    ];
    expect(externalStackSignature(ext)).toBe(externalStackSignature(mixed));
  });
});

// ── Door width across partition modes ────────────────────────────────────────
// Regression: prior to the fix, partition bodies used `(box.W - tBody) / 2`
// (no gap budget), which produced asymmetric, right-aligned rendering.

describe('getPartitionDoorWidth', () => {
  it('W=80, tBody=1.8, gap=2mm → 38.7 (= (80 − 1.8 − 0.8)/2)', () => {
    expect(getPartitionDoorWidth(80, 1.8, 2)).toBeCloseTo(38.7);
  });

  it('layout sums back to box.W: 2·door + tBody + 4·gap = W', () => {
    const W = 80, tBody = 1.8, gapMm = 2;
    const doorW = getPartitionDoorWidth(W, tBody, gapMm);
    expect(2 * doorW + tBody + 4 * (gapMm / 10)).toBeCloseTo(W);
  });

  it('zero gap collapses to the old behavior (W − tBody) / 2', () => {
    expect(getPartitionDoorWidth(80, 1.8, 0)).toBeCloseTo((80 - 1.8) / 2);
  });

  it('partition doorWidth is strictly smaller than non-partition doorWidth at gap>0', () => {
    // Same W and gap, 2 doors. Non-partition: (W - 3·gap)/2; partition: (W - tBody - 4·gap)/2.
    // The partition layout pays the partition's width AND an extra gap.
    const W = 80, gapMm = 2;
    const noPartition = getDoorWidth(W, 2, gapMm);
    const partition   = getPartitionDoorWidth(W, 1.8, gapMm);
    expect(partition).toBeLessThan(noPartition);
    // Specifically: difference = (tBody + gap) / 2 = (1.8 + 0.2)/2 = 1.0
    expect(noPartition - partition).toBeCloseTo(1.0);
  });
});
