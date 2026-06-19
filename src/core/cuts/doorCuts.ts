import type { CutItem } from '../../types/cuts';
import type { Door } from '../../types/doors';
import type { Box, BoxLevel } from '../../types/geometry';
import type { Edging } from '../../types/edging';
import type { MaterialId } from '../../types/materials';
import { makeDoorId } from '../doors/doorUtils';

// Door dimensions are in cm; CutItem dimensions are in mm.
const cm = (v: number) => v * 10;

/** Hebrew cut-list label for a door, by the body level it sits in. Mirrors the
 *  legacy `calcCuts` naming so the saw operator's list reads identically:
 *  a single-row cabinet → "דלת"; split rows → bottom / middle / top variants. */
function doorCutName(level: BoxLevel): string {
  switch (level) {
    case 'bottom': return 'דלת תחתונה';
    case 'middle': return 'דלת אמצעית';
    case 'top':    return 'דלת עליונה';
    default:       return 'דלת'; // 'single'
  }
}

/**
 * Door-panel cut items, derived from the already-computed `doors` map.
 *
 * `doors` is the single source of truth for door geometry: each `Door.width`
 * comes from the cabinet-level front layout (effective per-row width, so it
 * tracks per-body W overrides) and each `Door.height` comes from
 * `calcMainDoorHeight(box.H, items, …)` — which already reflects the overridden
 * body height AND any external-drawer stack that shortens the door. Deriving
 * the cut from it keeps the cut list identical to the rendered door (DoorsList
 * + sketch all read the same `doors`).
 *
 * This replaces the legacy `calcCuts` door path, which recomputed the panel
 * size from the global input W/H and so ignored overrides. (DECISIONS_LOG
 * 2026-05-25 left doors in `calcCuts` "until BoardModel handles them"; this
 * closes that gap for the door dimensions without moving doors into BoardModel.)
 *
 * One CutItem per door (qty=1, group 'door'); identical panels are folded by
 * `mergeCutItems` downstream — exactly like the BoardModel carcass cuts. The
 * caller's `enrich` step assigns the front material to the 'door' group, so no
 * `materialId` is set here (matching the legacy behaviour).
 *
 * Doors with `hasDoor === false` (appliance bays / `hasFronts:false`) are
 * skipped — they have no facade panel to cut.
 *
 * @param edging Cabinet-wide edging band. Deducts 2×thickness (mm) from each
 *   panel dimension (one band per edge, both edges of each axis), matching the
 *   legacy perimeter-band deduction. Omit for the raw (un-banded) door size.
 */
export function buildDoorCutItems(args: {
  doors: Record<string, Door>;
  bodyBoxes: ReadonlyArray<Box>;
  numFrontsPerBox: ReadonlyMap<string, number>;
  edging?: Edging;
  /** Optional per-body front material id. When provided, each door cut is tagged
   *  with its body's (possibly overridden) front material so the cut list groups
   *  it correctly — bypassing the cabinet-wide `enrich` step. Omit to fall back
   *  to the cabinet front material via group enrichment. */
  frontMaterialForBox?: (boxId: string) => MaterialId | string | undefined;
}): CutItem[] {
  const { doors, bodyBoxes, numFrontsPerBox, edging, frontMaterialForBox } = args;
  const perimMm = edging ? 2 * edging.thickness : 0;
  const cuts: CutItem[] = [];
  for (const box of bodyBoxes) {
    const nf = numFrontsPerBox.get(box.id) ?? 1;
    const name = doorCutName(box.level);
    const matId = frontMaterialForBox?.(box.id);
    for (let fi = 0; fi < nf; fi++) {
      const door = doors[makeDoorId(box.id, fi)];
      if (!door || !door.hasDoor) continue;
      cuts.push({
        name,
        qty: 1,
        w: cm(door.width) - perimMm,
        h: cm(door.height) - perimMm,
        group: 'door',
        ...(matId !== undefined ? { materialId: matId } : {}),
      });
    }
  }
  return cuts;
}
