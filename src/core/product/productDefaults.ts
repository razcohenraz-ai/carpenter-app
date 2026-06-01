import type { CabinetInput } from '../../types/cabinet';
import type { ProductType } from '../../types/project';

/** Default CabinetInput for each product type. All types currently use the
 *  same baseline; per-type differences (no doors for bookcase, taller plinth
 *  for kitchen, etc.) will be refined as each type is built out. */
const BASE_DEFAULTS: CabinetInput = {
  W: 60,
  H: 220,
  D: 60,
  backThickness: 0.6,
  hasShell: false,
  hasEnvelopeTop: false,
  bodyMaterialId: 'mdf18',
  frontMaterialId: 'oak18',
  plinth: 0,
  plinthRecess: 0,
  doorCoversPlinth: false,
  lowerDoorH: undefined,
  middleDoorH: undefined,
  doorsPerColumn: 'auto',
  doorGapMm: 3,
  maxDoorWidth: 60,
};

/** Returns the default CabinetInput for a given product type.
 *  Each call returns a fresh copy — safe to mutate. */
export function defaultInputForType(type: ProductType): CabinetInput {
  // Future: each type will override relevant fields (e.g. bookcase → plinth=0,
  // no door defaults; kitchen → plinth=10, separate upper/lower unit logic).
  // For now all types share the baseline.
  void type;
  return { ...BASE_DEFAULTS };
}

/** Default SavedCabinetState — empty, no user choices yet. */
export function emptyCabinetState() {
  return {
    interior: {} as Record<string, never>,
    cellInterior: {} as Record<string, never>,
    partitions: {} as Record<string, never>,
    doors: {} as Record<string, never>,
    plinthGableOverrides: {} as Record<string, never>,
    boardOverrides: {} as Record<string, never>,
  };
}
