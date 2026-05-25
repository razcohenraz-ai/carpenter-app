import { describe, it, expect } from "vitest";
import { calcCuts } from "./cuttingList";
import { getDoorHeight } from "../doors/doorUtils";

// עזר: חיפוש פריט לפי שם
const find = (cuts: ReturnType<typeof calcCuts>, name: string) =>
  cuts.find((c) => c.name === name);

describe("calcCuts — cabinet קלאסי", () => {
  // W=80, H=180, D=60, ללא כלום
  const base = () =>
    calcCuts("cabinet", 80, 180, 60, 0, 0, false, 0, false, undefined, false);

  // הערה: בדיקות לוחות קורפוס (צד, עליון, תחתון, מדף, גב, צוקל, מעטפת)
  // הוסרו — כל הלוחות האלה מגיעים כעת מ-`buildBoardModel` ולא מ-`calcCuts`.
  // ראה `src/core/boards/boardModel.test.ts` לכיסוי המקביל.

  it("מכיל דלת אחת (n=2 כי 80>60)", () => {
    const cuts = base();
    const door = cuts.find((c) => c.name.startsWith("דלת"))!;
    expect(door.qty).toBe(2); // 2 דלתות על רוחב 80
  });

  it("עם מגירה — מייצר 4 סוגי חלקי מגירה", () => {
    const cuts = calcCuts("cabinet", 80, 180, 60, 0, 2, false, 0, false, undefined, false);
    expect(find(cuts, "חזית מגירה")).toBeDefined();
    expect(find(cuts, "צד מגירה")).toBeDefined();
    expect(find(cuts, "גב מגירה")).toBeDefined();
    expect(find(cuts, "תחתית מגירה")).toBeDefined();
    // 2 מגירות × 2 צדדים = 4 לוחות צד
    expect(find(cuts, "צד מגירה")!.qty).toBe(4);
  });

  it("תיקון ISSUE-006: כל חלקי המגירה מקבלים group='drawer'", () => {
    const cuts = calcCuts("cabinet", 80, 180, 60, 0, 2, false, 0, false, undefined, false);
    const drawerParts = ["חזית מגירה", "צד מגירה", "גב מגירה", "תחתית מגירה"];
    drawerParts.forEach((name) => {
      expect(find(cuts, name)!.group).toBe("drawer");
    });
  });
});

describe("calcCuts — shelf", () => {
  it("מדפייה עם 3 מדפים — 2 צדדים + 5 מדפים (כולל עליון ותחתון)", () => {
    const cuts = calcCuts("shelf", 80, 200, 40, 3, 0, false, 0, false, undefined, false);
    expect(find(cuts, "צד")!.qty).toBe(2);
    expect(find(cuts, "מדף")!.qty).toBe(5); // shelves+2 = 3+2
  });
});

describe("calcCuts — table", () => {
  it("שולחן — 4 רגליים ו-4 לוחות תיפוף", () => {
    const cuts = calcCuts("table", 120, 75, 60, 0, 0, false, 0, false, undefined, false);
    expect(find(cuts, "רגל")!.qty).toBe(4);
    expect(find(cuts, "תיפוף אורכי")!.qty).toBe(2);
    expect(find(cuts, "תיפוף רוחבי")!.qty).toBe(2);
  });

  it("משטח בגודל נכון", () => {
    const cuts = calcCuts("table", 120, 75, 60, 0, 0, false, 0, false, undefined, false);
    const top = find(cuts, "משטח")!;
    expect(top.w).toBe(1200);
    expect(top.h).toBe(600);
  });
});

describe("calcCuts — drawer_unit", () => {
  it("יחידת מגירות — כמות חזיתות שווה למספר המגירות", () => {
    const cuts = calcCuts("drawer_unit", 60, 80, 55, 0, 3, false, 0, false, undefined, false);
    expect(find(cuts, "חזית מגירה")!.qty).toBe(3);
    expect(find(cuts, "צד מגירה")!.qty).toBe(6); // 3×2
  });

  it("תיקון ISSUE-006: חלקי מגירה ב-drawer_unit גם עם group='drawer'", () => {
    const cuts = calcCuts("drawer_unit", 60, 80, 55, 0, 3, false, 0, false, undefined, false);
    const drawerParts = ["חזית מגירה", "צד מגירה", "גב מגירה", "תחתית מגירה"];
    drawerParts.forEach((name) => {
      expect(find(cuts, name)!.group).toBe("drawer");
    });
  });
});

