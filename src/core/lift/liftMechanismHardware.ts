import type { HardwareLineItem } from '../../types/hardware';
import type { LiftMechanismSpec } from '../../types/liftMechanisms';
import { getLiftMechanism } from '../../catalog/liftMechanisms';

/** Generic placeholder spec id in the `wall_cabinet` hardware preset. A chosen
 *  AVENTOS family supersedes this flat line. */
export const GENERIC_LIFT_SPEC_ID = 'lift-mechanism';

export interface LiftMechanismHardwareInput {
  /** Chosen family id (e.g. `aventos-hk`); undefined → keep the generic line. */
  liftMechanismId: string | undefined;
  /** External cabinet height (cm) — checked against the family's range. */
  cabinetHeightCm: number;
  /** Cabinet width (cm) — checked against the family's max. */
  cabinetWidthCm: number;
  /** Flap count (one mechanism set per flap door). */
  flapCount: number;
  /** Price override (₪) from Settings; falls back to the catalog price. */
  priceOverride?: number;
}

export interface LiftMechanismHardwareResult {
  lines: HardwareLineItem[];
  /** Non-blocking range warnings (freedom principle — inform, don't block). */
  warnings: string[];
}

/** Price (₪) of one mechanism set — the Settings override wins over the catalog. */
export function liftMechanismPriceShekel(spec: LiftMechanismSpec, override?: number): number {
  return override ?? spec.priceShekel;
}

const cm = (mm: number) => mm / 10;

/** Priced hardware line for the chosen AVENTOS family (one set per flap) plus
 *  cabinet height/width range warnings. Returns empty when no family is chosen
 *  or it doesn't resolve (or there are no flaps) — the caller then keeps the
 *  generic placeholder line. */
export function buildLiftMechanismHardware(input: LiftMechanismHardwareInput): LiftMechanismHardwareResult {
  const spec = getLiftMechanism(input.liftMechanismId ?? '');
  if (!spec || input.flapCount <= 0) return { lines: [], warnings: [] };

  const price = liftMechanismPriceShekel(spec, input.priceOverride);
  const lines: HardwareLineItem[] = [{
    specId: `lift-${spec.id}`,
    name: spec.name,
    qty: input.flapCount,
    unit: 'יח\'',
    unitPrice: price,
    total: price * input.flapCount,
  }];

  const warnings: string[] = [];
  const hMm = input.cabinetHeightCm * 10;
  if (hMm < spec.cabinetHeightMm.min || hMm > spec.cabinetHeightMm.max) {
    warnings.push(
      `גובה הארון ${input.cabinetHeightCm} ס"מ מחוץ לטווח של ${spec.name} ` +
      `(${cm(spec.cabinetHeightMm.min)}–${cm(spec.cabinetHeightMm.max)} ס"מ)`,
    );
  }
  if (input.cabinetWidthCm * 10 > spec.maxCabinetWidthMm) {
    warnings.push(
      `רוחב הארון ${input.cabinetWidthCm} ס"מ חורג מהמרבי של ${spec.name} ` +
      `(${cm(spec.maxCabinetWidthMm)} ס"מ)`,
    );
  }
  return { lines, warnings };
}

/** Replaces the generic placeholder lift line in the base hardware list with the
 *  chosen family's priced line(s). Returns `base` unchanged when there are none. */
export function mergeLiftMechanismHardware(
  base: HardwareLineItem[],
  liftLines: HardwareLineItem[],
): HardwareLineItem[] {
  if (liftLines.length === 0) return base;
  return [...base.filter(l => l.specId !== GENERIC_LIFT_SPEC_ID), ...liftLines];
}
