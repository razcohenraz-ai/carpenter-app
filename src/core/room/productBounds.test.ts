import { describe, it, expect } from 'vitest';
import { productBounds, productSubBoxes } from './productBounds';
import { kitchenModuleInput, kitchenModuleState, type KitchenModuleType } from '../product/kitchenModules';
import type { ProductUnit, KitchenUnit } from '../../types/project';

let n = 0;
function mkKitchenUnit(moduleType: KitchenModuleType, w?: number): KitchenUnit {
  return {
    id: `u${n++}`, name: moduleType, moduleType,
    cabinet: { input: kitchenModuleInput(moduleType, w), state: kitchenModuleState(moduleType) },
  };
}

function mkKitchen(units: KitchenUnit[]): ProductUnit {
  return {
    id: 'k', name: 'מטבח', productType: 'kitchen',
    cabinet: { input: kitchenModuleInput('drawers'), state: kitchenModuleState('drawers') },
    kitchenUnits: units,
  };
}

describe('productBounds', () => {
  it('non-kitchen product → cabinet W×H×D verbatim', () => {
    const wardrobe = {
      id: 'p', name: 'ארון', productType: 'wardrobe',
      cabinet: { input: { W: 100, H: 220, D: 60 }, state: {} },
    } as unknown as ProductUnit;
    expect(productBounds(wardrobe)).toEqual({ width: 100, height: 220, depth: 60 });
  });

  it('empty kitchen → all zeros', () => {
    expect(productBounds(mkKitchen([]))).toEqual({ width: 0, height: 0, depth: 0 });
  });

  it('base-only kitchen → Σ widths, max depth, base+countertop height', () => {
    const b = productBounds(mkKitchen([mkKitchenUnit('drawers', 60), mkKitchenUnit('drawers', 80)]));
    expect(b.width).toBeCloseTo(140, 5);   // 60 + 80, no shell on default kitchen units
    expect(b.depth).toBe(60);              // both drawers D=60
    expect(b.height).toBe(92);             // BASE_REF_H_CM(90) + COUNTERTOP_CM(2)
  });

  it('kitchen with a wall cabinet → wall does NOT add floor width but raises height', () => {
    const b = productBounds(mkKitchen([mkKitchenUnit('drawers', 60), mkKitchenUnit('wall', 100)]));
    expect(b.width).toBeCloseTo(60, 5);    // only the base unit counts toward floor width
    expect(b.height).toBe(202);            // WALL_BOTTOM_CM(152) + wall cabinet H(50)
  });
});

describe('productSubBoxes', () => {
  it('non-kitchen → a single full-size box', () => {
    const wardrobe = {
      id: 'p', name: 'ארון', productType: 'wardrobe',
      cabinet: { input: { W: 100, H: 220, D: 60 }, state: {} },
    } as unknown as ProductUnit;
    expect(productSubBoxes(wardrobe)).toEqual([{ x0: 0, x1: 100, y0: 0, y1: 220, z0: 0, z1: 60 }]);
  });

  it('base-only kitchen → one floor box per base unit at its real height', () => {
    const boxes = productSubBoxes(mkKitchen([mkKitchenUnit('drawers', 60), mkKitchenUnit('drawers', 80)]));
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({ x0: 0, x1: 60, y0: 0, y1: 90, z0: 0, z1: 60 });
    expect(boxes[1]).toMatchObject({ x0: 60, x1: 140, y0: 0, y1: 90 });
  });

  it('kitchen with a wall cabinet → floor box + floating wall box with a real open gap', () => {
    const boxes = productSubBoxes(mkKitchen([mkKitchenUnit('drawers', 60), mkKitchenUnit('wall', 100)]));
    const base = boxes.find(b => b.y0 === 0)!;
    const wall = boxes.find(b => b.y0 > 0)!;
    expect(base).toMatchObject({ y0: 0, y1: 90 });
    expect(wall.y0).toBe(152);                 // WALL_BOTTOM_CM
    expect(wall.y1).toBe(202);                 // 152 + wall H(50)
    expect(wall.y0).toBeGreaterThan(base.y1);  // the gap between countertop and wall row is real
  });

  it('parity: the union of sub-boxes matches productBounds width & depth', () => {
    const fixtures = [
      [mkKitchenUnit('drawers', 60), mkKitchenUnit('drawers', 80)],
      [mkKitchenUnit('drawers', 100), mkKitchenUnit('wall', 60)],
    ];
    for (const units of fixtures) {
      const k = mkKitchen(units);
      const boxes = productSubBoxes(k);
      const b = productBounds(k);
      expect(Math.max(...boxes.map(x => x.x1))).toBeCloseTo(b.width, 5);
      expect(Math.max(...boxes.map(x => x.z1))).toBeCloseTo(b.depth, 5);
    }
  });
});
