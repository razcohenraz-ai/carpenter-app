import type { Box, BoxPosition, BoxLevel } from "../../types";
import { roundInternal } from "../utils/round";

// ── קבועים ───────────────────────────────────────────────────────────────────

/** רוחב מקסימלי לקופסה בודדת, ס"מ */
const MAX_BOX_W = 120;

/** גובה שמעליו מפצלים לקופסה עליונה ותחתונה (במצב auto), ס"מ */
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
  heightRole: "top" | "middle" | "bottom" | "single",
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
  const baseW = Math.floor(W / n * 1000) / 1000;

  return Array.from({ length: n }, (_, i): BoxProto => {
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
 * מפרקת ארון לקופסאות פיזיות לפי מגבלות מידות ומספר קומות.
 *
 * כללי פיצול גובה (doorsPerColumn):
 * - 'auto': פיצול ל-2 קומות אם H > MAX_BOX_H (200 ס"מ), אחרת קומה אחת
 * - 1: תמיד קומה אחת (גם אם H > 200)
 * - 2: תמיד 2 קומות (top + bottom), גם אם H ≤ 200
 * - 3: 3 קומות (top + middle + bottom), דורש lowerDoorH ו-middleDoorH
 *
 * הצוקל מקטין תמיד את הקומה התחתונה ביותר.
 */
export function decomposeBoxes(
  W: number,
  H: number,
  D: number,
  lowerDoorH?: number,
  plinthHeight: number = 0,
  doorsPerColumn: "auto" | 1 | 2 | 3 = "auto",
  middleDoorH?: number,
): Box[] {
  if (plinthHeight > 0 && plinthHeight >= H) {
    throw new Error(`plinthHeight (${plinthHeight}) must be less than H (${H})`);
  }

  const protos: BoxProto[] = [];

  // ── כמה קומות לגובה? ────────────────────────────────────────────────────────

  const needsSplit =
    doorsPerColumn === 1 ? false
    : doorsPerColumn === 2 ? true
    : doorsPerColumn === 3 ? true
    : H > MAX_BOX_H; // 'auto'

  if (!needsSplit) {
    // קומה אחת
    protos.push(...splitWidth(W, H - plinthHeight, D, "single"));

  } else if (doorsPerColumn === 3) {
    // 3 קומות: top + middle + bottom
    const lo = lowerDoorH !== undefined ? lowerDoorH
      : roundInternal(H * DEFAULT_HEIGHT_SPLIT_RATIO);
    const mid = middleDoorH;

    if (mid === undefined) {
      throw new Error("middleDoorH is required when doorsPerColumn=3");
    }
    if (lo + mid >= H) {
      throw new Error(
        `lowerDoorH (${lo}) + middleDoorH (${mid}) must be less than H (${H})`
      );
    }
    if (plinthHeight > 0 && plinthHeight >= lo) {
      throw new Error(`plinthHeight (${plinthHeight}) must be less than lowerDoorH (${lo})`);
    }

    const topH = H - lo - mid;
    protos.push(...splitWidth(W, topH,             D, "top"));
    protos.push(...splitWidth(W, mid,              D, "middle"));
    protos.push(...splitWidth(W, lo - plinthHeight, D, "bottom"));

  } else {
    // 2 קומות: top + bottom
    const lo = lowerDoorH !== undefined ? lowerDoorH
      : roundInternal(H * DEFAULT_HEIGHT_SPLIT_RATIO);

    if (plinthHeight > 0 && plinthHeight >= lo) {
      throw new Error(`plinthHeight (${plinthHeight}) must be less than lower door height (${lo})`);
    }

    const hiH = H - lo;
    protos.push(...splitWidth(W, hiH,             D, "top"));
    protos.push(...splitWidth(W, lo - plinthHeight, D, "bottom"));
  }

  // יחידות צוקל — תמיד בסוף הרשימה
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
