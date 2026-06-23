import { describe, it, expect } from 'vitest';
import type { HardwareLineItem } from '../../types/hardware';
import { getLiftMechanism } from '../../catalog/liftMechanisms';
import {
  liftMechanismPriceShekel,
  buildLiftMechanismHardware,
  mergeLiftMechanismHardware,
  GENERIC_LIFT_SPEC_ID,
} from './liftMechanismHardware';

const genericLift = (qty: number): HardwareLineItem =>
  ({ specId: GENERIC_LIFT_SPEC_ID, name: 'מנגנון קלפה', qty, unit: 'יח\'', unitPrice: 200, total: qty * 200 });

describe('liftMechanismPriceShekel', () => {
  it('override wins over the catalog price', () => {
    const hk = getLiftMechanism('aventos-hk')!;
    expect(liftMechanismPriceShekel(hk)).toBe(200);        // catalog default
    expect(liftMechanismPriceShekel(hk, 260)).toBe(260);   // override
  });
});

describe('buildLiftMechanismHardware', () => {
  it('emits one priced set per flap for the chosen family', () => {
    const { lines, warnings } = buildLiftMechanismHardware({
      liftMechanismId: 'aventos-hk', cabinetHeightCm: 50, cabinetWidthCm: 90, flapCount: 1,
    });
    expect(lines).toHaveLength(1);
    expect([lines[0]!.specId, lines[0]!.qty, lines[0]!.unitPrice]).toEqual(['lift-aventos-hk', 1, 200]);
    expect(warnings).toEqual([]); // 50 cm ∈ [20.5, 60], 90 cm ≤ 180
  });

  it('applies a price override and multiplies by the flap count', () => {
    const { lines } = buildLiftMechanismHardware({
      liftMechanismId: 'aventos-hl', cabinetHeightCm: 45, cabinetWidthCm: 80, flapCount: 2, priceOverride: 300,
    });
    expect([lines[0]!.qty, lines[0]!.unitPrice, lines[0]!.total]).toEqual([2, 300, 600]);
  });

  it('warns (does not block) when the cabinet height is out of range', () => {
    // HL range is 30–58 cm; 25 cm is too short.
    const { lines, warnings } = buildLiftMechanismHardware({
      liftMechanismId: 'aventos-hl', cabinetHeightCm: 25, cabinetWidthCm: 80, flapCount: 1,
    });
    expect(lines).toHaveLength(1);                 // still emitted (warn, not block)
    expect(warnings.some(w => w.includes('גובה'))).toBe(true);
  });

  it('warns when the cabinet width exceeds the family max (1800 mm)', () => {
    const { warnings } = buildLiftMechanismHardware({
      liftMechanismId: 'aventos-hk', cabinetHeightCm: 50, cabinetWidthCm: 200, flapCount: 1,
    });
    expect(warnings.some(w => w.includes('רוחב'))).toBe(true);
  });

  it('returns nothing for an unknown family or zero flaps (generic kept)', () => {
    expect(buildLiftMechanismHardware({ liftMechanismId: 'nope', cabinetHeightCm: 50, cabinetWidthCm: 80, flapCount: 1 }).lines).toEqual([]);
    expect(buildLiftMechanismHardware({ liftMechanismId: undefined, cabinetHeightCm: 50, cabinetWidthCm: 80, flapCount: 1 }).lines).toEqual([]);
    expect(buildLiftMechanismHardware({ liftMechanismId: 'aventos-hk', cabinetHeightCm: 50, cabinetWidthCm: 80, flapCount: 0 }).lines).toEqual([]);
  });
});

describe('mergeLiftMechanismHardware', () => {
  it('replaces the generic placeholder line with the chosen family line', () => {
    const { lines } = buildLiftMechanismHardware({
      liftMechanismId: 'aventos-hk', cabinetHeightCm: 50, cabinetWidthCm: 90, flapCount: 1,
    });
    const merged = mergeLiftMechanismHardware([genericLift(1)], lines);
    expect(merged.some(l => l.specId === GENERIC_LIFT_SPEC_ID)).toBe(false);
    expect(merged.some(l => l.specId === 'lift-aventos-hk')).toBe(true);
  });

  it('returns the base unchanged when there is no family line', () => {
    const base = [genericLift(1)];
    expect(mergeLiftMechanismHardware(base, [])).toBe(base);
  });
});
