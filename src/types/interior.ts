export type BodyLevel = 'single' | 'top' | 'middle' | 'bottom';

interface BaseInteriorItem {
  id: string;
  specId?: string; // future: Blum model ID, rail spec, etc.
}

export interface ShelfItem extends BaseInteriorItem {
  type: 'shelf';
  heightFromFloor: number; // cm from body bottom
  isManuallyPositioned?: boolean; // true once user has moved this shelf by hand
}

export interface DrawerItem extends BaseInteriorItem {
  type: 'drawer';
  heightFromFloor: number; // cm from body bottom to bottom of drawer
  drawerHeight: number;    // cm
}

export interface RodItem extends BaseInteriorItem {
  type: 'rod';
  heightFromFloor: number; // cm from body bottom
}

export type InteriorItem = ShelfItem | DrawerItem | RodItem;

export type InteriorByLevel = Partial<Record<BodyLevel, InteriorItem[]>>;

/** Interior items keyed by Box.id — the canonical per-box storage. */
export type InteriorById = Record<string, InteriorItem[]>;

/** Cell items for boxes with an internal partition.
 *  Key = Box.id, value = array of two cell item arrays: [rightCell, leftCell]. */
export type CellInteriorById = Record<string, InteriorItem[][]>;

export type InteriorWarning =
  | { kind: 'outOfBounds'; itemId: string }
  | { kind: 'drawerOverlap'; itemIds: [string, string] };

/** Warnings emitted by shelf-redistribution and default-placement logic.
 *  - small_zone: a free zone smaller than the auto-distribution minimum (25cm)
 *  - rod_low: rod placed below 80cm — no proper hanger drop possible
 *  - rod_drawer_close: drawer top is less than 70cm below rod (inefficient) */
export type ShelfWarning =
  | { kind: 'small_zone'; zoneSize: number }
  | { kind: 'rod_low'; rodHeight: number; rodId: string }
  | { kind: 'rod_drawer_close'; gap: number; rodId: string; drawerId: string };
