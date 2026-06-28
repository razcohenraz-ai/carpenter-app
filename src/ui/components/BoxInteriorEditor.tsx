import React, { useState, lazy, Suspense } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import BoxBodySketch from './BoxBodySketch';
import CutsList from './CutsList';
import { HardwareList } from './HardwareList';
import { CabinetFrontsOverlay } from './CabinetFrontsOverlay';
import { cabinetBoardBoxes, cabinetFrontBoxes, type BoardBox3D } from '../../core/product/cabinetBoards3D';
import { makeDoorId } from '../../core/doors/doorUtils';
import { syncFixedShelf } from '../../core/interior/fixedShelfUtils';
import {
  addShelfRedistributed,
  redistributeShelves,
  defaultDrawerPlacement,
  defaultRodPlacement,
  equalizeExternalDrawersIfOverflow,
  validateInterior,
} from '../../core/interior/interiorUtils';
import { MATERIALS } from '../../catalog';
import styles from './BoxInteriorEditor.module.css';
import type { InteriorItem, DrawerItem, DrawerMount, InteriorWarning, ShelfWarning } from '../../types/interior';
import { RUNNERS } from '../../catalog/runners';
import type { Box, BoxPosition } from '../../types/geometry';
import type { Edging } from '../../types/edging';
import type { MaterialId, CustomMaterial } from '../../types/materials';
import type { CabinetInput } from '../../types/cabinet';
import type { SavedCabinetState } from '../../types/project';
import type { Translations } from '../../i18n/translations';
import type { CutItem } from '../../types/cuts';
import type { HardwareLineItem } from '../../types/hardware';
import type { BoxMaterialOverride } from '../../core/boards/boxMaterials';

/** Lazy — pulls in react-three-fiber / three only when the 3D toggle is used. */
const Body3DView = lazy(() => import('./Body3DView'));

function shelfWarningText(w: ShelfWarning, t: Translations): string {
  if (w.kind === 'small_zone')        return t.interior.warnShelfSmallZone;
  if (w.kind === 'rod_low')           return t.interior.warnRodLow;
  if (w.kind === 'rod_drawer_close')  return t.interior.warnRodDrawerClose;
  return '';
}

interface Props {
  box: Box;
  items: InteriorItem[];
  onChange: (items: InteriorItem[]) => void;
  onBack: () => void;
  numFronts: number;
  hasPartitions: boolean;
  onAddPartition: () => void;
  onRemovePartition: () => void;
  cellItems: InteriorItem[][];
  onCellItemsChange: (cellIndex: number, items: InteriorItem[]) => void;
  /** Drawer-runner systems the carpenter enabled (Settings → "Drawers"). Only
   *  these appear in a drawer's runner picker. Empty = none offered. */
  enabledRunnerIds?: string[];
  tBody: number;
  /** Cabinet-wide door/front gap in mm — needed locally so the editor can
   *  run `syncFixedShelf` on its optimistic copy and reflect the auto fixed
   *  shelf immediately, before the parent's state update round-trips back. */
  doorGapMm: number;
  // ── Board-model props (passed through to BoxBodySketch) ──────────────────
  // Whole-body sketch uses these to draw the carcass boards as background.
  // Cell sketches (partitioned bodies) intentionally pass hasOuterShell=false
  // — the envelope belongs to the whole body, not the cell.
  bodyMaterialId: import('../../types/materials').MaterialId;
  frontMaterialId: import('../../types/materials').MaterialId;
  hasOuterShell: boolean;
  hasEnvelopeTop: boolean;
  /** Cabinet-wide edging — shown as the "inherit" target in the override
   *  section. Used to seed `bodyEdgingOverride` when the user toggles
   *  "מותאם" for the first time. */
  cabinetEdging: Edging;
  /** Current per-body edging override, if any. `undefined` ↔ inheriting
   *  cabinet edging. */
  bodyEdgingOverride: Edging | undefined;
  /** Setter: pass `undefined` to revert to cabinet edging, an `Edging` value
   *  to apply / update the per-body band. */
  onSetBodyEdging: (edging: Edging | undefined) => void;
  /** Current per-body dimension overrides, if any. Derived (decomposeBoxes)
   *  values are in `box.W / box.H / box.D`; an override replaces only the
   *  axis the carpenter explicitly set. */
  boxDimensionOverride: import('../hooks/useCabinet').BoxDimensionOverride | undefined;
  /** Set one dimension axis override. Pass `undefined` to revert that axis. */
  onSetBoxDimension: (axis: 'W' | 'H' | 'D', value: number | undefined) => void;
  /** Reset all dimension overrides for this body. */
  onResetBoxDimensions: () => void;
  /** Derived box dimensions (from decomposeBoxes, before overrides) — shown
   *  as placeholder values in override inputs. */
  derivedW: number;
  derivedH: number;
  derivedD: number;
  /** When true, hide the "add hanging rod" button. Used for kitchen units
   *  where hanging rods don't apply (only wardrobes use them). */
  hideRodOption?: boolean;
  /** When true, hide ALL add-item controls (shelf, drawer, rod, partition).
   *  Used for appliance-bay units (e.g. dishwasher) that have no interior. */
  hideInteriorControls?: boolean;
  /** When true, expose ONLY the "add shelf" control — drawer, rod and partition
   *  buttons are hidden. Used by wall cabinets (קלפה), which hold shelves only. */
  shelfOnly?: boolean;
  /** Sink-open variant flags — passed through to BoxBodySketch so the
   *  carcass background renders the standing sink traverses instead of a
   *  top board. Both undefined for non-sink units. */
  topVariant?: 'standard' | 'sink-open';
  sinkTraverseWidthCm?: number;
  /** Isolated single-body input for the 3D preview (no cabinet plinth/shell),
   *  with the effective per-body materials. Null when no compute input exists
   *  — the 3D toggle is then hidden. */
  bodyInput: CabinetInput | null;
  /** Body-local heights (cm from this body's floor) of structural section
   *  shelves (מדפים מבניים). Forwarded to BoxBodySketch so the 2D cross-section
   *  renders them as real boards, matching the 3D view and the cut list. */
  internalShelvesCm?: number[];
  customMaterials: CustomMaterial[];
  // ── Per-body MATERIAL override (relocated from the old body-view screen) ──
  /** This body's material override, if any (`undefined` ↔ inheriting cabinet). */
  bodyMaterialOverride: BoxMaterialOverride | undefined;
  /** Enabled body / front material options (id + name) for the dropdowns. */
  availableBodyMaterials: { id: string; name: string }[];
  availableFrontMaterials: { id: string; name: string }[];
  /** Cabinet-wide defaults — shown as the "inherit" target in each dropdown. */
  cabinetBodyMaterialId: MaterialId;
  cabinetFrontMaterialId: MaterialId;
  /** Cabinet-wide back-panel thickness (mm) — the back-thickness placeholder. */
  cabinetBackThicknessMm: number;
  onSetBodyMaterial: (id: MaterialId | undefined) => void;
  onSetFrontMaterial: (id: MaterialId | undefined) => void;
  onSetBackThickness: (mm: number | undefined) => void;
  onResetBoxMaterials: () => void;
  // ── Per-body scoped lists for the Cuts / Hardware tabs ──
  /** This body's cut list (computed by the parent with full cabinet context). */
  cuts: CutItem[];
  /** This body's hardware list. */
  hardwareItems: HardwareLineItem[];
  /** Price-override slice passed straight to CutsList (per-sheet costing). */
  cutsSettings?: {
    bodyMaterialPriceOverrides?: Partial<Record<MaterialId, number>> | undefined;
    bodyCustomMaterials?: CustomMaterial[] | undefined;
    frontMaterialPriceOverrides?: Partial<Record<MaterialId, number>> | undefined;
    frontCustomMaterials?: CustomMaterial[] | undefined;
  };
  /** Folded-in unit-level controls (kitchen direct-edit): shell sides, door
   *  gap, lift-mechanism family, corner controls. Rendered as a "unit settings"
   *  section so the kitchen unit form can be retired. Omitted elsewhere. */
  unitControls?: React.ReactNode;
  /** Interactive fronts elevation for the Fronts tab (kitchen direct-edit) —
   *  the real CabinetFrontsSketch with clickable doors (→ door editor) and
   *  hinge marks. When present it replaces the body + overlay on the 2D Fronts
   *  tab. Omitted elsewhere (the synthetic overlay is used instead). */
  frontsSketch?: React.ReactNode;
  /** Controlled active tab. When provided (with `onTabChange`) the parent owns
   *  the tab so it survives the editor remounting on door/drawer edits (kitchen
   *  direct-edit). Omit for internal, uncontrolled tab state. */
  tab?: EditorTab;
  onTabChange?: (tab: EditorTab) => void;
  /** This body's saved doors (hinge side etc.), re-keyed to the isolated body's
   *  slot (`single:single:<fi>`), so the 3D fronts reflect the live hinge side
   *  edited in the door editor — not the geometric default. */
  bodyDoors?: SavedCabinetState['doors'];
  /** When set, the 2D fronts overlay's door faces become clickable (the cabinet
   *  body editor's "click a front → open its editor", matching the main view and
   *  the kitchen). The overlay reports the ISOLATED single-body door id; this
   *  handler receives the door id already re-mapped to the real cabinet
   *  (`makeDoorId(box.id, fi)`, matching `doorsById`). Omitted (kitchen, which
   *  uses the interactive `frontsSketch` instead) keeps the overlay static. */
  onFrontDoorClick?: (doorId: string) => void;
  /** Same, for external-drawer fronts. The drawer id is the stable interior-item
   *  id, so no re-mapping is needed. */
  onFrontDrawerClick?: (drawerId: string) => void;
}

