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
});
