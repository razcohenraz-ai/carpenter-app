import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useCabinet } from '../hooks/useCabinet';
import { MATERIALS, getMaterialWithCustom } from '../../catalog';
import { computeInnerWidth } from '../../core/boards/boardModel';
import { boxStableKey } from '../../core/interior/interiorUtils';
import { isHingeSideFree } from '../../core/doors/doorUtils';
import type { MaterialId } from '../../types';
import type { Edging } from '../../types/edging';
import BoxesList from './BoxesList';
import CabinetSketch from './CabinetSketch';
import CabinetFrontsSketch from './CabinetFrontsSketch';
import { CabinetFrontsOverlay } from './CabinetFrontsOverlay';
import { buildCabinetSketchModel } from '../../core/product/cabinetSketchModel';
import BoxInteriorEditor, { type EditorTab } from './BoxInteriorEditor';
import DoorEditor from './DoorEditor';
import DoorsList from './DoorsList';
import CutsList from './CutsList';
import { HardwareList } from './HardwareList';
import { computeUnitCutsAndHardware } from '../../core/cabinetCompute';
import { LIFT_MECHANISMS } from '../../catalog/liftMechanisms';
import { buildLiftMechanismHardware } from '../../core/lift/liftMechanismHardware';
import PlinthEditor from './PlinthEditor';
import ExternalDrawerEditor from './ExternalDrawerEditor';
import { checkBoxConsistency } from '../../core/geometry/dimensionConsistency';
import { MAX_BOX_W, MAX_BOX_H, plinthOuterWidth } from '../../core/geometry/boxDecomposition';
import styles from './CabinetForm.module.css';

type DoorsPerColumn = 'auto' | '1' | '2' | '3';

interface FormState {
  W: string;
  H: string;
  D: string;
  /** Back-panel thickness in MILLIMETRES (carpenter mental model). Stored
   *  here as the raw input string; converted to cm at submit time. */
  backThicknessMm: string;
  plinth: string;
  /** Recess depth in cm. Stored as a string so the input field can hold
   *  partial entries; converted at submit / live-update time. "0" means
   *  no recess. */
  plinthRecess: string;
  lowerDoorH: string;
  middleDoorH: string;
  hasShell: boolean;
  /** Per-side shell flags — used when `splitShellSides` is true (kitchen units). */
  hasShellLeft: boolean;
  hasShellRight: boolean;
  hasEnvelopeTop: boolean;
  /** Wall-cabinet (קלפה) top+bottom envelope toggle. Only meaningful when
   *  `initialInput.mount === 'wall'`. Independent of `hasShell*`. */
  hasWallEnvelope: boolean;
  doorCoversPlinth: boolean;
  bodyMaterialId: MaterialId;
  frontMaterialId: MaterialId;
  doorsPerColumn: DoorsPerColumn;
  doorGap: string;
  doorGapManuallySet: boolean;
  maxDoorWidth: string;
  /** Cabinet-wide edging band thickness. Two stocked options; the form
   *  stores the value as a string for the `<select>`. Maps to
   *  `Edging.thickness` (0.6 | 1.3) at submit time. */
  edgingThicknessMm: '0.6' | '1.3';
  /** Cabinet-wide edging finish material. `''` = auto (matches the panel
   *  the band is on); any other value is a catalog `MaterialId`. */
  edgingFinishMaterialId: '' | MaterialId;
  /** Corner unit (פינה) controls — only meaningful when `initialInput.cornerFiller`
   *  is set. Door side, fixed door width (cm), and the hinge-post return depth
   *  (cm). Stored as strings for the number inputs. */
  cornerDoorSide: 'left' | 'right';
  cornerDoorWidthCm: string;
  cornerReturnCm: string;
  /** Chosen lift-mechanism family id (AVENTOS HK/HL); '' = none. Only meaningful
   *  when `initialInput.liftMechanism === true` (a wall-cabinet flap). */
  liftMechanismId: string;
}

interface FormErrors {
  W: string;
  H: string;
  D: string;
  plinth: string;
  lowerDoorH: string;
  middleDoorH: string;
}

const NO_ERRORS: FormErrors = { W: '', H: '', D: '', plinth: '', lowerDoorH: '', middleDoorH: '' };
const materialsArray = Object.values(MATERIALS);

function showLowerDoor(doorsPerColumn: DoorsPerColumn, rawH: string): boolean {
  if (doorsPerColumn === '2' || doorsPerColumn === '3') return true;
  if (doorsPerColumn === 'auto') {
    const h = parseFloat(rawH);
    return !isNaN(h) && h > 180;
  }
  return false;
}

// ── Height-authoritative collision resolution ──────────────────────────────────
// The form defaults the door rows seed from; reused as the refit target when a
// height change collides with the saved values.
const DEFAULT_LOWER_DOOR_CM = 110;
const DEFAULT_MIDDLE_DOOR_CM = 80;
// No built door section may be shorter than this — a sliver door isn't real. The
// bottom section is `lowerDoorH − plinth`, so the sections sum to `H − plinth`.
const MIN_SECTION_CM = 30;

/** Whether the engine actually stacks the cabinet into rows for this
 *  (doorsPerColumn, H) — mirrors decomposeBoxes' `needsSplit`. NOTE auto splits
 *  only above MAX_BOX_H (200), NOT at showLowerDoor's 180 field-visibility cue. */
function cabinetSplitsRows(dpc: DoorsPerColumn, H: number): boolean {
  if (dpc === '2' || dpc === '3') return true;
  if (dpc === '1') return false;
  return H > MAX_BOX_H; // 'auto'
}

/** Largest door-section count (1..3) whose sections all reach MIN_SECTION_CM,
 *  given the plinth eats into the bottom section (sections sum to H − plinth). */
function maxSections(H: number, plinth: number): 1 | 2 | 3 {
  const doorTotal = H - plinth;
  if (doorTotal >= 3 * MIN_SECTION_CM) return 3;
  if (doorTotal >= 2 * MIN_SECTION_CM) return 2;
  return 1;
}

/** True when the current floor-measured door heights make any built section drop
 *  below MIN_SECTION_CM (or not fit). bottom = lo − plinth, top = H − lo − (mid). */
function sectionsViolate(H: number, plinth: number, count: 2 | 3, lo: number, mid: number): boolean {
  if (!(lo > 0)) return true;
  if (count === 2) return (lo - plinth) < MIN_SECTION_CM || (H - lo) < MIN_SECTION_CM;
  if (!(mid > 0)) return true;
  return (lo - plinth) < MIN_SECTION_CM || mid < MIN_SECTION_CM || (H - lo - mid) < MIN_SECTION_CM;
}

/** Floor-measured door heights for a `count`-section cabinet, every section
 *  >= MIN_SECTION_CM: the form defaults when they satisfy it, else an equal split
 *  of the section space (H − plinth). Assumes `count <= maxSections(H, plinth)`. */
function fitDoorHeights(H: number, plinth: number, count: 2 | 3): { lowerDoorH: number; middleDoorH?: number } {
  const each = Math.floor((H - plinth) / count);
  if (count === 3) {
    if (!sectionsViolate(H, plinth, 3, DEFAULT_LOWER_DOOR_CM, DEFAULT_MIDDLE_DOOR_CM)) {
      return { lowerDoorH: DEFAULT_LOWER_DOOR_CM, middleDoorH: DEFAULT_MIDDLE_DOOR_CM };
    }
    return { lowerDoorH: plinth + each, middleDoorH: each };
  }
  if (!sectionsViolate(H, plinth, 2, DEFAULT_LOWER_DOOR_CM, NaN)) {
    return { lowerDoorH: DEFAULT_LOWER_DOOR_CM };
  }
  return { lowerDoorH: plinth + each };
}

/** Refit a FormState's section count + door rows + plinth to its height H (H is
 *  authoritative). Pure. Caps doors-per-column to what fits at MIN_SECTION_CM,
 *  re-balances any sub-minimum / non-fitting section, and keeps the plinth below
 *  H and the lower door. Returns whether anything changed (drives the notice). */
function fitFormToHeight(f: FormState): { next: FormState; changed: boolean } {
  const H = parseFloat(f.H);
  if (!(H > 0)) return { next: f, changed: false };
  let doorsPerColumn = f.doorsPerColumn;
  let { lowerDoorH, middleDoorH, plinth, doorCoversPlinth } = f;
  let changed = false;
  const plinthVal = parseFloat(plinth) || 0;

  if (cabinetSplitsRows(doorsPerColumn, H)) {
    if (doorsPerColumn === '2' || doorsPerColumn === '3') {
      const desired = doorsPerColumn === '3' ? 3 : 2;
      const count = Math.min(desired, maxSections(H, plinthVal));
      if (count < desired) {                       // too short for the chosen count → cap it
        doorsPerColumn = count <= 1 ? '1' : '2';
        changed = true;
      }
      if (count === 2 || count === 3) {
        const lo = parseFloat(lowerDoorH);
        const mid = parseFloat(middleDoorH);
        if (count !== desired || sectionsViolate(H, plinthVal, count, lo, mid)) {
          const fit = fitDoorHeights(H, plinthVal, count);
          if (String(fit.lowerDoorH) !== lowerDoorH) { lowerDoorH = String(fit.lowerDoorH); changed = true; }
          if (count === 3 && fit.middleDoorH !== undefined && String(fit.middleDoorH) !== middleDoorH) { middleDoorH = String(fit.middleDoorH); changed = true; }
        }
      }
    } else {
      // auto (> MAX_BOX_H) → 2 rows; H is large enough that min-30 always holds,
      // but a saved lower door taller than H still needs refitting.
      const lo = parseFloat(lowerDoorH);
      if (sectionsViolate(H, plinthVal, 2, lo, NaN)) {
        const fit = fitDoorHeights(H, plinthVal, 2);
        if (String(fit.lowerDoorH) !== lowerDoorH) { lowerDoorH = String(fit.lowerDoorH); changed = true; }
      }
    }
  }

  // Plinth: keep it below H and (when split) below the lower door.
  const loEff = cabinetSplitsRows(doorsPerColumn, H) ? parseFloat(lowerDoorH) : H;
  const plinthMax = Math.min(H, loEff);
  if (plinthVal >= plinthMax) {
    const newP = Math.max(0, Math.floor(plinthMax) - 1);
    if (String(newP) !== plinth) { plinth = String(newP); changed = true; }
    if (newP <= 0) doorCoversPlinth = false;
  }

  return changed
    ? { next: { ...f, doorsPerColumn, lowerDoorH, middleDoorH, plinth, doorCoversPlinth }, changed }
    : { next: f, changed: false };
}

