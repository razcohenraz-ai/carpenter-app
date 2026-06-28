import { makeDoorId } from './doorUtils';

/** A single door slot in a body's (column × section) grid. */
export interface DoorCell {
  /** Column index within the body (0 = rightmost front). */
  fi: number;
  /** Section index within the column, bottom-up (0 = bottom section). */
  si: number;
  /** Stable door id — makeDoorId(boxId, fi, si). */
  doorId: string;
  /** Height of this section in cm. Pass as `boxH` to calcMainDoorHeight. */
  sectionH: number;
  /** Section bottom in box-local cm (from body bottom). Used for y0 in cabinetFronts. */
  sectionY0: number;
  /** Gap rule at the top of this section's door (false for non-top sections). */
  hasTopGap: boolean;
  /** Gap rule at the bottom of this section's door (body-level rule for si=0; true for inner). */
  hasBottomGap: boolean;
}

/** Stable save-key for a door in the saved state. Backward-compatible:
 *  si=0 produces `${slotKey}:${fi}` (same as before sections were added). */
export function makeSavedDoorKey(slotKey: string, fi: number, si: number): string {
  return si === 0 ? `${slotKey}:${fi}` : `${slotKey}:${fi}:${si}`;
}

/**
 * Returns the ordered door cells for one body (column × section grid).
 *
 * When `shelvesCm` is empty (no internal shelves), emits one cell per column
 * (si=0 only) — identical to pre-section behaviour. When shelves are present,
 * emits `numFronts × (numShelves+1)` cells.
 *
 * Gap rules per section:
 * - `hasTopGap`: only true for the top section (inherits `opts.hasTopGap`).
 * - `hasBottomGap`: inherits `opts.hasBottomGap` for the bottom section;
 *   always true for inner sections (the door above a shelf has a bottom gap).
 *
 * @param shelvesCm  Sorted box-local shelf positions (cm from body bottom).
 *                   Pre-filter to (0, boxH) exclusive before passing.
 * @param boxH       Total body height (cm). Required when shelvesCm is non-empty.
 */
export function buildBodyDoorCells(
  boxId: string,
  numFronts: number,
  opts: {
    hasTopGap?: boolean;
    hasBottomGap?: boolean;
    /** Box-local sorted shelf positions (cm from body bottom, exclusive of 0 and boxH). */
    shelvesCm?: number[];
    /** Total body height in cm. Provide to get correct sectionH on the top section. */
    boxH?: number;
  } = {},
): DoorCell[] {
  const {
    hasTopGap = true,
    hasBottomGap = true,
    shelvesCm = [],
    boxH = 0,
  } = opts;

  // Section boundaries: [0, s1, s2, ..., boxH]
  const boundaries: number[] = [0, ...shelvesCm, boxH];
  const numSections = Math.max(1, boundaries.length - 1);

  const cells: DoorCell[] = [];
  for (let fi = 0; fi < numFronts; fi++) {
    for (let si = 0; si < numSections; si++) {
      const sectionY0 = boundaries[si] ?? 0;
      const sectionY1 = boundaries[si + 1] ?? boxH;
      cells.push({
        fi,
        si,
        doorId: makeDoorId(boxId, fi, si),
        sectionH: sectionY1 - sectionY0,
        sectionY0,
        hasTopGap: si === numSections - 1 ? hasTopGap : false,
        hasBottomGap: si === 0 ? hasBottomGap : true,
      });
    }
  }
  return cells;
}
