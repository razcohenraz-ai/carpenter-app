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

/** גובה מינימלי לגוף עצמאי — פחות מכך מאחדים עם הגוף הסמוך */
const MIN_BODY_HEIGHT = 60;

// ─────────────────────────────────────────────────────────────────────────────

interface BoxProto {
  W: number;
  H: number;
  D: number;
  position: BoxPosition;
  level: BoxLevel;
  unitIndex?: number;
  unitTotal?: number;
  internalShelves?: number[];
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
 * doorsPerColumn:
 * - 'auto': פיצול ל-2 קומות אם H > MAX_BOX_H, אחרת קומה אחת
 * - 1: תמיד קומה אחת
 * - 2: תמיד 2 קומות
 * - 3: 3 קומות; גופים < MIN_BODY_HEIGHT (60 ס"מ) מאוחדים עם הסמוך
 *
 * איחוד גופים (doorsPerColumn=3 בלבד):
 * סריקה מלמעלה למטה — אם גוף < 60 ס"מ, מאחד עם הגוף שתחתיו.
 * הגוף המאוחד מקבל internalShelves עם הגבהים המוחלטים (מרצפה) של המחיצות הפנימיות.
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
    // ── 3 קומות + לוגיקת איחוד ──────────────────────────────────────────────

    const lo  = lowerDoorH !== undefined ? lowerDoorH
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
    const midH = mid;
    const botH = lo - plinthHeight;

    // גבהי מדפים מוחלטים (מרצפה) בין הקומות
    const SHELF_TOP_MID = lo + mid; // גבול עליון/אמצעי
    const SHELF_MID_BOT = lo;       // גבול אמצעי/תחתון

    interface BodyDef {
      H: number;
      level: "top" | "middle" | "bottom" | "single";
      shelves: number[];
    }

    let bodies: BodyDef[] = [
      { H: topH, level: "top",    shelves: [] },
      { H: midH, level: "middle", shelves: [] },
      { H: botH, level: "bottom", shelves: [] },
    ];
    let dividers = [SHELF_TOP_MID, SHELF_MID_BOT];

    // סריקה מלמעלה למטה: אם גוף[i] < MIN → מאחד עם גוף[i+1]
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < bodies.length - 1; i++) {
        if (bodies[i]!.H < MIN_BODY_HEIGHT) {
          const upper = bodies[i]!;
          const lower = bodies[i + 1]!;
          bodies.splice(i, 2, {
            H:      upper.H + lower.H,
            level:  upper.level,
            shelves: [...upper.shelves, dividers[i]!, ...lower.shelves],
          });
          dividers.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    // ליתר ביטחון: טיפול בגוף תחתון קטן (מאחד כלפי מעלה)
    if (bodies.length > 1) {
      const lastIdx = bodies.length - 1;
      if (bodies[lastIdx]!.H < MIN_BODY_HEIGHT) {
        const prev = bodies[lastIdx - 1]!;
        const last = bodies[lastIdx]!;
        bodies.splice(lastIdx - 1, 2, {
          H:      prev.H + last.H,
          level:  prev.level,
          shelves: [...prev.shelves, dividers[lastIdx - 1]!, ...last.shelves],
        });
        dividers.splice(lastIdx - 1, 1);
      }
    }

    // אם נשאר גוף אחד בלבד — מסמנים כ-single
    if (bodies.length === 1) bodies[0]!.level = "single";

    // בניית protos מהגופים הסופיים
    for (const body of bodies) {
      const bodyProtos = splitWidth(W, body.H, D, body.level);
      if (body.shelves.length > 0) {
        protos.push(...bodyProtos.map(p => ({ ...p, internalShelves: body.shelves })));
      } else {
        protos.push(...bodyProtos);
      }
    }

  } else {
    // ── 2 קומות: top + bottom ────────────────────────────────────────────────
    const lo = lowerDoorH !== undefined ? lowerDoorH
      : roundInternal(H * DEFAULT_HEIGHT_SPLIT_RATIO);

    if (plinthHeight > 0 && plinthHeight >= lo) {
      throw new Error(`plinthHeight (${plinthHeight}) must be less than lower door height (${lo})`);
    }

    protos.push(...splitWidth(W, H - lo,            D, "top"));
    protos.push(...splitWidth(W, lo - plinthHeight,  D, "bottom"));
  }

  // ── יחידות צוקל — תמיד בסוף ──────────────────────────────────────────────

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
    ...(p.internalShelves && p.internalShelves.length > 0
      ? { internalShelves: [...p.internalShelves].sort((a, b) => a - b) }
      : {}),
  }));
}
