import type { Box } from '../../types/geometry';
import type {
  BodyLevel,
  InteriorItem,
  InteriorById,
  ShelfItem,
  DrawerItem,
  RodItem,
  InteriorWarning,
  ShelfWarning,
} from '../../types/interior';

// ── ID generation ─────────────────────────────────────────────────────────────

export function newItemId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// Round to 1 decimal cm — keeps storage and display clean (carpentry precision).
export function roundCm(h: number): number {
  return Math.round(h * 10) / 10;
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
const ROD_CEILING_CLEARANCE = 10;
const HANGER_DROP = 80;
const HANGER_MIN_GAP = 70;
const MIN_AUTO_SHELF_ZONE = 25;

function findLowestRod(items: InteriorItem[]): RodItem | null {
  let lowest: RodItem | null = null;
  for (const item of items) {
    if (item.type !== 'rod') continue;
    if (!lowest || item.heightFromFloor < lowest.heightFromFloor) {
      lowest = item;
    }
  }
  return lowest;
}

function findDrawerJustBelowRod(items: InteriorItem[], rodH: number): DrawerItem | null {
  let candidate: DrawerItem | null = null;
  for (const item of items) {
    if (item.type !== 'drawer') continue;
    const top = item.heightFromFloor + item.drawerHeight;
    if (top > rodH) continue;
    if (!candidate || top > candidate.heightFromFloor + candidate.drawerHeight) {
      candidate = item;
    }
  }
  return candidate;
}

export function defaultDrawerPlacement(
  existingItems: InteriorItem[],
  bodyH: number,
  drawerH: number = DEFAULT_DRAWER_H,
): { drawer: DrawerItem; warnings: ShelfWarning[] } {
  const newId = newItemId();
  const warnings: ShelfWarning[] = [];

  const drawers = existingItems
    .filter((i): i is DrawerItem => i.type === 'drawer')
    .sort((a, b) => a.heightFromFloor - b.heightFromFloor); // lowest first

  // Existing drawer → stack 3cm below lowest (no rod-aware logic for stacking)
  if (drawers.length > 0) {
    const heightFromFloor = roundCm(Math.max(0, drawers[0]!.heightFromFloor - drawerH - 3));
    return {
      drawer: { type: 'drawer', id: newId, heightFromFloor, drawerHeight: drawerH },
      warnings,
    };
  }

  const rod = findLowestRod(existingItems);
  if (!rod) {
    // No rod, no existing drawers → centre of body
    return {
      drawer: {
        type: 'drawer',
        id: newId,
        heightFromFloor: roundCm(Math.max(0, (bodyH - drawerH) / 2)),
        drawerHeight: drawerH,
      },
      warnings,
    };
  }

  // Rod present, first drawer → keep 80cm hanger gap when possible
  const rodH = rod.heightFromFloor;
  const desiredH = rodH - HANGER_DROP - drawerH;
  if (desiredH >= 0) {
    return {
      drawer: { type: 'drawer', id: newId, heightFromFloor: roundCm(desiredH), drawerHeight: drawerH },
      warnings,
    };
  }

  // Not enough room — place at floor, warn if resulting gap is <70
  const placedH = 0;
  const actualGap = rodH - drawerH;
  if (actualGap < HANGER_MIN_GAP) {
    warnings.push({ kind: 'rod_drawer_close', gap: actualGap, rodId: rod.id, drawerId: newId });
  }
  return {
    drawer: { type: 'drawer', id: newId, heightFromFloor: placedH, drawerHeight: drawerH },
    warnings,
  };
}

export function defaultRodPlacement(
  bodyH: number,
  existingItems: InteriorItem[] = [],
): { rod: RodItem; warnings: ShelfWarning[] } {
  const newId = newItemId();
  const warnings: ShelfWarning[] = [];

  const rods = existingItems
    .filter((i): i is RodItem => i.type === 'rod')
    .map(i => i.heightFromFloor)
    .sort((a, b) => a - b);

  // Subsequent rod → bisect largest gap between floor and existing rod heights
  if (rods.length > 0) {
    const boundaries = [0, ...rods];
    let bestLo = 0, bestHi = rods[0]!;
    for (let i = 0; i < boundaries.length - 1; i++) {
      const lo = boundaries[i]!;
      const hi = boundaries[i + 1]!;
      if (hi - lo > bestHi - bestLo) { bestLo = lo; bestHi = hi; }
    }
    return {
      rod: { type: 'rod', id: newId, heightFromFloor: roundCm((bestLo + bestHi) / 2) },
      warnings,
    };
  }

  const defaultH = Math.max(0, bodyH - ROD_CEILING_CLEARANCE);
  const drawers = existingItems.filter((i): i is DrawerItem => i.type === 'drawer');

  if (drawers.length === 0) {
    return { rod: { type: 'rod', id: newId, heightFromFloor: roundCm(defaultH) }, warnings };
  }

  // Highest drawer top defines the minimum rod height needed for 80cm hanger
  let highestTop = -Infinity;
  let highestDrawer: DrawerItem = drawers[0]!;
  for (const d of drawers) {
    const top = d.heightFromFloor + d.drawerHeight;
    if (top > highestTop) { highestTop = top; highestDrawer = d; }
  }
  const requiredH = highestTop + HANGER_DROP;

  if (requiredH <= bodyH) {
    // Push rod up to maintain 80cm gap, but never below the default ceiling clearance
    return {
      rod: { type: 'rod', id: newId, heightFromFloor: roundCm(Math.max(defaultH, requiredH)) },
      warnings,
    };
  }

  // Cannot satisfy 80cm — fall back to default position. Warn if gap <70.
  const actualGap = defaultH - highestTop;
  if (actualGap < HANGER_MIN_GAP) {
    warnings.push({
      kind: 'rod_drawer_close',
      gap: actualGap,
      rodId: newId,
      drawerId: highestDrawer.id,
    });
  }
  return { rod: { type: 'rod', id: newId, heightFromFloor: roundCm(defaultH) }, warnings };
}

// ── Equal shelf distribution ──────────────────────────────────────────────────
// Shelves with isManuallyPositioned=true stay put.
// Auto shelves are distributed evenly inside the largest free zone.
// Free zones are computed by subtracting physical zones of drawers, rods and
// manual shelves from [0, containerH]. Non-shelf items are never moved.

interface Zone { lo: number; hi: number }

function computeFreeZones(
  blockers: InteriorItem[],
  containerH: number,
  shelfThickness: number,
): Zone[] {
  const occupied: Zone[] = [];
  for (const item of blockers) {
    if (item.type === 'drawer') {
      occupied.push({ lo: item.heightFromFloor, hi: item.heightFromFloor + item.drawerHeight });
    } else if (item.type === 'rod') {
      occupied.push({ lo: item.heightFromFloor - 1.5, hi: item.heightFromFloor + 1.5 });
    } else if (item.type === 'shelf') {
      // Manual shelf: physical zone [pos, pos + thickness]
      occupied.push({ lo: item.heightFromFloor, hi: item.heightFromFloor + shelfThickness });
    }
  }

  // Clamp to [0, containerH] and drop zero/negative-width zones
  const clamped = occupied
    .map(z => ({ lo: Math.max(0, z.lo), hi: Math.min(containerH, z.hi) }))
    .filter(z => z.hi > z.lo)
    .sort((a, b) => a.lo - b.lo);

  // Merge overlapping intervals
  const merged: Zone[] = [];
  for (const z of clamped) {
    const last = merged[merged.length - 1];
    if (!last || z.lo >= last.hi) {
      merged.push({ lo: z.lo, hi: z.hi });
    } else {
      last.hi = Math.max(last.hi, z.hi);
    }
  }

  // Gaps between merged intervals are the free zones
  const free: Zone[] = [];
  let cursor = 0;
  for (const occ of merged) {
    if (occ.lo > cursor) free.push({ lo: cursor, hi: occ.lo });
    cursor = occ.hi;
  }
  if (cursor < containerH) free.push({ lo: cursor, hi: containerH });

  // Fallback: if everything is occupied, treat the full container as free
  return free.length > 0 ? free : [{ lo: 0, hi: containerH }];
}

// ── Smart shelf distribution ──────────────────────────────────────────────────
// MIN_AUTO_SHELF_ZONE: zones smaller than this are skipped by auto distribution
// HANGER_DROP: recommended clearance below a rod for hanging clothes
// HANGER_MIN_GAP: minimum drawer-to-rod gap below which the rod is "inefficient"
// (constants and rod/drawer helpers are declared above near defaultDrawerPlacement)

export function redistributeShelves(
  items: InteriorItem[],
  containerH: number,
  shelfThickness = 1.8,
): { items: InteriorItem[]; warnings: ShelfWarning[] } {
  const warnings: ShelfWarning[] = [];

  const manual = items.filter(
    (i): i is ShelfItem => i.type === 'shelf' && i.isManuallyPositioned === true,
  );
  const auto = items.filter(
    (i): i is ShelfItem => i.type === 'shelf' && i.isManuallyPositioned !== true,
  );
  const others = items.filter(i => i.type !== 'shelf');

  if (auto.length === 0) return { items, warnings };

  // ── Rod-hanger logic ──────────────────────────────────────────────────────
  // The lowest rod defines a hanger zone; the first auto shelf is the hanger
  // floor — placed 80cm below the rod when possible.
  const rod = findLowestRod(others);
  let hangerShelf: ShelfItem | null = null;
  let remainingAuto = [...auto];

  if (rod) {
    const rodH = rod.heightFromFloor;
    if (rodH < HANGER_DROP) {
      warnings.push({ kind: 'rod_low', rodHeight: rodH, rodId: rod.id });
    } else {
      const drawer = findDrawerJustBelowRod(others, rodH);
      if (drawer) {
        const drawerTop = drawer.heightFromFloor + drawer.drawerHeight;
        const gap = rodH - drawerTop;

        if (gap < HANGER_MIN_GAP) {
          // <70: rod is too close to the drawer — inefficient as hanger.
          // The drawer top acts as the de-facto hanger floor (no extra shelf),
          // and the first auto shelf goes below the drawer when there is room.
          warnings.push({ kind: 'rod_drawer_close', gap, rodId: rod.id, drawerId: drawer.id });
          if (drawer.heightFromFloor > 0) {
            hangerShelf = { ...remainingAuto[0]!, heightFromFloor: drawer.heightFromFloor / 2 };
            remainingAuto = remainingAuto.slice(1);
          }
        } else if (gap < HANGER_DROP) {
          // 70–80: drawer top serves as the hanger floor; first shelf goes below it
          if (drawer.heightFromFloor > 0) {
            hangerShelf = { ...remainingAuto[0]!, heightFromFloor: drawer.heightFromFloor / 2 };
            remainingAuto = remainingAuto.slice(1);
          }
        } else {
          // ≥80: standard hanger — first shelf 80cm below rod
          hangerShelf = { ...remainingAuto[0]!, heightFromFloor: rodH - HANGER_DROP };
          remainingAuto = remainingAuto.slice(1);
        }
      } else {
        hangerShelf = { ...remainingAuto[0]!, heightFromFloor: rodH - HANGER_DROP };
        remainingAuto = remainingAuto.slice(1);
      }
    }
  }

  // ── Round-robin zone distribution ─────────────────────────────────────────
  // Blockers (drawers, rods, manual shelves, and the hanger shelf if placed)
  // define free zones. Zones ≥ 25cm receive auto shelves in round-robin order,
  // starting with the largest. Multiple shelves in one zone divide it evenly.
  const blockers: InteriorItem[] = [...others, ...manual];
  if (hangerShelf) blockers.push(hangerShelf);

  const allZones = computeFreeZones(blockers, containerH, shelfThickness);
  const validZones = allZones.filter(z => z.hi - z.lo >= MIN_AUTO_SHELF_ZONE);

  if (remainingAuto.length > 0) {
    for (const z of allZones) {
      const size = z.hi - z.lo;
      if (size > 0 && size < MIN_AUTO_SHELF_ZONE) {
        warnings.push({ kind: 'small_zone', zoneSize: size });
      }
    }
  }

  const placedShelves: ShelfItem[] = [];

  if (remainingAuto.length > 0) {
    const zonesToUse = validZones.length > 0 ? validZones : allZones;

    if (zonesToUse.length === 0) {
      const N = remainingAuto.length;
      for (let i = 0; i < N; i++) {
        placedShelves.push({
          ...remainingAuto[i]!,
          heightFromFloor: containerH * (i + 1) / (N + 1),
        });
      }
    } else {
      // Sort by size desc; on ties prefer the higher zone (larger lo)
      const sortedZones = [...zonesToUse].sort(
        (a, b) => (b.hi - b.lo) - (a.hi - a.lo) || b.lo - a.lo,
      );

      const zoneToShelves = new Map<number, ShelfItem[]>();
      for (let i = 0; i < remainingAuto.length; i++) {
        const zoneIdx = i % sortedZones.length;
        if (!zoneToShelves.has(zoneIdx)) zoneToShelves.set(zoneIdx, []);
        zoneToShelves.get(zoneIdx)!.push(remainingAuto[i]!);
      }

      for (const [zoneIdx, shelves] of zoneToShelves) {
        const zone = sortedZones[zoneIdx]!;
        const N = shelves.length;
        for (let j = 0; j < N; j++) {
          placedShelves.push({
            ...shelves[j]!,
            heightFromFloor: zone.lo + (zone.hi - zone.lo) * (j + 1) / (N + 1),
          });
        }
      }
    }
  }

  const finalShelves: ShelfItem[] = (hangerShelf
    ? [hangerShelf, ...placedShelves]
    : placedShelves
  ).map(s => ({ ...s, heightFromFloor: roundCm(s.heightFromFloor) }));

  return {
    items: [...others, ...manual, ...finalShelves],
    warnings,
  };
}

export function addShelfRedistributed(
  items: InteriorItem[],
  containerH: number,
): { items: InteriorItem[]; warnings: ShelfWarning[] } {
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
