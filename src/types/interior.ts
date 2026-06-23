import type { MaterialId } from './materials';

export type BodyLevel = 'single' | 'top' | 'middle' | 'bottom';

interface BaseInteriorItem {
  id: string;
  specId?: string; // future: Blum model ID, rail spec, etc.
}

export interface ShelfItem extends BaseInteriorItem {
  type: 'shelf';
  heightFromFloor: number; // cm from body bottom — bottom edge of the shelf
  isManuallyPositioned?: boolean; // true once user has moved this shelf by hand
  /** true for the auto-generated fixed shelf above an external-drawer stack.
   *  Such shelves are derived from drawer geometry, never participate in
   *  redistribution, and are not user-draggable. Manual removal is respected
   *  (the shelf will not be re-created automatically while externals remain). */
  isFixedAboveExternals?: boolean;
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
  /** Chosen drawer-runner system id (catalog/runners.json). When set, the
   *  drawer BOX parts (sides/front/back/bottom) are sized from that runner. */
  runnerId?: string;
  /** Carpenter's drawer side-panel thickness (mm); defaults to the runner's
   *  max. */
  drawerSideThicknessMm?: number;
  /** Carpenter's drawer bottom thickness T (mm) = the groove. */
  drawerBottomThicknessMm?: number;
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
