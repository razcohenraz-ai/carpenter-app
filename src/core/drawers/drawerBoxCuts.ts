import type { CutItem } from '../../types/cuts';
import type { DrawerItem, InteriorItem } from '../../types/interior';
import type { DrawerJoinery, DrawerPanelCut } from '../../types/runners';
import { getRunner } from '../../catalog/runners';
import { computeDrawerBox } from './drawerBox';

/** Default drawer bottom thickness (mm) when the drawer doesn't specify one.
 *  (A per-drawer choice will be added later.) */
export const DEFAULT_DRAWER_BOTTOM_MM = 6;

const PANEL_NAME: Record<DrawerPanelCut['role'], string> = {
  side: 'דופן מגירה',
  front: 'חזית תיבה',
  back: 'גב תיבה',
  bottom: 'תחתית מגירה',
};

export interface DrawerBoxCutsOptions {
  /** Runner used for drawers that don't carry their own `runnerId`. */
  defaultRunnerId?: string;
  /** Corner joinery (default `miter`, per the carpenter's method). */
  joinery?: DrawerJoinery;
}

/** Drawer-BOX cut items (group `'drawer'`) for the drawers in one body or cell.
 *  The facade front is emitted elsewhere (group `'front'`); this adds the box's
 *  sides, front, back and bottom, sized from the drawer's chosen runner.
 *
 *  `clearInnerWidthCm` is the body's clear inner width (LW) — already net of the
 *  carcass side panels; `usableDepthCm` is the usable internal depth (selects
 *  the nominal runner length). A drawer with no resolvable runner is skipped
 *  (its facade front is still produced by the existing front path). */
export function buildDrawerBoxCuts(
  items: InteriorItem[],
  clearInnerWidthCm: number,
  usableDepthCm: number,
  opts: DrawerBoxCutsOptions = {},
): CutItem[] {
  const drawers = items.filter((i): i is DrawerItem => i.type === 'drawer');
  const cuts: CutItem[] = [];
  for (const d of drawers) {
    const spec = getRunner(d.runnerId ?? opts.defaultRunnerId ?? '');
    if (!spec) continue;
    const box = computeDrawerBox(spec, {
      internalWidthMm: clearInnerWidthCm * 10,
      internalDepthMm: usableDepthCm * 10,
      sidePanelThicknessMm: d.drawerSideThicknessMm ?? spec.sidePanelThicknessMm.max,
      bottomThicknessMm: d.drawerBottomThicknessMm ?? DEFAULT_DRAWER_BOTTOM_MM,
      kind: d.mount === 'external' ? 'external' : 'inner',
      heightMm: d.drawerHeight * 10,
      ...(opts.joinery ? { joinery: opts.joinery } : {}),
    });
    for (const p of box.panels) {
      cuts.push({
        name: PANEL_NAME[p.role],
        qty: p.qty,
        w: p.lengthMm,
        h: p.heightMm,
        group: 'drawer',
        note: `${p.thicknessMm}mm${p.joint === 'miter45' ? ' 45°' : ''}`,
      });
    }
  }
  return cuts;
}