// "calcCuts — cabinet עם מעטפת" — כל הבדיקות הוסרו. לוחות מעטפת + גוף פנימי
// מגיעים כעת מ-`buildBoardModel`. בדיקות התיקון של ISSUE-001 (מעטפת במידות
// חיצוניות, גוף בממדים פנימיים) מכוסות ב-`boardModel.test.ts` דרך תרחישי
// rabbet/butt + envelope flags.

describe("calcCuts — custom", () => {
  it("custom עם D>0 — לוח ראשי + 2 לוחות צד", () => {
    const cuts = calcCuts("custom", 100, 80, 40, 0, 0, false, 0, false, undefined, false);
    expect(find(cuts, "לוח ראשי")).toBeDefined();
    expect(find(cuts, "לוח צד")!.qty).toBe(2);
  });

  it("custom עם D=0 — רק לוח ראשי", () => {
    const cuts = calcCuts("custom", 100, 80, 0, 0, 0, false, 0, false, undefined, false);
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.name).toBe("לוח ראשי");
  });
});

describe("calcCuts — envelope top (מעטפת תקרה)", () => {
  // ארון שורה אחת — H=60, צוקל 10 → box.H=50
  // plinth=10, doorCoversPlinth=false → 1 gap (bottom on plinth)
  const singleRow = (hasEnvelopeTop: boolean) =>
    calcCuts("cabinet", 60, 60, 60, 0, 0, false, 10, false, undefined,
             true, 1.8, 1.8, 2, hasEnvelopeTop, 1.8);

  it("ללא תקרה: דלת = 50 − 0.2 = 49.8 (רווח עליון בלבד)", () => {
    const door = find(singleRow(false), "דלת")!;
    expect(door.h).toBeCloseTo(498); // 49.8 × 10
  });

  it("עם תקרה 18מ\"מ: דלת = 48.2 − 0.2 = 48.0 (רווח עליון בלבד)", () => {
    const door = find(singleRow(true), "דלת")!;
    expect(door.h).toBeCloseTo(480); // 48.0 × 10
  });

  it("תקרה מקצרת דלת ב-18מ\"מ", () => {
    const diff = find(singleRow(false), "דלת")!.h - find(singleRow(true), "דלת")!.h;
    expect(diff).toBeCloseTo(18);
  });

  // לוח "מעטפת תקרה" עצמו עבר ל-BoardModel; הבדיקות שמודדות את ההשפעה על
  // גובה הדלת נשמרו (`getDoorHeight` עדיין מתחשב ב-envelope-top).

  // ארון 2 קומות — H=220, צוקל 10, קומה תחתונה 170
  // קומה עליונה box.H=50 — תמיד 2 רווחים (לא מושפעת מהצוקל)
  const twoRow = (hasEnvelopeTop: boolean) =>
    calcCuts("cabinet", 60, 220, 60, 0, 0, false, 10, false, 170,
             true, 1.8, 1.8, 2, hasEnvelopeTop, 1.8);

  it("2 קומות ללא תקרה: דלת עליונה = 50 − 0.4 = 49.6 (2 רווחים)", () => {
    const door = find(twoRow(false), "דלת עליונה")!;
    expect(door.h).toBeCloseTo(496); // 49.6 × 10
  });

  it("2 קומות עם תקרה: דלת עליונה = 48.2 − 0.4 = 47.8 (2 רווחים)", () => {
    const door = find(twoRow(true), "דלת עליונה")!;
    expect(door.h).toBeCloseTo(478); // 47.8 × 10
  });

  it("2 קומות: תקרה מקצרת דלת עליונה ב-18מ\"מ, לא משפיעה על דלת תחתונה", () => {
    const withTop    = twoRow(true);
    const withoutTop = twoRow(false);
    const upperDiff = find(withoutTop, "דלת עליונה")!.h - find(withTop, "דלת עליונה")!.h;
    const lowerDiff = find(withoutTop, "דלת תחתונה")!.h - find(withTop, "דלת תחתונה")!.h;
    expect(upperDiff).toBeCloseTo(18);
    expect(lowerDiff).toBeCloseTo(0);
  });

  // תקרה ללא מעטפת — לא אמורה להשפיע
  it("תקרה ללא מעטפת חיצונית — אין השפעה על גובה הדלת", () => {
    const withoutShell    = calcCuts("cabinet", 60, 60, 60, 0, 0, false, 10, false, undefined,
                                     false, 1.8, 1.8, 2, true, 1.8);
    const withoutBothTop  = calcCuts("cabinet", 60, 60, 60, 0, 0, false, 10, false, undefined,
                                     false, 1.8, 1.8, 2, false, 1.8);
    const d1 = withoutShell.find(c => c.name.startsWith("דלת"))!;
    const d2 = withoutBothTop.find(c => c.name.startsWith("דלת"))!;
    expect(d1.h).toBeCloseTo(d2.h);
  });
});