// Larger sketches give the carpenter a more readable cross-section in the
// body editor; the controls column flexes to take the remaining width.
const SKETCH_W      = 270;
const SKETCH_H      = 570;
const CELL_SKETCH_W = 195;
const CELL_SKETCH_H = 390;

// BoxBodySketch's internal layout (showDimensions=true) — mirrored here so the
// 2D fronts overlay lands exactly on the body rectangle inside the SVG.
const SK_PAD = 8, SK_DIM_TOP = 30, SK_DIM_RIGHT = 44;

/** Roles hidden behind closed doors — dropped in the editor's 'fronts' tab 3D,
 *  mirroring RoomView3D so the two never diverge. */
const INTERIOR_ROLES_3D = new Set<BoardBox3D['role']>([
  'rod', 'drawer-box', 'runner', 'lift-mechanism', 'shelf', 'fixed-shelf', 'internal-shelf',
]);

/** The 2D fronts overlay computes its panels from the ISOLATED single-body input,
 *  so its door ids are keyed to that body's lone carcass (`box_0`), not the real
 *  cabinet box. Parse fi and si so the click can be re-mapped to the real cabinet
 *  door id (`makeDoorId(box.id, fi, si)`).
 *
 *  Isolated door id formats (boxId = 'box_N', no colons):
 *    'box_N'        → fi=0, si=0
 *    'box_N:fi'     → fi=fi, si=0
 *    'box_N:fi:si'  → fi=fi, si=si
 */
function parseFiSiFromIsolatedDoorId(doorId: string): { fi: number; si: number } {
  const firstColon = doorId.indexOf(':');
  if (firstColon === -1) return { fi: 0, si: 0 };
  const rest = doorId.slice(firstColon + 1);
  const secondColon = rest.indexOf(':');
  if (secondColon === -1) {
    const fi = parseInt(rest, 10);
    return { fi: Number.isFinite(fi) ? fi : 0, si: 0 };
  }
  const fi = parseInt(rest.slice(0, secondColon), 10);
  const si = parseInt(rest.slice(secondColon + 1), 10);
  return { fi: Number.isFinite(fi) ? fi : 0, si: Number.isFinite(si) ? si : 0 };
}

/** The 'bodies'/'fronts' tabs are one editable screen; 'cuts'/'hardware' are
 *  read-only lists scoped to this body. */
export type EditorTab = 'bodies' | 'fronts' | 'cuts' | 'hardware';

