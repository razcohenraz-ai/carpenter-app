import type { MaterialId } from './materials';

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

/** Drawer mount type:
 *  - `internal`: drawer sits behind the cabinet front; the door is unaffected.
 *  - `external`: drawer has its own face panel that is part of the cabinet
 *    facade; the door above is shortened to make room, and the drawer-front
 *    cut is produced separately. Multiple externals stack from the bottom. */
export type DrawerMount = 'internal' | 'external';

export interface DrawerItem extends BaseInteriorItem {
  type: 'drawer';
  heightFromFloor: number; // cm from body bottom to bottom of drawer
  drawerHeight: number;    // cm
  mount: DrawerMount;
  /** Per-drawer override of the global frontMaterial. Only meaningful when
   *  mount === 'external' (internal drawers have no facade panel). */
  frontThicknessOverride?: MaterialId;
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
 *  - small_zone: at least one pair of adjacent items is closer than 25cm
 *  - rod_low: rod placed below 80cm — no proper hanger drop possible
 *  - rod_drawer_close: drawer top is less than 70cm below rod (inefficient) */
export type ShelfWarning =
  | { kind: 'small_zone' }
  | { kind: 'rod_low'; rodHeight: number; rodId: string }
  | { kind: 'rod_drawer_close'; gap: number; rodId: string; drawerId: string };
