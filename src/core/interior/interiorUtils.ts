import type { Box } from '../../types/geometry';
import type {
  BodyLevel,
  InteriorItem,
  InteriorById,
  ShelfItem,
  DrawerItem,
  RodItem,
  InteriorWarning,
} from '../../types/interior';

// ── ID generation ─────────────────────────────────────────────────────────────

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Stable key for cross-recalculation identity ───────────────────────────────
// Box.id resets on every recalc; stable key encodes structural position.

export function boxStableKey(box: Box): string {
  return `${box.level}:${box.position}`;
}

// ── Body floor computation ────────────────────────────────────────────────────
// Returns each body level's floor height (cm above plinth, within body area).
// E.g. for top/bottom split: bottom→0, top→bottomH

const BODY_LEVEL_ORDER: BodyLevel[] = ['top', 'middle', 'bottom', 'single'];

export function computeBodyFloors(
  levelHeightMap: Map<BodyLevel, number>,
): Map<BodyLevel, number> {
  const floors = new Map<BodyLevel, number>();
  const active = BODY_LEVEL_ORDER.filter(l => levelHeightMap.has(l));
  let cum = 0;
  for (const level of [...active].reverse()) {
    floors.set(level, cum);
    cum += levelHeightMap.get(level)!;
  }
  return floors;
}

// ── Init interior from decomposeBoxes result ──────────────────────────────────
// Returns one entry per non-plinth box, keyed by Box.id.
// Converts Box.internalShelves (absolute cm from cabinet floor) to ShelfItems
// with heights relative to each body's own floor.

export function initInteriorFromBoxes(
  boxes: Box[],
  plinthHeight: number,
): InteriorById {
  const levelHeightMap = new Map<BodyLevel, number>();
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    const lvl = box.level as BodyLevel;
    if (!levelHeightMap.has(lvl)) levelHeightMap.set(lvl, box.H);
  }

  const bodyFloors = computeBodyFloors(levelHeightMap);
  const result: InteriorById = {};

  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    const level = box.level as BodyLevel;
    const bodyFloor = bodyFloors.get(level) ?? 0;

    if (box.internalShelves && box.internalShelves.length > 0) {
      result[box.id] = box.internalShelves.map(absH => ({
        type: 'shelf' as const,
        id: newItemId(),
        heightFromFloor: absH - plinthHeight - bodyFloor,
      } satisfies ShelfItem));
    } else {
      result[box.id] = [];
    }
  }

  return result;
}

// ── Default placement algorithms ──────────────────────────────────────────────

interface Segment { lo: number; hi: number }

function computeFreeSegments(items: InteriorItem[], bodyH: number): Segment[] {
  const occupied: Array<[number, number]> = items
    .filter((i): i is DrawerItem => i.type === 'drawer')
    .map(d => [d.heightFromFloor, d.heightFromFloor + d.drawerHeight]);

  const pointBarriers = items
    .filter(i => i.type === 'shelf' || i.type === 'rod')
    .map(i => i.heightFromFloor);

  const all: Array<[number, number]> = (
    [[0, 0] as [number, number], [bodyH, bodyH] as [number, number]]
      .concat(pointBarriers.map(h => [h, h] as [number, number]))
      .concat(occupied)
  ).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Merge overlapping intervals
  const merged: Array<[number, number]> = [];
  for (const iv of all) {
    const [lo, hi] = iv;
    if (!merged.length) { merged.push([lo, hi]); continue; }
    const last = merged[merged.length - 1]!;
    if (lo <= last[1]) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }

  const free: Segment[] = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const lo = merged[i]![1];
    const hi = merged[i + 1]![0];
    if (hi > lo) free.push({ lo, hi });
  }
  return free;
}

export function defaultShelfPlacement(
  existingItems: InteriorItem[],
  bodyH: number,
): ShelfItem {
  // Shelves-only body: evenly divide the available space
  if (existingItems.every(i => i.type === 'shelf')) {
    const positions = existingItems.map(i => i.heightFromFloor).sort((a, b) => a - b);
    const boundaries = [0, ...positions, bodyH];
    let bestLo = 0, bestHi = bodyH;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const lo = boundaries[i]!;
      const hi = boundaries[i + 1]!;
      if (hi - lo >= bestHi - bestLo) { // >= prefers higher segment on ties
        bestLo = lo;
        bestHi = hi;
      }
    }
    return { type: 'shelf', id: newItemId(), heightFromFloor: (bestLo + bestHi) / 2 };
  }

  // Mixed body: bisect the largest free segment (respects drawers and rods)
  const segs = computeFreeSegments(existingItems, bodyH);
  const best = segs.length
    ? segs.reduce((a, b) => (b.hi - b.lo) > (a.hi - a.lo) ? b : a)
    : { lo: 0, hi: bodyH };
  return { type: 'shelf', id: newItemId(), heightFromFloor: (best.lo + best.hi) / 2 };
}

