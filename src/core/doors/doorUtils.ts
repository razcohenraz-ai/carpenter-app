import type { Box, BoxPosition } from '../../types/geometry';
import type { InteriorItem, InteriorById, DrawerItem } from '../../types/interior';
import type { Door, DoorById, DrawerFront, Hinge } from '../../types/doors';
import type { MaterialId } from '../../types/materials';
import { newItemId } from '../interior/interiorUtils';
import { getMaterial } from '../../catalog';

// ── Hinge count by door height ────────────────────────────────────────────────

export function computeHingeCount(doorH: number): 1 | 2 | 3 | 4 {
  if (doorH < 25) return 1;
  if (doorH <= 150) return 2;
  if (doorH <= 200) return 3;
  return 4;
}

// ── Default hinge positions (cm from door bottom, sorted low→high) ────────────
// h < 25: single hinge at centre
// 25 ≤ h < 40: two hinges, offset scaled proportionally (offset = h/4)
// h ≥ 40: standard two-hinge offset of 10 cm from each edge

export function computeDefaultHingePositions(doorH: number, count?: 1 | 2 | 3 | 4): number[] {
  const n = count ?? computeHingeCount(doorH);
  if (n === 1) return [doorH / 2];
  const offset = Math.min(10, doorH / 4);
  const top    = doorH - offset;
  const bottom = offset;
  if (n === 2) return [bottom, top];
  if (n === 3) return [bottom, (doorH * 2) / 3, top];
  // 4 hinges
  const upperMid = (doorH * 2) / 3;
  const lowerMid = (bottom + upperMid) / 2;
  return [bottom, lowerMid, upperMid, top];
}

// ── Column rank helpers ───────────────────────────────────────────────────────

function columnLTRRank(pos: BoxPosition): number {
  if (pos === 'single' || pos === 'left') return 0;
  if (pos === 'right') return 1000;
  const m = pos.match(/unit_(\d+)/);
  return m ? parseInt(m[1]!, 10) : 0;
}

// ── Default hinge side ("salon style") ───────────────────────────────────────
// Left half of columns → hinges left; right half → hinges right.
// Middle column of odd count defaults to right.

export function defaultHingeSide(
  boxPos: BoxPosition,
  allBodyPositions: BoxPosition[],
): 'right' | 'left' {
  const unique = [...new Set(allBodyPositions)].sort((a, b) => columnLTRRank(a) - columnLTRRank(b));
  const idx  = unique.indexOf(boxPos);
  const half = Math.floor(unique.length / 2);
  return idx >= half ? 'right' : 'left';
}

// ── Interior conflict detection ───────────────────────────────────────────────

const CLEARANCE = 1; // cm

// Hinge positions live in the DOOR frame (0 = door's structural bottom edge).
// InteriorItem.heightFromFloor lives in the BODY frame (0 = body floor). When
// the door sits above an external-drawer stack, the two frames are offset by
// `calcExternalStackHeight(items, gapMm)`. Every comparison between a hinge
// position and an item position must reconcile the two frames first; helpers
// in this file convert the hinge pos to the body frame before comparing.

function conflictAt(pos: number, items: InteriorItem[], gapMm: number): boolean {
  const bodyPos = pos + calcExternalStackHeight(items, gapMm);
  return items.some(item => {
    if (item.type === 'drawer') {
      // Strict inequalities: bodyPos exactly CLEARANCE from drawer edge is safe.
      return bodyPos > item.heightFromFloor - CLEARANCE
          && bodyPos < item.heightFromFloor + item.drawerHeight + CLEARANCE;
    }
    return Math.abs(bodyPos - item.heightFromFloor) < CLEARANCE;
  });
}

// Move a single hinge away from conflict.
// min/max define the valid range for this hinge in DOOR frame (bounded by
// neighbours). Zone edges read from items in body frame and shifted back to
// door frame by subtracting the external-stack offset.