export default function BoxInteriorEditor({
  box, items, onChange, onBack, numFronts, hasPartitions,
  onAddPartition, onRemovePartition,
  cellItems, onCellItemsChange, tBody, doorGapMm,
  bodyMaterialId, frontMaterialId, hasOuterShell, hasEnvelopeTop,
  cabinetEdging, bodyEdgingOverride, onSetBodyEdging,
  boxDimensionOverride, onSetBoxDimension, onResetBoxDimensions,
  derivedW, derivedH, derivedD,
  hideRodOption,
  hideInteriorControls,
  shelfOnly,
  topVariant, sinkTraverseWidthCm,
  bodyInput, customMaterials,
  bodyMaterialOverride, availableBodyMaterials, availableFrontMaterials,
  cabinetBodyMaterialId, cabinetFrontMaterialId, cabinetBackThicknessMm,
  onSetBodyMaterial, onSetFrontMaterial, onSetBackThickness, onResetBoxMaterials,
  cuts, hardwareItems, cutsSettings,
  unitControls, frontsSketch,
  tab: controlledTab, onTabChange, bodyDoors,
  onFrontDoorClick, onFrontDrawerClick,
  enabledRunnerIds = [],
  internalShelvesCm,
}: Props): React.JSX.Element {
  const { t } = useTranslation();
  const [localItems, setLocalItems] = useState<InteriorItem[]>(items);
  const [localCellItems, setLocalCellItems] = useState<InteriorItem[][]>(
    cellItems.length === 2 ? cellItems : [[], []],
  );
  const [pendingAction, setPendingAction] = useState<null | 'add' | 'remove'>(null);
  const [view, setView] = useState<'2d' | '3d'>('3d');
  const [tabInternal, setTabInternal] = useState<EditorTab>('bodies');
  const tab: EditorTab = controlledTab ?? tabInternal;
  const setTab = (next: EditorTab): void => { if (onTabChange) onTabChange(next); else setTabInternal(next); };
  const showFronts = tab === 'fronts';

  // Live 3D boxes for THIS body, built from the editor's local items via the
  // same cabinetBoardBoxes pipeline as the room view (single source — no drift).
  const bodyState3d: SavedCabinetState = {
    interior: { 'single:single': localItems },
    cellInterior: { 'single:single': [localCellItems[0] ?? [], localCellItems[1] ?? []] },
    partitions: { 'single:single': hasPartitions },
    doors: {}, plinthGableOverrides: {}, boardOverrides: {},
  };
  // Fronts view shares ONE state between the 2D overlay and the 3D so the hinge
  // side can never diverge: both read this body's live per-front door choices
  // (re-keyed to the isolated 'single:single' slot). Without the doors here the
  // 2D overlay fell back to the geometric default and ignored a saved hinge side
  // while the 3D moved — the cabinet-only 2D/3D split (the kitchen avoids it by
  // using the interactive CabinetFrontsSketch for its 2D fronts).
  const bodyFrontsState: SavedCabinetState = { ...bodyState3d, doors: bodyDoors ?? {} };
  const boxes3D = bodyInput ? cabinetBoardBoxes(bodyInput, bodyState3d, customMaterials) : [];
  const show3d = view === '3d' && bodyInput !== null && boxes3D.length > 0;
  // 'fronts' tab 3D: closed doors over an empty carcass (drop the interior
  // pieces, add this body's front faces) — mirrors RoomView3D's fronts view.
  const frontBoxes3D = showFronts && bodyInput
    ? cabinetFrontBoxes(bodyInput, bodyFrontsState, customMaterials) : [];
  const displayBoxes3D: BoardBox3D[] = showFronts
    ? [...boxes3D.filter(b => !INTERIOR_ROLES_3D.has(b.role)), ...frontBoxes3D]
    : boxes3D;

  // Per-body material-override helpers (the relocated body-view controls).
  const hasMaterialOverride = bodyMaterialOverride !== undefined
    && Object.keys(bodyMaterialOverride).length > 0;
  const matName = (opts: { id: string; name: string }[], id: string): string =>
    opts.find(m => m.id === id)?.name ?? id;
  // EFFECTIVE materials for THIS body — the 2D sketch must colour by the
  // override (falling back to the cabinet default), not the cabinet material,
  // so a per-body override recolours the body live (matches the cut list / 3D).
  const effBodyMatId = bodyMaterialOverride?.bodyMaterialId ?? bodyMaterialId;
  const effFrontMatId = bodyMaterialOverride?.frontMaterialId ?? frontMaterialId;

  // 2D fronts overlay rectangle inside the body SVG (same fit math as
  // BoxBodySketch with showDimensions). Used to lay CabinetFrontsOverlay over
  // the editable single-body sketch on the 'fronts' tab.
  const frontsOverlayRect = (() => {
    const drawW = SKETCH_W - SK_PAD - SK_DIM_RIGHT;
    const drawH = SKETCH_H - SK_DIM_TOP - SK_PAD;
    const scale = Math.min(drawH / Math.max(box.H, 1), drawW / Math.max(box.W, 1));
    const bW = box.W * scale, bH = box.H * scale;
    return { left: SK_PAD + (drawW - bW) / 2, top: SK_DIM_TOP + (drawH - bH) / 2, width: bW, height: bH };
  })();
  const [boxShelfWarnings,  setBoxShelfWarnings]  = useState<ShelfWarning[]>([]);
  const [cellShelfWarnings, setCellShelfWarnings] = useState<ShelfWarning[][]>([[], []]);
  // Where to drop the new drawer once the user picks internal/external.
  // null = no dialog open; { kind: 'box' } = add to body; { kind: 'cell', cellIndex } = add to cell.
  const [drawerTarget, setDrawerTarget] = useState<null | { kind: 'box' } | { kind: 'cell'; cellIndex: number }>(null);

  const bodyH = box.H;
  const cellW = (box.W - tBody) / 2;

  const levelLabel: Record<string, string> = {
    top:    t.boxes.levelTop,
    middle: t.boxes.levelMiddle,
    bottom: t.boxes.levelBottom,
    single: t.boxes.levelSingle,
  };

  const posLabel = (pos: BoxPosition): string => {
    if (pos === 'single') return '';
    if (pos === 'left')  return t.boxes.posLeft;
    if (pos === 'right') return t.boxes.posRight;
    return `${t.boxes.posUnit} ${box.unitIndex ?? ''}`.trim();
  };

  const levelStr = levelLabel[box.level] ?? box.level;
  const posStr   = posLabel(box.position);
  const boxLabel = posStr ? `${levelStr} ${posStr}` : levelStr;

  // ── single-box item helpers ───────────────────────────────────────────────

  function update(next: InteriorItem[]): void {
    // Run syncFixedShelf on the local copy so the auto fixed shelf appears in
    // BoxBodySketch immediately, without waiting for a parent state round-trip.
    // The parent (useCabinet.setBoxInterior) re-runs the same sync against its
    // own snapshot — that path is idempotent (existing shelf → height update).
    const synced = syncFixedShelf(localItems, next, doorGapMm, tBody);
    setLocalItems(synced);
    onChange(synced);
  }

  function addShelf(): void {
    const { items: next, warnings } = addShelfRedistributed(localItems, bodyH);
    update(next);
    setBoxShelfWarnings(warnings);
  }
  function addDrawer(): void {
    // Open the type dialog; actual placement happens in confirmDrawerType.
    setDrawerTarget({ kind: 'box' });
  }
  function confirmDrawerType(mount: DrawerMount): void {
    if (!drawerTarget) return;
    if (drawerTarget.kind === 'box') {
      const { drawer, warnings } = defaultDrawerPlacement(localItems, bodyH, undefined, mount, doorGapMm);
      const next = equalizeExternalDrawersIfOverflow([...localItems, drawer], bodyH, doorGapMm);
      update(next);
      setBoxShelfWarnings(warnings);
    } else {
      const ci = drawerTarget.cellIndex;
      const c = localCellItems[ci] ?? [];
      const { drawer, warnings } = defaultDrawerPlacement(c, bodyH, undefined, mount, doorGapMm);
      const next = equalizeExternalDrawersIfOverflow([...c, drawer], bodyH, doorGapMm);
      updateCell(ci, next);
      setCellWarnings(ci, warnings);
    }
    setDrawerTarget(null);
  }
  function addRod(): void {
    const { rod, warnings } = defaultRodPlacement(bodyH, localItems);
    update([...localItems, rod]);
    setBoxShelfWarnings(warnings);
  }

  function deleteItem(id: string): void {
    const filtered = localItems.filter(i => i.id !== id);
    const wasShelf = localItems.some(i => i.id === id && i.type === 'shelf');
    if (wasShelf) {
      const { items: next } = redistributeShelves(filtered, bodyH);
      update(next);
    } else {
      update(filtered);
    }
  }

  function updateHeight(id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h)) return;
    // Fixed shelves (above external drawers) derive their height from drawer
    // geometry — silently ignore manual edits.
    const target = localItems.find(i => i.id === id);
    if (target?.type === 'shelf' && target.isFixedAboveExternals === true) return;
    update(localItems.map(i => {
      if (i.id !== id) return i;
      if (i.type === 'shelf') return { ...i, heightFromFloor: h, isManuallyPositioned: true };
      return { ...i, heightFromFloor: h };
    }));
  }

  function updateDrawerH(id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h) || h <= 0) return;
    update(localItems.map(i =>
      i.id === id && i.type === 'drawer' ? { ...i, drawerHeight: h } : i,
    ));
  }

  function updateDrawerRunner(id: string, runnerId: string | undefined): void {
    update(localItems.map(i => {
      if (i.id !== id || i.type !== 'drawer') return i;
      if (runnerId === undefined) {
        const { runnerId: _drop, ...rest } = i;
        return rest;
      }
      return { ...i, runnerId };
    }));
  }

  function onItemMove(id: string, newH: number): void {
    update(localItems.map(i => {
      if (i.id !== id) return i;
      if (i.type === 'shelf') return { ...i, heightFromFloor: newH, isManuallyPositioned: true };
      return { ...i, heightFromFloor: newH };
    }));
  }

  // ── cell item helpers ─────────────────────────────────────────────────────

  function updateCell(cellIndex: number, next: InteriorItem[]): void {
    // syncFixedShelf runs per-cell — each cell maintains its own fixed shelf,
    // so the diff is between the cell's previous items and the new items.
    const prev = localCellItems[cellIndex] ?? [];
    const synced = syncFixedShelf(prev, next, doorGapMm, tBody);
    const updated = localCellItems.map((c, i) => i === cellIndex ? synced : c);
    setLocalCellItems(updated);
    onCellItemsChange(cellIndex, synced);
  }

  function setCellWarnings(ci: number, warnings: ShelfWarning[]): void {
    setCellShelfWarnings(prev => {
      const out = [prev[0] ?? [], prev[1] ?? []];
      out[ci] = warnings;
      return out;
    });
  }

  function addCellShelf(ci: number): void {
    const c = localCellItems[ci] ?? [];
    const { items: next, warnings } = addShelfRedistributed(c, bodyH);
    updateCell(ci, next);
    setCellWarnings(ci, warnings);
  }
  function addCellDrawer(ci: number): void {
    // Same dialog as the body editor — user picks mount, then confirmDrawerType places it.
    setDrawerTarget({ kind: 'cell', cellIndex: ci });
  }
  function addCellRod(ci: number): void {
    const c = localCellItems[ci] ?? [];
    const { rod, warnings } = defaultRodPlacement(bodyH, c);
    updateCell(ci, [...c, rod]);
    setCellWarnings(ci, warnings);
  }

  function deleteCellItem(ci: number, id: string): void {
    const current = localCellItems[ci] ?? [];
    const filtered = current.filter(i => i.id !== id);
    const wasShelf = current.some(i => i.id === id && i.type === 'shelf');
    if (wasShelf) {
      const { items: next } = redistributeShelves(filtered, bodyH);
      updateCell(ci, next);
    } else {
      updateCell(ci, filtered);
    }
  }

  function dismissBoxWarning(i: number): void {
    setBoxShelfWarnings(ws => ws.filter((_, j) => j !== i));
  }
  function dismissCellWarning(ci: number, i: number): void {
    setCellShelfWarnings(prev => {
      const out = [prev[0] ?? [], prev[1] ?? []];
      out[ci] = (out[ci] ?? []).filter((_, j) => j !== i);
      return out;
    });
  }

  function updateCellHeight(ci: number, id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h)) return;
    const cellItems = localCellItems[ci] ?? [];
    const target = cellItems.find(i => i.id === id);
    if (target?.type === 'shelf' && target.isFixedAboveExternals === true) return;
    updateCell(ci, cellItems.map(i => {
      if (i.id !== id) return i;
      if (i.type === 'shelf') return { ...i, heightFromFloor: h, isManuallyPositioned: true };
      return { ...i, heightFromFloor: h };
    }));
  }

  function updateCellDrawerH(ci: number, id: string, raw: string): void {
    const h = parseFloat(raw);
    if (isNaN(h) || h <= 0) return;
    updateCell(ci, (localCellItems[ci] ?? []).map(i =>
      i.id === id && i.type === 'drawer' ? { ...i, drawerHeight: h } : i,
    ));
  }

  function updateCellDrawerRunner(ci: number, id: string, runnerId: string | undefined): void {
    updateCell(ci, (localCellItems[ci] ?? []).map(i => {
      if (i.id !== id || i.type !== 'drawer') return i;
      if (runnerId === undefined) {
        const { runnerId: _drop, ...rest } = i;
        return rest;
      }
      return { ...i, runnerId };
    }));
  }

  function onCellItemMove(ci: number, id: string, newH: number): void {
    updateCell(ci, (localCellItems[ci] ?? []).map(i => {
      if (i.id !== id) return i;
      if (i.type === 'shelf') return { ...i, heightFromFloor: newH, isManuallyPositioned: true };
      return { ...i, heightFromFloor: newH };
    }));
  }

  // ── partition action handlers ─────────────────────────────────────────────

  function requestAddPartition(): void {
    if (localItems.length > 0) {
      setPendingAction('add');
    } else {
      onAddPartition();
    }
  }

  function requestRemovePartition(): void {
    const totalCellItems = (localCellItems[0]?.length ?? 0) + (localCellItems[1]?.length ?? 0);
    if (totalCellItems > 0) {
      setPendingAction('remove');
    } else {
      onRemovePartition();
    }
  }

  function confirmAction(): void {
    if (pendingAction === 'add') onAddPartition();
    if (pendingAction === 'remove') onRemovePartition();
    setPendingAction(null);
  }

  // ── warnings ──────────────────────────────────────────────────────────────

  const warnings = validateInterior(localItems, bodyH);
  const warnSet = new Set(warnings.map(w =>
    w.kind === 'outOfBounds' ? w.itemId : w.itemIds.join(','),
  ));

  function hasWarning(item: InteriorItem): boolean {
    if (warnSet.has(item.id)) return true;
    return warnings.some(w => w.kind === 'drawerOverlap' && w.itemIds.includes(item.id));
  }

  function warningMessages(item: InteriorItem): string[] {
    const msgs: string[] = [];
    const w: InteriorWarning[] = warnings.filter(w =>
      w.kind === 'outOfBounds' ? w.itemId === item.id : w.itemIds.includes(item.id),
    );
    for (const warn of w) {
      if (warn.kind === 'outOfBounds') msgs.push(t.interior.warnOutOfBounds);
      if (warn.kind === 'drawerOverlap') msgs.push(t.interior.warnDrawerOverlap);
    }
    return [...new Set(msgs)];
  }

  const cellWarnings = localCellItems.map(cellItemList => validateInterior(cellItemList, bodyH));

  function hasCellWarning(ci: number, item: InteriorItem): boolean {
    const ws = cellWarnings[ci] ?? [];
    return ws.some(w =>
      w.kind === 'outOfBounds' ? w.itemId === item.id : w.itemIds.includes(item.id),
    );
  }

  function cellWarningMessages(ci: number, item: InteriorItem): string[] {
    const ws = cellWarnings[ci] ?? [];
    const msgs: string[] = [];
    for (const w of ws.filter(w =>
      w.kind === 'outOfBounds' ? w.itemId === item.id : w.itemIds.includes(item.id),
    )) {
      if (w.kind === 'outOfBounds') msgs.push(t.interior.warnOutOfBounds);
      if (w.kind === 'drawerOverlap') msgs.push(t.interior.warnDrawerOverlap);
    }
    return [...new Set(msgs)];
  }

  // ── labels ────────────────────────────────────────────────────────────────

  const sorted = [...localItems].sort((a, b) => a.heightFromFloor - b.heightFromFloor);

  const typeLabel: Record<InteriorItem['type'], string> = {
    shelf:  t.interior.shelf,
    drawer: t.interior.drawer,
    rod:    t.interior.rod,
  };

  const typeIcon: Record<InteriorItem['type'], string> = {
    shelf:  '📐',
    drawer: '🗄️',
    rod:    '🔧',
  };

  // ── pending-action warning text ───────────────────────────────────────────

  function pendingWarningText(): string {
    if (pendingAction === 'add') {
      const shelves = localItems.filter(i => i.type === 'shelf').length;
      const drawers = localItems.filter(i => i.type === 'drawer').length;
      const rods    = localItems.filter(i => i.type === 'rod').length;
      return t.interior.partitionWarnAdd(shelves, drawers, rods);
    }
    if (pendingAction === 'remove') {
      const a = localCellItems[0]?.length ?? 0;
      const b = localCellItems[1]?.length ?? 0;
      return t.interior.partitionWarnRemove(a, b);
    }
    return '';
  }

  // ── shelf-warning banner ──────────────────────────────────────────────────

  function renderShelfWarnings(
    warnings: ShelfWarning[],
    onDismiss: (i: number) => void,
  ): React.JSX.Element | null {
    if (warnings.length === 0) return null;
    return (
      <div className={styles.shelfWarnings}>
        {warnings.map((w, i) => (
          <div key={i} className={styles.shelfWarning}>
            <span>⚠ {shelfWarningText(w, t)}</span>
            <button
              className={styles.shelfWarningDismiss}
              onClick={() => onDismiss(i)}
              aria-label={t.interior.dismissWarning}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    );
  }

  // ── item list renderer (shared between box and cell) ─────────────────────

  function renderItemList(
    itemList: InteriorItem[],
    onDelete: (id: string) => void,
    onUpdateH: (id: string, val: string) => void,
    onUpdateDrawerH: (id: string, val: string) => void,
    getHasWarning: (item: InteriorItem) => boolean,
    getWarnings: (item: InteriorItem) => string[],
    onUpdateDrawerRunner: (id: string, runnerId: string | undefined) => void,
  ): React.JSX.Element {
    const sorted = [...itemList].sort((a, b) => a.heightFromFloor - b.heightFromFloor);
    if (sorted.length === 0) {
      return <p className={styles.empty}>{t.interior.noItems}</p>;
    }
    return (
      <ul className={styles.list}>
        {sorted.map(item => {
          const isFixedShelf = item.type === 'shelf' && item.isFixedAboveExternals === true;
          return (
          <li
            key={item.id}
            className={`${styles.item} ${getHasWarning(item) ? styles.itemWarn : ''}`}
          >
            <span className={styles.itemIcon}>{typeIcon[item.type]}</span>
            <span className={styles.itemType}>
              {typeLabel[item.type]}
              {isFixedShelf && (
                <span className={styles.fixedTag} title={t.interior.fixedShelfTooltip}>
                  {' '}{t.interior.fixedShelfLabel}
                </span>
              )}
            </span>

            <label className={styles.fieldLabel}>
              {t.interior.heightFromFloor}
              <input
                type="number"
                className={styles.numInput}
                value={item.heightFromFloor}
                step={1}
                readOnly={isFixedShelf}
                onChange={e => onUpdateH(item.id, e.target.value)}
                onFocus={e => e.target.select()}
              />
            </label>

            {item.type === 'drawer' && (
              <>
                <label className={styles.fieldLabel}>
                  {t.interior.drawerHeight}
                  <input
                    type="number"
                    className={styles.numInput}
                    value={(item as DrawerItem).drawerHeight}
                    step={1}
                    min={1}
                    onChange={e => onUpdateDrawerH(item.id, e.target.value)}
                    onFocus={e => e.target.select()}
                  />
                </label>
                <label className={styles.fieldLabel}>
                  מסילה
                  <select
                    className={styles.numInput}
                    value={(item as DrawerItem).runnerId ?? ''}
                    onChange={e => onUpdateDrawerRunner(item.id, e.target.value || undefined)}
                  >
                    <option value="">ללא</option>
                    {enabledRunnerIds.map(rid => RUNNERS[rid] && (
                      <option key={rid} value={rid}>{RUNNERS[rid]!.name}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <button
              className={styles.deleteBtn}
              onClick={() => onDelete(item.id)}
              aria-label="מחק"
            >
              ✕
            </button>

            {getWarnings(item).map((msg, i) => (
              <span key={i} className={styles.warning}>⚠ {msg}</span>
            ))}
          </li>
          );
        })}
      </ul>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.editor}>
      {/* Confirmation dialog */}
      {pendingAction && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <p className={styles.dialogText}>{pendingWarningText()}</p>
            <div className={styles.dialogBtns}>
              <button className={styles.dialogConfirmBtn} onClick={confirmAction}>
                {pendingAction === 'add' ? t.interior.partitionConfirmAdd : t.interior.partitionConfirmRemove}
              </button>
              <button className={styles.dialogCancelBtn} onClick={() => setPendingAction(null)}>
                {t.interior.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer-type dialog (internal vs external) */}
      {drawerTarget && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <p className={styles.dialogTitle}>{t.interior.drawerTypeDialogTitle}</p>
            <div className={styles.drawerTypeBtns}>
              <button
                className={styles.drawerTypeBtn}
                onClick={() => confirmDrawerType('internal')}
              >
                <span className={styles.drawerTypeLabel}>{t.interior.drawerInternal}</span>
                <span className={styles.drawerTypeDesc}>{t.interior.drawerInternalDesc}</span>
              </button>
              <button
                className={styles.drawerTypeBtn}
                onClick={() => confirmDrawerType('external')}
              >
                <span className={styles.drawerTypeLabel}>{t.interior.drawerExternal}</span>
                <span className={styles.drawerTypeDesc}>{t.interior.drawerExternalDesc}</span>
              </button>
            </div>
            <button className={styles.dialogCancelBtn} onClick={() => setDrawerTarget(null)}>
              {t.interior.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          ← {t.interior.back}
        </button>
        <h2 className={styles.title}>
          {t.interior.editBody} — {boxLabel}
          <span className={styles.bodyHint}> ({bodyH} ס"מ)</span>
        </h2>
      </div>

      {/* Tab bar — גופים/חזיתות share the editable screen (fronts just adds the
          door overlay); חיתוכים/פרזולים are read-only lists for this body.
          Sits above the unit-settings section. */}
      <div className={styles.viewToggle}>
        {(['bodies', 'fronts', 'cuts', 'hardware'] as const).map(id => (
          <button
            key={id}
            type="button"
            className={`${styles.viewBtn} ${tab === id ? styles.viewBtnActive : ''}`}
            onClick={() => setTab(id)}
          >
            {id === 'bodies' ? t.doors.bodies
              : id === 'fronts' ? t.doors.fronts
              : id === 'cuts' ? t.cutsList.tab
              : t.hardwareList.tab}
          </button>
        ))}
      </div>

      {/* Folded-in unit-level controls (kitchen direct-edit) — shell sides,
          door gap, lift-mechanism family, corner controls. Sits under the tabs
          so the kitchen unit form is fully retired. */}
      {unitControls && (
        <div className={styles.dimOverrideSection}>
          <span className={styles.dimOverrideTitle}>{t.interior.unitSettings}</span>
          {unitControls}
        </div>
      )}

      {tab === 'cuts' ? (
        <CutsList cuts={cuts} {...(cutsSettings ? { settings: cutsSettings } : {})} />
      ) : tab === 'hardware' ? (
        <HardwareList items={hardwareItems} />
      ) : (
      <>
      {/* Per-body edging override.
          - "כמו ארון" (default) → no override entry; cabinet edging applies.
          - "מותאם" → an entry seeded from `cabinetEdging`, then edited
            in-place via the two dropdowns. Switching back to "כמו ארון"
            deletes the entry (setter receives `undefined`).
          Section sits above both layout branches so the carpenter sees the
          same control in partitioned and single-body modes. */}
      <div className={styles.edgingSection}>
        <span className={styles.edgingLabel}>{t.edging.overrideLabel}:</span>
        <label className={styles.edgingRadioLabel}>
          <input
            type="radio"
            name={`edging-${box.id}`}
            checked={bodyEdgingOverride === undefined}
            onChange={() => onSetBodyEdging(undefined)}
          />
          {t.edging.inherit}
        </label>
        <label className={styles.edgingRadioLabel}>
          <input
            type="radio"
            name={`edging-${box.id}`}
            checked={bodyEdgingOverride !== undefined}
            onChange={() => onSetBodyEdging({ ...cabinetEdging })}
          />
          {t.edging.custom}
        </label>

        {bodyEdgingOverride !== undefined && (
          <>
            <label className={styles.edgingField}>
              <span className={styles.edgingFieldLabel}>{t.edging.thicknessShort}</span>
              <select
                className={styles.edgingSelect}
                value={String(bodyEdgingOverride.thickness)}
                onChange={e => onSetBodyEdging({
                  ...bodyEdgingOverride,
                  thickness: e.target.value === '1.3' ? 1.3 : 0.6,
                })}
              >
                <option value="0.6">0.6</option>
                <option value="1.3">1.3</option>
              </select>
            </label>

            <label className={styles.edgingField}>
              <span className={styles.edgingFieldLabel}>{t.edging.finishShort}</span>
              <select
                className={styles.edgingSelect}
                value={bodyEdgingOverride.finishMaterialId ?? ''}
                onChange={e => {
                  const v = e.target.value as '' | MaterialId;
                  // '' = auto → drop the key so the band tracks the panel
                  // material. Any other value pins the band's color.
                  if (v === '') {
                    onSetBodyEdging({ thickness: bodyEdgingOverride.thickness });
                  } else {
                    onSetBodyEdging({ ...bodyEdgingOverride, finishMaterialId: v });
                  }
                }}
              >
                <option value="">{t.edging.finishAuto}</option>
                {Object.values(MATERIALS).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {/* ── Dimension overrides ─────────────────────────────────────────── */}
      <div className={styles.dimOverrideSection}>
        <span className={styles.dimOverrideTitle}>{t.interior.dimOverrideTitle}</span>
        {(['W', 'H', 'D'] as const).map(axis => {
          const derived = axis === 'W' ? derivedW : axis === 'H' ? derivedH : derivedD;
          const overrideVal = boxDimensionOverride?.[axis];
          return (
            <label key={axis} className={styles.dimOverrideField}>
              <span className={styles.dimOverrideLabel}>
                {axis === 'W' ? t.interior.dimOverrideW
                  : axis === 'H' ? t.interior.dimOverrideH
                  : t.interior.dimOverrideD}
              </span>
              <input
                type="number"
                className={`${styles.dimOverrideInput} ${overrideVal !== undefined ? styles.dimOverrideInputActive : ''}`}
                value={overrideVal !== undefined ? overrideVal : ''}
                placeholder={String(Math.round(derived * 10) / 10)}
                min={1}
                step={0.5}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  onSetBoxDimension(axis, isNaN(v) || v <= 0 ? undefined : v);
                }}
              />
            </label>
          );
        })}
        {boxDimensionOverride !== undefined && (
          <button
            type="button"
            className={styles.dimOverrideResetBtn}
            onClick={onResetBoxDimensions}
          >
            {t.interior.dimOverrideReset}
          </button>
        )}
      </div>

      {/* ── Per-body material override (relocated from the body view) ─────────
          Body material / front material / back-panel thickness. Sits directly
          under the dimension override; visible in both 2D and 3D. */}
      <div className={styles.dimOverrideSection}>
        <span className={styles.dimOverrideTitle}>{t.interior.materialOverrideTitle}</span>
        <label className={styles.dimOverrideField}>
          <span className={styles.dimOverrideLabel}>{t.form.bodyMaterial}</span>
          <select
            className={styles.edgingSelect}
            value={bodyMaterialOverride?.bodyMaterialId ?? ''}
            onChange={e => onSetBodyMaterial(e.target.value === '' ? undefined : (e.target.value as MaterialId))}
          >
            <option value="">{t.bodyView.inherit}: {matName(availableBodyMaterials, cabinetBodyMaterialId)}</option>
            {availableBodyMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className={styles.dimOverrideField}>
          <span className={styles.dimOverrideLabel}>{t.form.frontMaterial}</span>
          <select
            className={styles.edgingSelect}
            value={bodyMaterialOverride?.frontMaterialId ?? ''}
            onChange={e => onSetFrontMaterial(e.target.value === '' ? undefined : (e.target.value as MaterialId))}
          >
            <option value="">{t.bodyView.inherit}: {matName(availableFrontMaterials, cabinetFrontMaterialId)}</option>
            {availableFrontMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className={styles.dimOverrideField}>
          <span className={styles.dimOverrideLabel}>{t.form.backThickness}</span>
          <input
            type="number"
            className={styles.dimOverrideInput}
            step={0.5}
            min={0}
            value={bodyMaterialOverride?.backThicknessCm !== undefined ? bodyMaterialOverride.backThicknessCm * 10 : ''}
            placeholder={String(cabinetBackThicknessMm)}
            onChange={e => onSetBackThickness(e.target.value === '' ? undefined : (parseFloat(e.target.value) || 0))}
            onFocus={e => e.target.select()}
          />
        </label>
        {hasMaterialOverride && (
          <button
            type="button"
            className={styles.dimOverrideResetBtn}
            onClick={onResetBoxMaterials}
          >
            {t.bodyView.reset}
          </button>
        )}
      </div>

      {/* ── 2D / 3D preview toggle ──────────────────────────────────────── */}
      {bodyInput && (
        <div className={styles.viewToggle}>
          <button
            type="button"
            className={`${styles.viewBtn} ${view === '3d' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('3d')}
          >
            {t.interior.view3d}
          </button>
          <button
            type="button"
            className={`${styles.viewBtn} ${view === '2d' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('2d')}
          >
            {t.interior.view2d}
          </button>
        </div>
      )}

      {/* 3D model of the whole body (carcass + shelves/drawers). Editing stays
          on the controls below; switch to 2D for drag-to-move. */}
      {show3d && (
        <Suspense fallback={<div className={styles.view3dFallback} />}>
          <Body3DView boxes={displayBoxes3D} />
        </Suspense>
      )}

      {!show3d && showFronts && frontsSketch ? (
        /* ── Fronts tab (kitchen): interactive elevation — clickable doors
            (→ door editor) + hinge marks, in place of the body + overlay. ── */
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
          {frontsSketch}
        </div>
      ) : !show3d && showFronts && hasPartitions && bodyInput ? (
        /* ── Fronts tab (closet, partitioned) ── The two-cell editor below is
            for the Bodies tab; on Fronts the carpenter sees and clicks the
            body's door faces as one elevation (one door per cell), exactly like
            a non-partitioned body. Without this branch a partitioned body fell
            into the cell editor and showed no fronts at all. */
        <div className={styles.body}>
          <div className={styles.sketchCol}>
            <div style={{ position: 'relative', width: SKETCH_W, height: SKETCH_H }}>
              <BoxBodySketch
                bodyH={bodyH}
                bodyW={box.W}
                bodyD={box.D}
                items={localItems}
                svgWidth={SKETCH_W}
                svgHeight={SKETCH_H}
                showLabels
                showDimensions
                onItemMove={onItemMove}
                numPartitions={1}
                cellItems={[localCellItems[0] ?? [], localCellItems[1] ?? []]}
                bodyMaterialId={effBodyMatId}
                frontMaterialId={effFrontMatId}
                hasOuterShell={hasOuterShell}
                hasEnvelopeTop={hasEnvelopeTop}
                {...(topVariant ? { topVariant } : {})}
                {...(sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm } : {})}
              />
              <div style={{ position: 'absolute', ...frontsOverlayRect, pointerEvents: 'none' }}>
                <CabinetFrontsOverlay
                  input={bodyInput}
                  state={bodyFrontsState}
                  customMaterials={customMaterials}
                  viewBoxW={box.W}
                  viewBoxH={box.H}
                  {...(onFrontDoorClick ? { onDoorClick: (isoId: string) => { const { fi, si } = parseFiSiFromIsolatedDoorId(isoId); onFrontDoorClick(makeDoorId(box.id, fi, si)); } } : {})}
                  {...(onFrontDrawerClick ? { onDrawerFrontClick: onFrontDrawerClick } : {})}
                />
              </div>
            </div>
          </div>
        </div>
      ) : hasPartitions ? (
        /* ── Cell editor (partition mode) ── */
        <div className={styles.partitionBody}>
          <div className={styles.partitionToolbar}>
            <button className={styles.removePartitionBtn} onClick={requestRemovePartition}>
              {t.interior.removePartition}
            </button>
          </div>

          <div className={styles.cellsRow}>
            {[0, 1].map(ci => {
              const cellLabel = ci === 0 ? t.interior.cellRight : t.interior.cellLeft;
              const cellItemList = localCellItems[ci] ?? [];
              return (
                <div key={ci} className={styles.cell}>
                  <div className={styles.cellHeader}>
                    <span className={styles.cellLabel}>{cellLabel}</span>
                    <span className={styles.cellDims}>
                      {cellW.toFixed(1)} × {bodyH} ס"מ
                    </span>
                  </div>

                  {!show3d && (
                    <div className={styles.cellSketch}>
                      <BoxBodySketch
                        bodyH={bodyH}
                        bodyW={cellW}
                        bodyD={box.D}
                        items={cellItemList}
                        svgWidth={CELL_SKETCH_W}
                        svgHeight={CELL_SKETCH_H}
                        showLabels={false}
                        showGaps
                        onItemMove={(id, newH) => onCellItemMove(ci, id, newH)}
                        numPartitions={0}
                        bodyMaterialId={effBodyMatId}
                        frontMaterialId={effFrontMatId}
                        hasOuterShell={false}
                        hasEnvelopeTop={false}
                      />
                    </div>
                  )}

                  {!hideInteriorControls && (
                    <div className={styles.addRow}>
                      <button className={styles.addBtn} onClick={() => addCellShelf(ci)}>
                        {t.interior.addShelf}
                      </button>
                      {!shelfOnly && (
                        <button className={styles.addBtn} onClick={() => addCellDrawer(ci)}>
                          {t.interior.addDrawer}
                        </button>
                      )}
                      {!hideRodOption && !shelfOnly && (
                        <button className={styles.addBtn} onClick={() => addCellRod(ci)}>
                          {t.interior.addRod}
                        </button>
                      )}
                    </div>
                  )}

                  {renderShelfWarnings(
                    cellShelfWarnings[ci] ?? [],
                    i => dismissCellWarning(ci, i),
                  )}

                  {renderItemList(
                    cellItemList,
                    id => deleteCellItem(ci, id),
                    (id, val) => updateCellHeight(ci, id, val),
                    (id, val) => updateCellDrawerH(ci, id, val),
                    item => hasCellWarning(ci, item),
                    item => cellWarningMessages(ci, item),
                    (id, rid) => updateCellDrawerRunner(ci, id, rid),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── Single-box editor ── */
        <div className={styles.body}>
          {/* Sketch (2D) — hidden while the 3D model is showing */}
          {!show3d && (
            <div className={styles.sketchCol}>
              <div style={{ position: 'relative', width: SKETCH_W, height: SKETCH_H }}>
                <BoxBodySketch
                  bodyH={bodyH}
                  bodyW={box.W}
                  bodyD={box.D}
                  items={localItems}
                  svgWidth={SKETCH_W}
                  svgHeight={SKETCH_H}
                  showLabels
                  showDimensions
                  showGaps
                  onItemMove={onItemMove}
                  numPartitions={0}
                  bodyMaterialId={effBodyMatId}
                  frontMaterialId={effFrontMatId}
                  hasOuterShell={hasOuterShell}
                  hasEnvelopeTop={hasEnvelopeTop}
                  {...(topVariant ? { topVariant } : {})}
                  {...(sinkTraverseWidthCm !== undefined ? { sinkTraverseWidthCm } : {})}
                  {...(internalShelvesCm && internalShelvesCm.length > 0 ? { internalShelvesCm } : {})}
                />
                {/* 'fronts' tab — overlay this body's door/drawer faces on the
                    editable sketch (translucent, interior still visible). */}
                {showFronts && bodyInput && (
                  /* Wrapper stays click-through so gaps between fronts fall to
                     the body sketch below (drag-to-move shelves); the overlay's
                     clickable rects re-enable pointer events on themselves. */
                  <div style={{ position: 'absolute', ...frontsOverlayRect, pointerEvents: 'none' }}>
                    <CabinetFrontsOverlay
                      input={bodyInput}
                      state={bodyFrontsState}
                      customMaterials={customMaterials}
                      viewBoxW={box.W}
                      viewBoxH={box.H}
                      {...(onFrontDoorClick ? { onDoorClick: (isoId: string) => { const { fi, si } = parseFiSiFromIsolatedDoorId(isoId); onFrontDoorClick(makeDoorId(box.id, fi, si)); } } : {})}
                      {...(onFrontDrawerClick ? { onDrawerFrontClick: onFrontDrawerClick } : {})}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className={styles.controlsCol}>
            {!hideInteriorControls && (
              <div className={styles.addRow}>
                <button className={styles.addBtn} onClick={addShelf}>
                  {t.interior.addShelf}
                </button>
                {!shelfOnly && (
                  <button className={styles.addBtn} onClick={addDrawer}>
                    {t.interior.addDrawer}
                  </button>
                )}
                {!hideRodOption && !shelfOnly && (
                  <button className={styles.addBtn} onClick={addRod}>
                    {t.interior.addRod}
                  </button>
                )}
                {numFronts > 1 && !shelfOnly && (
                  <button className={styles.addBtn} onClick={requestAddPartition}>
                    {t.interior.addPartition}
                  </button>
                )}
              </div>
            )}

            {renderShelfWarnings(boxShelfWarnings, dismissBoxWarning)}

            {renderItemList(
              sorted,
              deleteItem,
              updateHeight,
              updateDrawerH,
              hasWarning,
              warningMessages,
              updateDrawerRunner,
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
