import type { Box } from '../../types/geometry';
import type { CabinetInput } from '../../types/cabinet';
import type { CustomMaterial } from '../../types/materials';
import type { BoxSlotId, SavedCabinetState } from '../../types/project';
import { getMaterialWithCustom } from '../../catalog';
import { boxStableKey } from '../interior/interiorUtils';

/** One body's material override entry (the value side of
 *  {@link SavedCabinetState.boxMaterialOverrides}). */
export type BoxMaterialOverride = NonNullable<SavedCabinetState['boxMaterialOverrides']>[BoxSlotId];

/** The effective materials + back thickness for a single body, after applying
 *  any per-body override over the cabinet-wide default. */
export interface ResolvedBoxMaterials {
  bodyMaterial: ReturnType<typeof getMaterialWithCustom>;
  frontMaterial: ReturnType<typeof getMaterialWithCustom>;
  /** Effective back-panel thickness, cm. */
  backThicknessCm: number;
}

/** SINGLE SOURCE for a body's effective materials. Every board-building path
 *  (cut list, 2D sketch, 3D) resolves per-body materials through here so a
 *  per-body override drives the cut list, the colour, and the cost identically
 *  — keyed by `boxStableKey(box)`, the same key the dimension/edging overrides
 *  use. An absent override (or absent field) falls through to the cabinet
 *  default on `input`.
 *
 *  Note (deliberate): the cabinet-level shell inset (`computeInnerWidth`) and
 *  carcass depth (`computeCarcassDepth`) keep using the CABINET front material —
 *  the outer envelope is one cabinet-wide shell, not per body. A per-body front
 *  material drives that body's own faces (material + thickness + colour), but
 *  does not re-inset the shared shell. */
export function resolveBoxMaterials(
  box: Box,
  input: CabinetInput,
  overrides: ReadonlyMap<BoxSlotId, BoxMaterialOverride>,
  customMaterials: CustomMaterial[],
): ResolvedBoxMaterials {
  const o = overrides.get(boxStableKey(box));
  return {
    bodyMaterial: getMaterialWithCustom(o?.bodyMaterialId ?? input.bodyMaterialId, customMaterials),
    frontMaterial: getMaterialWithCustom(o?.frontMaterialId ?? input.frontMaterialId, customMaterials),
    backThicknessCm: o?.backThicknessCm ?? input.backThickness,
  };
}
