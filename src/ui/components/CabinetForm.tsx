import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useCabinet } from '../hooks/useCabinet';
import { MATERIALS, getMaterialWithCustom } from '../../catalog';
import { computeInnerWidth } from '../../core/boards/boardModel';
import { boxStableKey } from '../../core/interior/interiorUtils';
import type { MaterialId } from '../../types';
import type { Edging } from '../../types/edging';
import BoxesList from './BoxesList';
import CabinetSketch from './CabinetSketch';
import CabinetFrontsSketch from './CabinetFrontsSketch';
import BoxInteriorEditor from './BoxInteriorEditor';
import DoorEditor from './DoorEditor';
import DoorsList from './DoorsList';
import CutsList from './CutsList';
import { HardwareList } from './HardwareList';
import PlinthEditor from './PlinthEditor';
import ExternalDrawerEditor from './ExternalDrawerEditor';
import { checkBoxConsistency } from '../../core/geometry/dimensionConsistency';
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
    doorCoversPlinth: inp.doorCoversPlinth,
    bodyMaterialId: inp.bodyMaterialId, frontMaterialId: inp.frontMaterialId,
    doorsPerColumn: dpc,
    doorGap: String(inp.doorGapMm), doorGapManuallySet: true,
    maxDoorWidth: String(inp.maxDoorWidth),
    edgingThicknessMm: inp.edging?.thickness === 1.3 ? '1.3' : '0.6',
    edgingFinishMaterialId: (inp.edging?.finishMaterialId ?? '') as '' | import('../../types/materials').MaterialId,
  };
}

