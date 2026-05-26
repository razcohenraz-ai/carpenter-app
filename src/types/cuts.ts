// Cutting list — the output given to the saw operator.
// All w/h dimensions are in mm (standard for cut lists).

import type { MaterialId } from "./materials";

export type CutGroup =
  | "shell"    // outer envelope panels
  | "body"     // inner carcass panels
  | "door"     // door panels
  | "front"    // external-drawer face panels (part of the cabinet facade)
  | "drawer"   // drawer box parts (sides, back, bottom)
  | "back"     // back panels (usually 6mm)
  | "plinth";  // plinth / kick-board strips

export interface CutItem {
  name: string;
  qty: number;
  w: number;    // mm
  h: number;    // mm
  group?: CutGroup;
  note?: string; // e.g. "6mm", "מדף צף"
  /** Catalog material id that this piece is cut from. Drives the cut-list
   *  view grouping (one section per material). Optional: drawer-box parts
   *  use fixed thicknesses (12 mm sides, 6 mm bottom) outside the cabinet
   *  catalog, so they fall through to an "Other" group. */
  materialId?: MaterialId;
}

// ── Sheet usage summary ───────────────────────────────────────────────────────

export interface SheetUsage {
  /** Total sheets required (with waste factor applied) */
  total: number;
  byGroup: Partial<Record<CutGroup, number>>;
}
