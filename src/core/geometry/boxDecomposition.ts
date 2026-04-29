import type { Box, BoxPosition, BoxLevel } from "../../types";
import { roundInternal } from "../utils/round";

// ── קבועים ───────────────────────────────────────────────────────────────────

/** רוחב מקסימלי לקופסה בודדת, ס"מ */
const MAX_BOX_W = 120;

/** גובה שמעליו מפצלים לקופסה עליונה ותחתונה, ס"מ */
const MAX_BOX_H = 200;

/** רוחב מקסימלי ליחידת צוקל בודדת, ס"מ */
const MAX_PLINTH_W = 240;

/** יחס ברירת מחדל לגובה הקופסה התחתונה בפיצול גובה */
const DEFAULT_HEIGHT_SPLIT_RATIO = 0.45;

// ─────────────────────────────────────────────────────────────────────────────

interface BoxProto {
  W: number;
  H: number;
  D: number;
  position: BoxPosition;
  level: BoxLevel;
  unitIndex?: number;
  unitTotal?: number;
}

function splitWidth(
  W: number,
  H: number,
  D: number,
  heightRole: "top" | "bottom" | "single",
): BoxProto[] {
  if (W <= 60) {
    return [{ W, H, D, position: "single", level: heightRole }];
  }

  if (W <= MAX_BOX_W) {
    const half = roundInternal(W / 2);
    return [
      { W: half, H, D, position: "left",  level: heightRole },
      { W: half, H, D, position: "right", level: heightRole },
    ];
  }

  // W > MAX_BOX_W: מספר מינימלי של קופסאות, כל אחת ≤ MAX_BOX_W
  const n = Math.ceil(W / MAX_BOX_W);
  const baseW = Math.floor(W / n * 1000) / 1000; // floor ב-0.001 ס"מ

  return Array.from({ length: n }, (_, i): BoxProto => {
    // הקופסה האחרונה מקבלת את השארית — מבטיח סכום = W ללא תלות ב-floating-point
    const bW = i === n - 1 ? roundInternal(W - baseW * (n - 1)) : baseW;
    const position: BoxPosition = n > 2 ? (`unit_${i + 1}` as BoxPosition) : i === 0 ? "left" : "right";
    return {
      W: bW, H, D,
      position,
      level: heightRole,
      ...(n > 2 ? { unitIndex: i + 1, unitTotal: n } : {}),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * מפרקת ארון לקופסאות פיזיות לפי מגבלות מידות.
 *
 * כללי הפיצול:
 * - גובה > MAX_BOX_H (200 ס"מ) → קופסה תחתונה ועליונה
 * - 60 < רוחב ≤ MAX_BOX_W (120 ס"מ) → 2 קופסאות שוות
 * - רוחב > MAX_BOX_W → מספר מינימלי של קופסאות (כל אחת ≤ MAX_BOX_W)
 * - רוחב ≤ 60 ס"מ → קופסה בודדת
 *
 * הצוקל הוא יחידה פיזית נפרדת שיושבת מתחת לקופסה התחתונה (או היחידה).
 * גובה הקופסה התחתונה מקוצר ב-plinthHeight; הקופסה העליונה לא מושפעת.
 *
 * @param W            - רוחב כולל, ס"מ
 * @param H            - גובה כולל (כולל הצוקל), ס"מ
 * @param D            - עומק, ס"מ
 * @param lowerDoorH   - גובה אזור הדלת התחתונה בפיצול גובה, ס"מ
 *                       (אופציונלי; ברירת מחדל DEFAULT_HEIGHT_SPLIT_RATIO מ-H)
 * @param plinthHeight - גובה הצוקל, ס"מ (ברירת מחדל 0 = ללא צוקל)
 * @returns מערך קופסאות Box עם id ייחודי, מידות ותפקיד
 */
export function decomposeBoxes(
  W: number,
  H: number,
  D: number,
  lowerDoorH?: number,
  plinthHeight: number = 0,
): Box[] {
  if (plinthHeight > 0 && plinthHeight >= H) {
    throw new Error(`plinthHeight (${plinthHeight}) must be less than H (${H})`);
  }

  const protos: BoxProto[] = [];

  if (H > MAX_BOX_H) {
    const loH = lowerDoorH !== undefined ? lowerDoorH : roundInternal(H * DEFAULT_HEIGHT_SPLIT_RATIO);
    if (plinthHeight > 0 && plinthHeight >= loH) {
      throw new Error(`plinthHeight (${plinthHeight}) must be less than lower door height (${loH})`);
    }
    const hiH = H - loH;
    protos.push(...splitWidth(W, hiH, D, "top"));
    protos.push(...splitWidth(W, loH - plinthHeight, D, "bottom"));
  } else {
    protos.push(...splitWidth(W, H - plinthHeight, D, "single"));
  }

  // יחידות צוקל — תמיד בסוף הרשימה, אחרי כל הקופסאות הרגילות
  if (plinthHeight > 0) {
    const n = Math.ceil(W / MAX_PLINTH_W);
    if (n === 1) {
      protos.push({ W, H: plinthHeight, D, position: "single", level: "plinth" });
    } else {
      const baseW = Math.floor(W / n * 1000) / 1000;
      for (let i = 0; i < n; i++) {
        const pW = i === n - 1 ? roundInternal(W - baseW * (n - 1)) : baseW;
        const position: BoxPosition =
          n === 2 ? (i === 0 ? "left" : "right") : (`unit_${i + 1}` as BoxPosition);
        protos.push({
          W: pW, H: plinthHeight, D,
          position,
          level: "plinth",
          ...(n > 2 ? { unitIndex: i + 1, unitTotal: n } : {}),
        });
      }
    }
  }

  return protos.map((p, i): Box => ({
    id: `box_${i}`,
    W: p.W,
    H: p.H,
    D: p.D,
    position: p.position,
    level: p.level,
    ...(p.unitIndex !== undefined ? { unitIndex: p.unitIndex, unitTotal: p.unitTotal } : {}),
  }));
}
