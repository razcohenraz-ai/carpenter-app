import type { CabinetInput, SavedCabinetState } from '../../types';
import type { CustomMaterial } from '../../types/materials';
import type { InteriorItem, DrawerItem } from '../../types/interior';
import { calcDoors } from '../doors/doorCalc';
import {
  frontColumnsForBox, computeRowFrontLayout, computeFrontGeometry,
} from '../geometry/frontGeometry';
import { salonHingeSide, defaultHingeSide } from '../doors/doorUtils';
import { getShellSides } from '../../types/cabinet';
import { getMaterialWithCustom } from '../../catalog';
import { isCorner, cornerFrontXLayout, cornerHingeSide } from './cornerModule';

/** One door / drawer-front face of a cabinet, in cabinet-local cm. `x` runs
 *  left→right from the outer-left edge; `y` is height off the floor (y0 bottom,
 *  y1 top). Single source for both the 2D fronts overlay (`CabinetFrontsOverlay`,
 *  which flips y into its top-down SVG) and the detailed 3D fronts view. */
export interface FrontPanel {
  x0: number; x1: number;
  y0: number; y1: number;
  /** Set only on DOOR panels (not drawer fronts / corner filler). The EDGE the
   *  door is hinged on. Drives the elevation hinge-marking triangle, whose apex
   *  points to the OPENING (free) side — the opposite edge. `'top'` = a lift-up
   *  door (קלפה) hinged along the top and opening upward → apex points down. */
  hingeSide?: 'left' | 'right' | 'top';
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
  // Top/bottom envelope caps (front material, tFront each) reduce the door area —
  // the door must sit BETWEEN them, not over them. `topEnvCm` covers the shell
  // ceiling (מעטפת תקרה) AND the קלפה top cap; `botEnvCm` is the קלפה bottom cap.
  // These mirror decomposeBoxes' envelopeTopH / envelopeBottomH, so the rendered
  // door height equals the cut list's (derived from the already-reduced box.H).
  // Both zero for a plain cabinet, so no other path moves.
  const wallEnv = inp.hasWallEnvelope === true && inp.mount === 'wall';
  const topEnvCm = ((inp.hasEnvelopeTop && hasAnyShell) || wallEnv) ? tFront : 0;
  const botEnvCm = wallEnv ? tFront : 0;
  const dl = calcDoors(effW, effH - topEnvCm - botEnvCm, inp.plinth, inp.doorCoversPlinth,
                       inp.lowerDoorH, hasAnyShell, tFront, forceRows, gapCm);

  // Corner unit (פינה): one fixed-width door at the chosen edge + a filler face
  // covering the rest of the front. Both share the single door row's height
  // (a corner is a shelf-only body — no external drawers, no door columns).
  if (isCorner(inp)) {
    const cf = inp.cornerFiller!;
    const xl = cornerFrontXLayout(effW, gapCm, cf);
    const y0 = dl.doorStart;
    const y1 = dl.doorStart + (dl.lowerH ?? 0);
    return [
      { x0: xl.door.x0, x1: xl.door.x1, y0, y1, hingeSide: cornerHingeSide(cf) },
      { x0: xl.fillerFace.x0, x1: xl.fillerFace.x1, y0, y1 },
    ];
  }

  if (dl.n === 0 && extDrawers.length === 0) return [];

  const numFronts = frontColumnsForBox(effW, inp.maxDoorWidth, inp.mount, inp.singleFront);
  // Front layout MUST match the cut list (cabinetCompute) so the rendered faces
  // agree with the actual door cuts: with a shell the fronts sit INSIDE the
  // opening (inset by the shell), not over it. The previous `hasOuterShell:false`
  // + a manual left-shell shift made the faces span the full W and pushed them
  // one shell-thickness past the right edge — masked by the old inter-unit gap,
  // but overlapping the neighbour once kitchen units pack flush.
  const frontLayout = computeRowFrontLayout({
    cabinetW: effW,
    hasOuterShell: hasAnyShell,
    shellSides: sides,
    shellThicknessCm: tFront,
    totalFrontsInRow: numFronts,
    gapCm,
  });

  const panels: FrontPanel[] = [];

  // A front face's bottom edge off the floor is `plinth + yFromBodyBottom`
  // (the body floor sits at the plinth line). Columns come from the shared
  // front layout — identical to the 2D overlay. `isDoor` tags door rows so the
  // panel carries the hinge side (the loop index runs left→right; Door.frontIndex
  // is right→left, so the hinge side derivation inverts the index — matching the
  // doors map produced by cabinetCompute / useCabinet).
  function pushFrontRow(heightCm: number, yFromBodyBottom: number, isDoor = false) {
    const x0base = frontLayout.cabinetLeftOffset;
    for (let fi = 0; fi < numFronts; fi++) {
      const fp = computeFrontGeometry({ globalFrontIndexInRow: fi, layout: frontLayout, gapCm });
      const hingeSide = isDoor
        ? (inp.liftMechanism === true
            ? 'top' as const // קלפה: lift-up door hinged along the top
            : (numFronts > 1 ? salonHingeSide(numFronts - 1 - fi, numFronts) : defaultHingeSide('single', ['single'])))
        : undefined;
      panels.push({
        x0: x0base + fp.x,
        x1: x0base + fp.x + Math.max(fp.width, 0),
        y0: inp.plinth + botEnvCm + yFromBodyBottom,
        y1: inp.plinth + botEnvCm + yFromBodyBottom + Math.max(heightCm, 0),
        ...(hingeSide ? { hingeSide } : {}),
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
    rows.forEach(r => pushFrontRow(r.h, r.yFromBodyBottom, true));
  } else if (!noFronts && totalDrawerH < doorTopFromBodyBottom - 3) {
    pushFrontRow(doorTopFromBodyBottom - totalDrawerH, totalDrawerH, true);
  }

  return panels;
}
