import { describe, it, expect } from 'vitest';
import type { KitchenUnit } from '../../types/project';
import type { CabinetInput } from '../../types/cabinet';
import { groupKitchenUnitsForPlinth } from './kitchenPlinth';
import { kitchenModuleInput, kitchenModuleState } from './kitchenModules';

function unit(id: string, input: Partial<CabinetInput> = {}): KitchenUnit {
  const fullInput: CabinetInput = { ...kitchenModuleInput('drawers'), ...input };
  return {
    id,
    name: id,
    moduleType: 'drawers',
    cabinet: {
      input: fullInput,
      state: kitchenModuleState('drawers'),
    },
  };
}

describe('groupKitchenUnitsForPlinth — dishwasher breaks plinth groups', () => {
  it('3 drawer units in a row → 1 group of 3', () => {
    const groups = groupKitchenUnitsForPlinth([
      unit('a'), unit('b'), unit('c'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.units).toHaveLength(3);
    expect(groups[0]!.totalW).toBe(180);
  });

  it('drawers + dishwasher + drawers → 2 groups (the dishwasher splits the run)', () => {
    const groups = groupKitchenUnitsForPlinth([
      unit('a'),
      // Dishwasher unit: plinth = 0 breaks the group via plinthKeyOf returning null.
      { ...unit('dw', kitchenModuleInput('dishwasher')), moduleType: 'dishwasher' },
      unit('b'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.units.map(u => u.id)).toEqual(['a']);
    expect(groups[1]!.units.map(u => u.id)).toEqual(['b']);
  });

  it('dishwasher at the start → 1 plinth group after it (the dishwasher itself produces no plinth)', () => {
    const groups = groupKitchenUnitsForPlinth([
      { ...unit('dw', kitchenModuleInput('dishwasher')), moduleType: 'dishwasher' },
      unit('a'), unit('b'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.units.map(u => u.id)).toEqual(['a', 'b']);
  });

  it('two dishwashers separated by drawers → 3 plinth groups (sandwiched cabinets each their own group)', () => {
    const groups = groupKitchenUnitsForPlinth([
      unit('a'),
      { ...unit('dw1', kitchenModuleInput('dishwasher')), moduleType: 'dishwasher' },
      unit('b'),
      { ...unit('dw2', kitchenModuleInput('dishwasher')), moduleType: 'dishwasher' },
      unit('c'),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map(g => g.units.map(u => u.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('back-to-back dishwashers → 0 plinth groups (no plinth at all)', () => {
    const groups = groupKitchenUnitsForPlinth([
      { ...unit('dw1', kitchenModuleInput('dishwasher')), moduleType: 'dishwasher' },
      { ...unit('dw2', kitchenModuleInput('dishwasher')), moduleType: 'dishwasher' },
    ]);
    expect(groups).toHaveLength(0);
  });
});
