// Interior layout of a single box/carcass.

// ── Element positions (set manually or via drag-and-drop) ────────────────────
// y is always measured from the floor of the box upwards, in cm.

export interface ShelfPosition {
  y: number; // cm from floor to shelf surface
}

export interface DrawerPosition {
  y: number; // cm from floor to bottom of drawer
  h: number; // drawer height, cm
}

export interface RodPosition {
  y: number; // cm from floor to rod centre
}

export type FreeformElement =
  | { type: "shelf";  y: number }
  | { type: "drawer"; y: number; h: number }
  | { type: "rod";    y: number };

// ── Hinge side (door swing direction) ────────────────────────────────────────

export type HingeSide = "left" | "right" | "double";

// ── Interior mode ─────────────────────────────────────────────────────────────

export type InteriorMode =
  | "shelves"   // fixed or drag-positioned shelves
  | "drawers"   // drawer stack
  | "hanging"   // hanging rods
  | "mixed"     // hanging on top + drawers on bottom
  | "freeform"; // any combination, fully manual

// ── Full interior configuration for one box ──────────────────────────────────

export interface InteriorConfig {
  mode: InteriorMode;
  hingeSide: HingeSide;

  // Counts (used when customLayout = false)
  shelves: number;
  drawers: number;
  hangingRods: number;

  // When true, positions below override the counts
  customLayout: boolean;
  shelfPositions?: ShelfPosition[];
  drawerPositions?: DrawerPosition[];
  rodPositions?: RodPosition[];

  // Uniform drawer height override
  customDrawerH: boolean;
  drawerH: number; // cm, used when customDrawerH = true

  // Mixed mode: how much of the box height is the drawer section (from bottom)
  mixedDrawerSectionH: number; // cm

  // Freeform mode elements
  elements?: FreeformElement[];
}

export const defaultInteriorConfig = (): InteriorConfig => ({
  mode: "shelves",
  hingeSide: "left",
  shelves: 2,
  drawers: 0,
  hangingRods: 1,
  customLayout: false,
  customDrawerH: false,
  drawerH: 20,
  mixedDrawerSectionH: 50,
});
