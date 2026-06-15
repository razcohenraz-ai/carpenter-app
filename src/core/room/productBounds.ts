import type { ProductUnit } from '../../types/project';
import { kitchenFootprint } from '../product/kitchenFootprint';

/** 3D bounding box of a product in its own local frame, cm.
 *  width = X (along the back wall), height = Y (up), depth = Z (front-to-back).
 *  This — not a 2D footprint — is the single source the top view, the
 *  elevation, and the future 3D renderer all read from. */
export interface ProductBounds {
  width: number;
  height: number;
  depth: number;
}

/** Bounding box of a product placed in a room.
 *  - kitchen: derived from its units (sum of base widths × deepest × wall-row top).
 *  - everything else (wardrobe / bookcase / sideboard / free-build): the
 *    cabinet's own W × H × D. */
export function productBounds(product: ProductUnit): ProductBounds {
  if (product.productType === 'kitchen') {
    return kitchenFootprint(product.kitchenUnits ?? []);
  }
  const { W, H, D } = product.cabinet.input;
  return { width: W, height: H, depth: D };
}
