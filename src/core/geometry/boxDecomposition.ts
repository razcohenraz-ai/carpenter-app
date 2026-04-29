import type { Box, BoxPosition, BoxLevel } from "../../types";
import { roundInternal } from "../utils/round";

// ── קבועים ───────────────────────────────────────────────────────────────────

/** רוחב מקסימלי לקופסה בודדת, ס"מ */
const MAX_BOX_W = 120;

/** גובה שמעליו מפצלים לקופסה עליונה ותחתונה, ס"מ */
const MAX_BOX_H = 200;

/** יחס ברירת מחדל לגובה הקופסה התחתונה בפיצול גובה */
const DEFAULT_HEIGHT_SPLIT_RATIO = 0.45;

// ─────────────────────────────────────────────────────────────────────────────

interface BoxProto {
  W: number;
  H: number;
  D: number;
  label: string;
  note: string;
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
  const suffix =
    heightRole === "top" ? "עליונה" : heightRole === "bottom" ? "תחתונה" : "";
  const label = (part: string) => [part, suffix].filter(Boolean).join(" — ");

  if (W <= 60) {
    return [
      {
        W, H, D,
        label: label("קופסה יחידה"),
        note: "",
        position: "single",
        level: heightRole,
      },
    ];
  }

  if (W <= MAX_BOX_W) {
    const half = roundInternal(W / 2);
    return [
      { W: half, H, D, label: label("שמאל"), note: "חצי שמאלי", position: "left",  level: heightRole },
      { W: half, H, D, label: label("ימין"),  note: "חצי ימני",  position: "right", level: heightRole },
    ];
  }

  // W > MAX_BOX_W: מספר מינימלי של קופסאות, כל אחת ≤ MAX_BOX_W
  const n = Math.ceil(W / MAX_BOX_W);
  const baseW = Math.floor(W / n * 1000) / 1000; // floor ב-0.001 ס"מ

  return Array.from({ length: n }, (_, i): BoxProto => {
    // הקופסה האחרונה מקבלת את השארית — מבטיח סכום = W ללא תלות ב-floating-point
    const bW = i === n - 1 ? roundInternal(W - baseW * (n - 1)) : baseW;
    const partLabel = n > 2 ? `קופסה ${i + 1}` : i === 0 ? "שמאל" : "ימין";
    const position: BoxPosition = n > 2 ? (`unit_${i + 1}` as BoxPosition) : i === 0 ? "left" : "right";
    return {
      W: bW, H, D,
      label: label(partLabel),
      note: `${i + 1}/${n}`,
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
 * @param W          - רוחב כולל, ס"מ
 * @param H          - גובה כולל, ס"מ
 * @param D          - עומק, ס"מ
 * @param lowerDoorH - גובה הקופסה התחתונה בפיצול גובה, ס"מ
 *                     (אופציונלי; ברירת מחדל DEFAULT_HEIGHT_SPLIT_RATIO מ-H)
 * @returns מערך קופסאות Box עם id ייחודי, מידות ותפקיד
 */
export function decomposeBoxes(
  W: number,
  H: number,
  D: number,
  lowerDoorH?: number,
): Box[] {
  const protos: BoxProto[] = [];

  if (H > MAX_BOX_H) {
    const loH = lowerDoorH !== undefined ? lowerDoorH : roundInternal(H * DEFAULT_HEIGHT_SPLIT_RATIO);
    const hiH = H - loH;
    protos.push(...splitWidth(W, loH, D, "bottom"));
    protos.push(...splitWidth(W, hiH, D, "top"));
  } else {
    protos.push(...splitWidth(W, H, D, "single"));
  }

  return protos.map((p, i): Box => ({
    id: `box_${i}`,
    label: p.label,
    W: p.W,
    H: p.H,
    D: p.D,
    position: p.position,
    level: p.level,
    ...(p.note ? { note: p.note } : {}),
    ...(p.unitIndex !== undefined ? { unitIndex: p.unitIndex, unitTotal: p.unitTotal } : {}),
  }));
}
