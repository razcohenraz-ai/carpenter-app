import type { CutItem, CutGroup, Material } from "../../types";
import { APP_DEFAULTS } from "../../types";

// TODO: consider exporting buildSheetUsage(cuts, mat): SheetUsage
//   that computes both total and byGroup in one pass.

/**
 * מחשבת מספר לוחות נדרשים עבור כל פריטי החיתוך.
 *
 * מדלגת על גבי דקים (פריטים שההערה שלהם מכילה "4mm" או "גב").
 * מוסיפה גורם בזבוז (ברירת מחדל 10%).
 *
 * @param cuts - רשימת החיתוכים; מידות w ו-h ב-מ"מ
 * @param mat  - חומר הגלם; sheetW ו-sheetH ב-ס"מ (מומרים ×10 לחישוב)
 * @returns מספר לוחות (מעוגל כלפי מעלה)
 */
export function sheetsNeeded(cuts: CutItem[], mat: Pick<Material, "sheetW" | "sheetH">): number {
  let area = 0;
  for (const c of cuts) {
    if (c.group === "back") continue;
    area += c.w * c.h * c.qty;
  }
  return Math.ceil(
    (area / (mat.sheetW * 10 * mat.sheetH * 10)) * APP_DEFAULTS.wasteFactor,
  );
}

/**
 * מחשבת מספר לוחות נדרשים עבור קבוצת חיתוך ספציפית בלבד.
 *
 * @param cuts  - רשימת החיתוכים המלאה
 * @param mat   - חומר הגלם
 * @param group - קבוצה לסינון (shell, body, door וכו')
 * @returns מספר לוחות לקבוצה זו (מעוגל כלפי מעלה)
 */
export function sheetsNeededByGroup(
  cuts: CutItem[],
  mat: Material,
  group: CutGroup,
): number {
  let area = 0;
  for (const c of cuts) {
    if (c.group === "back") continue;
    if (c.group !== group) continue;
    area += c.w * c.h * c.qty;
  }
  return Math.ceil(
    (area / (mat.sheetW * 10 * mat.sheetH * 10)) * APP_DEFAULTS.wasteFactor,
  );
}