function adjustOneHinge(
  pos: number,
  items: InteriorItem[],
  gapMm: number,
  min: number,
  max: number,
): { pos: number; warning: boolean } {
  if (!conflictAt(pos, items, gapMm)) return { pos, warning: false };

  const offset  = calcExternalStackHeight(items, gapMm);
  const bodyPos = pos + offset;

  // Compute extent of the conflicting zone in DOOR frame
  let zoneLo = pos, zoneHi = pos;
  for (const item of items) {
    const overlaps =
      item.type === 'drawer'
        ? bodyPos > item.heightFromFloor - CLEARANCE && bodyPos < item.heightFromFloor + item.drawerHeight + CLEARANCE
        : Math.abs(bodyPos - item.heightFromFloor) < CLEARANCE;
    if (!overlaps) continue;
    if (item.type === 'drawer') {
      zoneLo = Math.min(zoneLo, item.heightFromFloor - CLEARANCE - offset);
      zoneHi = Math.max(zoneHi, item.heightFromFloor + item.drawerHeight + CLEARANCE - offset);
    } else {
      zoneLo = Math.min(zoneLo, item.heightFromFloor - CLEARANCE - offset);
      zoneHi = Math.max(zoneHi, item.heightFromFloor + CLEARANCE - offset);
    }
  }

  const upPos   = zoneHi;
  const downPos = zoneLo;

  const upOk   = upPos   <= max && !conflictAt(upPos,   items, gapMm);
  const downOk = downPos >= min && !conflictAt(downPos, items, gapMm);

  if (!upOk && !downOk)    return { pos, warning: true };
  if (!upOk)               return { pos: downPos, warning: false };
  if (!downOk)             return { pos: upPos,   warning: false };
  // Both OK: prefer closer; tie → prefer up
  return upPos - pos <= pos - downPos
    ? { pos: upPos, warning: false }
    : { pos: downPos, warning: false };
}

// Returns adjusted hinges + warning message if any hinge couldn't be placed.
// All non-manual hinges are adjusted (including top and bottom).
// Per-hinge valid range is bounded by neighbouring hinges ± CLEARANCE.
// `gapMm` is the door gap used by `calcExternalStackHeight` to compute the
// door-bottom-from-floor offset.

export function adjustHingesForInterior(
  hinges: Hinge[],
  items: InteriorItem[],
  gapMm: number,
  doorH: number,
): { hinges: Hinge[]; warnings: string[] } {
  const warnings: string[] = [];

  // Sort once to compute per-hinge bounds from neighbours (use original positions)
  const sorted = [...hinges].sort((a, b) => a.positionFromBottom - b.positionFromBottom);
  const idxInSorted = new Map(sorted.map((h, i) => [h.id, i]));

  const adjusted = hinges.map(hinge => {
    if (hinge.isManual) return hinge;

    const i   = idxInSorted.get(hinge.id)!;
    const min = i > 0 ? sorted[i - 1]!.positionFromBottom + CLEARANCE : 0;
    const max = i < sorted.length - 1 ? sorted[i + 1]!.positionFromBottom - CLEARANCE : doorH;

    const { pos, warning } = adjustOneHinge(hinge.positionFromBottom, items, gapMm, min, max);
    if (warning) warnings.push('no_auto_pos');
    return { ...hinge, positionFromBottom: pos };
  });

  return { hinges: adjusted, warnings };
}

// ── Detect which hinges (including manual) are in conflict ────────────────────

export function computeHingeWarnings(door: Door, items: InteriorItem[], gapMm: number): Set<string> {
  const result = new Set<string>();
  for (const hinge of door.hinges) {
    if (conflictAt(hinge.positionFromBottom, items, gapMm)) result.add(hinge.id);
  }
  return result;
}

// ── Spacing warning: hinge pairs closer than MIN_HINGE_GAP ───────────────────

const MIN_HINGE_GAP = 25;

export function computeHingeSpacingWarnings(door: Door): Set<string> {
  if (!door.hasDoor || door.hinges.length < 2) return new Set();
  const sorted = [...door.hinges].sort((a, b) => a.positionFromBottom - b.positionFromBottom);
  const result = new Set<string>();
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1]!.positionFromBottom - sorted[i]!.positionFromBottom;
    if (gap < MIN_HINGE_GAP) {
      result.add(sorted[i]!.id);
      result.add(sorted[i + 1]!.id);
    }
  }
  return result;
}

// ── Skirt extension helpers ───────────────────────────────────────────────────

// True if this level is bottom-touching — eligible to extend downward over the plinth.
export function shouldCoverSkirt(boxLevel: string): boolean {
  return boxLevel === 'bottom' || boxLevel === 'single';
}

// Structural height = the door panel as built; hinges always positioned within this.
export function getDoorStructuralHeight(door: Door): number {
  return door.height;
}

// Visual height = structural + plinth extension when coversSkirt is true.
// Extension = (plinthH − 1) cm (leaves 1 cm floor clearance) + gapCm (bottom gap
// was subtracted from door.height by getDoorHeight, but skirt doors have no bottom gap —
// the 1 cm absolute clearance already covers it).
export function getDoorVisualHeight(door: Door, plinthH: number): number {
  if (!door.coversSkirt || !(plinthH > 0)) return door.height;
  const gapCm = (door.gapMm ?? 0) / 10;
  return door.height + (plinthH - 1) + gapCm;
}

