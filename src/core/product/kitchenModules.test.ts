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

  // The bug closed by this branch: widening a drawers unit past maxDoorWidth
  // (e.g. W=90, maxDoorWidth=60) auto-split into two drawer faces — but a
  // drawers unit emits ONE bank per body. `singleFront:true` pins the column
  // count to 1; downstream sketches + the cut list both follow.
  it('singleFront = true (drawer face always spans the full body width)', () => {
    expect(kitchenModuleInput('drawers').singleFront).toBe(true);
    expect(kitchenModuleInput('drawers', 90).singleFront).toBe(true);
  });
});

describe('kitchenModuleInput — shelves', () => {
  it('singleFront NOT set (a wide shelves unit can split into 2 doors at >60)', () => {
    expect(kitchenModuleInput('shelves').singleFront).toBeUndefined();
  });

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
  it('default W = 60, H = 152 (top aligned with wall-cabinet bottom), D = 60, plinth = 10', () => {
    const inp = kitchenModuleInput('pantry');
    expect(inp.W).toBe(60);
    expect(inp.H).toBe(152);
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

  it('default maxDoorWidth = 120 (>= default W=100)', () => {
    expect(kitchenModuleInput('wall').maxDoorWidth).toBe(120);
  });

  it('mount = wall (drives elevation + shelf-only editor)', () => {
    expect(kitchenModuleInput('wall').mount).toBe('wall');
  });

  it('has a door: hasFronts left at default (undefined → true)', () => {
    expect(kitchenModuleInput('wall').hasFronts).toBeUndefined();
  });

  // liftMechanism separates the lift-up mechanism from the wall mount, so
  // pantry-top (also wall-mounted) can use normal cup hinges.
  it('wall → liftMechanism = true (cup hinges replaced by lift-up panel)', () => {
    expect(kitchenModuleInput('wall').liftMechanism).toBe(true);
  });

  // singleFront pins the column count regardless of width override — a wide
  // קלפה (e.g. W=130) keeps a single lift panel rather than splitting.
  it('wall → singleFront = true (lift panel is one piece per body)', () => {
    expect(kitchenModuleInput('wall').singleFront).toBe(true);
  });
});

describe('kitchenModuleInput — pantry-top (עליון מזווה)', () => {
  it('default W=60, H=50, D=60, plinth=0 (pantry footprint, wall height)', () => {
    const inp = kitchenModuleInput('pantry-top');
    expect(inp.W).toBe(60);
    expect(inp.H).toBe(50);
    expect(inp.D).toBe(60);
    expect(inp.plinth).toBe(0);
  });

  it('W override is respected', () => {
    expect(kitchenModuleInput('pantry-top', 80).W).toBe(80);
  });

  it('maxDoorWidth = 60 (standard kitchen; W>60 override splits into 2 doors)', () => {
    expect(kitchenModuleInput('pantry-top').maxDoorWidth).toBe(60);
  });

  it('mount = wall (drives elevation + shelf-only editor)', () => {
    expect(kitchenModuleInput('pantry-top').mount).toBe('wall');
  });

  // Unlike the wall cabinet (קלפה), pantry-top uses ordinary cup hinges — so
  // liftMechanism stays unset (the body editor must show hinge controls).
  it('liftMechanism is NOT set (normal cup hinges, not lift-up)', () => {
    expect(kitchenModuleInput('pantry-top').liftMechanism).toBeUndefined();
  });

  // pantry-top is the explicit reason mount='wall' no longer pins the column
  // count in frontColumnsForBox: a wider pantry-top must split into multiple
  // doors, unlike the lift-panel קלפה.
  it('singleFront is NOT set (a wider pantry-top splits into multiple doors)', () => {
    expect(kitchenModuleInput('pantry-top').singleFront).toBeUndefined();
  });

  it('has a door: hasFronts left at default (undefined → true)', () => {
    expect(kitchenModuleInput('pantry-top').hasFronts).toBeUndefined();
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

  it('wall → 1 centred shelf (single-door wall cabinet)', () => {
    const st = kitchenModuleState('wall');
    const items = st.interior['single:single'];
    expect(items).toBeDefined();
    expect(items!.length).toBe(1);
    expect(items![0]!.type).toBe('shelf');
  });

  it('pantry-top → 1 centred shelf (single-door cabinet above the pantry)', () => {
    const st = kitchenModuleState('pantry-top');
    const items = st.interior['single:single'];
    expect(items).toBeDefined();
    expect(items!.length).toBe(1);
    expect(items![0]!.type).toBe('shelf');
    // Same hff as the wall cabinet — both share a 50 cm body split at 24.1.
    expect((items![0] as { heightFromFloor: number }).heightFromFloor).toBe(24.1);
  });

  it('pantry → 5 internal drawers, bottom 30 + 4×28, filling bodyH=142 exactly', () => {
    const st = kitchenModuleState('pantry');
    const items = st.interior['single:single'];
    expect(items).toBeDefined();
    const drawers = items!.filter((i): i is import('../../types/interior').DrawerItem => i.type === 'drawer');
    expect(drawers.length).toBe(5);
    // All internal (behind the doors).
    expect(drawers.every(d => d.mount === 'internal')).toBe(true);
    // Bottom drawer = 30 at floor; the rest = 28 (deeper-storage pattern).
    const sorted = [...drawers].sort((a, b) => a.heightFromFloor - b.heightFromFloor);
    expect(sorted[0]!.heightFromFloor).toBe(0);
    expect(sorted[0]!.drawerHeight).toBe(30);
    expect(sorted.slice(1).every(d => d.drawerHeight === 28)).toBe(true);
    // No overlaps: each drawer starts exactly where the previous one ends.
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i + 1]!.heightFromFloor).toBe(sorted[i]!.heightFromFloor + sorted[i]!.drawerHeight);
    }
    // Stack fills to the ceiling exactly: top of highest = bodyH = 152 − 10 = 142.
    const top = sorted[sorted.length - 1]!;
    expect(top.heightFromFloor + top.drawerHeight).toBe(142);
  });
});
