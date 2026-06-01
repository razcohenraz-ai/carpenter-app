// Hardware catalog and per-unit hardware list.

// ── Catalog ───────────────────────────────────────────────────────────────────

export type HardwareCategory =
  | "hinge"       // צירים
  | "slide"       // מסילות
  | "handle"      // ידיות
  | "cam"         // פלטות הרכבה (קונפירמט / cam-lock)
  | "screw"       // ברגים
  | "shelf_pin"   // שידות מדף
  | "back_panel"  // גבי לוחות
  | "other";

export type Manufacturer = "blum" | "hettich" | "grass" | "generic";

export interface HardwareSpec {
  id: string;
  manufacturer: Manufacturer;
  category: HardwareCategory;
  name: string;
  model?: string;
  unitPrice: number; // ₪
  unit: string;      // "יח'", "זוג", "לוח", "קופסה"

  // Physical parameters used for hole-drilling calculations
  drillingSpec?: HingeDrillingSpec | SlideDrillingSpec;
}

// ── Drilling specs ────────────────────────────────────────────────────────────
// These drive the future hole-calculation engine.

export interface HingeDrillingSpec {
  type: "hinge";
  cupDiameter: number;   // mm — standard 35mm for Blum
  cupDepth: number;      // mm
  boreOffsetFromEdge: number; // mm from door edge to cup centre
  mountingHoleDist: number;   // mm between mounting holes
}

export interface SlideDrillingSpec {
  type: "slide";
  bodyHeight: number;   // mm
  mountingHoleY: number[]; // distances from front, mm
}

// ── Per-unit hardware line ────────────────────────────────────────────────────

export interface HardwareLineItem {
  specId: string;       // references HardwareSpec.id
  name: string;         // display name (may be override)
  qty: number;
  unit: string;
  unitPrice: number;    // ₪
  total: number;        // ₪
}

// ── Presets ───────────────────────────────────────────────────────────────────
// A preset maps a furniture type to a list of hardware rules.
// qty multipliers: byDoor, byDrawer, byShelf, fixed

export interface HardwareRule {
  specId: string;
  name: string;
  unit: string;
  unitPrice: number;
  fixed?: number;          // fixed qty per unit
  byDoor?: number;         // multiplied by door count
  byDrawer?: number;       // multiplied by drawer count
  byShelf?: number;        // multiplied by shelf count
  byRod?: number;          // multiplied by hanging-rod count
}

export type FurnitureType = "cabinet" | "shelf" | "table" | "drawer_unit" | "custom";

export type HardwarePresets = Record<FurnitureType, HardwareRule[]>;
