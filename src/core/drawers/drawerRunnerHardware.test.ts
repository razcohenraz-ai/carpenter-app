import { describe, it, expect } from 'vitest';
import type { DrawerItem } from '../../types/interior';
import type { HardwareLineItem } from '../../types/hardware';
import { getRunner } from '../../catalog/runners';
import {
  runnerPriceShekel,
  buildDrawerRunnerHardware,
  mergeRunnerHardware,
  GENERIC_SLIDE_SPEC_ID,
} from './drawerRunnerHardware';

const drawer = (over: Partial<DrawerItem> = {}): DrawerItem => ({
  id: 'd1', type: 'drawer', heightFromFloor: 0, drawerHeight: 31, mount: 'external', ...over,
});

const slide = (qty: number): HardwareLineItem =>
  ({ specId: GENERIC_SLIDE_SPEC_ID, name: 'מסילה טלסקופית', qty, unit: 'זוג', unitPrice: 35, total: qty * 35 });

describe('runnerPriceShekel — NL band', () => {
  const t16 = getRunner('tandem-16')!;
  it('NL < 50 cm → 100 ₪, NL ≥ 50 cm → 150 ₪', () => {
    expect(runnerPriceShekel(t16, 300)).toBe(100);
    expect(runnerPriceShekel(t16, 480)).toBe(100);
    expect(runnerPriceShekel(t16, 500)).toBe(150);
    expect(runnerPriceShekel(t16, 550)).toBe(150);
    expect(runnerPriceShekel(t16, 600)).toBe(150);
  });
  it('falls back to the last band for an NL beyond the table', () => {
    expect(runnerPriceShekel(t16, 9999)).toBe(150);
  });
  it('override bands take precedence over the catalog price (per band)', () => {
    expect(runnerPriceShekel(t16, 300, [120, 180])).toBe(120); // band 0
    expect(runnerPriceShekel(t16, 550, [120, 180])).toBe(180); // band 1
    expect(runnerPriceShekel(t16, 550, [120])).toBe(150);      // band 1 missing → catalog
  });
});

describe('buildDrawerRunnerHardware', () => {
  it('one set per runner drawer, priced from the body depth → NL', () => {
    // 60 cm depth → NL 550 → 150 ₪; 40 cm depth → NL 380 → 100 ₪.
    const deep = buildDrawerRunnerHardware([drawer({ runnerId: 'tandem-16' })], 60);
    expect(deep).toHaveLength(1);
    expect([deep[0]!.qty, deep[0]!.unitPrice, deep[0]!.unit]).toEqual([1, 150, 'סט']);
    expect(deep[0]!.specId).toBe('runner-tandem-16-nl550');

    const shallow = buildDrawerRunnerHardware([drawer({ runnerId: 'tandem-16' })], 40);
    expect(shallow[0]!.unitPrice).toBe(100);
    expect(shallow[0]!.specId).toBe('runner-tandem-16-nl380');
  });

  it('skips drawers with no resolvable runner (they keep the generic slide)', () => {
    expect(buildDrawerRunnerHardware([drawer({})], 60)).toEqual([]);
    expect(buildDrawerRunnerHardware([drawer({ runnerId: 'nope' })], 60)).toEqual([]);
  });

  it('uses the default runner when the drawer carries none', () => {
    const lines = buildDrawerRunnerHardware([drawer({})], 60, { defaultRunnerId: 'tandem-19' });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.specId).toBe('runner-tandem-19-nl550');
  });

  it('applies the carpenter\'s per-runner price overrides', () => {
    const lines = buildDrawerRunnerHardware([drawer({ runnerId: 'tandem-16' })], 60, {
      priceOverrides: { 'tandem-16': [120, 180] },
    });
    expect([lines[0]!.unitPrice, lines[0]!.total]).toEqual([180, 180]); // 60 cm → NL 550 → band 1
  });
});

describe('mergeRunnerHardware', () => {
  it('removes one generic slide per runner and appends the runner line', () => {
    const base = [slide(2)];
    const runners = buildDrawerRunnerHardware([drawer({ runnerId: 'tandem-16' })], 60); // 1 set
    const merged = mergeRunnerHardware(base, runners);
    expect(merged.find(l => l.specId === GENERIC_SLIDE_SPEC_ID)!.qty).toBe(1); // 2 − 1
    expect(merged.find(l => l.specId.startsWith('runner-tandem-16'))!.unitPrice).toBe(150);
  });

  it('drops the generic slide entirely when every drawer has a runner', () => {
    const merged = mergeRunnerHardware([slide(1)], buildDrawerRunnerHardware([drawer({ runnerId: 'tandem-16' })], 60));
    expect(merged.some(l => l.specId === GENERIC_SLIDE_SPEC_ID)).toBe(false);
  });

  it('groups identical runner sets (same runner + NL) and sums qty/total', () => {
    const runners = buildDrawerRunnerHardware(
      [drawer({ id: 'a', runnerId: 'tandem-16' }), drawer({ id: 'b', runnerId: 'tandem-16' })],
      60,
    );
    const merged = mergeRunnerHardware([slide(2)], runners);
    const line = merged.find(l => l.specId === 'runner-tandem-16-nl550')!;
    expect([line.qty, line.total]).toEqual([2, 300]);
    expect(merged.some(l => l.specId === GENERIC_SLIDE_SPEC_ID)).toBe(false); // 2 − 2
  });

  it('returns the base unchanged when there are no runner drawers', () => {
    const base = [slide(2)];
    expect(mergeRunnerHardware(base, [])).toBe(base);
  });
});
