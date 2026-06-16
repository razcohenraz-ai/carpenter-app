import type { CabinetInput, SavedCabinetState } from '../../types';
import type { CustomMaterial } from '../../types/materials';
import type { InteriorItem, DrawerItem } from '../../types/interior';
import { calcDoors } from '../doors/doorCalc';
import {
  frontColumnsForBox, computeRowFrontLayout, computeFrontGeometry,
} from '../geometry/frontGeometry';
import { getShellSides } from '../../types/cabinet';
import { getMaterialWithCustom } from '../../catalog';

/** One door / drawer-front face of a cabinet, in cabinet-local cm. `x` runs
 *  left→right from the outer-left edge; `y` is height off the floor (y0 bottom,
 *  y1 top). Single source for both the 2D fronts overlay (`CabinetFrontsOverlay`,
 *  which flips y into its top-down SVG) and the detailed 3D fronts view. */
export interface FrontPanel {
  x0: number; x1: number;
  y0: number; y1: number;
}

/** Door rows + external-drawer faces of a single cabinet as flat panels.
 *  Pure extraction of the geometry previously inlined in `CabinetFrontsOverlay`
 *  — same `calcDoors` / front-layout math, expressed in floor-up coordinates so
 *  both the 2D overlay and the 3D view derive faces from one place. */
export function cabinetFrontPanels(
  input: CabinetInput,
  state: SavedCabinetState,
  customMaterials: CustomMaterial[],
): FrontPanel[] {
  const inp = input;
  const noFronts = (inp.hasFronts ?? true) === false;

  const savedItems = state.interior['single:single'] ?? [];
  const extDrawers = (savedItems as InteriorItem[])
    .filter((it): it is DrawerItem => it.type === 'drawer' && it.mount === 'external')
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor);

  if (noFronts && extDrawers.length === 0) return [];

  const ovr = state.boxDimensionOverrides?.['single:single'];
  const effW = ovr?.W ?? inp.W;
  const effH = ovr?.H ?? inp.H;
  const tFront = getMaterialWithCustom(inp.frontMaterialId, customMaterials).thickness / 10;
  const forceRows = inp.doorsPerColumn === 'auto' ? undefined : inp.doorsPerColumn as 1 | 2 | 3;
  const sides = getShellSides(inp);
  const hasAnyShell = sides.left || sides.right;
  const gapCm = inp.doorGapMm / 10;
  const dl = calcDoors(effW, effH, inp.plinth, inp.doorCoversPlinth,
                       inp.lowerDoorH, hasAnyShell, tFront, forceRows, gapCm);

  if (dl.n === 0 && extDrawers.length === 0) return [];

  const leftEnvCm = sides.left ? tFront : 0;
  const numFronts = frontColumnsForBox(effW, inp.maxDoorWidth, inp.mount, inp.singleFront);
  const frontLayout = computeRowFrontLayout({
    cabinetW: effW,
    hasOuterShell: false,
    shellThicknessCm: 0,
    totalFrontsInRow: numFronts,
    gapCm,
  });

  const panels: FrontPanel[] = [];

  // A front face's bottom edge off the floor is `plinth + yFromBodyBottom`
  // (the body floor sits at the plinth line). Columns come from the shared
  // front layout — identical to the 2D overlay.
  function pushFrontRow(heightCm: number, yFromBodyBottom: number) {
    const x0base = leftEnvCm + frontLayout.cabinetLeftOffset;
    for (let fi = 0; fi < numFronts; fi++) {
      const fp = computeFrontGeometry({ globalFrontIndexInRow: fi, layout: frontLayout, gapCm });
      panels.push({
        x0: x0base + fp.x,
        x1: x0base + fp.x + Math.max(fp.width, 0),
        y0: inp.plinth + yFromBodyBottom,
        y1: inp.plinth + yFromBodyBottom + Math.max(heightCm, 0),
      });
    }
  }

  let totalDrawerH = 0;
  extDrawers.forEach(d => {
    const gap = gapCm / 2;
    pushFrontRow(d.drawerHeight - gap, d.heightFromFloor + gap / 2);
    totalDrawerH = Math.max(totalDrawerH, d.heightFromFloor + d.drawerHeight);
  });

  const doorStartFromBodyBottom = dl.doorStart - inp.plinth;
  const doorTopFromBodyBottom = doorStartFromBodyBottom + (dl.lowerH ?? 0);

  if (!noFronts && extDrawers.length === 0) {
    const rows: { h: number; yFromBodyBottom: number }[] = [];
    if (dl.rows >= 1) rows.push({ h: dl.lowerH!, yFromBodyBottom: doorStartFromBodyBottom });
    if (dl.rows >= 2) rows.push({ h: dl.upperH!, yFromBodyBottom: doorStartFromBodyBottom + dl.lowerH! + 0.2 });
    if (dl.rows >= 3) rows.push({ h: dl.topH!,  yFromBodyBottom: doorStartFromBodyBottom + dl.lowerH! + dl.upperH! + 0.4 });
    rows.forEach(r => pushFrontRow(r.h, r.yFromBodyBottom));
  } else if (!noFronts && totalDrawerH < doorTopFromBodyBottom - 3) {
    pushFrontRow(doorTopFromBodyBottom - totalDrawerH, totalDrawerH);
  }

  return panels;
}
