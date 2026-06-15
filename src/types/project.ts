import type { CabinetInput } from './cabinet';
import type { Edging } from './edging';
import type { InteriorItem } from './interior';
import type { MaterialId } from './materials';

// ── Stable identifiers ────────────────────────────────────────────────────────

/** Stable identity of a body's logical "slot" in the cabinet, assigned at
 *  the slot's FIRST appearance and preserved across `calculate()` rebuilds.
 *  Opaque string — NOT derived from `box.level`/`position`/`unitIndex`, so a
 *  future feature that changes the order or derivation of units cannot
 *  mistakenly link an override (interior, partition, door choice) to a
 *  different slot. Mirrors the role of `Board.stableId` for boards.
 *  Maintained by `useCabinet` via a `boxStableKey → BoxSlotId` map. */
export type BoxSlotId = string;

/** `${BoxSlotId}:${frontIndex}` — identifies a single door panel within a
 *  body. `frontIndex` is the same RTL-ordered index used by `Door`. */
export type DoorSlotKey = string;

// ── Saved per-door state ──────────────────────────────────────────────────────

/** Saved subset of a hinge — only the fields the user controls. `id` is
 *  not saved; deserialize regenerates ids via `newItemId()` since hinge
 *  identity only matters within its parent door. */
export interface SavedHinge {
  positionFromBottom: number;
  isManual: boolean;
}

/** Saved subset of a door — only the fields the user controls. `height`,
 *  `width`, `coversSkirt`, and `gapMm` are derived in `calculate()` from
 *  `CabinetInput` + the box geometry, so they are not saved. */
export interface SavedDoor {
  hingeSide: 'right' | 'left';
  hingeCount: number | 'auto';
  hinges: SavedHinge[];
  hasDoor: boolean;
  thicknessOverride?: MaterialId;
}

// ── Saved per-board override ──────────────────────────────────────────────────

/** Persistent shape of `BoardOverrides` (from `core/boards/boardModel.ts`).
 *  Duplicated here so `types/` stays free of `core/` dependencies; the
 *  shapes are kept in sync deliberately. If `BoardOverrides` changes,
 *  bump {@link Project.schemaVersion} and add a migration. */
export interface SavedBoardOverride {
  dimensions?: Partial<Record<'length' | 'width' | 'thickness', number>>;
  materialId?: MaterialId;
  /** Per-board edging override — wins over the per-body and cabinet-wide
   *  layers. Infrastructure only at this stage; no UI surfaces it yet. */
  edging?: Edging;
}

// ── Saved cabinet state (user choices, keyed by stable ids) ───────────────────

/** Everything the user has chosen that survives `calculate()` rebuilds.
 *  Derived state (`result`, `displayNumbers`, `numFrontsPerBox`,
 *  `frontLayoutByRow`, `drawerFrontsById`, all `*Ref` mirrors) is NOT
 *  included — it is recomputed from {@link CabinetInput} + this state. */
export interface SavedCabinetState {
  /** Per-body interior items, keyed by {@link BoxSlotId}. */
  interior: Record<BoxSlotId, InteriorItem[]>;
  /** Per-partitioned-body cell interior, keyed by {@link BoxSlotId}.
   *  Each value is a length-2 array `[leftCellItems, rightCellItems]`. */
  cellInterior: Record<BoxSlotId, InteriorItem[][]>;
  /** Partition presence per body, keyed by {@link BoxSlotId}. */
  partitions: Record<BoxSlotId, boolean>;
  /** Per-door user choices, keyed by {@link DoorSlotKey}. */
  doors: Record<DoorSlotKey, SavedDoor>;
  /** Plinth gable x overrides (cm), keyed by `PlinthGable.id`
   *  (e.g. `edge-left`, `joint:0`). */
  plinthGableOverrides: Record<string, number>;
  /** Board dimension/material/edging overrides, keyed by `Board.stableId`. */
  boardOverrides: Record<string, SavedBoardOverride>;
  /** Per-body edging override, keyed by {@link BoxSlotId}. Wins over the
   *  cabinet-wide default; loses to a per-board override. Optional — absent
   *  in projects saved before edging was introduced. */
  bodyEdgingOverrides?: Record<BoxSlotId, Edging>;
  /** Per-door edging override, keyed by {@link DoorSlotKey}. Same precedence
   *  as `bodyEdgingOverrides` but applied to door/drawer-front panels in
   *  the door cut-emission path. Optional. */
  doorEdgingOverrides?: Record<DoorSlotKey, Edging>;
  /** Per-body W/H/D dimension overrides, keyed by {@link BoxSlotId}.
   *  Only axes explicitly set by the user are present. Optional. */
  boxDimensionOverrides?: Record<BoxSlotId, { W?: number; H?: number; D?: number }>;
}

