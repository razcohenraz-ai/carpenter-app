import type { CabinetInput } from '../../types/cabinet';
import type { SavedCabinetState } from '../../types/project';

export type KitchenModuleType = 'drawers' | 'shelves' | 'sink' | 'dishwasher';

/** Default dimensions for lower kitchen units. */
const KITCHEN_DEFAULTS = {
  H: 90,
  D: 60,
  plinth: 10,
  backThickness: 0.6,
  hasShell: false,
  hasShellLeft: false,
  hasShellRight: false,
  hasEnvelopeTop: false,
  bodyMaterialId: 'mdf18',
  frontMaterialId: 'oak18',
  plinthRecess: 0,
  doorCoversPlinth: false,
  lowerDoorH: undefined,
  middleDoorH: undefined,
  doorsPerColumn: 'auto' as const,
  doorGapMm: 3,
  maxDoorWidth: 60,
} satisfies Omit<CabinetInput, 'W'>;

/** Returns a fresh CabinetInput for the given kitchen module type.
 *  `w` overrides the default width (60 cm for drawers/shelves, 80 cm for sink,
 *  64 cm for dishwasher). */
export function kitchenModuleInput(type: KitchenModuleType, w?: number): CabinetInput {
  const defaultW = type === 'sink' ? 80 : type === 'dishwasher' ? 64 : 60;
  const base: CabinetInput = { ...KITCHEN_DEFAULTS, W: w ?? defaultW };

  if (type === 'sink') {
    return { ...base, topVariant: 'sink-open', sinkTraverseWidthCm: 10 };
  }
  if (type === 'dishwasher') {
    // Appliance bay: sits directly on the floor (no plinth → breaks the
    // kitchen plinth run via groupKitchenUnitsForPlinth), no back, no bottom,
    // no fronts (empty interior + undefined door heights → calcDoors returns 0).
    // The body fills the full kitchen height (plinth=0 + H=90 → 90 cm body).
    return { ...base, plinth: 0, hasFronts: false, hasBack: false, hasBottom: false };
  }
  return base;
}

/** Returns a fresh SavedCabinetState pre-populated for the given module.
 *
 * Keys use `boxStableKey` format: for a single-box cabinet = `"single:single"`. */
export function kitchenModuleState(type: KitchenModuleType): SavedCabinetState {
  const emptyBase: SavedCabinetState = {
    interior: {}, cellInterior: {}, partitions: {}, doors: {},
    plinthGableOverrides: {}, boardOverrides: {},
  };

  const slotKey = 'single:single';

  if (type === 'drawers') {
    return {
      ...emptyBase,
      interior: {
        [slotKey]: [
          { id: 'km-d1', type: 'drawer', heightFromFloor: 0,  drawerHeight: 31.7, mount: 'external' },
          { id: 'km-d2', type: 'drawer', heightFromFloor: 32, drawerHeight: 31.7, mount: 'external' },
          { id: 'km-d3', type: 'drawer', heightFromFloor: 64, drawerHeight: 15.7, mount: 'external' },
        ],
      },
    };
  }

  if (type === 'shelves') {
    return {
      ...emptyBase,
      interior: {
        [slotKey]: [
          { id: 'km-s1', type: 'shelf', heightFromFloor: 25 },
          { id: 'km-s2', type: 'shelf', heightFromFloor: 50 },
        ],
      },
    };
  }

  // sink + dishwasher: no interior items — the unit is empty (basin / appliance).
  return emptyBase;
}
