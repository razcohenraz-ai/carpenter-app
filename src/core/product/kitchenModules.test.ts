import { describe, it, expect } from 'vitest';
import { kitchenModuleInput, kitchenModuleState } from './kitchenModules';

describe('kitchenModuleInput — drawers', () => {
  it('default W = 60, plinth = 10 (full kitchen base unit)', () => {
    const inp = kitchenModuleInput('drawers');
    expect(inp.W).toBe(60);
    expect(inp.plinth).toBe(10);
    expect(inp.H).toBe(90);
    expect(inp.D).toBe(60);
  });

  it('W override is respected', () => {
    expect(kitchenModuleInput('drawers', 75).W).toBe(75);
  });
});

describe('kitchenModuleInput — shelves', () => {
  it('default W = 60', () => {
    expect(kitchenModuleInput('shelves').W).toBe(60);
  });
});

describe('kitchenModuleInput — sink', () => {
  it('default W = 80, topVariant = sink-open, sinkTraverseWidthCm = 10', () => {
    const inp = kitchenModuleInput('sink');
    expect(inp.W).toBe(80);
    expect(inp.topVariant).toBe('sink-open');
    expect(inp.sinkTraverseWidthCm).toBe(10);
    expect(inp.plinth).toBe(10);
  });
});

describe('kitchenModuleInput — dishwasher', () => {
  it('default W = 64', () => {
    expect(kitchenModuleInput('dishwasher').W).toBe(64);
  });

  it('W override is respected', () => {
    expect(kitchenModuleInput('dishwasher', 60).W).toBe(60);
    expect(kitchenModuleInput('dishwasher', 70).W).toBe(70);
  });

  it('plinth = 0 → breaks the kitchen plinth run via groupKitchenUnitsForPlinth', () => {
    expect(kitchenModuleInput('dishwasher').plinth).toBe(0);
  });

  it('hasBack = false, hasBottom = false → empty appliance bay (only gables + top)', () => {
    const inp = kitchenModuleInput('dishwasher');
    expect(inp.hasBack).toBe(false);
    expect(inp.hasBottom).toBe(false);
  });

  it('inherits kitchen H = 90 and D = 60 from KITCHEN_DEFAULTS', () => {
    const inp = kitchenModuleInput('dishwasher');
    expect(inp.H).toBe(90);
    expect(inp.D).toBe(60);
  });

  it('no fronts: lowerDoorH / middleDoorH undefined → calcDoors returns n=0', () => {
    const inp = kitchenModuleInput('dishwasher');
    expect(inp.lowerDoorH).toBeUndefined();
    expect(inp.middleDoorH).toBeUndefined();
  });

  it('topVariant left at default (standard) → top board IS emitted', () => {
    expect(kitchenModuleInput('dishwasher').topVariant).toBeUndefined();
  });
});

describe('kitchenModuleInput — pantry (מזווה)', () => {
  it('default W = 60, H = 180 (taller than countertop), D = 60, plinth = 10', () => {
    const inp = kitchenModuleInput('pantry');
    expect(inp.W).toBe(60);
    expect(inp.H).toBe(180);
    expect(inp.D).toBe(60);
    expect(inp.plinth).toBe(10);
  });

  it('W override is respected', () => {
    expect(kitchenModuleInput('pantry', 50).W).toBe(50);
  });

  it('has fronts (doors): hasFronts left at default (undefined → true)', () => {
    expect(kitchenModuleInput('pantry').hasFronts).toBeUndefined();
  });

  it('standard carcass: hasBack / hasBottom left at default (undefined → true)', () => {
    const inp = kitchenModuleInput('pantry');
    expect(inp.hasBack).toBeUndefined();
    expect(inp.hasBottom).toBeUndefined();
  });
});

describe('kitchenModuleInput — wall (קלפה)', () => {
  it('default W=100, H=50, D=35, plinth=0 (wall cabinet, no plinth)', () => {
    const inp = kitchenModuleInput('wall');
    expect(inp.W).toBe(100);
    expect(inp.H).toBe(50);
    expect(inp.D).toBe(35);
    expect(inp.plinth).toBe(0);
  });

  it('W override is respected', () => {
    expect(kitchenModuleInput('wall', 80).W).toBe(80);
  });

  it('single front: maxDoorWidth (120) > W (100) → one door column', () => {
    expect(kitchenModuleInput('wall').maxDoorWidth).toBe(120);
  });

  it('mount = wall (drives elevation + shelf-only editor)', () => {
    expect(kitchenModuleInput('wall').mount).toBe('wall');
  });

  it('has a door: hasFronts left at default (undefined → true)', () => {
    expect(kitchenModuleInput('wall').hasFronts).toBeUndefined();
  });
});

describe('kitchenModuleState — interior shape', () => {
  it('drawers → 3 external drawers', () => {
    const st = kitchenModuleState('drawers');
    const items = st.interior['single:single'];
    expect(items).toBeDefined();
    expect(items!.length).toBe(3);
    expect(items!.every(i => i.type === 'drawer')).toBe(true);
  });

  it('shelves → 2 shelves', () => {
    const st = kitchenModuleState('shelves');
    const items = st.interior['single:single'];
    expect(items).toBeDefined();
    expect(items!.length).toBe(2);
    expect(items!.every(i => i.type === 'shelf')).toBe(true);
  });

  it('sink → empty interior', () => {
    const st = kitchenModuleState('sink');
    expect(Object.keys(st.interior).length).toBe(0);
  });

  it('dishwasher → empty interior (no items at all)', () => {
    const st = kitchenModuleState('dishwasher');
    expect(Object.keys(st.interior).length).toBe(0);
    expect(Object.keys(st.doors).length).toBe(0);
    expect(Object.keys(st.partitions).length).toBe(0);
  });

  it('wall → 2 shelves (single-door wall cabinet)', () => {
    const st = kitchenModuleState('wall');
    const items = st.interior['single:single'];
    expect(items).toBeDefined();
    expect(items!.length).toBe(2);
    expect(items!.every(i => i.type === 'shelf')).toBe(true);
  });

  it('pantry → 6 internal drawers, bottom 30 + 5×28, filling bodyH=170 exactly', () => {
    const st = kitchenModuleState('pantry');
    const items = st.interior['single:single'];
    expect(items).toBeDefined();
    const drawers = items!.filter((i): i is import('../../types/interior').DrawerItem => i.type === 'drawer');
    expect(drawers.length).toBe(6);
    // All internal (behind the doors).
    expect(drawers.every(d => d.mount === 'internal')).toBe(true);
    // Bottom drawer = 30 at floor; the rest = 28.
    const sorted = [...drawers].sort((a, b) => a.heightFromFloor - b.heightFromFloor);
    expect(sorted[0]!.heightFromFloor).toBe(0);
    expect(sorted[0]!.drawerHeight).toBe(30);
    expect(sorted.slice(1).every(d => d.drawerHeight === 28)).toBe(true);
    // No overlaps: each drawer starts exactly where the previous one ends.
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i + 1]!.heightFromFloor).toBe(sorted[i]!.heightFromFloor + sorted[i]!.drawerHeight);
    }
    // Stack fills to the ceiling exactly: top of highest = bodyH = 180 − 10 = 170.
    const top = sorted[sorted.length - 1]!;
    expect(top.heightFromFloor + top.drawerHeight).toBe(170);
  });
});