// ── Cabinet content (input + saved state) ─────────────────────────────────────

export interface Cabinet {
  /** The 16 form values that drive `calculate()`. */
  input: CabinetInput;
  /** Persistent user-choice state, keyed by stable ids. */
  state: SavedCabinetState;
}

// ── Product types ─────────────────────────────────────────────────────────────

/** The kind of furniture unit in a project. All types share the same
 *  decomposition engine; each type has different default inputs and will
 *  expose different construction options over time. */
export type ProductType =
  | 'wardrobe'   // ארון
  | 'bookcase'   // ספריה
  | 'sideboard'  // מזנון
  | 'kitchen'    // מטבח
  | 'free-build'; // בנייה חופשית

/** A single cabinet body inside a kitchen product. */
export interface KitchenUnit {
  /** Unique id within the kitchen product. */
  id: string;
  /** Carpenter-visible label (e.g. "מגירות 60", "כיור"). */
  name: string;
  /** Which preset this unit was created from (for display only). */
  moduleType: string;
  cabinet: Cabinet;
}

/** One furniture unit inside a project. */
export interface ProductUnit {
  /** Unique id — stable across renames and reorders. */
  id: string;
  /** Carpenter-visible name (e.g. "ארון חדר שינה"). */
  name: string;
  productType: ProductType;
  /** Cabinet data — used for all product types except 'kitchen'. */
  cabinet: Cabinet;
  /** Kitchen units — only present when productType === 'kitchen'.
   *  Each entry is one cabinet body in the kitchen row. */
  kitchenUnits?: KitchenUnit[];
}

// ── Room layout (floor plan) ──────────────────────────────────────────────────

/** Per-room coordinate system (three.js-compatible, right-handed, Y-up, cm):
 *  origin at the back-left floor corner; X = width along the back wall;
 *  Y = height (floor → ceiling); Z = depth (back wall → forward). Every view
 *  (top / elevation / 3D) is a projection of this single frame. */

/** Where a product sits inside a room. `position` is the CENTRE of the
 *  product's footprint on the floor (rotation pivots around it); `y` is
 *  optional and defaults to 0 (the product's base rests on the floor).
 *  `rotationDeg` rotates around the vertical (Y) axis — 0 = facing +Z
 *  (forward, away from the back wall); 90/180/270 turn it toward the other
 *  walls. Centre + pivot-around-centre matches how a 3D mesh is placed. */
export interface ProductPlacement {
  /** → {@link ProductUnit.id} of the product positioned here. */
  productId: string;
  position: { x: number; z: number; y?: number };
  rotationDeg: number;
  /** Snap hint for the UI only — the wall the product is anchored to. The
   *  source of truth for geometry is `position` + `rotationDeg`. */
  anchorWall?: 'north' | 'south' | 'east' | 'west';
  /** cm from the wall's start corner (x=0 for north/south, z=0 for east/west).
   *  Persisted so the offset input survives navigation away and back. */
  anchorOffset?: number;
}

/** A rectangular room measured at the client's home. References products from
 *  the flat {@link Project.products} list by id via `placements` — a placement
 *  only positions a product, it does not own it. */
export interface Room {
  id: string;
  name: string;
  /** cm. X axis — along the back wall. */
  width: number;
  /** cm. Z axis — front-to-back. */
  depth: number;
  /** cm. Y axis — floor to ceiling. */
  height: number;
  placements: ProductPlacement[];
}

// ── Project wrapper (cloud-save envelope) ─────────────────────────────────────

/** The outermost envelope for a saved project. Designed so cloud save can
 *  treat a project as a single document. `schemaVersion` enables the
 *  migration framework in `core/project/migrations.ts`; `createdAt` and
 *  `updatedAt` are maintained automatically by the serializer. */
export interface Project {
  schemaVersion: number;
  /** Project name — shown on the project landing page. Required from v2. */
  projectName: string;
  /** ISO 8601 — assigned by the serializer on first save. */
  createdAt?: string;
  /** ISO 8601 — refreshed by the serializer on every save. */
  updatedAt?: string;
  /** All furniture units in this project (ordered by insertion). */
  products: ProductUnit[];
  /** Rooms with product placements (floor plan). Optional — absent in
   *  projects saved before the room feature (schema < 3). */
  rooms?: Room[];
}

// ── App-level constants ───────────────────────────────────────────────────────

export const APP_DEFAULTS = {
  laborRate: 180,    // ₪/hour
  wasteFactor: 1.10,
  maxDoorWidth: 60,  // cm — split into 2 doors above this
  tallThreshold: 180,// cm — add second row of doors above this door-area height
} as const;
