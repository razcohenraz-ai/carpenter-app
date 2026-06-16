import { describe, it, expect } from 'vitest';
import { cabinetFrontPanels } from './cabinetFronts';
import { defaultInputForType, emptyCabinetState } from './productDefaults';
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
});