// ── Init doors from boxes ─────────────────────────────────────────────────────

// NOTE: not called from production (useCabinet.calculate builds doors inline).
// Kept for symmetry; gapMm=0 here is safe because no external-drawer stack
// offset is known at this seed point and `calcExternalStackHeight` returns 0
// when there are no externals in items.
export function initDoorsFromBoxes(
  boxes: Box[],
  interiorById: InteriorById,
): DoorById {
  const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
  const allPositions = bodyBoxes.map(b => b.position);

  const result: DoorById = {};
  for (const box of bodyBoxes) {
    const items = interiorById[box.id] ?? [];
    const defaultPos = computeDefaultHingePositions(box.H);
    const rawHinges: Hinge[] = defaultPos.map(p => ({
      id: newItemId(),
      positionFromBottom: p,
      isManual: false,
    }));
    const { hinges } = adjustHingesForInterior(rawHinges, items, 0, box.H);

    result[box.id] = {
      id: box.id,
      boxId: box.id,
      frontIndex: 0,
      height: box.H,
      width: box.W,
      hingeSide: defaultHingeSide(box.position, allPositions),
      hingeCount: 'auto',
      hinges,
      hasDoor: true,
      coversSkirt: false,
    };
  }
  return result;
}

// ── Recompute non-manual hinges after interior or height change ───────────────
// Preserves door.hingeCount (user-set or 'auto').

export function recomputeDoorHinges(door: Door, items: InteriorItem[], plinthH = 0): Door {
  const visualH = getDoorVisualHeight(door, plinthH);
  const n = door.hingeCount === 'auto'
    ? computeHingeCount(visualH)
    : (door.hingeCount as 1 | 2 | 3 | 4);
  const defaults = computeDefaultHingePositions(door.height, n);
  // Build array of length n — preserves manual hinges by index, drops extras.
  const reset = Array.from({ length: defaults.length }, (_, idx) => {
    const existing = door.hinges[idx];
    if (existing?.isManual) return existing;
    return { id: existing?.id ?? newItemId(), positionFromBottom: defaults[idx]!, isManual: false };
  });
  const { hinges } = adjustHingesForInterior(reset, items, door.gapMm ?? 0, door.height);
  return { ...door, hinges };
}

// ── Multi-front helpers ───────────────────────────────────────────────────────

// doorId for frontIndex 0 equals boxId (backward-compat); fi > 0 → "${boxId}:${fi}"
export function makeDoorId(boxId: string, frontIndex: number): string {
  return frontIndex === 0 ? boxId : `${boxId}:${frontIndex}`;
}

// Salon-style hinge side for horizontal front splitting within a single box.
// Right half (fi < ceil(n/2)) → hinges right; left half → hinges left.
export function salonHingeSide(frontIndex: number, numFronts: number): 'right' | 'left' {
  return frontIndex < Math.ceil(numFronts / 2) ? 'right' : 'left';
}

// ── Door panel dimensions ────────────────────────────────────────────────────
// Door WIDTH is no longer computed here — it's a function of the whole cabinet
// (see `core/geometry/frontGeometry.ts`). This module owns only door HEIGHT
// and the various per-drawer derivations below.

// hasTopGap: gap between box top and front top. False for 'bottom'/'middle' boxes —
//   the box above already owns the shared boundary gap (prevents double-counting).
// hasBottomGap: gap between front bottom and box bottom. False when the front
//   rests directly on a plinth (no clearance needed below).
export function getDoorHeight(boxH: number, gapMm: number, hasBottomGap = true, hasTopGap = true): number {
  const gapCm = gapMm / 10;
  return boxH - (hasTopGap ? gapCm : 0) - (hasBottomGap ? gapCm : 0);
}

// ── External drawer fronts ────────────────────────────────────────────────────
// An "external" drawer has its own face panel that is part of the cabinet
// facade. Multiple externals stack from the bottom of the box upward; each
// drawer occupies `drawerHeight` cm and is separated from the front above it
// (next drawer or main door) by `gapMm` (the door gap).
//
// Layout within the front area (cm from box bottom, ignoring bottom gap):
//   [drawer 1] [gap] [drawer 2] [gap] ... [drawer N] [gap] [main door]
// `calcExternalStackHeight` returns the offset where the main door starts —
// i.e. sum(drawerHeights) + N * gap. `calcMainDoorHeight` returns the
// resulting main-door panel height.
//
// `internal` drawers have no facade panel and do not affect door geometry.

