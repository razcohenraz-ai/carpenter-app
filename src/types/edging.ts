import type { MaterialId } from './materials';

/** Edge-banding spec for a panel — the thin strip applied to a board's
 *  visible cut edge. The pattern of WHICH edges get the band (front-only
 *  vs. perimeter vs. none) is determined by the board's role, not by this
 *  type — see `getEdgingPattern` and `getDeductionFor` in
 *  `core/boards/boardModel.ts`. */
export interface Edging {
  /** Band thickness in mm. Two stocked options. The cut-list deducts
   *  `thickness/10` cm per banded edge from the board's effective
   *  dimensions (1× on a single edge, 2× on a perimeter). */
  thickness: 0.6 | 1.3;
  /** Catalog material id whose color/finish drives the band. `undefined`
   *  means "auto" — the band matches the board's effective material (body
   *  panel → body color, front panel → front color). Auto resolution is
   *  performed by `getEdgingFinishMaterial` at the cut-list boundary; the
   *  saved data stays declarative. */
  finishMaterialId?: MaterialId;
}

/** Cabinet-wide default applied whenever no more-specific override is set.
 *  0.6 mm + auto finish covers the standard case. Use the constant rather
 *  than literal `{ thickness: 0.6 }` so a future change to the default
 *  propagates everywhere consistently. */
export const DEFAULT_EDGING: Edging = { thickness: 0.6 };