interface CabinetFormProps {
  /** Initial dimensions/settings to populate the form (from a saved project). */
  initialInput?: import('../../types/cabinet').CabinetInput;
  /** Saved interior/door/override state to restore on first calculate(). */
  initialState?: import('../../types/project').SavedCabinetState;
  /** Called after every successful calculate() with the current input+state.
   *  Used by the project layer to auto-save. */
  onCabinetChange?: (
    input: import('../../types/cabinet').CabinetInput,
    state: import('../../types/project').SavedCabinetState,
  ) => void;
  /** Settings including custom materials and overrides. */
  settings?: {
    customMaterials?: import('../../types/materials').CustomMaterial[];
    bodyEnabledMaterialIds?: string[];
    frontEnabledMaterialIds?: string[];
    bodyMaterialPriceOverrides?: Partial<Record<import('../../types/materials').MaterialId, number>>;
    frontMaterialPriceOverrides?: Partial<Record<import('../../types/materials').MaterialId, number>>;
    enabledRunnerIds?: string[];
    runnerPriceOverrides?: Record<string, number[]>;
    enabledLiftMechanismIds?: string[];
    liftMechanismPriceOverrides?: Record<string, number>;
  };
  /** When true, hide the main W/H/D fields. Used for kitchen units where
   *  dimensions are owned exclusively by per-body overrides via the
   *  BoxInteriorEditor — no input-level W/H/D editing. The form's W/H/D
   *  state values still flow from `initialInput` (kitchenModuleInput
   *  defaults) so calculate() receives valid dimensions; users adjust them
   *  via the per-body override sheet. */
  hideMainDimensions?: boolean;
  /** When true, hide the "doors per column" selector (kitchen units use auto). */
  hideDoorsPerColumn?: boolean;
  /** When true, hide the "envelope top" (top ceiling shell) checkbox. */
  hideEnvelopeTop?: boolean;
  /** When true, replace the single "מעטפת חיצונית" checkbox with two separate
   *  checkboxes for left and right side. Used in kitchen units where a cabinet
   *  might sit flush against a wall on one side only. */
  splitShellSides?: boolean;
  /** When true, suppress the plinth UI in the form: the "גובה צוקל" input,
   *  the "דלת מכסה צוקל" checkbox, and the plinth click-to-edit on the sketch.
   *  Used for kitchen units — plinth is edited at the kitchen level
   *  (KitchenOverview), not per-unit. */
  hidePlinthEditor?: boolean;
  /** When true, the cabinet is a single-body kitchen unit: skip the form and
   *  open straight into the per-body editor, with the unit-level controls
   *  (shell sides, door gap, lift-mechanism family, corner) folded into the
   *  editor's "unit settings" section. The unit form is retired entirely. */
  kitchenDirectEdit?: boolean;
  /** Back-out handler used by the body editor in `kitchenDirectEdit` mode —
   *  returns to the kitchen (there is no form to fall back to). */
  onExit?: () => void;
  /** Opens the editor straight onto a specific door/drawer's editor at mount.
   *  Used by the kitchen overview's clickable fronts (the "cabinet way" — one
   *  click in the overview jumps into that door's editor). Consumed once. */
  initialEditing?: { type: 'door'; doorId: string } | { type: 'drawer'; drawerId: string };
}

function inputToFormState(
  inp: import('../../types/cabinet').CabinetInput,
): FormState {
  const dpc: DoorsPerColumn =
    inp.doorsPerColumn === 1 ? '1' :
    inp.doorsPerColumn === 2 ? '2' :
    inp.doorsPerColumn === 3 ? '3' : 'auto';
  return {
    W: String(inp.W), H: String(inp.H), D: String(inp.D),
    backThicknessMm: String(inp.backThickness * 10),
    plinth: String(inp.plinth), plinthRecess: String(inp.plinthRecess),
    lowerDoorH: inp.lowerDoorH !== undefined ? String(inp.lowerDoorH) : '110',
    middleDoorH: inp.middleDoorH !== undefined ? String(inp.middleDoorH) : '80',
    hasShell: inp.hasShell,
    hasShellLeft: inp.hasShellLeft ?? inp.hasShell,
    hasShellRight: inp.hasShellRight ?? inp.hasShell,
    hasEnvelopeTop: inp.hasEnvelopeTop,
    hasWallEnvelope: inp.hasWallEnvelope ?? false,
    doorCoversPlinth: inp.doorCoversPlinth,
    bodyMaterialId: inp.bodyMaterialId, frontMaterialId: inp.frontMaterialId,
    doorsPerColumn: dpc,
    doorGap: String(inp.doorGapMm), doorGapManuallySet: true,
    maxDoorWidth: String(inp.maxDoorWidth),
    edgingThicknessMm: inp.edging?.thickness === 1.3 ? '1.3' : '0.6',
    edgingFinishMaterialId: (inp.edging?.finishMaterialId ?? '') as '' | import('../../types/materials').MaterialId,
    cornerDoorSide: inp.cornerFiller?.doorSide ?? 'right',
    cornerDoorWidthCm: String(inp.cornerFiller?.doorWidthCm ?? 60),
    cornerReturnCm: String(inp.cornerFiller?.returnDepthCm ?? 7),
    liftMechanismId: inp.liftMechanismId ?? '',
  };
}

