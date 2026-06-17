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
      {panels.map((p, i) => {
        const top = viewBoxH - p.y1;
        const bot = viewBoxH - p.y0;
        const mid = (top + bot) / 2;
        const midX = (p.x0 + p.x1) / 2;
        // Elevation hinge-marking convention: a triangle whose apex points to the
        // OPENING (free) side — the opposite edge from the hinge. 'top' = a
        // lift-up door (hinged along the top, opens up) → apex points DOWN.
        const points =
          p.hingeSide === 'top'  ? `${p.x0},${top} ${midX},${bot} ${p.x1},${top}` :
          p.hingeSide === 'left' ? `${p.x0},${top} ${p.x1},${mid} ${p.x0},${bot}` :
          p.hingeSide === 'right' ? `${p.x1},${top} ${p.x0},${mid} ${p.x1},${bot}` : '';
        return (
          <React.Fragment key={i}>
            <rect
              x={p.x0}
              y={top}
              width={Math.max(p.x1 - p.x0, 0)}
              height={Math.max(p.y1 - p.y0, 0)}
              fill="var(--color-fronts, #e8934a)"
              stroke="var(--color-border, #ccc)"
              strokeWidth={0.1}
              opacity={0.9}
            />
            {points && (
              <polyline
                points={points}
                fill="none"
                stroke="var(--color-border-strong, #555)"
                strokeWidth={0.3}
                strokeLinejoin="round"
                opacity={0.7}
              />
            )}
          </React.Fragment>
        );
      })}
    </svg>
  );
}
