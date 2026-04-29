// All dimensions in cm unless noted otherwise.

export interface Dimensions {
  W: number; // width
  H: number; // height
  D: number; // depth
}

// ── Shell / carcass structure ─────────────────────────────────────────────────

export interface ShellConfig {
  hasShell: boolean;
  tShell: number; // outer shell panel thickness, cm (e.g. 1.8 for 18mm)
  tBody: number;  // inner body panel thickness, cm (e.g. 1.8 for 18mm)
}

// ── Plinth (צוקל) ─────────────────────────────────────────────────────────────

export interface PlinthConfig {
  height: number;           // cm, 0 = no plinth
  doorCoversPlinth: boolean;// door starts 1cm above floor instead of at plinth top
}

// ── Box decomposition ─────────────────────────────────────────────────────────
// A single cabinet may be decomposed into multiple physical boxes
// (split by height > 200cm or width > 60/120cm).

/** מיקום אופקי של הקופסה */
export type BoxPosition = "single" | "left" | "right" | `unit_${number}`;

/** מיקום אנכי של הקופסה (רלוונטי לארון גבוה בלבד) */
export type BoxLevel = "single" | "bottom" | "top" | "plinth";

export interface Box {
  id: string;
  W: number; // cm
  H: number; // cm
  D: number; // cm
  /** מיקום אופקי — "single" | "left" | "right" | "unit_N" */
  position: BoxPosition;
  /** מיקום אנכי — "single" | "bottom" | "top" | "plinth" */
  level: BoxLevel;
  /** לקופסאות unit_N ו-unit plinth: המספר הסידורי (1-based) */
  unitIndex?: number;
  /** לקופסאות unit_N ו-unit plinth: סך הקופסאות בשורה זו */
  unitTotal?: number;
}

// ── Door calculation result ───────────────────────────────────────────────────

export interface DoorCalcResult {
  /** Number of door columns across the width */
  n: number;
  /** Width of each door panel, cm */
  doorW: number;
  /** 1 = single row, 2 = tall (lower + upper), 3 = three rows (lower + middle + top) */
  rows: 1 | 2 | 3;
  /** Distance from floor to bottom of door zone, cm */
  doorStart: number;
  /** Bottom row height (or only door height when rows=1), cm */
  lowerH: number;
  /** Middle/upper row height (rows≥2 only), cm */
  upperH: number | null;
  /** Top row height (rows=3 only), cm */
  topH: number | null;
  /** Total door count (n × rows) */
  total: number;
}
