export type BodyLevel = 'single' | 'top' | 'middle' | 'bottom';

interface BaseInteriorItem {
  id: string;
  specId?: string; // future: Blum model ID, rail spec, etc.
}

export interface ShelfItem extends BaseInteriorItem {
  type: 'shelf';
  heightFromFloor: number; // cm from body bottom
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

export type InteriorWarning =
  | { kind: 'outOfBounds'; itemId: string }
  | { kind: 'drawerOverlap'; itemIds: [string, string] };
