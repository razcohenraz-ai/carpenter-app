import type { CutItem, FurnitureType } from "../../types";
import type { Edging } from "../../types/edging";
import { calcDoors } from "../doors/doorCalc";
import { getDoorHeight } from "../doors/doorUtils";
import { computeRowFrontLayout } from "../geometry/frontGeometry";
import { roundInternal, roundOutput } from "../utils/round";

// ── קבועים (מ"מ אלא אם צוין אחרת) ──────────────────────────────────────────
// כל "מספר קסם" קיבל שם. שנה כאן בלבד.

/** רווח ברירת מחדל לרוחב דלת כשאין gap מוגדר (overlay על הגוף), מ"מ */
const DOOR_WIDTH_REVEAL_MM = 2;

/** רווח ברירת מחדל לגובה דלת כשאין gap מוגדר, מ"מ */
const DOOR_HEIGHT_REVEAL_MM = 2;

/** שיעור גובה אזור המגירות מתוך הגובה הזמין של הגוף */
const DRAWER_HEIGHT_RATIO = 0.4;

/** קיצור עומק לוח צד מגירה (לשיקוע המסילה), מ"מ */
const DRAWER_SIDE_DEPTH_REDUCTION_MM = 40;

/** קיצור גובה לוח צד ולוח גב מגירה (פינוי לתחתית), מ"מ */
const DRAWER_SIDE_HEIGHT_REDUCTION_MM = 30;

/** קיצור רוחב לוח גב ותחתית מגירה (לשקע הצדדים), מ"מ */
const DRAWER_BACK_WIDTH_REDUCTION_MM = 50;

/** רוחב רגל שולחן, מ"מ */
const TABLE_LEG_WIDTH_MM = 70;

/** גובה תיפוף (apron) שולחן, מ"מ */
const TABLE_APRON_HEIGHT_MM = 80;

// עזר: המרה ס"מ → מ"מ (כל מידות הקלט הן ס"מ; הפלט ב-CutItem הוא מ"מ)
const cm = (v: number) => v * 10;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * מייצרת רשימת חיתוכים (cutting list) עבור פריט רהיטים.
 *
 * יחידות קלט:  כל המידות ב-ס"מ, כולל tShell ו-tBody (למשל 1.8 עבור לוח 18 מ"מ).
 * יחידות פלט:  CutItem.w / .h ב-מ"מ (המרה ×10 מתבצעת בפנים).
 *
 * @param type             - סוג הרהיט
 * @param W                - רוחב, ס"מ
 * @param H                - גובה, ס"מ
 * @param D                - עומק, ס"מ
 * @param shelves          - מספר מדפים
 * @param drawers          - מספר מגירות
 * @param hasBack          - האם יש גב
 * @param plinth           - גובה הצוקל, ס"מ (0 = ללא)
 * @param doorCoversPlinth - האם הדלת מכסה את הצוקל
 * @param lowerH           - גובה שורת דלתות תחתונה בארון גבוה, ס"מ (אופציונלי)
 * @param hasShell         - האם הארון בנוי ממעטפת חיצונית + גוף פנימי
 * @param tShell           - עובי לוח מעטפת, ס"מ (ברירת מחדל 1.8 = 18 מ"מ)
 * @param tBody            - עובי לוח גוף פנימי, ס"מ (ברירת מחדל 1.8 = 18 מ"מ)
 * @param doorGapMm        - רווח בין דלתות לדפנות, מ"מ (ברירת מחדל 0)
 * @returns מערך פריטי חיתוך עם שם, כמות, מידות ב-מ"מ וקבוצה
 */
