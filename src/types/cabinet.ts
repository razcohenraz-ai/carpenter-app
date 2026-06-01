import type { Edging } from './edging';
import type { MaterialId } from './materials';

/** The 16 form values that drive `calculate()` + an optional cabinet-wide
 *  edging default. Single source of truth for the cabinet's external
 *  definition — everything else (boxes, boards, doors, the carcass depth)
 *  is derived from this + the persistent user-choice state in
 *  {@link SavedCabinetState}. */
export interface CabinetInput {
  W: number;
  H: number;
  D: number;
  /** Back-panel thickness in cm (form field "עובי גב", entered in mm and
   *  divided by 10). Reduces the carcass depth: every carcass board's depth
   *  becomes `D - backThickness - HINGE_GAP_CM - frontMaterialThickness`. */
  backThickness: number;
  hasShell: boolean;
  hasEnvelopeTop: boolean;
  bodyMaterialId: MaterialId;
  frontMaterialId: MaterialId;
  plinth: number;
  /** Recess depth in cm — pushes the plinth back from the cabinet's front
   *  face. 0 (default) = flush with the front. */
  plinthRecess: number;
  doorCoversPlinth: boolean;
  lowerDoorH: number | undefined;
  middleDoorH: number | undefined;
  doorsPerColumn: 'auto' | 1 | 2 | 3;
  doorGapMm: number;
  maxDoorWidth: number;
  /** Cabinet-wide edging default. Optional — absent values fall back to
   *  {@link DEFAULT_EDGING}. Kept optional so projects saved before edging
   *  was introduced still deserialize cleanly without a schema bump. */
  edging?: Edging;
  /** Top-panel structural variant.
   *  - `'standard'` (default): full-width top board.
   *  - `'sink-open'`: no top board; two narrow traverse boards (front + back)
   *    are added instead so the sink basin can drop in from above. */
  topVariant?: 'standard' | 'sink-open';
  /** Width (depth direction) of each sink traverse in cm. Only used when
   *  `topVariant === 'sink-open'`. Defaults to 8 cm. */
  sinkTraverseWidthCm?: number;
}
