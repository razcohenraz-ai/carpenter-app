import type { FurnitureType } from "../../types";

/**
 * מחשבת שעות עבודה משוערות עבור סוג רהיט נתון.
 *
 * נוסחאות לינאריות פשוטות — נועדו לאומדן ראשוני בלבד.
 *
 * @param type    - סוג הרהיט
 * @param drawers - מספר מגירות (משמעותי עבור cabinet ו-drawer_unit)
 * @param shelves - מספר מדפים (משמעותי עבור shelf)
 * @returns שעות עבודה משוערות
 */
export function laborHours(
  type: FurnitureType,
  drawers: number,
  shelves: number,
): number {
  // TODO(review): shelves is unused for cabinet/table/drawer_unit, and drawers
  // is unused for shelf/table. TypeScript won't flag this (params are referenced
  // in at least one branch) but the asymmetry is a latent issue.
  // Consider accepting a single options object: { type, drawers, shelves }.
  switch (type) {
    case "cabinet":     return 6 + drawers * 2;
    case "shelf":       return 3 + shelves * 0.5;
    case "table":       return 5;
    case "drawer_unit": return 4 + drawers * 1.5;
    default:            return 3;
  }
}
