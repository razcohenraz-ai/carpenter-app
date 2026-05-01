import type { Dimensions, ShellConfig, PlinthConfig } from "./geometry";
import type { InteriorByLevel } from "./interior";
import type { MaterialId } from "./materials";
import type { FurnitureType } from "./hardware";

// ── Cabinet unit ──────────────────────────────────────────────────────────────
// One piece of furniture in the project. A unit may decompose into
// multiple physical boxes (see Box in geometry.ts).

export interface CabinetUnit {
  id: string;
  label: string;              // user-facing name, e.g. "ארון בגדים שמאלי"
  type: FurnitureType;

  dimensions: Dimensions;     // cm
  shell: ShellConfig;         // mm for thicknesses
  plinth: PlinthConfig;       // cm for height
  hasBack: boolean;

  /** Material used for the main body and shell */
  bodyMaterialId: MaterialId;
  /** Material used for doors (may differ) */
  doorMaterialId: MaterialId;

  /** Interior items per body level. */
  interiorByLevel: InteriorByLevel;

  /**
   * Manual override for where a tall cabinet splits into upper/lower.
   * Corresponds to the lowerH param in calcDoors / decomposeBoxes.
   * undefined = use the automatic 45% rule.
   */
  lowerDoorH?: number;        // cm
}

// ── Pricing summary ───────────────────────────────────────────────────────────

export interface PriceSummary {
  sheets: number;
  materialCost: number; // ₪
  hardwareCost: number; // ₪
  laborHours: number;
  laborCost: number;    // ₪
  total: number;        // ₪
}

// ── Project ───────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  clientName?: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  units: CabinetUnit[];

  /** Global labor rate ₪/hour, overrides the app default */
  laborRate?: number;

  /** Global waste factor (1.10 = 10% waste), overrides the app default */
  wasteFactor?: number;
}

// ── App-level constants ───────────────────────────────────────────────────────

export const APP_DEFAULTS = {
  laborRate: 180,    // ₪/hour
  wasteFactor: 1.10,
  maxDoorWidth: 60,  // cm — split into 2 doors above this
  tallThreshold: 180,// cm — add second row of doors above this door-area height
} as const;
