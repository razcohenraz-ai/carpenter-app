import type { Material, MaterialId } from "../types/materials";
import rawMaterials from "./materials.json";

// נתוני חומרי הגלם טעונים מ-materials.json.
// לעדכון מחירים, עובי, או הוספת חומר חדש — ערוך את הקובץ JSON בלבד.

const materialsArray = rawMaterials as Material[];

export const MATERIALS: Record<MaterialId, Material> = Object.fromEntries(
  materialsArray.map((m) => [m.id, m]),
) as Record<MaterialId, Material>;

/** מחזירה חומר לפי מזהה. זורקת שגיאה אם המזהה לא קיים בקטלוג. */
export function getMaterial(id: MaterialId): Material {
  const mat = MATERIALS[id];
  if (!mat) throw new Error(`חומר לא נמצא בקטלוג: ${id}`);
  return mat;
}
