// Cutting list — the output given to the saw operator.
// All w/h dimensions are in mm (standard for cut lists).

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
}

// ── Sheet usage summary ───────────────────────────────────────────────────────

export interface SheetUsage {
  /** Total sheets required (with waste factor applied) */
  total: number;
  byGroup: Partial<Record<CutGroup, number>>;
}
