import type { CutItem } from '../../types/cuts';
import type { Edging } from '../../types/edging';
import type { InteriorItem } from '../../types/interior';
import { getExternalDrawers, getSkirtCoveringDrawer } from '../doors/doorUtils';

// cm → mm conversion (cut items are emitted in mm).
const cm = (v: number) => v * 10;

/** Generates one cut per external drawer in `items`.
 *
 *  - Panel width = `frontWidthCm` (cm). The same width as a door in the same
 *    column; the caller decides whether the body is partitioned (cell width)
 *    or not (full body width).
 *  - Panel height = `drawerHeight` (cm).
 *  - The lowest external drawer (smallest `heightFromFloor`) extends to cover
 *    the plinth when `mainDoorCoversSkirt` is true and `plinthCm > 0`. The
 *    extension follows the same formula as `getDoorVisualHeight`:
 *      visualH = drawerHeight + (plinthCm − 1) + gapCm.
 *
 *  Output items use group `'front'` to distinguish facade panels from internal
 *  drawer box parts (which use `'drawer'`). The `note` field carries the
 *  effective thickness in mm. */
export function calcExternalDrawerFrontCuts(
  items: InteriorItem[],
  frontWidthCm: number,
  gapMm: number,
  plinthCm: number,
  mainDoorCoversSkirt: boolean,
  frontThicknessMm: number,
  perDrawerThicknessMm?: Map<string, number>,
  /** Cabinet-wide edging applied as a perimeter band to every drawer-front
   *  panel. Optional — when omitted the panel ships at its raw size. */
  edging?: Edging,
): CutItem[] {
  const externals = getExternalDrawers(items);
  if (externals.length === 0) return [];

  const gapCm = gapMm / 10;
  const skirtDrawer = getSkirtCoveringDrawer(items, mainDoorCoversSkirt);
  // Perimeter band deduction in mm: 2× thickness on each dimension.
  const perimMm = edging ? 2 * edging.thickness : 0;

  const cuts: CutItem[] = [];
  for (const drawer of externals) {
    const isSkirtCovering = skirtDrawer?.id === drawer.id && plinthCm > 0;
    const panelHcm = isSkirtCovering
      ? drawer.drawerHeight + (plinthCm - 1) + gapCm
      : drawer.drawerHeight;
    const thicknessMm = perDrawerThicknessMm?.get(drawer.id) ?? frontThicknessMm;
    cuts.push({
      name: 'חזית מגירה חיצונית',
      qty: 1,
      w: cm(frontWidthCm) - perimMm,
      h: cm(panelHcm) - perimMm,
      group: 'front',
      note: `${Math.round(thicknessMm)}mm`,
    });
  }
  return cuts;
}
