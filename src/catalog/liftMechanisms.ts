import type { LiftMechanismCatalog, LiftMechanismSpec } from '../types/liftMechanisms';
import rawLiftMechanisms from './liftMechanisms.json';

// Lift-mechanism systems loaded from liftMechanisms.json.
// To add a system or adjust a spec — edit the JSON only, not this file.
export const LIFT_MECHANISMS: LiftMechanismCatalog = rawLiftMechanisms as LiftMechanismCatalog;

export function getLiftMechanism(id: string): LiftMechanismSpec | undefined {
  return LIFT_MECHANISMS[id];
}

/** All lift-mechanism ids in catalog order — for the Settings list + picker. */
export function liftMechanismIds(): string[] {
  return Object.keys(LIFT_MECHANISMS);
}