/** Comfort threshold for the main door above an external-drawer stack. */
export const MIN_COMFORTABLE_MAIN_DOOR_H_CM = 10;

/** Returns the external drawers in the list, sorted by `heightFromFloor` ascending
 *  (lowest first — i.e. the drawer at the bottom of the front stack). */
export function getExternalDrawers(items: InteriorItem[]): DrawerItem[] {
  return items
    .filter((i): i is DrawerItem => i.type === 'drawer' && i.mount === 'external')
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor);
}

/** Total height occupied by external-drawer fronts and the gap above each one
 *  (the gap above the topmost drawer separates it from the main door above).
 *  Returns 0 when there are no external drawers. */
export function calcExternalStackHeight(items: InteriorItem[], gapMm: number): number {
  const externals = getExternalDrawers(items);
  const n = externals.length;
  if (n === 0) return 0;
  const gapCm = gapMm / 10;
  const sum = externals.reduce((s, d) => s + d.drawerHeight, 0);
  return sum + n * gapCm;
}

/** Height of the main door panel after external-drawer fronts (if any) are
 *  subtracted from the available front area. With no externals, equals
 *  `getDoorHeight(boxH, gapMm, hasBottomGap, hasTopGap)`. May be ≤0 when the
 *  externals fill or exceed the box (the caller decides whether to emit a
 *  door at all). */
export function calcMainDoorHeight(
  boxH: number,
  items: InteriorItem[],
  gapMm: number,
  hasBottomGap = true,
  hasTopGap = true,
): number {
  const frontAreaH = getDoorHeight(boxH, gapMm, hasBottomGap, hasTopGap);
  return frontAreaH - calcExternalStackHeight(items, gapMm);
}

export type MainDoorWarning = 'main_door_too_short' | 'main_door_absent';

/** Validates the computed main-door height. `<=0` means there is no room for a
 *  main door (caller should skip creating a Door for that frontIndex). `<10cm`
 *  is a usability concern (hard to grip) — door is still created, warning is
 *  emitted. */
export function validateMainDoorHeight(mainDoorH: number): MainDoorWarning | null {
  if (mainDoorH <= 0) return 'main_door_absent';
  if (mainDoorH < MIN_COMFORTABLE_MAIN_DOOR_H_CM) return 'main_door_too_short';
  return null;
}

/** True if `mount === 'external'`. */
export function isExternalDrawer(item: InteriorItem): item is DrawerItem {
  return item.type === 'drawer' && item.mount === 'external';
}

/** Maps a cell index (0=right, 1=left) to a frontIndex within a body with
 *  `numFronts` horizontal fronts. Identity mapping for the two ends:
 *  `Door.frontIndex` is 0 = rightmost (RTL convention), and cell 0 is the
 *  right cell — so right cell sits behind the right door (frontIndex 0), and
 *  left cell sits behind the leftmost door (frontIndex numFronts−1). */
export function cellIndexToFrontIndex(cellIndex: 0 | 1, numFronts: number): number {
  return cellIndex === 0 ? 0 : numFronts - 1;
}

/** Items that drive the front of a given door (frontIndex):
 *  - Body without partition → all body items affect every front.
 *  - Partition body → right cell items drive frontIndex 0; left cell items
 *    drive frontIndex numFronts−1. Middle frontIndices have no cell mapping
 *    (numFronts > 2 + partition is not yet supported) and receive []. */
export function getItemsForFront(
  frontIndex: number,
  numFronts: number,
  hasPartition: boolean,
  bodyItems: InteriorItem[],
  cellItems: InteriorItem[][] | undefined,
): InteriorItem[] {
  if (!hasPartition || !cellItems) return bodyItems;
  if (frontIndex === 0) return cellItems[0] ?? [];
  if (frontIndex === numFronts - 1) return cellItems[1] ?? [];
  return [];
}

/** Signature describing the set of external drawers in `items` (id + height).
 *  Two snapshots with the same signature produce the same door geometry and
 *  the same `'front'` cuts — used to short-circuit unrelated state updates. */
export function externalStackSignature(items: InteriorItem[]): string {
  return items
    .filter((i): i is DrawerItem => i.type === 'drawer' && i.mount === 'external')
    .map(d => `${d.id}:${d.drawerHeight}`)
    .sort()
    .join('|');
}

/** True when adding/removing/resizing an external drawer (or toggling a
 *  drawer's mount) changes the external stack. Callers may use this to decide
 *  whether to trigger a full `calculate()` versus a surgical state update. */
export function externalStackChanged(prev: InteriorItem[], next: InteriorItem[]): boolean {
  return externalStackSignature(prev) !== externalStackSignature(next);
}

