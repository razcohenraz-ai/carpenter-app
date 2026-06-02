// Unit conventions (important!):
//   Cabinet/shelf dimensions  → cm
//   Panel thickness (tShell, tBody) → mm
//   Cut item dimensions (CutItem.w / .h) → mm
//   Sheet dimensions here → cm (converted ×10 when comparing to cut items)

export type MaterialId =
  | "mdf18"
  | "mdf12"
  | "plywood18"
  | "oak18"
  | "melamine18";

export interface Material {
  id: MaterialId;
  name: string;
  thickness: number;      // mm
  pricePerSheet: number;  // ₪
  sheetW: number;         // cm
  sheetH: number;         // cm
}

export interface CustomMaterial {
  id: string;            // prefix 'custom_' + nanoid
  name: string;
  thickness: number;     // mm
  pricePerSheet: number; // ₪
  sheetW: number;        // cm (default 244)
  sheetH: number;        // cm (default 122)
}

// הנתונים עצמם נמצאים ב-src/catalog/materials.json
// ייבא MATERIALS ו-getMaterial מ-src/catalog