export default function CabinetForm({ initialInput, initialState, onCabinetChange, settings, hideMainDimensions, hideDoorsPerColumn, hideEnvelopeTop, splitShellSides, hidePlinthEditor }: CabinetFormProps = {}): React.JSX.Element {
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
    getLastInput, getSnapshot, restoreState,
  } = useCabinet(settings);

  // On mount: if we have a saved product, calculate immediately so
  // lastInputRef is set (enables setBoxInterior / all other setters) and the
  // sketch appears without requiring the user to click "חשב".
  // Then restore the saved state so interior/doors/overrides come back.
  const restoredRef = React.useRef(false);
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
  const [editing, setEditing] = useState<Editing>({ type: 'none' });
  const [sketchMode, setSketchMode] = useState<'bodies' | 'fronts' | 'cuts' | 'hardware'>('bodies');

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
      hasEnvelopeTop: false, doorCoversPlinth: false,
      bodyMaterialId: 'mdf18', frontMaterialId: 'mdf18', doorsPerColumn: 'auto',
      doorGap: '2', doorGapManuallySet: false,
      maxDoorWidth: '60',
      edgingThicknessMm: '0.6', edgingFinishMaterialId: '',
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

  // ── handlers ──────────────────────────────────────────────────────────────

  function setStr(field: keyof FormErrors, value: string): void {
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
  // The body and door editors fully replace the main view; the drawer editor
  // renders as a modal overlay (rendered alongside main view, see below).

  if (editing.type === 'box') {
    const editingBox = result?.boxes.find(b => b.id === editing.boxId) ?? null;
    if (editingBox) {
      // `boxStableKey` is the current `BoxSlotId` placeholder used by the
      // per-body edging map (DECISIONS_LOG 2026-05-29 — BoxSlotId refactor
      // is a separate task). Lookup + setter wiring stay here so the editor
      // is unaware of slot identity.
      const editingBoxSlotId = boxStableKey(editingBox);
      const cabinetEdging = buildCabinetEdging(form);
      return (
        <div className={styles.form}>
          <BoxInteriorEditor
            box={editingBox}
            items={interiorById[editingBox.id] ?? []}
            onChange={items => setBoxInterior(editingBox.id, items)}
            onBack={closeEditor}
            numFronts={numFrontsPerBox.get(editingBox.id) ?? 1}
            hasPartitions={partitionsById.get(editingBox.id) ?? false}
            onAddPartition={() => addPartition(editingBox.id)}
            onRemovePartition={() => removePartition(editingBox.id)}
            cellItems={cellInteriorById[editingBox.id] ?? [[], []]}
            onCellItemsChange={(ci, items) => setCellItems(editingBox.id, ci, items)}
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
            {...(initialInput?.mount === 'wall' ? { shelfOnly: true } : {})}
            {...(initialInput?.topVariant ? { topVariant: initialInput.topVariant } : {})}
            {...(initialInput?.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: initialInput.sinkTraverseWidthCm } : {})}
          />
        </div>
      );
    }
  }

  if (editing.type === 'plinth' && result) {
    // Plinth depth shown to the carpenter = the CARCASS depth (matches the
    // body sitting on top), not the raw input D. Lifted off `result` so the
    // formula has a single source of truth (useCabinet via
    // computeCarcassDepth) — no carcassD arithmetic in this component.
    return (
      <div className={styles.form}>
        <PlinthEditor
          cabinetW={parseFloat(form.W) || 0}
          cabinetD={result.carcassD}
          plinthHeight={parseFloat(form.plinth) || 0}
          plinthRecess={(() => {
            const r = parseFloat(form.plinthRecess);
            return Number.isFinite(r) && r > 0 ? r : 0;
          })()}
          boxes={result.boxes.filter(b => b.level === 'bottom' || b.level === 'single')}
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
                {numInput('input-H', 'H', t.form.height, 0.1, 'height')}
                {numInput('input-D', 'D', t.form.depth, 0.1, 'depth')}
              </>
            )}

            {/* שורה 2: צוקל, דלתות לגובה, חומר */}
            {!hidePlinthEditor && numInput('input-plinth', 'plinth', t.form.plinthHeight, 0, 'height')}

            {!hideDoorsPerColumn && (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="input-doors-per-col">
                  {t.form.doorsPerColumn}
                </label>
                <select
                  id="input-doors-per-col"
                  className={styles.select}
                  value={form.doorsPerColumn}
                  onChange={e =>
                    setForm(p => ({ ...p, doorsPerColumn: e.target.value as DoorsPerColumn }))
                  }
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
                    v => setForm(p => ({
                      ...p,
                      hasShellLeft: v,
                      hasShell: v && p.hasShellRight,
                      ...((!v && !p.hasShellRight) ? { hasEnvelopeTop: false } : {}),
                    })),
                  )}
                  {checkbox(
                    'input-shell-right',
                    form.hasShellRight,
                    t.form.hasShellRight,
                    v => setForm(p => ({
                      ...p,
                      hasShellRight: v,
                      hasShell: p.hasShellLeft && v,
                      ...((!v && !p.hasShellLeft) ? { hasEnvelopeTop: false } : {}),
                    })),
                  )}
                </>
              ) : (
                <div className={styles.checkboxWithWarn}>
                  {checkbox(
                    'input-shell',
                    form.hasShell,
                    t.form.hasShell,
                    v => setForm(p => ({
                      ...p,
                      hasShell: v,
                      hasShellLeft: v,
                      hasShellRight: v,
                      ...(v ? {} : { hasEnvelopeTop: false }),
                      ...(p.doorGapManuallySet ? {} : { doorGap: v ? '2' : '0' }),
                    })),
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
                },
                parseFloat(form.plinth) <= 0 || isNaN(parseFloat(form.plinth)),
              )}
              {!hideEnvelopeTop && (
                <div className={styles.checkboxWithWarn}>
                  {checkbox(
                    'input-envelope-top',
                    form.hasEnvelopeTop,
                    t.form.hasEnvelopeTop,
                    v => setForm(p => ({ ...p, hasEnvelopeTop: v })),
                    !form.hasShellLeft && !form.hasShellRight,
                  )}
                  {envelopeTopWarning && (
                    <span className={styles.warnMsg}>{envelopeTopWarning}</span>
                  )}
                </div>
              )}
            </div>

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
            {needsLower  && numInput('input-lower-door',  'lowerDoorH',  lowerLabel,              0.1, 'height')}
            {needsMiddle && numInput('input-middle-door', 'middleDoorH', t.form.middleDoorHeight, 0.1, 'height')}

          </div>
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

          {/* Main sketch — bodies layout doubles as the cuts-tab reference.
              Clicking the plinth rect opens the PlinthEditor full-screen
              (see editing.type === 'plinth' block above). */}
          {sketchMode === 'bodies' || sketchMode === 'cuts' || sketchMode === 'hardware' || !result ? (
            <CabinetSketch
              W={form.W}
              H={form.H}
              D={form.D}
              backThicknessCm={backThicknessCm}
              plinth={form.plinth}
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
              {...(settings?.customMaterials ? { customMaterials: settings.customMaterials } : {})}
              {...(initialInput?.topVariant ? { topVariant: initialInput.topVariant } : {})}
              {...(initialInput?.sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm: initialInput.sinkTraverseWidthCm } : {})}
              {...(initialInput?.hasBack !== undefined ? { hasBack: initialInput.hasBack } : {})}
              {...(initialInput?.hasBottom !== undefined ? { hasBottom: initialInput.hasBottom } : {})}
            />
          ) : (
            <CabinetFrontsSketch
              W={form.W}
              H={form.H}
              D={form.D}
              plinth={form.plinth}
              doorsPerColumn={form.doorsPerColumn}
              {...(needsLower  ? { lowerDoorH:  form.lowerDoorH  } : {})}
              {...(needsMiddle ? { middleDoorH: form.middleDoorH } : {})}
              doorsById={doorsById}
              displayNumbers={displayNumbers}
              drawerFrontsById={drawerFrontsById}
              partitionsById={partitionsById}
              frontLayoutByRow={frontLayoutByRow}
              numFrontsPerBox={numFrontsPerBox}
              onDrawerFrontClick={handleDrawerFrontClick}
              onDoorClick={handleDoorClick}
              onBoxClick={handleBoxClick}
            />
          )}
        </div>
      </div>

      <button type="submit" className={styles.submitBtn}>
        {t.form.calculate}
      </button>

      {result !== null && boxDimensionOverrides.size > 0 && (() => {
        const envTopH = (form.hasEnvelopeTop && form.hasShell) ? frontThicknessCm : 0;
        const dimWarnings = checkBoxConsistency(
          result.boxes,
          parseFloat(form.H) || undefined,
          parseFloat(form.plinth) || 0,
          envTopH,
        );
        return dimWarnings.length > 0 ? (
          <div className={styles.dimMismatchBanner}>
            {dimWarnings.map((w, i) => (
              <span key={i}>
                {w.kind === 'h_mismatch'
                  ? t.interior.warnHeightMismatch.replace('{diff}', String(w.diffCm))
                  : w.kind === 'w_mismatch'
                  ? t.interior.warnWidthMismatch.replace('{diff}', String(w.diffCm))
                  : t.interior.warnVerticalGap.replace('{diff}', String(w.gapCm))}
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
