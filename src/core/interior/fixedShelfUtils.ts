import type { InteriorItem, ShelfItem, DrawerItem } from '../../types/interior';
import { newItemId, roundCm } from './interiorUtils';

// ── Fixed shelf above the external-drawer stack ──────────────────────────────
// When a body has external drawers, a single horizontal shelf sits above the
// topmost drawer — it serves as the cap of the drawer cavity and the floor of
// the area above it. This shelf is auto-generated when the user adds the first
// external drawer, repositions whenever externals change, disappears when the
// last external is removed, and — if the user deletes it manually — is **not**
// re-created (so the carpenter's choice is respected).
//
// Convention: `heightFromFloor` is the BOTTOM of the shelf (same as everywhere
// else in this module). The shelf's TOP coincides with the TOP of the topmost
// external drawer:
//   topOfHighestDrawer = sum(drawerHeights) + (N − 1) × gapCm
//   heightFromFloor    = topOfHighestDrawer − shelfThickness

/** Returns the topmost external-drawer top (cm from box bottom) and the bottom
 *  edge of the fixed shelf at the same level. Caller passes a non-empty list. */
export function calcFixedShelfHeight(
  externalDrawers: DrawerItem[],
  gapMm: number,
  shelfThickness: number,
): number {
  if (externalDrawers.length === 0) return 0;
  const gapCm = gapMm / 10;
  const sum = externalDrawers.reduce((s, d) => s + d.drawerHeight, 0);
  const topOfHighest = sum + (externalDrawers.length - 1) * gapCm;
  return roundCm(topOfHighest - shelfThickness);
}

export function hasFixedShelf(items: InteriorItem[]): boolean {
  return items.some(i => i.type === 'shelf' && i.isFixedAboveExternals === true);
}

export function findFixedShelf(items: InteriorItem[]): ShelfItem | undefined {
  return items.find(
    (i): i is ShelfItem => i.type === 'shelf' && i.isFixedAboveExternals === true,
  );
}

function externalDrawersOf(items: InteriorItem[]): DrawerItem[] {
  return items.filter(
    (i): i is DrawerItem => i.type === 'drawer' && i.mount === 'external',
  );
}

/** Reconciles the fixed shelf with the current external drawers.
 *
 *  Decision table (existing = does newItems already contain a fixed shelf):
 *  - newCount = 0 + existing      → remove the fixed shelf
 *  - newCount = 0 + !existing     → unchanged
 *  - newCount > 0 + existing      → update heightFromFloor to track the stack
 *  - newCount > 0 + !existing
 *      + first external (newCount=1, oldCount=0) → create a new fixed shelf
 *      + otherwise (user removed it manually)   → unchanged (respect choice)
 *
 *  The returned items array preserves the order of `newItems`; the fixed shelf
 *  is appended on creation. */
export function syncFixedShelf(
  oldItems: InteriorItem[],
  newItems: InteriorItem[],
  gapMm: number,
  shelfThickness: number,
): InteriorItem[] {
  const oldCount = externalDrawersOf(oldItems).length;
  const newExternals = externalDrawersOf(newItems);
  const newCount = newExternals.length;
  const existing = findFixedShelf(newItems);

  if (newCount === 0) {
    return existing ? newItems.filter(i => i.id !== existing.id) : newItems;
  }

  const newHeight = calcFixedShelfHeight(newExternals, gapMm, shelfThickness);

  if (existing) {
    return newItems.map(i =>
      i.id === existing.id && i.type === 'shelf'
        ? { ...i, heightFromFloor: newHeight }
        : i,
    );
  }

  // No existing fixed shelf. Only auto-create on the first external drawer
  // being added; otherwise treat the absence as a manual removal.
  if (newCount === 1 && oldCount === 0) {
    const fixed: ShelfItem = {
      type: 'shelf',
      id: newItemId(),
      heightFromFloor: newHeight,
      isFixedAboveExternals: true,
    };
    return [...newItems, fixed];
  }

  return newItems;
}