describe("calcCuts — door gap (doorGapMm)", () => {
  // W=60 → n=ceil(60/60)=1 door, H=180, plinth=0
  const door = (gapMm: number) => {
    const cuts = calcCuts("cabinet", 60, 180, 60, 0, 0, false, 0, false, undefined, false, 1.8, 1.8, gapMm);
    return cuts.find((c) => c.name.startsWith("דלת"))!;
  };

  it("gap=2mm: width = (60 − 2×0.2) × 10 = 596mm", () => {
    expect(door(2).w).toBeCloseTo(596);
  });

  it("gap=1mm: width = (60 − 2×0.1) × 10 = 598mm", () => {
    expect(door(1).w).toBeCloseTo(598);
  });

  it("gap=0: width = 60×10 = 600mm (no deduction)", () => {
    expect(door(0).w).toBeCloseTo(600);
  });

  it("gap=2mm: height = getDoorHeight(180, 2) × 10 = 1796mm", () => {
    expect(door(2).h).toBeCloseTo(getDoorHeight(180, 2) * 10);
  });

  it("gap=1mm: height = getDoorHeight(180, 1) × 10 = 1798mm", () => {
    expect(door(1).h).toBeCloseTo(getDoorHeight(180, 1) * 10);
  });

  it("gap=0: height = 180×10 = 1800mm (no structural reveals deducted)", () => {
    expect(door(0).h).toBeCloseTo(1800);
  });

  it("cut height equals door.height stored in Door state (getDoorHeight formula)", () => {
    const gapMm = 2;
    const boxH   = 180; // H − plinth for plinth=0
    const expected = getDoorHeight(boxH, gapMm) * 10;
    expect(door(gapMm).h).toBeCloseTo(expected);
  });
});

describe("calcCuts — plinth gap correction (תיקון רווח תחתון עם צוקל)", () => {
  // א. צוקל=0, תקרה ומעטפת — 2 רווחים
  it("א. צוקל=0: box.H=100, תקרה → effectiveH=98.2, 2 רווחים → 97.8 ס\"מ", () => {
    const cuts = calcCuts("cabinet", 60, 100, 60, 0, 0, false, 0, false, undefined,
                          true, 1.8, 1.8, 2, true, 1.8);
    const d = cuts.find(c => c.name.startsWith("דלת"))!;
    expect(d.h).toBeCloseTo(978); // (98.2 − 0.4) × 10
  });

  // ב. צוקל=10, לא מכסה — 1 רווח בלבד (הבאג שתוקן)
  it("ב. צוקל=10, לא מכסה צוקל: box.H=88.2, 1 רווח → 88.0 ס\"מ", () => {
    const cuts = calcCuts("cabinet", 60, 100, 60, 0, 0, false, 10, false, undefined,
                          true, 1.8, 1.8, 2, true, 1.8);
    const d = cuts.find(c => c.name.startsWith("דלת"))!;
    expect(d.h).toBeCloseTo(880); // (88.2 − 0.2) × 10
  });

  // ג. צוקל=10, מכסה צוקל — structural 2 רווחים (getDoorVisualHeight מוסיפה את הצוקל)
  it("ג. צוקל=10, מכסה צוקל: structural = 88.2 − 0.4 = 87.8 ס\"מ", () => {
    const cuts = calcCuts("cabinet", 60, 100, 60, 0, 0, false, 10, true, undefined,
                          true, 1.8, 1.8, 2, true, 1.8);
    const d = cuts.find(c => c.name.startsWith("דלת"))!;
    expect(d.h).toBeCloseTo(878); // (88.2 − 0.4) × 10
  });

  // ד. 2 קומות, צוקל=10, לא מכסה: תחתונה=0 רווחים, עליונה=2 רווחים
  // תחתון: hasTopGap=false (הגוף העליון מחזיק את ה-gap האמצעי), hasBottomGap=false (צוקל) → 170.0
  // עליון: hasTopGap=true, hasBottomGap=true → 60 − 0.4 = 59.6
  it("ד. 2 קומות: תחתונה (170) = 0 רווחים → 170.0, עליונה (60) = 2 רווחים → 59.6", () => {
    const cuts = calcCuts("cabinet", 60, 240, 60, 0, 0, false, 10, false, 180,
                          false, 1.8, 1.8, 2);
    const lower = cuts.find(c => c.name === "דלת תחתונה")!;
    const upper = cuts.find(c => c.name === "דלת עליונה")!;
    expect(lower.h).toBeCloseTo(1700); // (170 − 0) × 10
    expect(upper.h).toBeCloseTo(596);  // (60 − 0.4) × 10
  });
});
