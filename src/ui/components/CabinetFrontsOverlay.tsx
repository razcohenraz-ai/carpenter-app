import React from 'react';
import { cabinetFrontPanels } from '../../core/product/cabinetFronts';
import type { CabinetInput } from '../../types/cabinet';
import type { SavedCabinetState } from '../../types';
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
 *  (viewBox in cm, position-absolute filling its parent). Panel geometry comes
 *  from the shared core `cabinetFrontPanels` (single source with the 3D fronts
 *  view); this component only flips the floor-up y into the top-down SVG and
 *  draws the rects. Used by KitchenOverview and ProductElevation. */
export function CabinetFrontsOverlay({
  input, state, customMaterials = [], viewBoxW, viewBoxH,
}: Props): React.JSX.Element | null {
  const panels = cabinetFrontPanels(input, state, customMaterials);
  if (panels.length === 0) return null;

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
      {panels.map((p, i) => (
        <rect
          key={i}
          x={p.x0}
          y={viewBoxH - p.y1}
          width={Math.max(p.x1 - p.x0, 0)}
          height={Math.max(p.y1 - p.y0, 0)}
          fill="var(--color-fronts, #e8934a)"
          stroke="var(--color-border, #ccc)"
          strokeWidth={0.1}
          opacity={0.9}
        />
      ))}
    </svg>
  );
}
