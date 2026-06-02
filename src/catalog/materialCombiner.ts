import { MATERIALS } from './materials';
import type { MaterialId, CustomMaterial, Material } from '../types/materials';

/**
 * A Material-compatible interface that works for both catalog and custom materials.
 * Can be cast to Material or CustomMaterial depending on context.
 */
export type CombinedMaterial = (Material | CustomMaterial) & { isCustom: boolean };

/**
 * Returns only custom materials suitable for populating a select dropdown.
 * The carpenter defines all materials they work with in settings.
 */
export function getCombinedMaterials(customMaterials: CustomMaterial[] = []): CombinedMaterial[] {
  const custom = customMaterials.map(mat => ({
    ...mat,
    isCustom: true,
  }));

  return custom;
}

/**
 * Finds a material (catalog or custom) by ID. Returns catalog if ID matches,
 * otherwise searches custom list. Falls back to a default if not found.
 */
export function getMaterialWithCustom(
  id: MaterialId | string,
  customMaterials: CustomMaterial[] = [],
): CombinedMaterial {
  // Try catalog first (if it's a MaterialId)
  if (id in MATERIALS) {
    const mat = MATERIALS[id as MaterialId]!;
    return {
      id: id as MaterialId,
      name: mat.name,
      thickness: mat.thickness,
      pricePerSheet: mat.pricePerSheet,
      sheetW: mat.sheetW,
      sheetH: mat.sheetH,
      isCustom: false,
    };
  }

  // Try custom list
  const custom = customMaterials.find(m => m.id === id);
  if (custom) {
    return { ...custom, isCustom: true };
  }

  // Fallback to first material (should not happen in normal flow)
  const fallback = Object.entries(MATERIALS)[0];
  if (fallback) {
    const [fid, mat] = fallback;
    return {
      id: fid as MaterialId,
      name: mat.name,
      thickness: mat.thickness,
      pricePerSheet: mat.pricePerSheet,
      sheetW: mat.sheetW,
      sheetH: mat.sheetH,
      isCustom: false,
    };
  }

  throw new Error('No materials found');
}

/**
 * Safe wrapper for getMaterial that handles missing custom materials.
 * When a material ID is not in the catalog, falls back to the first catalog material.
 * This is a safe default for code paths that don't have access to custom materials.
 */
export function getEffectiveMaterial(id: MaterialId | string): Material {
  // First, try catalog
  if (id in MATERIALS) {
    return MATERIALS[id as MaterialId]!;
  }

  // If not in catalog and looks like a custom ID, still return first catalog material
  // (the actual custom material data is lost, but we return a valid material)
  const firstMaterial = Object.entries(MATERIALS)[0];
  if (firstMaterial) {
    return firstMaterial[1];
  }

  throw new Error('No materials found in catalog');
}