const DEFAULT_DRAWER_H = 20;

export function defaultDrawerPlacement(
  existingItems: InteriorItem[],
  bodyH: number,
  drawerH: number = DEFAULT_DRAWER_H,
): DrawerItem {
  const drawers = existingItems
    .filter((i): i is DrawerItem => i.type === 'drawer')
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor); // lowest first

  const heightFromFloor = drawers.length === 0
    ? Math.max(0, (bodyH - drawerH) / 2)                           // first: center
    : Math.max(0, drawers[0]!.heightFromFloor - drawerH - 3);      // next: 3cm gap below lowest

  return { type: 'drawer', id: newItemId(), heightFromFloor, drawerHeight: drawerH };
}

export function defaultRodPlacement(
  bodyH: number,
  existingItems: InteriorItem[] = [],
): RodItem {
  const rods = existingItems
    .filter(i => i.type === 'rod')
    .map(i => i.heightFromFloor)
    .sort((a, b) => a - b);

  if (rods.length === 0) {
    return { type: 'rod', id: newItemId(), heightFromFloor: Math.max(0, bodyH - 10) };
  }

  // Subsequent rods: bisect the largest gap between floor (0) and existing rod heights
  const boundaries = [0, ...rods];
  let bestLo = 0, bestHi = rods[0]!;
  for (let i = 0; i < boundaries.length - 1; i++) {
    const lo = boundaries[i]!;
    const hi = boundaries[i + 1]!;
    if (hi - lo > bestHi - bestLo) { bestLo = lo; bestHi = hi; }
  }
  return { type: 'rod', id: newItemId(), heightFromFloor: (bestLo + bestHi) / 2 };
}

// ── Equal shelf distribution ──────────────────────────────────────────────────
// Shelves with isManuallyPositioned=true stay put.
// All other shelves are spread evenly: position[i] = containerH × (i+1) / (N+1).
// Non-shelf items are never touched.

export function redistributeShelves(
  items: InteriorItem[],
  containerH: number,
): InteriorItem[] {
  const shelves = items.filter((i): i is ShelfItem => i.type === 'shelf');
  const others  = items.filter(i => i.type !== 'shelf');

  const manual = shelves.filter(s => s.isManuallyPositioned === true);
  const auto   = shelves.filter(s => s.isManuallyPositioned !== true);

  if (auto.length === 0) return items;

  // Sort by current position to minimise visual jumps on redistribution.
  const sorted = [...auto].sort((a, b) => a.heightFromFloor - b.heightFromFloor);
  const N = sorted.length;
  const redistributed = sorted.map((s, i) => ({
    ...s,
    heightFromFloor: containerH * (i + 1) / (N + 1),
  }));

  return [...others, ...manual, ...redistributed];
}

export function addShelfRedistributed(
  items: InteriorItem[],
  containerH: number,
): InteriorItem[] {
  const newShelf: ShelfItem = {
    type: 'shelf',
    id: newItemId(),
    heightFromFloor: 0, // placeholder; redistributeShelves will set the real position
    isManuallyPositioned: false,
  };
  return redistributeShelves([...items, newShelf], containerH);
}

// ── Validation (warnings, never blocking) ────────────────────────────────────

export function validateInterior(
  items: InteriorItem[],
  bodyH: number,
): InteriorWarning[] {
  const warnings: InteriorWarning[] = [];

  for (const item of items) {
    const exceeds =
      item.type === 'drawer'
        ? item.heightFromFloor < 0 || item.heightFromFloor + item.drawerHeight > bodyH
        : item.heightFromFloor < 0 || item.heightFromFloor > bodyH;
    if (exceeds) warnings.push({ kind: 'outOfBounds', itemId: item.id });
  }

  const drawers = items
    .filter((i): i is DrawerItem => i.type === 'drawer')
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor);

  for (let i = 0; i < drawers.length - 1; i++) {
    const a = drawers[i]!;
    const b = drawers[i + 1]!;
    if (a.heightFromFloor + a.drawerHeight > b.heightFromFloor) {
      warnings.push({ kind: 'drawerOverlap', itemIds: [a.id, b.id] });
    }
  }

  return warnings;
}

// ── Height-change filtering ───────────────────────────────────────────────────
// Removes items that exceed the new body height (hard physical impossibility).

export function filterItemsForHeight(
  items: InteriorItem[],
  newBodyH: number,
): InteriorItem[] {
  return items.filter(item => {
    if (item.heightFromFloor < 0) return false;
    if (item.type === 'drawer') return item.heightFromFloor + item.drawerHeight <= newBodyH;
    return item.heightFromFloor <= newBodyH;
  });
}
