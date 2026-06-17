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
  /** Per-side shell flags. When undefined, both sides fall back to `hasShell`
   *  (legacy behaviour — symmetric envelope). Used by kitchen units where the
   *  carpenter can disable a single side (e.g. cabinet flush against a wall). */
  hasShellLeft?: boolean;
  hasShellRight?: boolean;
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
   *  - `'sink-open'`: no top board; two STANDING traverse boards (front + back)
   *    are added instead — each `innerW × sinkTraverseWidthCm` (visible in
   *    front view as a `sinkTraverseWidthCm`-tall strip at the top), thickness
   *    = tBody. The sink basin drops into the open middle from the countertop above. */
  topVariant?: 'standard' | 'sink-open';
  /** Standing height (vertical, cm) of each sink traverse — the dimension
   *  visible in the front view. Only used when `topVariant === 'sink-open'`.
   *  Defaults to 10 cm. */
  sinkTraverseWidthCm?: number;
  /** Emit door / front panel cuts. Defaults to true. When false, all front
   *  panels are suppressed — no door CutItems, no hardware — used by appliance
   *  bays (e.g. dishwasher) whose front face is the appliance itself. */
  hasFronts?: boolean;
  /** Include a back panel. Defaults to true. When false, the back board
   *  is not emitted — used by appliance bays (e.g. dishwasher) that have
   *  no rear panel. The `backThickness` value is still consumed by the
   *  carcass-depth formula so the side panels keep their target depth even
   *  when no back board is produced. */
  hasBack?: boolean;
  /** Include a bottom panel. Defaults to true. When false, the bottom
   *  board is not emitted and the side panels span the full inner height
   *  (minus the top board). Used by appliance bays (e.g. dishwasher) where
   *  the appliance sits on the floor and the cabinet has no structural floor. */
  hasBottom?: boolean;
  /** Mounting position within a kitchen. `'base'` (default) = stands on the
   *  floor; `'wall'` = hung on the wall above the countertop (the `'wall'`
   *  module — קלפה). Drives the kitchen elevation (wall units render in an
   *  upper row, aligned above their base unit) and the body editor (wall units
   *  expose only the shelf control). Pure UI/positioning metadata — it does NOT
   *  affect board or cut computation. */
  mount?: 'base' | 'wall';
  /** Wall-cabinet (קלפה) top+bottom envelope: two front-material caps wrapping
   *  the body above and below, enabled by a single checkbox. Independent of the
   *  side shell (`hasShell*`) — a wall cabinet has no side shell. Like
   *  `hasEnvelopeTop` it shrinks the body (the cap thickness is taken from the
   *  external H, not added to it). Default false. */
  hasWallEnvelope?: boolean;
  /** Lift-up mechanism (קלפה): a single hinged-from-top panel instead of cup
   *  hinges. When true, the door is emitted with no hinges (`hinges:[]`,
   *  `hingeCount:0`), the hardware preset switches to `'wall_cabinet'` (the
   *  200₪ lift mechanism), and `DoorEditor` hides the hinge controls. Decoupled
   *  from `mount` so other wall-row modules (e.g. עליון מזווה — pantry top)
   *  can sit in the same elevation row with normal cup hinges. Default false. */
  liftMechanism?: boolean;
  /** Single-front lock: when true, the body always emits exactly ONE front
   *  column whatever its width — `maxDoorWidth` is ignored for column counting.
   *  Used by modules where a full-width facade is structural (drawers unit,
   *  קלפה, עליון מזווה — a drawer face / lift panel is one piece per body).
   *  Default false → normal `ceil(W / maxDoorWidth)` split. */
  singleFront?: boolean;
  /** Corner unit (פינה): a single fixed-width door at one edge + an L-shaped
   *  front-material filler that covers the rest of the front. The filler's 7 cm
   *  return (perpendicular, into the cabinet, at the carcass inner height)
   *  carries the door hinges. Presence of this object marks the body as a corner
   *  unit and drives the dedicated front layout, the door-width/hinge override,
   *  and the two filler cut pieces. Absent (default) = a normal body whose front
   *  splits into equal door columns. Every value is carpenter-overridable. */
  cornerFiller?: {
    /** Which EDGE the door sits on. Hinges always land on the opposite
     *  (filler) side. Default 'right'. */
    doorSide: 'left' | 'right';
    /** Door panel width (cm). Default 60. */
    doorWidthCm: number;
    /** Depth (cm) of the perpendicular hinge-post return. Default 7. */
    returnDepthCm: number;
  };
}

/** Single source of truth for "which sides of the cabinet have a shell".
 *  Reads per-side flags first; falls back to the legacy `hasShell` flag.
 *  Use this anywhere that consumes shell information so kitchen units with
 *  asymmetric shells (e.g. only left side) compute correctly. */
export function getShellSides(input: CabinetInput): { left: boolean; right: boolean } {
  return {
    left: input.hasShellLeft ?? input.hasShell,
    right: input.hasShellRight ?? input.hasShell,
  };
}
