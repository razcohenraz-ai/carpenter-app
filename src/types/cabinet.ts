import type { MaterialId } from './materials';

/** The 16 form values that drive `calculate()`. Single source of truth for
 *  the cabinet's external definition — everything else (boxes, boards,
 *  doors, the carcass depth) is derived from this + the persistent
 *  user-choice state in {@link SavedCabinetState}. */
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
}
