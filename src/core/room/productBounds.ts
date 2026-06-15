import type { ProductUnit } from '../../types/project';
import { kitchenFootprint, kitchenElevationLayout } from '../product/kitchenFootprint';

/** 3D bounding box of a product in its own local frame, cm.
 *  width = X (along the back wall), height = Y (up), depth = Z (front-to-back).
 *  The top view and snapping use this footprint (width × depth) as the single
 *  placement source. The elevation and the future 3D use {@link productSubBoxes}
 *  for the faithful internal shape; the two agree on width and depth. */
export interface ProductBounds {
  width: number;
  height: number;
  depth: number;
}

/** One axis-aligned sub-volume of a product in its LOCAL frame, cm
 *  (x = 0..width, y = 0..height off the product's own floor, z = 0..depth).
 *  A regular cabinet is a single box; a kitchen is one box per unit — base
 *  units on the floor, wall cabinets floating at WALL_BOTTOM_CM, so the open
 *  gap between them is real and a tall base unit (pantry) keeps its full
 *  height. This is the single source the elevation projects and the future 3D
 *  renderer extrudes. */
export interface ProductSubBox {
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
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

/** Decomposes a product into its local sub-boxes (see {@link ProductSubBox}).
 *  A kitchen maps 1:1 from {@link kitchenElevationLayout} (each unit a box,
 *  extruded across its own depth); anything else is one full-size box. */
export function productSubBoxes(product: ProductUnit): ProductSubBox[] {
  if (product.productType === 'kitchen') {
    return kitchenElevationLayout(product.kitchenUnits ?? []).map(b => ({
      x0: b.xCm, x1: b.xCm + b.w,
      y0: b.yBottomCm, y1: b.yBottomCm + b.h,
      z0: 0, z1: b.depth,
    }));
  }
  const { W, H, D } = product.cabinet.input;
  return [{ x0: 0, x1: W, y0: 0, y1: H, z0: 0, z1: D }];
}
