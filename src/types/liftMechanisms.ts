// Lift-mechanism systems (Blum AVENTOS, …) for wall cabinets (קלפה).
//
// A LiftMechanismSpec is pure DATA (catalog/liftMechanisms.json). Unlike a drawer
// runner it has no box-dimensioning math — a wall cabinet's flap is the door
// itself. The spec just curates the family, its cabinet height/width envelope,
// its load rating, and a default price; the carpenter picks one per wall cabinet
// and the hardware list emits a priced line (one set per flap).

export type LiftMechanismManufacturer = 'blum' | 'hettich' | 'grass' | 'generic';

/** One lift-mechanism system. Dimensions in mm. */
export interface LiftMechanismSpec {
  id: string;
  name: string;
  family: string;            // e.g. 'AVENTOS'
  manufacturer: LiftMechanismManufacturer;
  /** Supported cabinet (carcass) height range, mm — outside it the app warns. */
  cabinetHeightMm: { min: number; max: number };
  /** Max cabinet width, mm — above it the app warns (Blum: a 2nd unit needed). */
  maxCabinetWidthMm: number;
  /** Max front (flap) load, kg — spec/informational (no auto weight check yet). */
  maxLoadKg: number;
  /** Default price (₪) of one mechanism set; the carpenter overrides it in
   *  Settings. Edit the JSON to change the default. */
  priceShekel: number;
}

export type LiftMechanismCatalog = Record<string, LiftMechanismSpec>;
