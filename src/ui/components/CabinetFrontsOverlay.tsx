import React from 'react';
import { calcDoors } from '../../core/doors/doorCalc';
import {
  frontColumnsForBox, computeRowFrontLayout, computeFrontGeometry,
} from '../../core/geometry/frontGeometry';
import { getEffectiveMaterial, getMaterialWithCustom } from '../../catalog';
import { getShellSides } from '../../types/cabinet';
import type { CabinetInput } from '../../types/cabinet';
import type { SavedCabinetState } from '../../types';
import type { InteriorItem, DrawerItem } from '../../types/interior';
import type { CustomMaterial } from '../../types/materials';

interface Props {
  input: CabinetInput;
  state: SavedCabinetState;
  customMaterials?: CustomMaterial[];
  /** Outer cabinet width including any shell envelope panels, cm. */
  viewBoxW: number;
  /** Effective cabinet height (after any single-body override), cm. */
  viewBoxH: number;
}

/** Schematic front-panels overlay: colored rectangles for door rows and
 *  external-drawer fronts, in the same coordinate space as CabinetSketch
 *  (viewBox in cm, position-absolute filling its parent). Used by
 *  KitchenOverview and ProductElevation to show the 'fronts' mode. */
export function CabinetFrontsOverlay({
  input: inp, state, customMaterials = [], viewBoxW, viewBoxH,
}: Props): React.JSX.Element | null {
  const noFronts = (inp.hasFronts ?? true) === false;

  const slotKey = 'single:single';
  const savedItems = state.interior[slotKey] ?? [];
  const extDrawers = (savedItems as InteriorItem[])
    .filter((it): it is DrawerItem => it.type === 'drawer' && it.mount === 'external')
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor);

  if (noFronts && extDrawers.length === 0) return null;

  const ovr = state.boxDimensionOverrides?.['single:single'];
  const effW = ovr?.W ?? inp.W;
  const effH = ovr?.H ?? inp.H;
  const tFront = (customMaterials.length > 0
    ? getMaterialWithCustom(inp.frontMaterialId, customMaterials)
    : getEffectiveMaterial(inp.frontMaterialId)
  ).thickness / 10;
  const forceRows = inp.doorsPerColumn === 'auto' ? undefined : inp.doorsPerColumn as 1 | 2 | 3;
  const sides = getShellSides(inp);
  const hasAnyShell = sides.left || sides.right;
  const gapCm = inp.doorGapMm / 10;
  const dl = calcDoors(effW, effH, inp.plinth, inp.doorCoversPlinth,
                       inp.lowerDoorH, hasAnyShell, tFront, forceRows, gapCm);

  if (dl.n === 0 && extDrawers.length === 0) return null;

  const bodyH = effH - inp.plinth;
  const leftEnvCm = sides.left ? tFront : 0;
  const numFronts = frontColumnsForBox(effW, inp.maxDoorWidth, inp.mount, inp.singleFront);
  const frontLayout = computeRowFrontLayout({
    cabinetW: effW,
    hasOuterShell: false,
    shellThicknessCm: 0,
    totalFrontsInRow: numFronts,
    gapCm,
  });

  const panels: React.ReactElement[] = [];

  function pushFrontRow(key: string, heightCm: number, yFromBodyBottom: number) {
    const panelY = bodyH - (yFromBodyBottom + heightCm);
    for (let fi = 0; fi < numFronts; fi++) {
      const fp = computeFrontGeometry({ globalFrontIndexInRow: fi, layout: frontLayout, gapCm });
      panels.push(
        <rect
          key={`${key}-fi${fi}`}
          x={leftEnvCm + frontLayout.cabinetLeftOffset + fp.x}
          y={panelY}
          width={Math.max(fp.width, 0)}
          height={Math.max(heightCm, 0)}
          fill="var(--color-fronts, #e8934a)"
          stroke="var(--color-border, #ccc)"
          strokeWidth={0.1}
          opacity={0.9}
        />
      );
    }
  }

  let totalDrawerH = 0;
  extDrawers.forEach((d, di) => {
    const gap = gapCm / 2;
    pushFrontRow(`drw${di}`, d.drawerHeight - gap, d.heightFromFloor + gap / 2);
    totalDrawerH = Math.max(totalDrawerH, d.heightFromFloor + d.drawerHeight);
  });

  const doorStartFromBodyBottom = dl.doorStart - inp.plinth;
  const doorTopFromBodyBottom = doorStartFromBodyBottom + (dl.lowerH ?? 0);

  if (!noFronts && extDrawers.length === 0) {
    const rows: { h: number; yFromBodyBottom: number }[] = [];
    if (dl.rows >= 1) rows.push({ h: dl.lowerH!, yFromBodyBottom: doorStartFromBodyBottom });
    if (dl.rows >= 2) rows.push({ h: dl.upperH!, yFromBodyBottom: doorStartFromBodyBottom + dl.lowerH! + 0.2 });
    if (dl.rows >= 3) rows.push({ h: dl.topH!,  yFromBodyBottom: doorStartFromBodyBottom + dl.lowerH! + dl.upperH! + 0.4 });
    rows.forEach((r, ri) => pushFrontRow(`door${ri}`, r.h, r.yFromBodyBottom));
  } else if (!noFronts && totalDrawerH < doorTopFromBodyBottom - 3) {
    pushFrontRow('doorAbove', doorTopFromBodyBottom - totalDrawerH, totalDrawerH);
  }

  return (
    <svg
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    >
      {panels}
    </svg>
  );
}
