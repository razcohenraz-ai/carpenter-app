import { describe, it, expect } from 'vitest';
import { cabinetFrontPanels } from './cabinetFronts';
import { defaultInputForType, emptyCabinetState } from './productDefaults';
import { kitchenModuleInput, kitchenModuleState } from './kitchenModules';
import type { CabinetInput, SavedCabinetState } from '../../types';

function singleBodyInput(): CabinetInput {
  return { ...defaultInputForType('wardrobe'), doorsPerColumn: 1 };
}
const state = () => emptyCabinetState() as SavedCabinetState;

describe('cabinetFrontPanels', () => {
  it('emits door faces within the width, above the plinth, up to the cabinet top', () => {
    const input = singleBodyInput();
    const panels = cabinetFrontPanels(input, state(), []);
    expect(panels.length).toBeGreaterThan(0);
    for (const p of panels) {
      expect(p.x0).toBeGreaterThanOrEqual(-0.01);
      expect(p.x1).toBeLessThanOrEqual(input.W + 0.01);
      expect(p.y0).toBeGreaterThanOrEqual(input.plinth - 0.01); // faces start above the plinth
      expect(p.y1).toBeLessThanOrEqual(input.H + 0.01);
      expect(p.y1).toBeGreaterThan(p.y0);
    }
  });

  it('an appliance bay (hasFronts:false, no external drawers) has no faces', () => {
    const input = { ...singleBodyInput(), hasFronts: false };
    expect(cabinetFrontPanels(input, state(), [])).toHaveLength(0);
  });

  it('shelled cabinet: door faces sit INSIDE the shell, never past W', () => {
    // Regression: the render used to lay fronts over the full W and shift them
    // right by the left shell, so a shelled face overhung the right edge by one
    // shell thickness. Masked by the old inter-unit gap in 3D; once kitchen
    // units packed flush it overlapped the neighbour. Fronts must match the cut
    // list — inset within the shell opening, within [0, W].
    const W = singleBodyInput().W;
    const noShell = cabinetFrontPanels(singleBodyInput(), state(), []);
    const shelled = cabinetFrontPanels({ ...singleBodyInput(), hasShell: true }, state(), []);

    for (const p of shelled) {
      expect(p.x0).toBeGreaterThanOrEqual(-0.01);
      expect(p.x1).toBeLessThanOrEqual(W + 0.01); // no overhang past the shell
    }
    const leftX0 = (ps: typeof shelled) => Math.min(...ps.map(p => p.x0));
    const doorW = (ps: typeof shelled) => Math.max(...ps.map(p => p.x1 - p.x0));
    expect(leftX0(shelled)).toBeGreaterThan(leftX0(noShell)); // inset by the shell
    expect(doorW(shelled)).toBeLessThan(doorW(noShell));      // spans innerW, not W
  });

  it('door panels carry a hinge side (for the elevation marking symbol)', () => {
    const panels = cabinetFrontPanels(singleBodyInput(), state(), []);
    const doors = panels.filter(p => p.hingeSide !== undefined);
    expect(doors.length).toBeGreaterThan(0);
    // A single-door body defaults to a right-hinged door.
    expect(doors[0]!.hingeSide).toBe('right');
  });

  it('corner (פינה): the door panel is hinged on the filler side, the filler has none', () => {
    const input = kitchenModuleInput('corner'); // door on the right → hinge left
    const panels = cabinetFrontPanels(input, kitchenModuleState('corner') as SavedCabinetState, []);
    const hinged = panels.filter(p => p.hingeSide !== undefined);
    expect(hinged).toHaveLength(1);                 // only the door, not the filler
    expect(hinged[0]!.hingeSide).toBe('left');      // filler side (opposite the right edge)
  });

  it('lift-up door (קלפה): the hinge edge is the top (opens upward)', () => {
    const input = kitchenModuleInput('wall'); // liftMechanism: true
    const panels = cabinetFrontPanels(input, kitchenModuleState('wall') as SavedCabinetState, []);
    const hinged = panels.filter(p => p.hingeSide !== undefined);
    expect(hinged.length).toBeGreaterThan(0);
    expect(hinged.every(p => p.hingeSide === 'top')).toBe(true);
  });

  it('קלפה with wall envelope: the lift door sits BETWEEN the caps, not over them', () => {
    // Regression: calcDoors laid the door over the full external H, ignoring the
    // top+bottom envelope caps (front material, tFront each) → the door overlapped
    // both caps in 2D + 3D. It must fit inside the inner opening, mirroring the
    // cut list (door height from box.H, already reduced by the caps).
    const input = { ...kitchenModuleInput('wall'), hasWallEnvelope: true };
    const tFront = 1.8; // oak18 front material → cap thickness
    const door = cabinetFrontPanels(input, kitchenModuleState('wall') as SavedCabinetState, [])
      .find(p => p.hingeSide === 'top')!;
    expect(door).toBeDefined();
    expect(door.y0).toBeGreaterThanOrEqual(input.plinth + tFront - 0.01); // above the bottom cap
    expect(door.y1).toBeLessThanOrEqual(input.H - tFront + 0.01);          // below the top cap
  });
});
