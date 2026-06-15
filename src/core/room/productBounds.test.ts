import { describe, it, expect } from 'vitest';
import { productBounds } from './productBounds';
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