export function calcCuts(
  type: FurnitureType,
  W: number,
  H: number,
  D: number,
  shelves: number,
  drawers: number,
  hasBack: boolean,
  plinth: number,
  doorCoversPlinth: boolean,
  lowerH: number | undefined,
  hasShell: boolean,
  tShell = 1.8,
  tBody = 1.8,
  doorGapMm = 0,
  hasEnvelopeTop = false,
  tFront = 1.8,
  maxDoorWidth = 60,
  /** Cabinet-wide edging applied as a perimeter band to every door panel
   *  (and to internal-drawer fronts emitted for non-cabinet furniture
   *  types). Optional — when omitted the cut dimensions are emitted at the
   *  raw door size, matching pre-edging behavior. Per-door overrides are
   *  not threaded here yet: the door cuts in this path are anonymous
   *  (`qty=frontsPerRow`), so a per-door override would need a different
   *  emission strategy. */
  edging?: Edging,
): CutItem[] {
  const cuts: CutItem[] = [];
  // Perimeter band deduction in mm: 2× thickness (the band wraps both sides
  // of every dimension). Zero when no edging is provided.
  const perimMm = edging ? 2 * edging.thickness : 0;

  if (type === "cabinet") {
    const d = calcDoors(W, H, plinth, doorCoversPlinth, lowerH, hasShell, tShell, undefined, doorGapMm / 10);

    // ── קורפוס + מעטפת + צוקל + גב + מדפים ─────────────────────────────────
    // הוסר. כל לוחות הקורפוס מגיעים כעת מ-`buildBoardModel` (קרא ב-useCabinet).
    // `calcCuts` מייצר רק את החזיתות — דלתות ומגירות — שלא חלק מ-BoardModel
    // עדיין. השדות `shelves`, `hasBack`, `tShell`, `hasEnvelopeTop` נשארים על
    // הסיגנטורה לתאימות לאחור אך לא משפיעים על הקורפוס.
    void shelves; void hasBack; void hasEnvelopeTop; void tBody;

    // ── דלתות ─────────────────────────────────────────────────────────────────
    // Door width is sourced from the cabinet-level front layout (see
    // `core/geometry/frontGeometry.ts`): all fronts in the cabinet share a
    // single width, with one gap on every side and between every pair.
    //
    // Horizontal splitting matches useCabinet: first split by MAX_BOX_W=100,
    // then split each box-column by maxDoorWidth.
    const MAX_BOX_W_CM = 100;
    const innerW = hasShell ? W - tShell * 2 : W;
    const numBoxCols = Math.ceil(innerW / MAX_BOX_W_CM);
    const colW = innerW / numBoxCols;
    const numFrontsPerCol = Math.max(1, Math.ceil(colW / maxDoorWidth));
    const frontsPerRow = numBoxCols * numFrontsPerCol;
    // cuttingList operates on a single-row cabinet (no body decomposition);
    // each row has the same fronts as the cabinet has columns.
    const cabinetLayout = computeRowFrontLayout({
      cabinetW: W,
      hasOuterShell: hasShell,
      shellThicknessCm: tShell,
      totalFrontsInRow: frontsPerRow,
      gapCm: doorGapMm / 10,
    });
    const frontW_mm = cm(cabinetLayout.frontWidth);

    const topReduction = (hasEnvelopeTop && hasShell) ? tFront : 0;
    const lowerBoxH = d.rows === 1 ? (H - plinth) - topReduction : d.lowerH - plinth;
    // Bottom/single-row door rests on the plinth — no lower clearance needed.
    const lowerHasBottomGap = !(plinth > 0 && !doorCoversPlinth);
    // Single box owns its top gap; bottom box of a multi-row split does not
    // (the box above already owns the shared boundary gap).
    const lowerHasTopGap = d.rows === 1;
    const doorName = d.rows === 1 ? "דלת" : "דלת תחתונה";
    cuts.push({
      name: doorName,
      qty: frontsPerRow,
      w: frontW_mm - perimMm,
      h: cm(getDoorHeight(lowerBoxH, doorGapMm, lowerHasBottomGap, lowerHasTopGap)) - perimMm,
      group: "door",
    });
    if (d.rows >= 2 && d.upperH !== null) {
      const upperBoxH = (H - d.lowerH) - (d.rows === 2 ? topReduction : 0);
      // Top box (rows=2) owns its top gap; middle box (rows=3) does not.
      const upperHasTopGap = d.rows === 2;
      cuts.push({
        name: d.rows === 3 ? "דלת אמצעית" : "דלת עליונה",
        qty: frontsPerRow,
        w: frontW_mm - perimMm,
        h: cm(getDoorHeight(upperBoxH, doorGapMm, true, upperHasTopGap)) - perimMm,
        group: "door",
      });
    }
    if (d.rows === 3 && d.topH !== null) {
      const topBoxH = (H - d.lowerH - (d.upperH ?? 0)) - topReduction;
      cuts.push({
        name: "דלת עליונה",
        qty: frontsPerRow,
        w: frontW_mm - perimMm,
        h: cm(getDoorHeight(topBoxH, doorGapMm)) - perimMm,
        group: "door",
      });
    }

    // ── מגירות ────────────────────────────────────────────────────────────────
    if (drawers > 0) {
      const refH  = hasShell ? H - tShell : H;
      const avail = plinth > 0 ? refH - plinth : refH;
      const dh    = roundInternal((avail * DRAWER_HEIGHT_RATIO) / drawers);
      const refW  = hasShell ? W - tShell * 2 : W;

      cuts.push({ name: "חזית מגירה",  qty: drawers,     w: cm(refW) - DOOR_WIDTH_REVEAL_MM,            h: cm(dh) - DOOR_HEIGHT_REVEAL_MM,            group: "drawer" });
      cuts.push({ name: "צד מגירה",    qty: drawers * 2, w: cm(D)    - DRAWER_SIDE_DEPTH_REDUCTION_MM,   h: cm(dh) - DRAWER_SIDE_HEIGHT_REDUCTION_MM,  group: "drawer", note: "12mm" });
      cuts.push({ name: "גב מגירה",    qty: drawers,     w: cm(refW) - DRAWER_BACK_WIDTH_REDUCTION_MM,   h: cm(dh) - DRAWER_SIDE_HEIGHT_REDUCTION_MM,  group: "drawer", note: "12mm" });
      cuts.push({ name: "תחתית מגירה", qty: drawers,     w: cm(refW) - DRAWER_BACK_WIDTH_REDUCTION_MM,   h: cm(D)  - DRAWER_SIDE_DEPTH_REDUCTION_MM,   group: "drawer", note: "6mm"  });
    }

  } else if (type === "shelf") {
    cuts.push({ name: "צד",  qty: 2,          w: cm(D),             h: cm(H) });
    cuts.push({ name: "מדף", qty: shelves + 2, w: cm(W - tBody * 2), h: cm(D) });
    if (hasBack) {
      cuts.push({ name: "גב", qty: 1, w: cm(W), h: cm(H), note: "4mm", group: "back" });
    }

  } else if (type === "table") {
    const legReduction = TABLE_LEG_WIDTH_MM * 2;
    cuts.push({ name: "משטח",        qty: 1, w: cm(W),                  h: cm(D)                 });
    cuts.push({ name: "רגל",         qty: 4, w: TABLE_LEG_WIDTH_MM,     h: cm(H - tBody)          });
    cuts.push({ name: "תיפוף אורכי", qty: 2, w: cm(W) - legReduction,   h: TABLE_APRON_HEIGHT_MM  });
    cuts.push({ name: "תיפוף רוחבי", qty: 2, w: cm(D) - legReduction,   h: TABLE_APRON_HEIGHT_MM  });

  } else if (type === "drawer_unit") {
    const dh = roundOutput(cm(H) / Math.max(drawers, 1));
    cuts.push({ name: "צד",           qty: 2,           w: cm(D),                                   h: cm(H)                                     });
    cuts.push({ name: "חזית מגירה",   qty: drawers,     w: cm(W) - DOOR_WIDTH_REVEAL_MM,             h: dh - DOOR_HEIGHT_REVEAL_MM,                group: "drawer" });
    cuts.push({ name: "צד מגירה",     qty: drawers * 2, w: cm(D) - DRAWER_SIDE_DEPTH_REDUCTION_MM,   h: dh - DRAWER_SIDE_HEIGHT_REDUCTION_MM,      group: "drawer", note: "12mm" });
    cuts.push({ name: "גב מגירה",     qty: drawers,     w: cm(W) - DRAWER_BACK_WIDTH_REDUCTION_MM,   h: dh - DRAWER_SIDE_HEIGHT_REDUCTION_MM,      group: "drawer", note: "12mm" });
    cuts.push({ name: "תחתית מגירה",  qty: drawers,     w: cm(W) - DRAWER_BACK_WIDTH_REDUCTION_MM,   h: cm(D) - DRAWER_SIDE_DEPTH_REDUCTION_MM,    group: "drawer", note: "6mm"  });
    if (hasBack) {
      cuts.push({ name: "גב", qty: 1,
        w: cm(W - tBody * 2), h: cm(H - tBody * 2),
        note: "6mm", group: "back" });
    }

  } else {
    // custom
    cuts.push({ name: "לוח ראשי", qty: 1, w: cm(W), h: cm(H) });
    if (D > 0) {
      cuts.push({ name: "לוח צד", qty: 2, w: cm(D), h: cm(H) });
    }
  }

  return cuts;
}