// Drawer-front derivation lives in `./drawerFrontsCalc.ts` (it needs the
// cabinet-level front layout from `core/geometry/frontGeometry.ts`, and
// keeping that import out of this file avoids a cycle).

/** Visual height of a drawer front, mirroring `getDoorVisualHeight`: adds the
 *  plinth-covering extension when the drawer inherited `coversSkirt`. */
export function getDrawerFrontVisualHeight(front: DrawerFront, plinthH: number): number {
  if (!front.coversSkirt || !(plinthH > 0)) return front.height;
  const gapCm = front.gapMm / 10;
  return front.height + (plinthH - 1) + gapCm;
}

/** Returns the external drawer that should carry the original door's
 *  `coversSkirt` (the lowest one, by `heightFromFloor`), or null if there are
 *  no externals or the main door does not cover skirt. The main door is
 *  expected to lose `coversSkirt` in that case — the field is transferred. */
export function getSkirtCoveringDrawer(
  items: InteriorItem[],
  mainDoorCoversSkirt: boolean,
): DrawerItem | null {
  if (!mainDoorCoversSkirt) return null;
  const externals = getExternalDrawers(items);
  return externals[0] ?? null;
}

/** Effective front-material thickness for an external drawer, mirroring
 *  `getDoorThicknessCm` for doors. Falls back to 1.8 cm if the override is
 *  invalid. Returns the global thickness for internal drawers (their
 *  `frontThicknessOverride` is meaningless and ignored). */
export function getDrawerFrontThicknessCm(
  drawer: DrawerItem,
  globalFrontMaterialId: string,
): number {
  if (drawer.mount !== 'external') {
    try { return getMaterial(globalFrontMaterialId as MaterialId).thickness / 10; }
    catch { return 1.8; }
  }
  const matId = (drawer.frontThicknessOverride ?? globalFrontMaterialId) as MaterialId;
  try { return getMaterial(matId).thickness / 10; }
  catch { return 1.8; }
}

// ── Effective door thickness ──────────────────────────────────────────────────

export function getDoorThicknessCm(door: Door, globalMaterialId: string): number {
  const matId = (door.thicknessOverride ?? globalMaterialId) as MaterialId;
  try {
    return getMaterial(matId).thickness / 10;
  } catch {
    return 1.8;
  }
}

// ── Door display numbering ────────────────────────────────────────────────────
// Columns numbered right → left (rightmost = 1).
// Single box per column: "1", "2", ...
// Multiple boxes per column: "1א" (bottom), "1ב" (top), etc.

const HEBREW = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י'];

const LEVEL_RANK: Record<string, number> = {
  bottom: 0, single: 0, middle: 1, top: 2,
};

// numFrontsMap: boxId → number of horizontal fronts (default 1 when absent).
// Returns doorId → display label, where doorId = makeDoorId(boxId, frontIndex).
export function assignDoorDisplayNumbers(
  boxes: Box[],
  numFrontsMap: Map<string, number> = new Map(),
): Map<string, string> {
  const bodyBoxes = boxes.filter(b => b.level !== 'plinth');

  // Group by column position
  const colMap = new Map<BoxPosition, Box[]>();
  for (const box of bodyBoxes) {
    const list = colMap.get(box.position) ?? [];
    list.push(box);
    colMap.set(box.position, list);
  }

  // Sort columns RTL (highest LTR rank = rightmost first)
  const sortedCols = [...colMap.keys()].sort(
    (a, b) => columnLTRRank(b) - columnLTRRank(a),
  );

  const result = new Map<string, string>();
  let colNum = 1;

  for (const colPos of sortedCols) {
    const colBoxes = (colMap.get(colPos) ?? []).sort(
      (a, b) => (LEVEL_RANK[a.level] ?? 0) - (LEVEL_RANK[b.level] ?? 0),
    );

    const totalFronts = colBoxes.reduce(
      (sum, box) => sum + (numFrontsMap.get(box.id) ?? 1),
      0,
    );

    if (totalFronts === 1) {
      result.set(makeDoorId(colBoxes[0]!.id, 0), `${colNum}`);
    } else {
      let letterIdx = 0;
      for (const box of colBoxes) {
        const nf = numFrontsMap.get(box.id) ?? 1;
        for (let fi = 0; fi < nf; fi++) {
          result.set(makeDoorId(box.id, fi), `${colNum}${HEBREW[letterIdx] ?? letterIdx}`);
          letterIdx++;
        }
      }
    }
    colNum++;
  }

  return result;
}
