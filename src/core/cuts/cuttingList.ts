import type { CutItem, FurnitureType } from "../../types";
import { calcDoors } from "../doors/doorCalc";
import { getDoorHeight, getDoorWidth } from "../doors/doorUtils";
import { roundInternal, roundOutput } from "../utils/round";

// ── קבועים (מ"מ אלא אם צוין אחרת) ──────────────────────────────────────────
// כל "מספר קסם" קיבל שם. שנה כאן בלבד.

/** רווח רוחב לכל צד של מדף צף (הפחתה כוללת = ×1 מכל צד), מ"מ */
const SHELF_WIDTH_REVEAL_MM = 2;

/** קיצור עומק מדף צף (מאפשר הוצאה ללא חיכוך), מ"מ */
const SHELF_DEPTH_REVEAL_MM = 20;

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
): CutItem[] {
  const cuts: CutItem[] = [];

  if (type === "cabinet") {
    const d = calcDoors(W, H, plinth, doorCoversPlinth, lowerH, hasShell, tShell);

    if (hasShell) {
      // ── מעטפת חיצונית ────────────────────────────────────────────────────
      // כל מידות הגוף הפנימי נגזרות מהממדים החיצוניים פחות עובי המעטפת.
      // tShell ב-ס"מ → החיסור מתקיים ביחידות עקביות.
      const iW = W - tShell * 2; // רוחב פנימי
      const iH = H - tShell;     // גובה פנימי (מעטפת רק מלמעלה — גוף יושב על הרצפה)
      const iD = D - tShell;     // עומק פנימי

      cuts.push({ name: "מעטפת — צד שמאל", qty: 1, w: cm(D),  h: cm(H),  group: "shell" });
      cuts.push({ name: "מעטפת — צד ימין", qty: 1, w: cm(D),  h: cm(H),  group: "shell" });
      cuts.push({ name: "מעטפת — טופ",      qty: 1, w: cm(iW), h: cm(D),  group: "shell" });
      if (hasEnvelopeTop) {
        cuts.push({ name: "מעטפת תקרה", qty: 1, w: cm(iW), h: cm(D), group: "shell" });
      }

      // ── גוף פנימי ─────────────────────────────────────────────────────────
      cuts.push({ name: "גוף פנימי — צד שמאל", qty: 1, w: cm(iD),             h: cm(iH),           group: "body" });
      cuts.push({ name: "גוף פנימי — צד ימין", qty: 1, w: cm(iD),             h: cm(iH),           group: "body" });
      cuts.push({ name: "גוף פנימי — עליון",    qty: 1, w: cm(iW - tBody * 2), h: cm(iD),           group: "body" });
      cuts.push({ name: "גוף פנימי — תחתון",   qty: 1, w: cm(iW - tBody * 2), h: cm(iD),
                  ...(plinth > 0 ? { note: `מגובה ${plinth} ס"מ` } : {}),                            group: "body" });

      if (plinth > 0) {
        cuts.push({ name: "גוף פנימי — צוקל קדמי",  qty: 1, w: cm(iW - tBody * 2), h: cm(plinth), group: "plinth" });
        cuts.push({ name: "גוף פנימי — צוקל אחורי", qty: 1, w: cm(iW - tBody * 2), h: cm(plinth), group: "plinth" });
      }
      if (shelves > 0) {
        cuts.push({ name: "גוף פנימי — מדף", qty: shelves,
          w: cm(iW - tBody * 2) - SHELF_WIDTH_REVEAL_MM,
          h: cm(iD) - SHELF_DEPTH_REVEAL_MM,
          note: "מדף צף", group: "body" });
      }
      if (hasBack) {
        cuts.push({ name: "גוף פנימי — גב", qty: 1,
          w: cm(iW - tBody * 2), h: cm(iH - tBody * 2),
          note: "6mm", group: "back" });
      }

    } else {
      // ── קרקס קלאסי (ללא מעטפת) ──────────────────────────────────────────
      cuts.push({ name: "צד שמאל", qty: 1, w: cm(D),             h: cm(H) });
      cuts.push({ name: "צד ימין", qty: 1, w: cm(D),             h: cm(H) });
      cuts.push({ name: "עליון",   qty: 1, w: cm(W - tBody * 2), h: cm(D) });
      cuts.push({ name: "תחתון",   qty: 1, w: cm(W - tBody * 2), h: cm(D),
                  ...(plinth > 0 ? { note: `מגובה ${plinth} ס"מ` } : {}) });
      if (plinth > 0) {
        cuts.push({ name: "לוח צוקל קדמי",  qty: 1, w: cm(W - tBody * 2), h: cm(plinth), group: "plinth" });
        cuts.push({ name: "לוח צוקל אחורי", qty: 1, w: cm(W - tBody * 2), h: cm(plinth), group: "plinth" });
      }
      if (shelves > 0) {
        cuts.push({ name: "מדף פנימי", qty: shelves,
          w: cm(W - tBody * 2) - SHELF_WIDTH_REVEAL_MM,
          h: cm(D) - SHELF_DEPTH_REVEAL_MM,
          note: "מדף צף" });
      }
      if (hasBack) {
        cuts.push({ name: "גב", qty: 1,
          w: cm(W - tBody * 2), h: cm(H - tBody * 2),
          note: "6mm", group: "back" });
      }
    }

    // ── דלתות ─────────────────────────────────────────────────────────────────
    // Panel dimensions align with getDoorWidth/getDoorHeight in doorUtils.ts.
    // hasEnvelopeTop reduces the effective height of the top/single-level box.
    //
    // Horizontal splitting matches useCabinet: first split by MAX_BOX_W=100,
    // then split each box-column by maxDoorWidth.
    const MAX_BOX_W_CM = 100;
    const innerW = hasShell ? W - tShell * 2 : W;
    const numBoxCols = Math.ceil(innerW / MAX_BOX_W_CM);
    const colW = innerW / numBoxCols;
    const numFrontsPerCol = Math.max(1, Math.ceil(colW / maxDoorWidth));
    const frontW_mm = cm(getDoorWidth(colW, numFrontsPerCol, doorGapMm));
    const frontsPerRow = numBoxCols * numFrontsPerCol;

    const topReduction = (hasEnvelopeTop && hasShell) ? tFront : 0;
    const lowerBoxH = d.rows === 1 ? (H - plinth) - topReduction : d.lowerH - plinth;
    // Bottom/single-row door rests on the plinth — no lower clearance needed.
    const lowerHasBottomGap = !(plinth > 0 && !doorCoversPlinth);
    const doorName = d.rows === 1 ? "דלת" : "דלת תחתונה";
    cuts.push({
      name: doorName,
      qty: frontsPerRow,
      w: frontW_mm,
      h: cm(getDoorHeight(lowerBoxH, doorGapMm, lowerHasBottomGap)),
      group: "door",
    });
    if (d.rows >= 2 && d.upperH !== null) {
      const upperBoxH = (H - d.lowerH) - (d.rows === 2 ? topReduction : 0);
      cuts.push({
        name: d.rows === 3 ? "דלת אמצעית" : "דלת עליונה",
        qty: frontsPerRow,
        w: frontW_mm,
        h: cm(getDoorHeight(upperBoxH, doorGapMm)),
        group: "door",
      });
    }
    if (d.rows === 3 && d.topH !== null) {
      const topBoxH = (H - d.lowerH - (d.upperH ?? 0)) - topReduction;
      cuts.push({
        name: "דלת עליונה",
        qty: frontsPerRow,
        w: frontW_mm,
        h: cm(getDoorHeight(topBoxH, doorGapMm)),
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
