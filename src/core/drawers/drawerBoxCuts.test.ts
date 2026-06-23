import { describe, it, expect } from 'vitest';
import type { DrawerItem } from '../../types/interior';
import { buildDrawerBoxCuts } from './drawerBoxCuts';

const drawer = (over: Partial<DrawerItem> = {}): DrawerItem => ({
  id: 'd1', type: 'drawer', heightFromFloor: 0, drawerHeight: 31, mount: 'external', ...over,
});

describe('buildDrawerBoxCuts', () => {
  it('emits the 4 box parts (group "drawer") for a TANDEM 16 external drawer', () => {
    // 60×60 body, 16.5 gables → LW 56.7 cm; depth 60 cm; sides 16, T 12, front 31 cm.
    const cuts = buildDrawerBoxCuts(
      [drawer({ runnerId: 'tandem-16', drawerSideThicknessMm: 16, drawerBottomThicknessMm: 12 })],
      56.7, 60,
    );
    expect(cuts).toHaveLength(4);
    expect(cuts.every(c => c.group === 'drawer')).toBe(true);

    const side = cuts.find(c => c.name === 'דופן מגירה')!;
    const front = cuts.find(c => c.name === 'חזית תיבה')!;
    const bottom = cuts.find(c => c.name === 'תחתית מגירה')!;
    expect([side.qty, side.w, side.h, side.note]).toEqual([2, 540, 270, '16mm 45°']);
    expect([front.w, front.h]).toEqual([557, 247]);
    expect([bottom.w, bottom.h, bottom.note]).toEqual([536, 540, '12mm']);
  });

  it('uses the runner side-thickness max when the drawer omits it', () => {
    const [side] = buildDrawerBoxCuts([drawer({ runnerId: 'tandem-19' })], 56.7, 60);
    expect(side!.note).toBe('19mm 45°'); // TANDEM 19 max
  });

  it('falls back to the default runner when the drawer has none', () => {
    const cuts = buildDrawerBoxCuts([drawer({})], 56.7, 60, { defaultRunnerId: 'tandem-16' });
    expect(cuts).toHaveLength(4);
  });

  it('skips drawers with no resolvable runner (front handled elsewhere)', () => {
    expect(buildDrawerBoxCuts([drawer({})], 56.7, 60)).toEqual([]);
    expect(buildDrawerBoxCuts([drawer({ runnerId: 'nope' })], 56.7, 60)).toEqual([]);
  });

  it('buttGroove joinery → front/back at SKW, no 45° note', () => {
    const [side, front] = buildDrawerBoxCuts(
      [drawer({ runnerId: 'tandem-16', drawerSideThicknessMm: 16 })], 56.7, 60, { joinery: 'buttGroove' },
    );
    expect(side!.note).toBe('16mm');               // no 45°
    expect(front!.w).toBe(567 - 42);               // SKW, not outer
  });
});
