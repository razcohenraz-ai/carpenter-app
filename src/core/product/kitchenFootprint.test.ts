import { describe, it, expect } from 'vitest';
import { kitchenElevationLayout, WALL_BOTTOM_CM } from './kitchenFootprint';
import { kitchenModuleInput, kitchenModuleState, type KitchenModuleType } from './kitchenModules';
import type { KitchenUnit } from '../../types/project';

let n = 0;
function mkUnit(moduleType: KitchenModuleType, w?: number): KitchenUnit {
  return {
    id: `u${n++}`, name: moduleType, moduleType,
    cabinet: { input: kitchenModuleInput(moduleType, w), state: kitchenModuleState(moduleType) },
  };
}

describe('kitchenElevationLayout', () => {
  it('base units run left→right on the floor', () => {
    const [a, b] = kitchenElevationLayout([mkUnit('drawers', 60), mkUnit('drawers', 80)]);
    expect(a).toMatchObject({ xCm: 0, yBottomCm: 0, w: 60, h: 90, depth: 60, isWall: false });
    expect(b).toMatchObject({ xCm: 60, yBottomCm: 0, w: 80, isWall: false });
  });

  it('a wall cabinet floats in the upper row at WALL_BOTTOM_CM', () => {
    const layout = kitchenElevationLayout([mkUnit('drawers', 60), mkUnit('wall', 100)]);
    const wall = layout.find(b => b.isWall)!;
    expect(wall.yBottomCm).toBe(WALL_BOTTOM_CM); // 152
    expect(wall.h).toBe(50);
    expect(wall.xCm).toBe(0);                    // tracks the base run start
  });

  it('pantry-top stacks directly above a pantry (H=152 touches but does not block)', () => {
    const layout = kitchenElevationLayout([mkUnit('pantry', 60), mkUnit('pantry-top', 60)]);
    const pantry = layout.find(b => !b.isWall)!;
    const top = layout.find(b => b.isWall)!;
    expect(pantry).toMatchObject({ xCm: 0, yBottomCm: 0, h: 152 });
    expect(top).toMatchObject({ xCm: 0, yBottomCm: WALL_BOTTOM_CM }); // same x → aligned column
  });

  it('a tall base unit (H>152) pushes a wall cabinet past it', () => {
    const tall = mkUnit('drawers', 60);
    tall.cabinet.input = { ...tall.cabinet.input, H: 200 };
    const layout = kitchenElevationLayout([tall, mkUnit('wall', 100)]);
    const wall = layout.find(b => b.isWall)!;
    expect(wall.xCm).toBe(60);                   // pushed past the tall base [0,60]
    expect(wall.yBottomCm).toBe(WALL_BOTTOM_CM);
  });
});
