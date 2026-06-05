import type { DoorCalcResult } from "../../types";
import { APP_DEFAULTS } from "../../types";
import { roundInternal } from "../utils/round";

// ── קבועים ───────────────────────────────────────────────────────────────────
// שנה כאן אם כללי הרווחים השתנו; אין מספרי קסם בתוך הפונקציה.

/** מרחק מהרצפה לתחתית הדלת כשהדלת מכסה את הצוקל, ס"מ.
 *  זהו רווח רצפה פיזי (clearance להגבהות), לא תלוי ב-doorGapMm. */
const DOOR_FLOOR_GAP_CM = 1;

/** יחס ברירת מחדל לגובה שורת הדלתות התחתונה בארון גבוה */
const DEFAULT_LOWER_DOOR_RATIO = 0.45;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * מחשבת את גאומטריית הדלתות לפתח הארון.
 *
 * @param W               - רוחב חיצוני כולל, ס"מ
 * @param H               - גובה חיצוני כולל, ס"מ
 * @param plinth          - גובה הצוקל, ס"מ (0 = ללא צוקל)
 * @param doorCoversPlinth - האם הדלת מכסה את הצוקל (מתחילה DOOR_FLOOR_GAP_CM מהרצפה)
 * @param lowerH          - גובה שורת דלתות תחתונה בארון גבוה, ס"מ
 *                          (אופציונלי; ברירת מחדל: DEFAULT_LOWER_DOOR_RATIO מגובה אזור הדלתות)
 * @param hasShell        - האם הארון בנוי ממעטפת חיצונית + גוף פנימי
 * @param tShell          - עובי לוח המעטפת, ס"מ (למשל 1.8 עבור לוח 18 מ"מ)
 * @returns תוצאת חישוב הדלתות: מספר, מידות, שורות (1 או 2)
 */
export function calcDoors(
  W: number,
  H: number,
  plinth: number,
  doorCoversPlinth: boolean,
  lowerH: number | undefined,
  hasShell: boolean,
  tShell: number,
  forceRows?: 1 | 2 | 3,
  /** רווח אחיד בין הדלת לקצוות (טופ, צוקל) ובין שורות, ס"מ. ברירת מחדל 0.2
   *  לתאימות לאחור; production callers מעבירים `input.doorGapMm / 10`. */
  gapCm: number = 0.2,
): DoorCalcResult {
  const innerW = hasShell ? W - tShell * 2 : W;
  const n = Math.ceil(innerW / APP_DEFAULTS.maxDoorWidth);
  const doorW = roundInternal(innerW / n);

  const doorStart = doorCoversPlinth
    ? DOOR_FLOOR_GAP_CM
    : plinth > 0
    ? plinth - gapCm
    : gapCm;

  const doorAreaH = H - doorStart - gapCm;
  const isTall = forceRows !== undefined
    ? forceRows > 1
    : doorAreaH > APP_DEFAULTS.tallThreshold;

  if (!isTall || forceRows === 1) {
    return {
      n,
      doorW,
      rows: 1,
      doorStart,
      lowerH: roundInternal(doorAreaH),
      upperH: null,
      topH: null,
      total: n,
    };
  }

  // Row gap = 2× the standard gap (top of lower door + bottom of upper door).
  const rowGap = 2 * gapCm;
  if (forceRows === 3) {
    const lo = lowerH !== undefined ? lowerH : roundInternal(doorAreaH / 3);
    const remaining = roundInternal(doorAreaH - lo - rowGap * 2);
    const mid = roundInternal(remaining / 2);
    const top = roundInternal(remaining - mid);
    return { n, doorW, rows: 3, doorStart, lowerH: lo, upperH: mid, topH: top, total: n * 3 };
  }

  const lo = lowerH !== undefined ? lowerH : roundInternal(doorAreaH * DEFAULT_LOWER_DOOR_RATIO);
  const up = roundInternal(doorAreaH - lo - rowGap);
  return { n, doorW, rows: 2, doorStart, lowerH: lo, upperH: up, topH: null, total: n * 2 };
}