export default function CabinetForm({ initialInput, initialState, onCabinetChange, settings, hideMainDimensions, hideDoorsPerColumn, hideEnvelopeTop, splitShellSides, hidePlinthEditor, kitchenDirectEdit, onExit, initialEditing }: CabinetFormProps = {}): React.JSX.Element {
  const { t } = useTranslation();
  const {
    result, calculate,
    interiorById, setBoxInterior,
    cellInteriorById, addPartition, removePartition, setCellItems,
    doorsById, drawerFrontsById, displayNumbers, numFrontsPerBox,
    partitionsById, frontLayoutByRow,
    setDoorHingeSide, setDoorHingeCount, setHingeManual, resetHingeToAuto, setDoorHasDoor,
    setDoorThickness, setCoversSkirt,
    setDrawerHeight, setDrawerFrontThickness, deleteDrawer,
    plinthGableOverrides, setPlinthGableOverride, resetPlinthGableOverrides,
    boardOverridesByStableId,
    bodyEdgingOverrides, setBodyEdgingOverride,
    boxDimensionOverrides, setBoxDimension, resetBoxDimensions,
    boxMaterialOverrides, setBoxMaterial, resetBoxMaterials,
    getLastInput, getSnapshot, restoreState,
  } = useCabinet(settings);

  // On mount: if we have a saved product, calculate immediately so
  // lastInputRef is set (enables setBoxInterior / all other setters) and the
  // sketch appears without requiring the user to click "חשב".
  // Then restore the saved state so interior/doors/overrides come back.
  const restoredRef = React.useRef(false);
  // Gate for the live-recalc effect: skip its first run (the mount), which the
  // restore effect above already owns, so we never recalc over the just-restored
  // interior/doors. Subsequent form edits recalc + auto-save with no "חשב" click.
  const liveReadyRef = React.useRef(false);
  React.useEffect(() => {
    if (!initialInput) return;
    // Build CabinetInput from the initialised FormState (mirrors handleSubmit)
    const doorsPerColumn: 'auto' | 1 | 2 | 3 =
      form.doorsPerColumn === '1' ? 1 :
      form.doorsPerColumn === '2' ? 2 :
      form.doorsPerColumn === '3' ? 3 : 'auto';
    const backThicknessMm = parseFloat(form.backThicknessMm);
    const backThicknessCm = Number.isFinite(backThicknessMm) && backThicknessMm >= 0
      ? backThicknessMm / 10 : 0.5;
    const plinthRecessParsed = parseFloat(form.plinthRecess);
    const needsLo = showLowerDoor(form.doorsPerColumn, form.H);
    const needsMid = form.doorsPerColumn === '3';
    const loDoor = parseFloat(form.lowerDoorH);
    const midDoor = parseFloat(form.middleDoorH);
    calculate({
      W: parseFloat(form.W) || initialInput.W,
      H: parseFloat(form.H) || initialInput.H,
      D: parseFloat(form.D) || initialInput.D,
      backThickness: backThicknessCm,
      hasShell: form.hasShell,
      hasShellLeft: form.hasShellLeft,
      hasShellRight: form.hasShellRight,
      hasEnvelopeTop: form.hasEnvelopeTop && (form.hasShellLeft || form.hasShellRight),
      hasWallEnvelope: form.hasWallEnvelope,
      bodyMaterialId: form.bodyMaterialId,
      frontMaterialId: form.frontMaterialId,
      plinth: parseFloat(form.plinth) || 0,
      plinthRecess: Number.isFinite(plinthRecessParsed) && plinthRecessParsed > 0 ? plinthRecessParsed : 0,
      doorCoversPlinth: form.doorCoversPlinth,
      lowerDoorH: needsLo ? loDoor : undefined,
      middleDoorH: needsMid ? midDoor : undefined,
      doorsPerColumn,
      doorGapMm: parseFloat(form.doorGap) || 0,
      maxDoorWidth: Math.max(parseFloat(form.maxDoorWidth) || 60, 10),
      edging: buildCabinetEdging(form),
      // Preserve sink-open variant (kitchen sink module) — not editable in
      // the form but must survive every calculate() call.
      ...(initialInput?.topVariant ? { topVariant: initialInput.topVariant } : {}),
      ...(initialInput?.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: initialInput.sinkTraverseWidthCm } : {}),
      // Preserve appliance-bay flags (kitchen dishwasher module) — same
      // rationale: no form field, but every calculate() must keep them.
      ...(initialInput?.hasFronts !== undefined ? { hasFronts: initialInput.hasFronts } : {}),
      ...(initialInput?.hasBack !== undefined ? { hasBack: initialInput.hasBack } : {}),
      ...(initialInput?.hasBottom !== undefined ? { hasBottom: initialInput.hasBottom } : {}),
      ...(initialInput?.mount !== undefined ? { mount: initialInput.mount } : {}),
      ...(initialInput?.liftMechanism !== undefined ? { liftMechanism: initialInput.liftMechanism } : {}),
      ...(form.liftMechanismId ? { liftMechanismId: form.liftMechanismId } : {}),
      ...(initialInput?.singleFront !== undefined ? { singleFront: initialInput.singleFront } : {}),
      // Corner unit (פינה): rebuild cornerFiller from the editable corner controls
      // so the door side / width / return survive every recalculation (Gotcha #2).
      ...(initialInput?.cornerFiller ? { cornerFiller: {
        doorSide: form.cornerDoorSide,
        doorWidthCm: Math.max(parseFloat(form.cornerDoorWidthCm) || 60, 1),
        returnDepthCm: Math.max(parseFloat(form.cornerReturnCm) || 7, 0),
      } } : {}),
    });
    // Restore saved state (interior/doors/overrides) right after first calculate
    if (initialState && !restoredRef.current) {
      restoredRef.current = true;
      restoreState(initialState);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save after EVERY calculate() — covers handleSubmit, setBoxInterior,
  // setDoorHingeCount, and all other paths that trigger calculate internally.
  // Skips if no onCabinetChange prop or no result yet.
  React.useEffect(() => {
    if (!onCabinetChange || !result) return;
    const input = getLastInput();
    if (!input) return;
    onCabinetChange(input, getSnapshot());
  // result is the only dep that changes after every calculate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // When settings change (e.g., user adds a custom material), re-run calculate
  // with the last input so the results reflect the updated material definitions
  React.useEffect(() => {
    const lastInput = getLastInput();
    if (lastInput) {
      calculate(lastInput);
    }
  }, [settings]);

  // All materials: catalog first, then custom — filtered by enabled IDs per category.
  // Note: availableBodyMaterials/availableFrontMaterials are computed AFTER form is
  // declared (below), so the current selection is always included in the dropdown.
  const allMaterials = [
    ...Object.values(MATERIALS).map(m => ({ ...m, isCustom: false as const })),
    ...(settings?.customMaterials ?? []).map(m => ({ ...m, isCustom: true as const })),
  ];
  const defaultIds = Object.keys(MATERIALS);  // fallback when no settings yet

  // Unified editor state: one editor open at a time. The body/door/plinth
  // editors replace the main view; the drawer editor renders as an overlay
  // above it.
  type Editing =
    | { type: 'none' }
    | { type: 'box'; boxId: string }
    | { type: 'door'; doorId: string }
    | { type: 'drawer'; drawerId: string }
    | { type: 'plinth' };
  const [editing, setEditing] = useState<Editing>(initialEditing ?? { type: 'none' });
  const [sketchMode, setSketchMode] = useState<'bodies' | 'fronts' | 'cuts' | 'hardware'>('bodies');
  // Inline notice shown when a height change auto-refits the door rows / plinth
  // (H is authoritative). Set on commit (blur / doors-per-column change), cleared
  // on the next keystroke.
  const [fitNotice, setFitNotice] = useState<string | null>(null);
  // Kitchen direct-edit: the body editor's active tab is owned here so it
  // survives the editor remounting when a door/drawer edit opens (and closes).
  const [kitchenEditorTab, setKitchenEditorTab] = useState<EditorTab>('bodies');

  // Clicking a body opens the per-body editor directly (materials + dimension
  // overrides + interior + the bodies/fronts/cuts/hardware tabs). main view →
  // body editor.
  function handleBoxClick(boxId: string): void { setEditing({ type: 'box', boxId }); }
  function handleDoorClick(doorId: string): void { setEditing({ type: 'door', doorId }); }
  function handleDrawerFrontClick(drawerId: string): void { setEditing({ type: 'drawer', drawerId }); }
  function handlePlinthClick(): void { setEditing({ type: 'plinth' }); }
  function closeEditor(): void { setEditing({ type: 'none' }); }

  // Shared live-update path for the plinth editor. Both the height input
  // and the recess input call this with `{ plinth?, plinthRecess? }`; the
  // values that aren't passed fall back to the current form state. Keeps
  // the CabinetInput-building logic in one place — mirrors handleSubmit
  // for everything except the field the user just changed.
  /** Builds an {@link Edging} value from the current form state. Pure —
   *  no side effects; used to feed `calculate()` and to seed the body
   *  editor's "מותאם" override with the cabinet defaults. */
  function buildCabinetEdging(state: FormState): Edging {
    const base: Edging = {
      thickness: state.edgingThicknessMm === '1.3' ? 1.3 : 0.6,
    };
    return state.edgingFinishMaterialId
      ? { ...base, finishMaterialId: state.edgingFinishMaterialId }
      : base;
  }

  /** Build the full CabinetInput from a FormState — the single payload shared by
   *  the mount calculate, Enter-submit, and the live-recalc effect. Mirrors the
   *  fields handleSubmit assembled; preserves module flags that aren't form
   *  fields (sink/appliance/wall/lift/corner) from `initialInput`. */
  function buildCabinetInput(f: FormState) {
    const doorsPerColumn: 'auto' | 1 | 2 | 3 =
      f.doorsPerColumn === '1' ? 1 :
      f.doorsPerColumn === '2' ? 2 :
      f.doorsPerColumn === '3' ? 3 : 'auto';
    const backThicknessMm = parseFloat(f.backThicknessMm);
    const backThicknessCm = Number.isFinite(backThicknessMm) && backThicknessMm >= 0 ? backThicknessMm / 10 : 0.5;
    const plinthRecessParsed = parseFloat(f.plinthRecess);
    const plinthRecess = Number.isFinite(plinthRecessParsed) && plinthRecessParsed > 0 ? plinthRecessParsed : 0;
    const needsLo = showLowerDoor(f.doorsPerColumn, f.H);
    const needsMid = f.doorsPerColumn === '3';
    const loDoor = parseFloat(f.lowerDoorH);
    const midDoor = parseFloat(f.middleDoorH);
    return {
      W: parseFloat(f.W), H: parseFloat(f.H), D: parseFloat(f.D),
      backThickness: backThicknessCm,
      hasShell: f.hasShell,
      hasShellLeft: f.hasShellLeft,
      hasShellRight: f.hasShellRight,
      hasEnvelopeTop: f.hasEnvelopeTop && (f.hasShellLeft || f.hasShellRight),
      hasWallEnvelope: f.hasWallEnvelope,
      bodyMaterialId: f.bodyMaterialId,
      frontMaterialId: f.frontMaterialId,
      plinth: parseFloat(f.plinth) || 0,
      plinthRecess,
      doorCoversPlinth: f.doorCoversPlinth,
      lowerDoorH: needsLo ? loDoor : undefined,
      middleDoorH: needsMid ? midDoor : undefined,
      doorsPerColumn,
      doorGapMm: parseFloat(f.doorGap) || 0,
      maxDoorWidth: Math.max(parseFloat(f.maxDoorWidth) || 60, 10),
      edging: buildCabinetEdging(f),
      ...(initialInput?.topVariant ? { topVariant: initialInput.topVariant } : {}),
      ...(initialInput?.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: initialInput.sinkTraverseWidthCm } : {}),
      ...(initialInput?.hasFronts !== undefined ? { hasFronts: initialInput.hasFronts } : {}),
      ...(initialInput?.hasBack !== undefined ? { hasBack: initialInput.hasBack } : {}),
      ...(initialInput?.hasBottom !== undefined ? { hasBottom: initialInput.hasBottom } : {}),
      ...(initialInput?.mount !== undefined ? { mount: initialInput.mount } : {}),
      ...(initialInput?.liftMechanism !== undefined ? { liftMechanism: initialInput.liftMechanism } : {}),
      ...(f.liftMechanismId ? { liftMechanismId: f.liftMechanismId } : {}),
      ...(initialInput?.singleFront !== undefined ? { singleFront: initialInput.singleFront } : {}),
      ...(initialInput?.cornerFiller ? { cornerFiller: {
        doorSide: f.cornerDoorSide,
        doorWidthCm: Math.max(parseFloat(f.cornerDoorWidthCm) || 60, 1),
        returnDepthCm: Math.max(parseFloat(f.cornerReturnCm) || 7, 0),
      } } : {}),
    };
  }

  /** Recalculate live from a FormState, but only when it can actually be
   *  decomposed. `decomposeBoxes` THROWS on a degenerate cabinet (plinth ≥ H,
   *  plinth ≥ lowerDoorH, lowerDoorH ≥ H, or lower+middle ≥ H), and with no error
   *  boundary that blanks the screen — the old "חשב" handleSubmit gated it the
   *  same way. We must validate BEFORE calling `calculate`: it records
   *  `lastInputRef` before it decomposes, so letting it throw would leave the
   *  embedded sketch reading a degenerate input and crash on the next render.
   *  Freedom principle: don't block, just hold the last drawing. */
  function liveRecalc(f: FormState): void {
    if (!canDecompose(f)) return;
    calculate(buildCabinetInput(f));
  }

  /** Mirrors every precondition `decomposeBoxes` enforces (core/geometry/
   *  boxDecomposition.ts), so the live gate predicts a throw without mutating any
   *  state. Shared with the inline door-height error below. */
  function canDecompose(f: FormState): boolean {
    const H = parseFloat(f.H);
    if (!(parseFloat(f.W) > 0) || !(H > 0) || !(parseFloat(f.D) > 0)) return false;
    const plinth = parseFloat(f.plinth) || 0;
    if (plinth >= H) return false;                          // plinth must be < H
    // Use the engine's actual split (auto splits at >200, not the 180 field cue),
    // so we don't over-hold in the 180–200 window where the cabinet is single-row.
    if (cabinetSplitsRows(f.doorsPerColumn, H)) {
      const lo = parseFloat(f.lowerDoorH);
      if (!(lo > 0) || lo >= H) return false;               // lower door fits under the top
      if (plinth >= lo) return false;                       // plinth must be < lowerDoorH
      if (f.doorsPerColumn === '3') {
        const mid = parseFloat(f.middleDoorH);
        if (!(mid > 0) || lo + mid >= H) return false;      // top row stays positive
      }
    }
    return true;
  }

  /** Commit a field edit with height-authoritative snapping: apply the optional
   *  override (the doors-per-column select), refit the door rows + plinth to the
   *  current height, and surface the inline notice when anything moved. Called on
   *  blur of H/plinth/door rows and on the doors-per-column change — NOT per
   *  keystroke, so intermediate typing never clobbers the dependents. */
  function fitAndCommit(override?: Partial<FormState>): void {
    const base = override ? { ...form, ...override } : form;
    const { next, changed } = fitFormToHeight(base);
    if (override || changed) setForm(next);   // `next` already folds in the override
    setFitNotice(changed ? t.form.heightFitNotice : null);
  }

  function applyPlinthUpdate(patch: { plinth?: number; plinthRecess?: number }): void {
    setForm(p => ({
      ...p,
      ...(patch.plinth      !== undefined ? { plinth:       String(patch.plinth)       } : {}),
      ...(patch.plinthRecess !== undefined ? { plinthRecess: String(patch.plinthRecess) } : {}),
    }));
    const W = parseFloat(form.W);
    const H = parseFloat(form.H);
    const D = parseFloat(form.D);
    if (!Number.isFinite(W) || !Number.isFinite(H) || !Number.isFinite(D)) return;
    const doorsPerColumn: 'auto' | 1 | 2 | 3 =
      form.doorsPerColumn === '1' ? 1 :
      form.doorsPerColumn === '2' ? 2 :
      form.doorsPerColumn === '3' ? 3 : 'auto';
    const backThicknessMm = parseFloat(form.backThicknessMm);
    const backThicknessCm = Number.isFinite(backThicknessMm) && backThicknessMm >= 0
      ? backThicknessMm / 10 : 0.5;
    const loDoor = parseFloat(form.lowerDoorH);
    const midDoor = parseFloat(form.middleDoorH);
    const needsLo = showLowerDoor(form.doorsPerColumn, form.H);
    const needsMid = form.doorsPerColumn === '3';
    const effectivePlinth = patch.plinth ?? (parseFloat(form.plinth) || 0);
    const recessParsed = patch.plinthRecess ?? parseFloat(form.plinthRecess);
    const effectiveRecess = Number.isFinite(recessParsed) && recessParsed > 0 ? recessParsed : 0;
    calculate({
      W, H, D,
      backThickness: backThicknessCm,
      hasShell: form.hasShell,
      hasShellLeft: form.hasShellLeft,
      hasShellRight: form.hasShellRight,
      hasEnvelopeTop: form.hasEnvelopeTop && (form.hasShellLeft || form.hasShellRight),
      hasWallEnvelope: form.hasWallEnvelope,
      bodyMaterialId: form.bodyMaterialId,
      frontMaterialId: form.frontMaterialId,
      plinth: effectivePlinth,
      plinthRecess: effectiveRecess,
      doorCoversPlinth: form.doorCoversPlinth,
      lowerDoorH: needsLo ? loDoor : undefined,
      middleDoorH: needsMid ? midDoor : undefined,
      doorsPerColumn,
      doorGapMm: parseFloat(form.doorGap) || 0,
      maxDoorWidth: Math.max(parseFloat(form.maxDoorWidth) || 60, 10),
      edging: buildCabinetEdging(form),
      // Preserve sink-open variant — see comment in the first calculate() call.
      ...(initialInput?.topVariant ? { topVariant: initialInput.topVariant } : {}),
      ...(initialInput?.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: initialInput.sinkTraverseWidthCm } : {}),
      // Preserve appliance-bay flags — same rationale.
      ...(initialInput?.hasFronts !== undefined ? { hasFronts: initialInput.hasFronts } : {}),
      ...(initialInput?.hasBack !== undefined ? { hasBack: initialInput.hasBack } : {}),
      ...(initialInput?.hasBottom !== undefined ? { hasBottom: initialInput.hasBottom } : {}),
      ...(initialInput?.mount !== undefined ? { mount: initialInput.mount } : {}),
      ...(initialInput?.liftMechanism !== undefined ? { liftMechanism: initialInput.liftMechanism } : {}),
      ...(form.liftMechanismId ? { liftMechanismId: form.liftMechanismId } : {}),
      ...(initialInput?.singleFront !== undefined ? { singleFront: initialInput.singleFront } : {}),
      // Corner unit (פינה): rebuild cornerFiller from the editable corner controls
      // so the door side / width / return survive every recalculation (Gotcha #2).
      ...(initialInput?.cornerFiller ? { cornerFiller: {
        doorSide: form.cornerDoorSide,
        doorWidthCm: Math.max(parseFloat(form.cornerDoorWidthCm) || 60, 1),
        returnDepthCm: Math.max(parseFloat(form.cornerReturnCm) || 7, 0),
      } } : {}),
    });
  }

  function handlePlinthHeightChange(newPlinthCm: number): void {
    applyPlinthUpdate({ plinth: newPlinthCm });
  }
  function handlePlinthRecessChange(newRecessCm: number): void {
    applyPlinthUpdate({ plinthRecess: newRecessCm });
  }

  // Lookup of all DrawerItems by id (across body interiors and partitioned
  // cells), so the modal can read drawerHeight/frontThicknessOverride from
  // the source-of-truth and the doors list can compute per-front thickness.
  const drawerById = React.useMemo(() => {
    const out: Record<string, import('../../types/interior').DrawerItem> = {};
    for (const items of Object.values(interiorById)) {
      for (const item of items) {
        if (item.type === 'drawer') out[item.id] = item;
      }
    }
    for (const cells of Object.values(cellInteriorById)) {
      for (const cellItems of cells) {
        for (const item of cellItems) {
          if (item.type === 'drawer') out[item.id] = item;
        }
      }
    }
    return out;
  }, [interiorById, cellInteriorById]);

  const [form, setForm] = useState<FormState>(() =>
    initialInput ? inputToFormState(initialInput) : {
      W: '240', H: '220', D: '60',
      backThicknessMm: '5',
      plinth: '10', plinthRecess: '0',
      lowerDoorH: '110', middleDoorH: '80',
      hasShell: true, hasShellLeft: true, hasShellRight: true,
      hasEnvelopeTop: false, hasWallEnvelope: false, doorCoversPlinth: false,
      bodyMaterialId: 'mdf18', frontMaterialId: 'mdf18', doorsPerColumn: 'auto',
      doorGap: '2', doorGapManuallySet: false,
      maxDoorWidth: '60',
      edgingThicknessMm: '0.6', edgingFinishMaterialId: '',
      cornerDoorSide: 'right', cornerDoorWidthCm: '60', cornerReturnCm: '7',
      liftMechanismId: '',
    }
  );

  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);

  // Compute available materials AFTER form is declared so we can ALWAYS include
  // the current selection (form.bodyMaterialId / form.frontMaterialId) — even
  // if the user did not check that material in the settings. This prevents the
  // dropdown from silently losing the saved material when settings filter it out.
  const baseBodyMaterials = allMaterials.filter(
    m => (settings?.bodyEnabledMaterialIds ?? defaultIds).includes(m.id)
  );
  const baseFrontMaterials = allMaterials.filter(
    m => (settings?.frontEnabledMaterialIds ?? defaultIds).includes(m.id)
  );
  const availableBodyMaterials = baseBodyMaterials.some(m => m.id === form.bodyMaterialId)
    ? baseBodyMaterials
    : [...baseBodyMaterials, ...allMaterials.filter(m => m.id === form.bodyMaterialId)];
  const availableFrontMaterials = baseFrontMaterials.some(m => m.id === form.frontMaterialId)
    ? baseFrontMaterials
    : [...baseFrontMaterials, ...allMaterials.filter(m => m.id === form.frontMaterialId)];

  // When the enabled list changes, only reset bodyMaterialId if the CURRENT
  // selection no longer exists in allMaterials (e.g. the custom material was
  // deleted entirely). We do NOT reset just because it's unchecked in settings —
  // that would silently lose the saved choice.
  React.useEffect(() => {
    const allIds = allMaterials.map(m => m.id);
    setForm(prev => {
      const newBody = allIds.includes(prev.bodyMaterialId) ? prev.bodyMaterialId : (allIds[0] ?? prev.bodyMaterialId) as MaterialId;
      const newFront = allIds.includes(prev.frontMaterialId) ? prev.frontMaterialId : (allIds[0] ?? prev.frontMaterialId) as MaterialId;
      if (newBody === prev.bodyMaterialId && newFront === prev.frontMaterialId) return prev;
      return { ...prev, bodyMaterialId: newBody, frontMaterialId: newFront };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.customMaterials]);

  // Live recalc + auto-save on every form change — there is no "חשב" button.
  // The first run (mount) is skipped: the restore effect above owns the initial
  // calculate, so this never clobbers the just-restored interior/doors. Kitchen
  // units (kitchenDirectEdit) already recalc inline per control, so they opt out.
  React.useEffect(() => {
    if (kitchenDirectEdit) return;
    if (!liveReadyRef.current) { liveReadyRef.current = true; return; }
    // Surface the door-row error inline (so the user sees WHY the drawing held)
    // and only recalc when it can decompose — mirrors the old handleSubmit gate.
    const H = parseFloat(form.H);
    const needsLo = showLowerDoor(form.doorsPerColumn, form.H);
    const needsMid = form.doorsPerColumn === '3';
    const lo = parseFloat(form.lowerDoorH);
    const mid = parseFloat(form.middleDoorH);
    const loErr = needsLo && !isNaN(H) && !isNaN(lo) && lo >= H ? t.form.errorMustBeLessThanH : '';
    const midErr = needsMid && !isNaN(H) && !isNaN(lo) && !isNaN(mid) && lo + mid >= H ? t.form.errorSumTooLarge : '';
    setErrors(prev => (prev.lowerDoorH === loErr && prev.middleDoorH === midErr) ? prev : { ...prev, lowerDoorH: loErr, middleDoorH: midErr });
    liveRecalc(form);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // ── handlers ──────────────────────────────────────────────────────────────

  function setStr(field: keyof FormErrors, value: string): void {
    if (fitNotice) setFitNotice(null);   // a fresh edit dismisses the last auto-fit notice
    if (field === 'W') setForm(p => ({ ...p, W: value }));
    else if (field === 'H') setForm(p => ({ ...p, H: value }));
    else if (field === 'D') setForm(p => ({ ...p, D: value }));
    else if (field === 'plinth') {
      const p = parseFloat(value);
      setForm(prev => {
        const base = { ...prev, plinth: value };
        if ((isNaN(p) || p <= 0) && prev.doorCoversPlinth) {
          return { ...base, doorCoversPlinth: false };
        }
        return base;
      });
      if (isNaN(p) || p <= 0) setCoversSkirt(false);
    }
    else if (field === 'lowerDoorH') setForm(p => ({ ...p, lowerDoorH: value }));
    else setForm(p => ({ ...p, middleDoorH: value }));

    if (errors[field]) {
      if (field === 'W') setErrors(p => ({ ...p, W: '' }));
      else if (field === 'H') setErrors(p => ({ ...p, H: '' }));
      else if (field === 'D') setErrors(p => ({ ...p, D: '' }));
      else if (field === 'plinth') setErrors(p => ({ ...p, plinth: '' }));
      else if (field === 'lowerDoorH') setErrors(p => ({ ...p, lowerDoorH: '' }));
      else setErrors(p => ({ ...p, middleDoorH: '' }));
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();

    const W      = parseFloat(form.W);
    const H      = parseFloat(form.H);
    const D      = parseFloat(form.D);
    const plinth = parseFloat(form.plinth);
    const loDoor = parseFloat(form.lowerDoorH);
    const midDoor = parseFloat(form.middleDoorH);
    const needsLo  = showLowerDoor(form.doorsPerColumn, form.H);
    const needsMid = form.doorsPerColumn === '3';

    const loDoorErr = needsLo
      ? (isNaN(loDoor) || loDoor <= 0 ? t.form.errorInvalid
         : (!isNaN(H) && loDoor >= H ? t.form.errorMustBeLessThanH : ''))
      : '';

    const midDoorErr = needsMid
      ? (isNaN(midDoor) || midDoor <= 0 ? t.form.errorInvalid
         : (!isNaN(H) && !isNaN(loDoor) && loDoor + midDoor >= H
            ? t.form.errorSumTooLarge : ''))
      : '';

    const newErrors: FormErrors = {
      W:        isNaN(W)      || W      <= 0 ? t.form.errorInvalid : '',
      H:        isNaN(H)      || H      <= 0 ? t.form.errorInvalid : '',
      D:        isNaN(D)      || D      <= 0 ? t.form.errorInvalid : '',
      plinth:   isNaN(plinth) || plinth  < 0 ? t.form.errorInvalid : '',
      lowerDoorH: loDoorErr,
      middleDoorH: midDoorErr,
    };

    setErrors(newErrors);
    if (Object.values(newErrors).some(v => v !== '')) return;

    const doorsPerColumn: 'auto' | 1 | 2 | 3 =
      form.doorsPerColumn === '1' ? 1 :
      form.doorsPerColumn === '2' ? 2 :
      form.doorsPerColumn === '3' ? 3 : 'auto';

    const backThicknessMm = parseFloat(form.backThicknessMm);
    const backThicknessCm = Number.isFinite(backThicknessMm) && backThicknessMm >= 0
      ? backThicknessMm / 10
      : 0.5;

    const plinthRecessParsed = parseFloat(form.plinthRecess);
    const plinthRecess = Number.isFinite(plinthRecessParsed) && plinthRecessParsed > 0
      ? plinthRecessParsed : 0;

    const cabinetInput = {
      W, H, D,
      backThickness: backThicknessCm,
      hasShell: form.hasShell,
      hasShellLeft: form.hasShellLeft,
      hasShellRight: form.hasShellRight,
      hasEnvelopeTop: form.hasEnvelopeTop && (form.hasShellLeft || form.hasShellRight),
      hasWallEnvelope: form.hasWallEnvelope,
      bodyMaterialId: form.bodyMaterialId,
      frontMaterialId: form.frontMaterialId,
      plinth,
      plinthRecess,
      doorCoversPlinth: form.doorCoversPlinth,
      lowerDoorH: needsLo ? loDoor : undefined,
      middleDoorH: needsMid ? midDoor : undefined,
      doorsPerColumn,
      doorGapMm: parseFloat(form.doorGap) || 0,
      maxDoorWidth: Math.max(parseFloat(form.maxDoorWidth) || 60, 10),
      edging: buildCabinetEdging(form),
      // Preserve module-level flags that aren't form fields. WITHOUT this,
      // pressing "calculate" on a wall cabinet (קלפה) silently strips its
      // `mount:'wall'` marker — so `wallEnv` flips back to false, the body
      // stops shrinking, and envelope-bottom boards disappear from the cut
      // list. Mirrors the two payloads above.
      ...(initialInput?.topVariant ? { topVariant: initialInput.topVariant } : {}),
      ...(initialInput?.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: initialInput.sinkTraverseWidthCm } : {}),
      ...(initialInput?.hasFronts !== undefined ? { hasFronts: initialInput.hasFronts } : {}),
      ...(initialInput?.hasBack !== undefined ? { hasBack: initialInput.hasBack } : {}),
      ...(initialInput?.hasBottom !== undefined ? { hasBottom: initialInput.hasBottom } : {}),
      ...(initialInput?.mount !== undefined ? { mount: initialInput.mount } : {}),
      ...(initialInput?.liftMechanism !== undefined ? { liftMechanism: initialInput.liftMechanism } : {}),
      ...(form.liftMechanismId ? { liftMechanismId: form.liftMechanismId } : {}),
      ...(initialInput?.singleFront !== undefined ? { singleFront: initialInput.singleFront } : {}),
      // Corner unit (פינה): rebuild cornerFiller from the editable corner controls
      // so the door side / width / return survive every recalculation (Gotcha #2).
      ...(initialInput?.cornerFiller ? { cornerFiller: {
        doorSide: form.cornerDoorSide,
        doorWidthCm: Math.max(parseFloat(form.cornerDoorWidthCm) || 60, 1),
        returnDepthCm: Math.max(parseFloat(form.cornerReturnCm) || 7, 0),
      } } : {}),
    };
    calculate(cabinetInput);
  }

  // ── derived values ─────────────────────────────────────────────────────────

  const needsLower  = showLowerDoor(form.doorsPerColumn, form.H);
  const needsMiddle = form.doorsPerColumn === '3';
  const lowerLabel  = form.doorsPerColumn === '3'
    ? t.form.lowerDoorHeightMulti
    : t.form.lowerDoorHeight;
  const totalPieces = result?.cuts.reduce((sum, c) => sum + c.qty, 0) ?? 0;

  const frontThicknessCm = (MATERIALS[form.frontMaterialId]?.thickness ?? 18) / 10;
  // The form stores the carpenter-facing value in MILLIMETRES; the sketch
  // and the engine consume cm. Match the conversion + 0.5-cm fallback used
  // in handleSubmit so the preview's carcass depth stays in sync with the
  // value that ultimately reaches `calculate({ backThickness })`.
  const backThicknessMmParsed = parseFloat(form.backThicknessMm);
  const backThicknessCm = Number.isFinite(backThicknessMmParsed) && backThicknessMmParsed >= 0
    ? backThicknessMmParsed / 10
    : 0.5;
  const parsedW = parseFloat(form.W);
  const innerBodyW = !isNaN(parsedW) ? computeInnerWidth(parsedW, form.hasShell, frontThicknessCm) : parsedW;
  const shellWidthWarning = form.hasShell && !isNaN(parsedW) && innerBodyW < 30
    ? t.form.shellWidthWarning(innerBodyW)
    : null;

  const parsedH     = parseFloat(form.H);
  const parsedPlinth = parseFloat(form.plinth) || 0;
  const parsedLo    = parseFloat(form.lowerDoorH) || 0;
  const parsedMid   = parseFloat(form.middleDoorH) || 0;
  const topBoxH = needsMiddle
    ? parsedH - parsedLo - parsedMid
    : needsLower
      ? parsedH - parsedLo
      : parsedH - parsedPlinth;
  const innerTopH = form.hasEnvelopeTop && form.hasShell ? topBoxH - frontThicknessCm : topBoxH;
  const envelopeTopWarning = form.hasEnvelopeTop && form.hasShell && !isNaN(innerTopH) && innerTopH < 20
    ? t.form.envelopeTopWarn(innerTopH)
    : null;

  // ── helpers ────────────────────────────────────────────────────────────────

  function numInput(
    id: string,
    field: keyof FormErrors,
    label: string,
    min = 0.1,
    axis?: 'width' | 'height' | 'depth',
    /** Run the height-fit snap when the field commits (blur). Passed for H and
     *  the dependents (plinth / door rows) so a collision auto-resolves once the
     *  user finishes typing — never per keystroke (that would clobber). */
    fitOnBlur = false,
  ): React.JSX.Element {
    const err = errors[field];
    const axisKey = axis ? axis.charAt(0).toUpperCase() + axis.slice(1) : '';
    const labelClass = axis
      ? `${styles.fieldLabel} ${styles[`label${axisKey}`]}`
      : styles.fieldLabel;
    const borderClass = !err && axis ? styles[`border${axisKey}`] : '';
    const inputClass = [styles.input, err ? styles.inputError : borderClass]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={styles.field}>
        <label className={labelClass} htmlFor={id}>{label}</label>
        <input
          id={id}
          className={inputClass}
          type="number"
          value={form[field]}
          step={0.1}
          min={min}
          onChange={e => setStr(field, e.target.value)}
          onFocus={e => e.target.select()}
          {...(fitOnBlur ? { onBlur: () => fitAndCommit() } : {})}
        />
        {err && <span className={styles.errorMsg}>{err}</span>}
      </div>
    );
  }

  function checkbox(
    id: string,
    checked: boolean,
    label: string,
    onChange: (v: boolean) => void,
    disabled?: boolean,
  ): React.JSX.Element {
    return (
      <label
        className={styles.checkboxLabel}
        htmlFor={id}
        style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
      >
        <input
          id={id}
          type="checkbox"
          className={styles.checkbox}
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  // ── editor views ───────────────────────────────────────────────────────────
  // The body editor and door editor each fully replace the main view; the
  // drawer editor renders as a modal overlay (see below).

  // Kitchen units skip the form and open straight into the per-body editor
  // (kitchenDirectEdit). The box id can change across recalcs, so fall back to
  // the unit's single (first non-plinth) body. Door/plinth editing yields to
  // their own branches below (so clicking a front in the editor's Fronts tab
  // opens the DoorEditor); the drawer modal renders as an overlay here.
  if ((editing.type === 'box' || kitchenDirectEdit) && editing.type !== 'door' && editing.type !== 'plinth') {
    const editingBox =
      (editing.type === 'box' ? result?.boxes.find(b => b.id === editing.boxId) : null)
      ?? (kitchenDirectEdit ? result?.boxes.find(b => b.level !== 'plinth') : null)
      ?? null;
    if (!editingBox && kitchenDirectEdit) {
      // Pre-calculate first render — avoid flashing the (retired) form.
      return <div className={styles.form} />;
    }
    if (editingBox) {
      // `boxStableKey` is the current `BoxSlotId` placeholder used by the
      // per-body edging map (DECISIONS_LOG 2026-05-29 — BoxSlotId refactor
      // is a separate task). Lookup + setter wiring stay here so the editor
      // is unaware of slot identity.
      const editingBoxSlotId = boxStableKey(editingBox);
      const cabinetEdging = buildCabinetEdging(form);
      // Isolated single-body input for the editor's 3D preview — same standalone
      // unit as the body view (no cabinet plinth/shell), with the effective
      // per-body materials. The editor builds the live SavedCabinetState from
      // its local items and feeds this through cabinetBoardBoxes (single source).
      const ovr3d = boxMaterialOverrides.get(editingBoxSlotId);
      const cabInput3d = getLastInput();
      const bodyInput3d = cabInput3d ? {
        ...cabInput3d,
        W: editingBox.W, H: editingBox.H, D: editingBox.D,
        plinth: 0,
        hasShell: false, hasShellLeft: false, hasShellRight: false,
        hasEnvelopeTop: false,
        doorsPerColumn: 1 as const,
        bodyMaterialId: ovr3d?.bodyMaterialId ?? form.bodyMaterialId,
        frontMaterialId: ovr3d?.frontMaterialId ?? form.frontMaterialId,
        backThickness: ovr3d?.backThicknessCm ?? cabInput3d.backThickness,
      } : null;
      // This body's cut list + hardware, SCOPED to the body (onlyBoxStableKey)
      // so the Cuts/Hardware tabs are a faithful slice of the cabinet's cut list
      // (full row context + real shell), never a standalone re-derivation that
      // would drift on a per-body width override.
      const customMats3d = settings?.customMaterials ?? [];
      const snapshot3d = getSnapshot();
      const bodyResult3d = cabInput3d
        ? computeUnitCutsAndHardware(cabInput3d, snapshot3d, customMats3d, {
            onlyBoxStableKey: editingBoxSlotId,
            ...(settings?.runnerPriceOverrides ? { runnerPriceOverrides: settings.runnerPriceOverrides } : {}),
            ...(settings?.liftMechanismPriceOverrides ? { liftMechanismPriceOverrides: settings.liftMechanismPriceOverrides } : {}),
          })
        : { cuts: [], hardwareItems: [] };
      // Re-key this body's saved doors to the isolated body's slot
      // ('single:single:<fi>') so the editor's 3D fronts honor the live hinge
      // side (the 2D sketch already reads the live doorsById).
      const slotDoorPrefix = editingBoxSlotId + ':';
      const bodyDoors: import('../../types/project').SavedCabinetState['doors'] = {};
      for (const [dk, dv] of Object.entries(snapshot3d.doors)) {
        if (dk.startsWith(slotDoorPrefix)) bodyDoors[`single:single:${dk.slice(slotDoorPrefix.length)}`] = dv;
      }
      // Unit-level controls folded into the editor for kitchen units (the unit
      // form is retired). All live-calculate on change (there is no "חשב"
      // button). Material / back / edging / dimensions are covered by the
      // editor's own per-body override sections, so only shell sides, door gap,
      // max door width, the wall-envelope + lift-mechanism family (קלפה) and the
      // corner controls live here.
      const unitControls = kitchenDirectEdit ? (
        <>
          {splitShellSides && (
            <div className={styles.checkboxRow}>
              {checkbox('k-shell-left', form.hasShellLeft, t.form.hasShellLeft, v => {
                setForm(p => ({ ...p, hasShellLeft: v, hasShell: v && p.hasShellRight, ...((!v && !p.hasShellRight) ? { hasEnvelopeTop: false } : {}) }));
                const li = getLastInput();
                if (li) calculate({ ...li, hasShellLeft: v, hasShell: v && form.hasShellRight, ...((!v && !form.hasShellRight) ? { hasEnvelopeTop: false } : {}) });
              })}
              {checkbox('k-shell-right', form.hasShellRight, t.form.hasShellRight, v => {
                setForm(p => ({ ...p, hasShellRight: v, hasShell: p.hasShellLeft && v, ...((!v && !p.hasShellLeft) ? { hasEnvelopeTop: false } : {}) }));
                const li = getLastInput();
                if (li) calculate({ ...li, hasShellRight: v, hasShell: form.hasShellLeft && v, ...((!v && !form.hasShellLeft) ? { hasEnvelopeTop: false } : {}) });
              })}
              {initialInput?.mount === 'wall' && checkbox('k-wall-env', form.hasWallEnvelope, t.form.hasWallEnvelope, v => {
                setForm(p => ({ ...p, hasWallEnvelope: v }));
                const li = getLastInput();
                if (li) calculate({ ...li, hasWallEnvelope: v });
              })}
            </div>
          )}

          {initialInput?.liftMechanism === true && (() => {
            const enabledLift = settings?.enabledLiftMechanismIds;
            const liftOptions = Object.values(LIFT_MECHANISMS).filter(m => !enabledLift || enabledLift.includes(m.id));
            const liftBodies = (result?.boxes ?? []).filter(b => b.level !== 'plinth');
            const liftDims = liftBodies.length > 0 ? liftBodies.map(b => ({ h: b.H, w: b.W })) : [{ h: parseFloat(form.H) || 0, w: parseFloat(form.W) || 0 }];
            const liftWarnings = !form.liftMechanismId ? [] : Array.from(new Set(
              liftDims.flatMap(d => buildLiftMechanismHardware({ liftMechanismId: form.liftMechanismId, cabinetHeightCm: d.h, cabinetWidthCm: d.w, flapCount: 1 }).warnings),
            ));
            return (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="k-lift-mechanism">מנגנון הרמה (קלפה)</label>
                <select id="k-lift-mechanism" className={styles.input} value={form.liftMechanismId}
                  onChange={e => {
                    const id = e.target.value;
                    setForm(p => ({ ...p, liftMechanismId: id }));
                    const li = getLastInput();
                    if (li) { const { liftMechanismId: _drop, ...rest } = li; calculate(id ? { ...rest, liftMechanismId: id } : rest); }
                  }}>
                  <option value="">ללא</option>
                  {liftOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {liftWarnings.map((w, i) => <span key={i} style={{ color: '#b8860b', fontSize: '0.8rem', marginTop: 2 }}>{w}</span>)}
              </div>
            );
          })()}

          {initialInput?.cornerFiller && (
            <>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="k-corner-door-side">{t.form.cornerDoorSide}</label>
                <select id="k-corner-door-side" className={styles.input} value={form.cornerDoorSide}
                  onChange={e => { const side = e.target.value as 'left' | 'right'; setForm(p => ({ ...p, cornerDoorSide: side })); const li = getLastInput(); if (li?.cornerFiller) calculate({ ...li, cornerFiller: { ...li.cornerFiller, doorSide: side } }); }}>
                  <option value="right">{t.form.cornerSideRight}</option>
                  <option value="left">{t.form.cornerSideLeft}</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="k-corner-door-w">{t.form.cornerDoorWidth}</label>
                <input id="k-corner-door-w" className={styles.input} type="number" min={1} step={1} value={form.cornerDoorWidthCm}
                  onChange={e => { const val = e.target.value; setForm(p => ({ ...p, cornerDoorWidthCm: val })); const li = getLastInput(); if (li?.cornerFiller) calculate({ ...li, cornerFiller: { ...li.cornerFiller, doorWidthCm: Math.max(parseFloat(val) || 60, 1) } }); }} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="k-corner-return">{t.form.cornerReturn}</label>
                <input id="k-corner-return" className={styles.input} type="number" min={0} step={1} value={form.cornerReturnCm}
                  onChange={e => { const val = e.target.value; setForm(p => ({ ...p, cornerReturnCm: val })); const li = getLastInput(); if (li?.cornerFiller) calculate({ ...li, cornerFiller: { ...li.cornerFiller, returnDepthCm: Math.max(parseFloat(val) || 7, 0) } }); }} />
              </div>
            </>
          )}

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="k-door-gap">{t.form.doorGap}</label>
            <input id="k-door-gap" className={styles.input} type="number" value={form.doorGap} step={0.5} min={0}
              onChange={e => { const val = e.target.value; setForm(p => ({ ...p, doorGap: val, doorGapManuallySet: true })); const li = getLastInput(); if (li) calculate({ ...li, doorGapMm: parseFloat(val) || 0 }); }}
              onFocus={e => e.target.select()} />
            {(parseFloat(form.doorGap) || 0) > 4 && <span className={styles.warnMsg}>{t.form.doorGapWarn}</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="k-max-door-width">{t.form.maxDoorWidth}</label>
            <input id="k-max-door-width" className={styles.input} type="number" value={form.maxDoorWidth} step={5} min={10}
              onChange={e => { const val = e.target.value; setForm(p => ({ ...p, maxDoorWidth: val })); const li = getLastInput(); if (li) calculate({ ...li, maxDoorWidth: Math.max(parseFloat(val) || 60, 10) }); }}
              onFocus={e => e.target.select()} />
          </div>
        </>
      ) : undefined;
      // Interactive fronts sketch for the editor's Fronts tab (kitchen only):
      // the SAME elevation the cabinet uses — clickable doors (→ DoorEditor) and
      // visible hinge marks. A kitchen unit is one body, so the unit's fronts =
      // this body's fronts.
      const frontsSketch = kitchenDirectEdit ? (
        <CabinetFrontsSketch
          W={form.W}
          H={form.H}
          D={form.D}
          plinth={form.plinth}
          doorsPerColumn={form.doorsPerColumn}
          {...(form.hasWallEnvelope && initialInput?.mount === 'wall' ? { wallEnvelopeCm: frontThicknessCm } : {})}
          {...(needsLower ? { lowerDoorH: form.lowerDoorH } : {})}
          {...(needsMiddle ? { middleDoorH: form.middleDoorH } : {})}
          doorsById={doorsById}
          displayNumbers={displayNumbers}
          drawerFrontsById={drawerFrontsById}
          partitionsById={partitionsById}
          frontLayoutByRow={frontLayoutByRow}
          numFrontsPerBox={numFrontsPerBox}
          onDrawerFrontClick={handleDrawerFrontClick}
          onDoorClick={handleDoorClick}
          {...(boxDimensionOverrides.size > 0 ? { boxDimensionOverrides } : {})}
          {...(initialInput?.cornerFiller ? { cornerFiller: initialInput.cornerFiller } : {})}
          {...(initialInput?.liftMechanism ? { liftUp: true } : {})}
        />
      ) : undefined;
      return (
        <div className={styles.form}>
          <BoxInteriorEditor
            box={editingBox}
            bodyInput={bodyInput3d}
            customMaterials={settings?.customMaterials ?? []}
            items={interiorById[editingBox.id] ?? []}
            onChange={items => setBoxInterior(editingBox.id, items)}
            onBack={kitchenDirectEdit && onExit ? onExit : closeEditor}
            {...(unitControls ? { unitControls } : {})}
            {...(frontsSketch ? { frontsSketch } : {})}
            {...(kitchenDirectEdit ? { tab: kitchenEditorTab, onTabChange: setKitchenEditorTab } : {})}
            bodyDoors={bodyDoors}
            // Cabinet body editor: make the 2D fronts overlay clickable (door →
            // DoorEditor, drawer → drawer modal), matching the main view. For
            // kitchen units the interactive frontsSketch is used instead, so
            // these are dead there — harmless.
            onFrontDoorClick={handleDoorClick}
            onFrontDrawerClick={handleDrawerFrontClick}
            bodyMaterialOverride={ovr3d}
            availableBodyMaterials={availableBodyMaterials}
            availableFrontMaterials={availableFrontMaterials}
            cabinetBodyMaterialId={form.bodyMaterialId}
            cabinetFrontMaterialId={form.frontMaterialId}
            cabinetBackThicknessMm={parseFloat(form.backThicknessMm) || 0}
            onSetBodyMaterial={id => setBoxMaterial(editingBoxSlotId, { bodyMaterialId: id })}
            onSetFrontMaterial={id => setBoxMaterial(editingBoxSlotId, { frontMaterialId: id })}
            onSetBackThickness={mm => setBoxMaterial(editingBoxSlotId, { backThicknessCm: mm === undefined ? undefined : mm / 10 })}
            onResetBoxMaterials={() => resetBoxMaterials(editingBoxSlotId)}
            cuts={bodyResult3d.cuts}
            hardwareItems={bodyResult3d.hardwareItems}
            cutsSettings={{
              bodyMaterialPriceOverrides: settings?.bodyMaterialPriceOverrides,
              bodyCustomMaterials: settings?.customMaterials,
              frontMaterialPriceOverrides: settings?.frontMaterialPriceOverrides,
              frontCustomMaterials: settings?.customMaterials,
            }}
            numFronts={numFrontsPerBox.get(editingBox.id) ?? 1}
            hasPartitions={partitionsById.get(editingBox.id) ?? false}
            onAddPartition={() => addPartition(editingBox.id)}
            onRemovePartition={() => removePartition(editingBox.id)}
            cellItems={cellInteriorById[editingBox.id] ?? [[], []]}
            onCellItemsChange={(ci, items) => setCellItems(editingBox.id, ci, items)}
            enabledRunnerIds={settings?.enabledRunnerIds ?? []}
            tBody={getMaterialWithCustom(form.bodyMaterialId, settings?.customMaterials).thickness / 10}
            doorGapMm={parseFloat(form.doorGap) || 2}
            bodyMaterialId={form.bodyMaterialId}
            frontMaterialId={form.frontMaterialId}
            hasOuterShell={form.hasShell}
            hasEnvelopeTop={form.hasEnvelopeTop}
            cabinetEdging={cabinetEdging}
            bodyEdgingOverride={bodyEdgingOverrides.get(editingBoxSlotId)}
            onSetBodyEdging={e => setBodyEdgingOverride(editingBoxSlotId, e)}
            boxDimensionOverride={boxDimensionOverrides.get(editingBoxSlotId)}
            onSetBoxDimension={(axis, val) => setBoxDimension(editingBoxSlotId, axis, val)}
            onResetBoxDimensions={() => resetBoxDimensions(editingBoxSlotId)}
            derivedW={result?.derivedBoxDims.get(editingBoxSlotId)?.W ?? editingBox.W}
            derivedH={result?.derivedBoxDims.get(editingBoxSlotId)?.H ?? editingBox.H}
            derivedD={result?.derivedBoxDims.get(editingBoxSlotId)?.D ?? editingBox.D}
            {...(hideMainDimensions ? { hideRodOption: true } : {})}
            {...(initialInput?.hasFronts === false ? { hideInteriorControls: true } : {})}
            {...(initialInput?.mount === 'wall' || initialInput?.cornerFiller ? { shelfOnly: true } : {})}
            {...(initialInput?.topVariant ? { topVariant: initialInput.topVariant } : {})}
            {...(initialInput?.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: initialInput.sinkTraverseWidthCm } : {})}
          />
          {/* Kitchen direct-edit: clicking an external-drawer front in the
              Fronts tab opens its editor as an overlay (the main form — which
              normally hosts this modal — is retired for kitchen units). */}
          {kitchenDirectEdit && editing.type === 'drawer' && drawerById[editing.drawerId] && (
            <ExternalDrawerEditor
              drawer={drawerById[editing.drawerId]!}
              onSetHeight={h => setDrawerHeight(editing.drawerId, h)}
              onSetThicknessOverride={mid => setDrawerFrontThickness(editing.drawerId, mid)}
              onDelete={() => { deleteDrawer(editing.drawerId); closeEditor(); }}
              onClose={closeEditor}
            />
          )}
        </div>
      );
    }
  }

  if (editing.type === 'plinth' && result) {
    // Plinth depth shown to the carpenter = the CARCASS depth (matches the
    // body sitting on top), not the raw input D. Lifted off `result` so the
    // formula has a single source of truth (useCabinet via
    // computeCarcassDepth) — no carcassD arithmetic in this component.
    // Plinth follows the bottom row's EFFECTIVE (overridden) width, not the raw
    // typed `form.W` — same `plinthOuterWidth` the cut list + 3D/2D plinth use,
    // so a per-body W override is reflected in this editor view too.
    const plinthBottomBoxes = result.boxes.filter(b => b.level === 'bottom' || b.level === 'single');
    const plinthEditorW = plinthOuterWidth(plinthBottomBoxes, parseFloat(form.W) || 0, result.innerW);
    return (
      <div className={styles.form}>
        <PlinthEditor
          cabinetW={plinthEditorW}
          cabinetD={result.carcassD}
          plinthHeight={parseFloat(form.plinth) || 0}
          plinthRecess={(() => {
            const r = parseFloat(form.plinthRecess);
            return Number.isFinite(r) && r > 0 ? r : 0;
          })()}
          boxes={plinthBottomBoxes}
          bodyMaterial={getMaterialWithCustom(form.bodyMaterialId, settings?.customMaterials)}
          frontMaterial={getMaterialWithCustom(form.frontMaterialId, settings?.customMaterials)}
          gableOverrides={plinthGableOverrides}
          boardOverrides={boardOverridesByStableId}
          onSetGableOverride={setPlinthGableOverride}
          onResetGables={resetPlinthGableOverrides}
          onPlinthHeightChange={handlePlinthHeightChange}
          onPlinthRecessChange={handlePlinthRecessChange}
          onBack={closeEditor}
        />
      </div>
    );
  }

  if (editing.type === 'door') {
    const door = doorsById[editing.doorId];
    if (door) {
      // The hinge SIDE is the carpenter's to choose only when both door edges
      // have a panel — a single front, or a partitioned body. Otherwise it's
      // forced onto the outer gable, so the chooser is hidden.
      const lockHingeSide = !isHingeSideFree(
        numFrontsPerBox.get(door.boxId) ?? 1,
        partitionsById.get(door.boxId) ?? false,
      );
      return (
        <div className={styles.form}>
          <DoorEditor
            door={door}
            interiorItems={interiorById[door.boxId] ?? []}
            displayNumber={displayNumbers.get(editing.doorId) ?? ''}
            globalMaterialId={form.frontMaterialId}
            plinthHeight={parseFloat(form.plinth) || 0}
            onHingeSide={side => setDoorHingeSide(editing.doorId, side)}
            onHingeCount={count => setDoorHingeCount(editing.doorId, count)}
            onHingeManual={(hingeId, pos) => setHingeManual(editing.doorId, hingeId, pos)}
            onResetAuto={hingeId => resetHingeToAuto(editing.doorId, hingeId)}
            onHasDoor={v => setDoorHasDoor(editing.doorId, v)}
            onThickness={matId => setDoorThickness(editing.doorId, matId)}
            onBack={closeEditor}
            {...(initialInput?.liftMechanism === true ? { noHinges: true } : {})}
            {...(lockHingeSide ? { lockHingeSide: true } : {})}
          />
        </div>
      );
    }
  }

  // ── main view ──────────────────────────────────────────────────────────────

  const bodyBoxes = result?.boxes.filter(b => b.level !== 'plinth') ?? [];

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <h2 className={styles.formTitle}>{t.form.title}</h2>

      <div className={styles.twoCol}>
        <div className={styles.formCol}>
          <div className={styles.grid}>

            {/* שורה 1: W, H, D — hidden for kitchen units (dimensions edited
                exclusively via per-body override in BoxInteriorEditor) */}
            {!hideMainDimensions && (
              <>
                {numInput('input-W', 'W', t.form.width, 0.1, 'width')}
                {numInput('input-H', 'H', t.form.height, 0.1, 'height', true)}
                {numInput('input-D', 'D', t.form.depth, 0.1, 'depth')}
              </>
            )}

            {/* שורה 2: צוקל, דלתות לגובה, חומר */}
            {!hidePlinthEditor && numInput('input-plinth', 'plinth', t.form.plinthHeight, 0, 'height', true)}

            {!hideDoorsPerColumn && (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="input-doors-per-col">
                  {t.form.doorsPerColumn}
                </label>
                <select
                  id="input-doors-per-col"
                  className={styles.select}
                  value={form.doorsPerColumn}
                  onChange={e => fitAndCommit({ doorsPerColumn: e.target.value as DoorsPerColumn })}
                >
                  <option value="auto">{t.form.auto}</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-body-material">
                {t.form.bodyMaterial}
              </label>
              <select
                id="input-body-material"
                className={styles.select}
                value={form.bodyMaterialId}
                onChange={e => {
                  const newId = e.target.value as MaterialId;
                  setForm(p => ({ ...p, bodyMaterialId: newId }));
                  // Live-update: recalculate immediately so the saved cabinet input
                  // (and therefore the kitchen overview's cuts/hardware) reflects
                  // the new material right away — without requiring "חשב".
                  const lastInput = getLastInput();
                  if (lastInput) calculate({ ...lastInput, bodyMaterialId: newId });
                }}
              >
                {availableBodyMaterials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-back-thickness">
                {t.form.backThickness}
              </label>
              <input
                id="input-back-thickness"
                className={styles.input}
                type="number"
                value={form.backThicknessMm}
                step={0.5}
                min={0}
                onChange={e => setForm(p => ({ ...p, backThicknessMm: e.target.value }))}
                onFocus={e => e.target.select()}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-front-material">
                {t.form.frontMaterial}
              </label>
              <select
                id="input-front-material"
                className={styles.select}
                value={form.frontMaterialId}
                onChange={e => {
                  const newId = e.target.value as MaterialId;
                  setForm(p => ({ ...p, frontMaterialId: newId }));
                  const lastInput = getLastInput();
                  if (lastInput) calculate({ ...lastInput, frontMaterialId: newId });
                }}
              >
                {availableFrontMaterials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* קנט — עובי + גמר. ברירת מחדל ארון: 0.6 mm + אוטומטי. ה-Edging
                שנבנה כאן יוזרם אל calculate() ויהיה ה-cabinetDefault של
                edgingCtx; per-body override נשלט בעורך הגוף. */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-edging-thickness">
                {t.edging.thickness}
              </label>
              <select
                id="input-edging-thickness"
                className={styles.select}
                value={form.edgingThicknessMm}
                onChange={e =>
                  setForm(p => ({ ...p, edgingThicknessMm: e.target.value as '0.6' | '1.3' }))
                }
              >
                <option value="0.6">0.6</option>
                <option value="1.3">1.3</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-edging-finish">
                {t.edging.finish}
              </label>
              <select
                id="input-edging-finish"
                className={styles.select}
                value={form.edgingFinishMaterialId}
                onChange={e =>
                  setForm(p => ({ ...p, edgingFinishMaterialId: e.target.value as '' | MaterialId }))
                }
              >
                <option value="">{t.edging.finishAuto}</option>
                {materialsArray.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* צ'קבוקסים — משתרעים על כל הרוחב */}
            <div className={styles.checkboxRow}>
              {splitShellSides ? (
                <>
                  {checkbox(
                    'input-shell-left',
                    form.hasShellLeft,
                    t.form.hasShellLeft,
                    v => {
                      setForm(p => ({
                        ...p,
                        hasShellLeft: v,
                        hasShell: v && p.hasShellRight,
                        ...((!v && !p.hasShellRight) ? { hasEnvelopeTop: false } : {}),
                      }));
                      const li = getLastInput();
                      if (li) calculate({
                        ...li,
                        hasShellLeft: v,
                        hasShell: v && form.hasShellRight,
                        ...((!v && !form.hasShellRight) ? { hasEnvelopeTop: false } : {}),
                      });
                    },
                  )}
                  {checkbox(
                    'input-shell-right',
                    form.hasShellRight,
                    t.form.hasShellRight,
                    v => {
                      setForm(p => ({
                        ...p,
                        hasShellRight: v,
                        hasShell: p.hasShellLeft && v,
                        ...((!v && !p.hasShellLeft) ? { hasEnvelopeTop: false } : {}),
                      }));
                      const li = getLastInput();
                      if (li) calculate({
                        ...li,
                        hasShellRight: v,
                        hasShell: form.hasShellLeft && v,
                        ...((!v && !form.hasShellLeft) ? { hasEnvelopeTop: false } : {}),
                      });
                    },
                  )}
                </>
              ) : (
                <div className={styles.checkboxWithWarn}>
                  {checkbox(
                    'input-shell',
                    form.hasShell,
                    t.form.hasShell,
                    v => {
                      setForm(p => ({
                        ...p,
                        hasShell: v,
                        hasShellLeft: v,
                        hasShellRight: v,
                        ...(v ? {} : { hasEnvelopeTop: false }),
                        ...(p.doorGapManuallySet ? {} : { doorGap: v ? '2' : '0' }),
                      }));
                      const li = getLastInput();
                      if (li) calculate({
                        ...li,
                        hasShell: v, hasShellLeft: v, hasShellRight: v,
                        hasEnvelopeTop: v ? li.hasEnvelopeTop : false,
                        ...(form.doorGapManuallySet ? {} : { doorGapMm: v ? 2 : 0 }),
                      });
                    },
                  )}
                  {shellWidthWarning && (
                    <span className={styles.warnMsg}>{shellWidthWarning}</span>
                  )}
                </div>
              )}
              {!hidePlinthEditor && checkbox(
                'input-covers-plinth',
                form.doorCoversPlinth,
                t.form.doorCoversPlinth,
                v => {
                  setForm(p => ({ ...p, doorCoversPlinth: v }));
                  setCoversSkirt(v);
                  const li = getLastInput();
                  if (li) calculate({ ...li, doorCoversPlinth: v });
                },
                parseFloat(form.plinth) <= 0 || isNaN(parseFloat(form.plinth)),
              )}
              {!hideEnvelopeTop && (
                <div className={styles.checkboxWithWarn}>
                  {checkbox(
                    'input-envelope-top',
                    form.hasEnvelopeTop,
                    t.form.hasEnvelopeTop,
                    v => {
                      setForm(p => ({ ...p, hasEnvelopeTop: v }));
                      const li = getLastInput();
                      if (li) calculate({ ...li, hasEnvelopeTop: v });
                    },
                    !form.hasShellLeft && !form.hasShellRight,
                  )}
                  {envelopeTopWarning && (
                    <span className={styles.warnMsg}>{envelopeTopWarning}</span>
                  )}
                </div>
              )}
              {/* Wall-cabinet (קלפה) top+bottom envelope — independent of side
                  shell. Shown only for wall units; replaces the shell-gated
                  "מעטפת תקרה" which is hidden by hideEnvelopeTop.
                  Live recalculate (mirrors the material selectors): toggling
                  the checkbox runs calculate() immediately so the body shrinks
                  and the envelope-bottom board reaches the cut list without
                  requiring the user to press "חשב". */}
              {initialInput?.mount === 'wall' && checkbox(
                'input-wall-envelope',
                form.hasWallEnvelope,
                t.form.hasWallEnvelope,
                v => {
                  setForm(p => ({ ...p, hasWallEnvelope: v }));
                  const lastInput = getLastInput();
                  if (lastInput) calculate({ ...lastInput, hasWallEnvelope: v });
                },
              )}
              {/* Lift-mechanism family picker (קלפה) — only for a wall-cabinet
                  flap. Picks the AVENTOS family that prices the hardware line;
                  re-runs calculate live (mirrors the wall-envelope checkbox). A
                  height/width out of the family's range shows a non-blocking
                  warning (freedom principle). */}
              {initialInput?.liftMechanism === true && (() => {
                const enabledLift = settings?.enabledLiftMechanismIds;
                const liftOptions = Object.values(LIFT_MECHANISMS)
                  .filter(m => !enabledLift || enabledLift.includes(m.id));
                // Check each EFFECTIVE body (result.boxes — per-body overrides
                // already applied) against the family range, not the un-overridden
                // form W/H. Falls back to the form dims until the first calculate.
                const liftBodies = (result?.boxes ?? []).filter(b => b.level !== 'plinth');
                const liftDims = liftBodies.length > 0
                  ? liftBodies.map(b => ({ h: b.H, w: b.W }))
                  : [{ h: parseFloat(form.H) || 0, w: parseFloat(form.W) || 0 }];
                const liftWarnings = !form.liftMechanismId ? [] : Array.from(new Set(
                  liftDims.flatMap(d => buildLiftMechanismHardware({
                    liftMechanismId: form.liftMechanismId,
                    cabinetHeightCm: d.h,
                    cabinetWidthCm: d.w,
                    flapCount: 1,
                  }).warnings),
                ));
                return (
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="lift-mechanism">מנגנון הרמה (קלפה)</label>
                    <select
                      id="lift-mechanism"
                      className={styles.input}
                      value={form.liftMechanismId}
                      onChange={e => {
                        const id = e.target.value;
                        setForm(p => ({ ...p, liftMechanismId: id }));
                        const li = getLastInput();
                        if (li) {
                          const { liftMechanismId: _drop, ...rest } = li;
                          calculate(id ? { ...rest, liftMechanismId: id } : rest);
                        }
                      }}
                    >
                      <option value="">ללא</option>
                      {liftOptions.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    {liftWarnings.map((w, i) => (
                      <span key={i} style={{ color: '#b8860b', fontSize: '0.8rem', marginTop: 2 }}>{w}</span>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Corner unit (פינה) controls — door side / width / hinge-post depth.
                Each edits cornerFiller and recalculates live (mirrors the wall-
                envelope checkbox) so the door + filler follow immediately. */}
            {initialInput?.cornerFiller && (
              <>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="corner-door-side">{t.form.cornerDoorSide}</label>
                  <select
                    id="corner-door-side"
                    className={styles.input}
                    value={form.cornerDoorSide}
                    onChange={e => {
                      const side = e.target.value as 'left' | 'right';
                      setForm(p => ({ ...p, cornerDoorSide: side }));
                      const li = getLastInput();
                      if (li?.cornerFiller) calculate({ ...li, cornerFiller: { ...li.cornerFiller, doorSide: side } });
                    }}
                  >
                    <option value="right">{t.form.cornerSideRight}</option>
                    <option value="left">{t.form.cornerSideLeft}</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="corner-door-w">{t.form.cornerDoorWidth}</label>
                  <input
                    id="corner-door-w"
                    className={styles.input}
                    type="number"
                    min={1}
                    step={1}
                    value={form.cornerDoorWidthCm}
                    onChange={e => {
                      const val = e.target.value;
                      setForm(p => ({ ...p, cornerDoorWidthCm: val }));
                      const li = getLastInput();
                      if (li?.cornerFiller) calculate({ ...li, cornerFiller: { ...li.cornerFiller, doorWidthCm: Math.max(parseFloat(val) || 60, 1) } });
                    }}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="corner-return">{t.form.cornerReturn}</label>
                  <input
                    id="corner-return"
                    className={styles.input}
                    type="number"
                    min={0}
                    step={1}
                    value={form.cornerReturnCm}
                    onChange={e => {
                      const val = e.target.value;
                      setForm(p => ({ ...p, cornerReturnCm: val }));
                      const li = getLastInput();
                      if (li?.cornerFiller) calculate({ ...li, cornerFiller: { ...li.cornerFiller, returnDepthCm: Math.max(parseFloat(val) || 7, 0) } });
                    }}
                  />
                </div>
              </>
            )}

            {/* רווח בין דלתות */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-door-gap">
                {t.form.doorGap}
              </label>
              <input
                id="input-door-gap"
                className={styles.input}
                type="number"
                value={form.doorGap}
                step={0.5}
                min={0}
                onChange={e => setForm(p => ({ ...p, doorGap: e.target.value, doorGapManuallySet: true }))}
                onFocus={e => e.target.select()}
              />
              {(parseFloat(form.doorGap) || 0) > 4 && (
                <span className={styles.warnMsg}>{t.form.doorGapWarn}</span>
              )}
            </div>

            {/* רוחב מקסימלי לחזית */}
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="input-max-door-width">
                {t.form.maxDoorWidth}
              </label>
              <input
                id="input-max-door-width"
                className={styles.input}
                type="number"
                value={form.maxDoorWidth}
                step={5}
                min={10}
                onChange={e => setForm(p => ({ ...p, maxDoorWidth: e.target.value }))}
                onFocus={e => e.target.select()}
              />
            </div>

            {/* שדות מותנים: גובה קומות */}
            {needsLower  && numInput('input-lower-door',  'lowerDoorH',  lowerLabel,              0.1, 'height', true)}
            {needsMiddle && numInput('input-middle-door', 'middleDoorH', t.form.middleDoorHeight, 0.1, 'height', true)}

          </div>

          {/* Inline notice when a height change auto-refit the door rows / plinth. */}
          {fitNotice && (
            <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--color-text-secondary, #6b5f55)' }}>
              ⓘ {fitNotice}
            </p>
          )}
        </div>

        <div className={styles.sketchStack}>
          {/* Mode toggle — shown only after first calculation */}
          {result && (
            <div className={styles.modeToggle}>
              <button
                type="button"
                className={`${styles.modeBtn} ${styles.modeBtnBodies} ${sketchMode === 'bodies' ? styles.modeBtnActive : ''}`}
                onClick={() => setSketchMode('bodies')}
              >
                {t.doors.bodies}
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${styles.modeBtnFronts} ${sketchMode === 'fronts' ? styles.modeBtnActive : ''}`}
                onClick={() => setSketchMode('fronts')}
              >
                {t.doors.fronts}
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${styles.modeBtnCuts} ${sketchMode === 'cuts' ? styles.modeBtnActive : ''}`}
                onClick={() => setSketchMode('cuts')}
              >
                {t.cutsList.tab}
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${sketchMode === 'hardware' ? styles.modeBtnActive : ''}`}
                onClick={() => setSketchMode('hardware')}
              >
                {t.hardwareList.tab}
              </button>
            </div>
          )}

          {/* Main sketch. BEFORE the first calculation (no mode tabs yet) this is
              the full standalone sketch with dimension labels, driven live by the
              form values. AFTER calculation every mode (bodies/fronts/cuts/
              hardware) shares ONE embedded sketch in a fixed holder, so switching
              tabs never resizes or shifts the drawing — same as the kitchen
              overview. Clicking the plinth opens the PlinthEditor; clicking a body
              opens its editor (bodies/cuts/hardware); fronts adds the overlay. */}
          {!result ? (
            <CabinetSketch
              W={form.W}
              H={form.H}
              D={form.D}
              backThicknessCm={backThicknessCm}
              plinth={form.plinth}
              {...(form.hasWallEnvelope && initialInput?.mount === 'wall'
                ? { wallEnvelopeCm: frontThicknessCm } : {})}
              {...(initialInput?.liftMechanism === true && form.liftMechanismId ? { liftMechanismId: form.liftMechanismId } : {})}
              doorsPerColumn={form.doorsPerColumn}
              {...(needsLower  ? { lowerDoorH:  form.lowerDoorH  } : {})}
              {...(needsMiddle ? { middleDoorH: form.middleDoorH } : {})}
              interiorById={result ? interiorById : undefined}
              {...(result ? { cellInteriorById, partitionsById } : {})}
              hasShell={form.hasShell}
              hasShellLeft={form.hasShellLeft}
              hasShellRight={form.hasShellRight}
              frontMaterialThickness={frontThicknessCm}
              {...(form.hasEnvelopeTop && (form.hasShellLeft || form.hasShellRight) ? { hasEnvelopeTop: true } : {})}
              frontLayoutByRow={frontLayoutByRow}
              numFrontsPerBox={numFrontsPerBox}
              bodyMaterialId={form.bodyMaterialId}
              frontMaterialId={form.frontMaterialId}
              {...(!hidePlinthEditor && result && (parseFloat(form.plinth) || 0) > 0 ? { onPlinthClick: handlePlinthClick } : {})}
              {...(result ? { onBoxClick: handleBoxClick, onDrawerFrontClick: handleDrawerFrontClick } : {})}
              boardOverrides={boardOverridesByStableId}
              boxDimensionOverrides={boxDimensionOverrides}
              boxMaterialOverrides={boxMaterialOverrides}
              {...(settings?.customMaterials ? { customMaterials: settings.customMaterials } : {})}
              {...(initialInput?.topVariant ? { topVariant: initialInput.topVariant } : {})}
              {...(initialInput?.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: initialInput.sinkTraverseWidthCm } : {})}
              {...(initialInput?.hasBack !== undefined ? { hasBack: initialInput.hasBack } : {})}
              {...(initialInput?.hasBottom !== undefined ? { hasBottom: initialInput.hasBottom } : {})}
              {...(initialInput?.cornerFiller ? { cornerSingleWidth: true } : {})}
            />
          ) : (() => {
            // Post-calculate view — ONE embedded sketch (cropped to the cabinet
            // box) in a fixed holder, shared by every mode so tabs don't jump
            // (kitchen UnitsView pattern, via the shared cabinetSketchModel).
            // Fronts mode layers the translucent orange front panels
            // (CabinetFrontsOverlay) on top in the SAME coordinate space
            // (outerCabW × effH) so they land exactly over the bodies. Bodies/
            // cuts/hardware keep the body + plinth click-to-edit.
            const inp = getLastInput();
            const st = getSnapshot();
            if (!inp) return null;
            const customMats = settings?.customMaterials ?? [];
            const m = buildCabinetSketchModel(inp, st, customMats);
            const MAX_H_PX = 480;
            const holderW = `min(100%, ${Math.round(MAX_H_PX * (m.outerCabW / m.effH))}px)`;
            const isFronts = sketchMode === 'fronts';
            return (
              <div style={{ position: 'relative', width: holderW, aspectRatio: `${m.outerCabW} / ${m.effH}`, margin: '0 auto' }}>
                <CabinetSketch
                  embedded
                  W={String(inp.W)}
                  H={String(inp.H)}
                  D={String(inp.D)}
                  backThicknessCm={inp.backThickness}
                  plinth={String(inp.plinth)}
                  doorsPerColumn={String(inp.doorsPerColumn)}
                  {...(inp.lowerDoorH !== undefined ? { lowerDoorH: String(inp.lowerDoorH) } : {})}
                  {...(inp.middleDoorH !== undefined ? { middleDoorH: String(inp.middleDoorH) } : {})}
                  interiorById={m.interiorById}
                  cellInteriorById={m.cellInteriorById}
                  partitionsById={m.partitionsById}
                  hasShell={m.hasAnyShell}
                  hasShellLeft={m.sides.left}
                  hasShellRight={m.sides.right}
                  frontMaterialThickness={m.tFront}
                  {...(inp.hasEnvelopeTop ? { hasEnvelopeTop: true } : {})}
                  {...(inp.hasWallEnvelope && inp.mount === 'wall' ? { wallEnvelopeCm: m.tFront } : {})}
                  {...(inp.liftMechanism && inp.liftMechanismId ? { liftMechanismId: inp.liftMechanismId } : {})}
                  frontLayoutByRow={m.frontLayoutByRow}
                  numFrontsPerBox={m.numFrontsPerBox}
                  bodyMaterialId={inp.bodyMaterialId}
                  frontMaterialId={inp.frontMaterialId}
                  boardOverrides={m.boardOverrides}
                  boxDimensionOverrides={m.boxDimensionOverrides}
                  {...(inp.topVariant ? { topVariant: inp.topVariant } : {})}
                  {...(inp.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: inp.sinkTraverseWidthCm } : {})}
                  {...(inp.hasBack !== undefined ? { hasBack: inp.hasBack } : {})}
                  {...(inp.hasBottom !== undefined ? { hasBottom: inp.hasBottom } : {})}
                  {...(inp.cornerFiller ? { cornerSingleWidth: true } : {})}
                  boxMaterialOverrides={boxMaterialOverrides}
                  customMaterials={customMats}
                  {...(!hidePlinthEditor && (parseFloat(form.plinth) || 0) > 0 ? { onPlinthClick: handlePlinthClick } : {})}
                  {...(!isFronts ? { onBoxClick: handleBoxClick } : {})}
                  onDrawerFrontClick={handleDrawerFrontClick}
                />
                {isFronts && (
                  <CabinetFrontsOverlay
                    input={inp}
                    state={st}
                    customMaterials={customMats}
                    viewBoxW={m.outerCabW}
                    viewBoxH={m.effH}
                    onDoorClick={handleDoorClick}
                    onDrawerFrontClick={handleDrawerFrontClick}
                  />
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {result !== null && boxDimensionOverrides.size > 0 && (() => {
        const envTopH = (form.hasEnvelopeTop && form.hasShell) ? frontThicknessCm : 0;
        const dimWarnings = checkBoxConsistency(
          result.boxes,
          parseFloat(form.H) || undefined,
          parseFloat(form.plinth) || 0,
          envTopH,
          // A corner unit is intentionally one wide carcass — skip the check there.
          initialInput?.cornerFiller ? undefined : MAX_BOX_W,
        );
        return dimWarnings.length > 0 ? (
          <div className={styles.dimMismatchBanner}>
            {dimWarnings.map((w, i) => (
              <span key={i}>
                {w.kind === 'h_mismatch'
                  ? t.interior.warnHeightMismatch.replace('{diff}', String(w.diffCm))
                  : w.kind === 'w_mismatch'
                  ? t.interior.warnWidthMismatch.replace('{diff}', String(w.diffCm))
                  : w.kind === 'v_gap'
                  ? t.interior.warnVerticalGap.replace('{diff}', String(w.gapCm))
                  : t.interior.warnBodyTooWide.replace('{w}', String(w.widthCm)).replace('{max}', String(w.maxCm))}
              </span>
            ))}
          </div>
        ) : null;
      })()}

      {result !== null && (
        <>
          <p className={styles.summary}>
            {t.results.summary(result.boxes.length, totalPieces)}
          </p>
          {sketchMode === 'bodies' && <BoxesList boxes={result.boxes} />}
          {sketchMode === 'fronts' && (
            <DoorsList
              bodyBoxes={bodyBoxes}
              doorsById={doorsById}
              drawerFrontsById={drawerFrontsById}
              drawerById={drawerById}
              displayNumbers={displayNumbers}
              globalMaterialId={form.frontMaterialId}
              plinthHeight={parseFloat(form.plinth) || 0}
              numFrontsPerBox={numFrontsPerBox}
              hasShell={form.hasShell}
              {...(form.hasEnvelopeTop && form.hasShell ? { hasEnvelopeTop: true } : {})}
              {...(parsedW > 0 ? { cabinetW: parsedW, cabinetH: parseFloat(form.H) || 0, cabinetD: parseFloat(form.D) || 0 } : {})}
              frontMaterialThickness={frontThicknessCm}
              onDrawerFrontClick={handleDrawerFrontClick}
            />
          )}
          {sketchMode === 'cuts' && (
            <CutsList
              cuts={result.cuts}
              settings={{
                bodyMaterialPriceOverrides: settings?.bodyMaterialPriceOverrides,
                bodyCustomMaterials: settings?.customMaterials,
                frontMaterialPriceOverrides: settings?.frontMaterialPriceOverrides,
                frontCustomMaterials: settings?.customMaterials,
              }}
            />
          )}
          {sketchMode === 'hardware' && <HardwareList items={result.hardwareItems} />}
        </>
      )}
      {editing.type === 'drawer' && drawerById[editing.drawerId] && (
        <ExternalDrawerEditor
          drawer={drawerById[editing.drawerId]!}
          onSetHeight={h => setDrawerHeight(editing.drawerId, h)}
          onSetThicknessOverride={mid => setDrawerFrontThickness(editing.drawerId, mid)}
          onDelete={() => { deleteDrawer(editing.drawerId); closeEditor(); }}
          onClose={closeEditor}
        />
      )}
    </form>
  );
}
