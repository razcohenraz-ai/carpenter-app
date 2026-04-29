// ── קבועי דיוק (יחידות: מ"מ) ──────────────────────────────────────────────────

/** דיוק חישוב פנימי: 0.01 מ"מ — מבטיח שגיאת floating-point זניחה */
export const INTERNAL_PRECISION_MM = 0.01;

/** דיוק פלט ל-CNC ולדוחות: 0.1 מ"מ — הסטנדרט של רוב מכונות CNC */
export const OUTPUT_PRECISION_MM = 0.1;

/** דיוק קלט מהמשתמש: 0.1 מ"מ — מאפשר הזנת מימדי מסילות וחירורים */
export const INPUT_PRECISION_MM = 0.1;

// ── פונקציות עיגול ────────────────────────────────────────────────────────────

/**
 * עיגול גנרי ל-precision כלשהו.
 * משתמש ב-Math.round(1/precision) כדי להימנע מ-1/0.1 = 9.999... ב-JS.
 */
export const round = (v: number, precision: number): number => {
  const f = Math.round(1 / precision);
  return Math.round(v * f) / f;
};

/**
 * עיגול לחישובים פנימיים — 0.001 ס"מ = 0.01 מ"מ.
 * לשימוש בכל חישובי גאומטריה שעובדים ב-ס"מ (boxDecomposition, doorCalc, cuttingList).
 */
export const roundInternal = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * עיגול לפלט CNC — 0.1 מ"מ.
 * לשימוש לפני כתיבה ל-CutItem.w/h, לדוחות, ולכל פלט חיצוני.
 */
export const roundOutput = (v: number): number => Math.round(v * 10) / 10;
