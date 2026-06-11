import type { CabinetInput } from '../../types/cabinet';
import type { SavedCabinetState } from '../../types/project';

export type KitchenModuleType = 'drawers' | 'shelves' | 'sink' | 'dishwasher' | 'oven' | 'pantry' | 'wall';

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
  const defaultW = type === 'sink' ? 80 : type === 'dishwasher' ? 64 : type === 'wall' ? 100 : 60;
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
  if (type === 'oven') {
    // Oven bay: standard cabinet (plinth, back, bottom) with a drawer at the
    // bottom and an open cavity above it for the oven appliance.
    // hasFronts=false: the oven cavity has no door panel — the appliance's own
    // front fills it. External-drawer front cuts are NOT suppressed (they come
    // from calcExternalDrawerFrontCuts, independent of hasFronts).
    return { ...base, hasFronts: false };
  }
  if (type === 'pantry') {
    // מזווה (tall larder): taller than countertop height. Standard W/D/plinth;
    // overrides only H → 180. Keeps hasFronts at its default (true) so it has
    // doors; the interior is a stack of INTERNAL drawers behind those doors
    // (see kitchenModuleState — internal drawers emit hardware + sketch, not
    // cut parts, matching bought drawer systems).
    return { ...base, H: 180 };
  }
  if (type === 'wall') {
    // קלפה (wall/upper cabinet): hung on the wall above the countertop, NOT on
    // the floor. W=100, H=50, D=35, no plinth. A single front: maxDoorWidth=120
    // (> W) forces one door column. `mount:'wall'` drives the kitchen elevation
    // (upper row, aligned above its base unit) and the shelf-only body editor.
    return { ...base, W: w ?? 100, H: 50, D: 35, plinth: 0, maxDoorWidth: 120, mount: 'wall' };
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

  if (type === 'oven') {
    // Oven bay: external drawer at the bottom + the fixed shelf that caps it.
    //
    // Geometry (bodyH = 90 − plinth10 = 80 cm, t_body = 1.8 cm, doorGapMm = 3):
    //   drawerHeight = 19.2 cm
    //   topOfDrawer  = 19.2 cm  (single drawer → (N−1)×gap = 0)
    //   shelf.hff    = roundCm(19.2 − 1.8) = 17.4 cm (bottom of shelf)
    //   top of shelf = 17.4 + 1.8 = 19.2 cm
    //   bottom of top board = 80 − 1.8 = 78.2 cm
    //   oven cavity  = 78.2 − 19.2 = 59.0 cm ✓
    //
    // The fixed shelf is included in the initial state so the cut list is
    // correct without requiring the user to first open the body editor.
    return {
      ...emptyBase,
      interior: {
        [slotKey]: [
          { id: 'km-ov-d1', type: 'drawer', heightFromFloor: 0,    drawerHeight: 19.2, mount: 'external' },
          { id: 'km-ov-sh1', type: 'shelf',  heightFromFloor: 17.4, isFixedAboveExternals: true },
        ],
      },
    };
  }

  if (type === 'pantry') {
    // מזווה: a vertical stack of INTERNAL drawers behind the door(s).
    //
    // Geometry (bodyH = H180 − plinth10 = 170 cm):
    //   bottom drawer height = 30 cm           → top = 30
    //   remaining (170 − 30) = 140 cm split into 5 EQUAL drawers = 28 cm each
    //   tops: 58, 86, 114, 142, 170            → fills to the ceiling exactly
    //   no overlap (each hff = previous top), no out-of-bounds (max top = bodyH)
    //
    // Internal drawers produce hardware (slides) + body-sketch rects but NO
    // cut-list parts (drawer boxes are bought systems) — same convention as the
    // 'drawers' module's external faces. Every height is overridable per body.
    return {
      ...emptyBase,
      interior: {
        [slotKey]: [
          { id: 'km-pn-d1', type: 'drawer', heightFromFloor: 0,   drawerHeight: 30, mount: 'internal' },
          { id: 'km-pn-d2', type: 'drawer', heightFromFloor: 30,  drawerHeight: 28, mount: 'internal' },
          { id: 'km-pn-d3', type: 'drawer', heightFromFloor: 58,  drawerHeight: 28, mount: 'internal' },
          { id: 'km-pn-d4', type: 'drawer', heightFromFloor: 86,  drawerHeight: 28, mount: 'internal' },
          { id: 'km-pn-d5', type: 'drawer', heightFromFloor: 114, drawerHeight: 28, mount: 'internal' },
          { id: 'km-pn-d6', type: 'drawer', heightFromFloor: 142, drawerHeight: 28, mount: 'internal' },
        ],
      },
    };
  }

  if (type === 'wall') {
    // קלפה: a wall cabinet with a single door and ONE centred shelf, splitting
    // bodyH (= H50 − plinth0 = 50) into two compartments: hff = (50 − 1.8)/2 ≈
    // 24.1. The body editor is shelf-only, so the carpenter adds/removes shelves
    // freely; every position is overridable.
    return {
      ...emptyBase,
      interior: {
        [slotKey]: [
          { id: 'km-wl-s1', type: 'shelf', heightFromFloor: 24.1 },
        ],
      },
    };
  }

  // sink + dishwasher: no interior items — the unit is empty (basin / appliance).
  return emptyBase;
}
