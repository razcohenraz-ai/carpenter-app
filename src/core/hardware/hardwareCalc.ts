import type { HardwareRule, HardwareLineItem, FurnitureType } from "../../types";
import { HW_PRESETS } from "../../catalog/hardware";

/**
 * בונה רשימת חומרה לפריט רהיט לפי ערכת ברירת המחדל.
 *
 * הנתונים (מחירים, כמויות) נטענים מ-src/catalog/hardware/presets.json —
 * לעדכון ערכים ערוך את ה-JSON, אין צורך לגעת בקוד זה.
 *
 * @param type     - סוג הרהיט
 * @param numDoors - מספר הדלתות (כולל שורה עליונה בארון גבוה)
 * @param drawers  - מספר מגירות
 * @param shelves  - מספר מדפים
 * @returns רשימת פריטי חומרה עם כמות ועלות; פריטים בכמות 0 מסוננים
 */
export function buildHW(
  type: FurnitureType,
  numDoors: number,
  drawers: number,
  shelves: number,
): HardwareLineItem[] {
  // noUncheckedIndexedAccess returns HardwareRule[] | undefined even for FurnitureType keys.
  const rules: HardwareRule[] = HW_PRESETS[type] ?? HW_PRESETS.custom;

  return rules
    .map((rule): HardwareLineItem => {
      let qty = rule.fixed ?? 0;
      if      (rule.byDoor   !== undefined) qty = numDoors * rule.byDoor;
      else if (rule.byDrawer !== undefined) qty = drawers  * rule.byDrawer;
      else if (rule.byShelf  !== undefined) qty = shelves  * rule.byShelf;

      return {
        specId:    rule.specId,
        name:      rule.name,
        qty,
        unit:      rule.unit,
        unitPrice: rule.unitPrice,
        total:     qty * rule.unitPrice,
      };
    })
    .filter((item) => item.qty > 0);
}
