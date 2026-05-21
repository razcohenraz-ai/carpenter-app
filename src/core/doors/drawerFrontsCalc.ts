import type { Box, BoxLevel } from '../../types/geometry';
import type { InteriorById, CellInteriorById } from '../../types/interior';
import type { DrawerFront, DrawerFrontById } from '../../types/doors';
import {
  type RowFrontLayout,
  computeFrontGeometryForSpan,
  getBoxFirstGlobalFrontIndex,
  groupBoxesByRow,
} from '../geometry/frontGeometry';
import { getExternalDrawers } from './doorUtils';

// ── Derive DrawerFront entities for the whole cabinet ─────────────────────────
// One DrawerFront per external drawer. The front's width comes from the
// row-level layout (see `frontGeometry.ts`) — every body's level maps to its
// own `RowFrontLayout`. Two paths:
//
//   - body-wide drawer (no partition):  spanLength = numFronts of the box
//   - cell drawer (partition, numFronts=2):
//                                       spanLength = 1 (single column)
//
// `cellIndex` 0 → frontIndex 0 (rightmost column of that body)
// `cellIndex` 1 → frontIndex numFronts − 1 (leftmost). Renderers translate
// (box, frontIndex) → globalFrontIndexInRow via `getBoxFirstGlobalFrontIndex`
// to place the drawer along the row's horizontal axis.

export interface DeriveDrawerFrontsInput {
  bodyBoxes: Box[];
  interiorById: InteriorById;
  cellInteriorById: CellInteriorById;
  partitionsById: Map<string, boolean>;
  numFrontsPerBox: Map<string, number>;
  doorCoversPlinth: boolean;
  doorGapMm: number;
  /** One layout per row (level). Caller is responsible for grouping boxes
   *  via `groupBoxesByRow` and computing each row's layout. */
  layoutByRow: Map<BoxLevel, RowFrontLayout>;
}

export function deriveDrawerFronts(input: DeriveDrawerFrontsInput): DrawerFrontById {
  const {
    bodyBoxes, interiorById, cellInteriorById, partitionsById,
    numFrontsPerBox, doorCoversPlinth, doorGapMm, layoutByRow,
  } = input;
  const result: DrawerFrontById = {};
  const gapCm = doorGapMm / 10;
  const rowsByLevel = groupBoxesByRow(bodyBoxes);

  for (const box of bodyBoxes) {
    const numFronts = numFrontsPerBox.get(box.id) ?? 1;
    const hasPartition = partitionsById.get(box.id) === true;
    const bodyItems = interiorById[box.id] ?? [];
    const cellItems = cellInteriorById[box.id];
    const layout = layoutByRow.get(box.level);
    const rowBoxes = rowsByLevel.get(box.level) ?? [];
    if (!layout) continue; // box on a level without a layout (e.g. plinth) — skip
    const boxFirstGlobalIndexInRow = getBoxFirstGlobalFrontIndex({
      rowBoxes, numFrontsPerBox, targetBoxId: box.id,
    });

    const originalCoversSkirt = doorCoversPlinth && (box.level === 'bottom' || box.level === 'single');

    if (hasPartition && cellItems) {
      // Two cells, two single-column fronts. cell 0 → frontIndex 0 (right);
      // cell 1 → frontIndex numFronts−1 (left).
      for (let ci = 0 as 0 | 1; ci <= 1; ci = (ci + 1) as 0 | 1) {
        const items = cellItems[ci] ?? [];
        const externals = getExternalDrawers(items);
        if (externals.length === 0) continue;
        const fi = ci === 0 ? 0 : numFronts - 1;
        const span = computeFrontGeometryForSpan({
          startGlobalIndexInRow: boxFirstGlobalIndexInRow + (numFronts - 1 - fi),
          spanLength: 1,
          layout,
          gapCm,
        });
        const skirtDrawerId = originalCoversSkirt ? externals[0]!.id : null;

        let positionFromBoxBottom = 0;
        for (const drawer of externals) {
          const isSkirt = drawer.id === skirtDrawerId;
          const front: DrawerFront = {
            id: drawer.id,
            drawerId: drawer.id,
            boxId: box.id,
            frontIndex: fi,
            cellIndex: ci,
            positionFromBoxBottom,
            height: drawer.drawerHeight,
            width: span.width,
            coversSkirt: isSkirt,
            gapMm: doorGapMm,
            ...(drawer.frontThicknessOverride ? { thicknessOverride: drawer.frontThicknessOverride } : {}),
          };
          result[drawer.id] = front;
          positionFromBoxBottom += drawer.drawerHeight + gapCm;
        }
      }
      continue;
    }

    const externals = getExternalDrawers(bodyItems);
    if (externals.length === 0) continue;
    // Body-wide drawer: one panel spanning all `numFronts` columns of the box.
    const span = computeFrontGeometryForSpan({
      startGlobalIndexInRow: boxFirstGlobalIndexInRow,
      spanLength: numFronts,
      layout,
      gapCm,
    });
    const skirtDrawerId = originalCoversSkirt ? externals[0]!.id : null;
    let positionFromBoxBottom = 0;
    for (const drawer of externals) {
      const isSkirt = drawer.id === skirtDrawerId;
      const front: DrawerFront = {
        id: drawer.id,
        drawerId: drawer.id,
        boxId: box.id,
        frontIndex: 0,
        positionFromBoxBottom,
        height: drawer.drawerHeight,
        width: span.width,
        coversSkirt: isSkirt,
        gapMm: doorGapMm,
        ...(drawer.frontThicknessOverride ? { thicknessOverride: drawer.frontThicknessOverride } : {}),
      };
      result[drawer.id] = front;
      positionFromBoxBottom += drawer.drawerHeight + gapCm;
    }
  }

  return result;
}
