import { describe, it, expect } from "vitest";
import { calcCuts } from "./cuttingList";

// עזר: חיפוש פריט לפי שם
const find = (cuts: ReturnType<typeof calcCuts>, name: string) =>
  cuts.find((c) => c.name === name);

describe("calcCuts — cabinet קלאסי", () => {
  // W=80, H=180, D=60, ללא כלום
  const base = () =>
    calcCuts("cabinet", 80, 180, 60, 0, 0, false, 0, false, undefined, false);

  it("מייצר 2 לוחות צד", () => {
    const sides = base().filter((c) => c.name === "צד שמאל" || c.name === "צד ימין");
    expect(sides).toHaveLength(2);
    sides.forEach((s) => {
      expect(s.w).toBe(600); // 60cm × 10
      expect(s.h).toBe(1800); // 180cm × 10
      expect(s.qty).toBe(1);
    });
  });

  it("עליון ותחתון ברוחב W - 2×tBody", () => {
    const top = find(base(), "עליון")!;
    // W*10 - tBody*2 = 800 - 36 = 764
    expect(top.w).toBe(764);
    expect(top.h).toBe(600);
  });

  it("מכיל דלת אחת (n=2 כי 80>60)", () => {
    const cuts = base();
    const door = cuts.find((c) => c.name.startsWith("דלת"))!;
    expect(door.qty).toBe(2); // 2 דלתות על רוחב 80
  });

  it("ללא מדפים — אין מדף בפלט", () => {
    expect(find(base(), "מדף פנימי")).toBeUndefined();
  });

  it("עם מדף — מדף צף עם reveal נכון", () => {
    const cuts = calcCuts("cabinet", 80, 180, 60, 2, 0, false, 0, false, undefined, false);
    const shelf = find(cuts, "מדף פנימי")!;
    expect(shelf.qty).toBe(2);
    expect(shelf.w).toBe(764 - 2); // SHELF_WIDTH_REVEAL_MM = 2
    expect(shelf.h).toBe(600 - 20); // SHELF_DEPTH_REVEAL_MM = 20
  });

  it("עם גב — לוח גב עם note 6mm", () => {
    const cuts = calcCuts("cabinet", 80, 180, 60, 0, 0, true, 0, false, undefined, false);
    const back = find(cuts, "גב")!;
    expect(back).toBeDefined();
    expect(back.note).toBe("6mm");
    expect(back.group).toBe("back");
  });

  it("עם צוקל — מייצר 2 לוחות צוקל", () => {
    const cuts = calcCuts("cabinet", 80, 180, 60, 0, 0, false, 10, false, undefined, false);
    const plinth = cuts.filter((c) => c.name.includes("צוקל"));
    expect(plinth).toHaveLength(2);
    plinth.forEach((p) => expect(p.h).toBe(100)); // 10cm × 10
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

describe("calcCuts — cabinet עם מעטפת (תיקון ISSUE-001)", () => {
  // tShell=1.8cm (18mm), tBody=1.8cm (18mm)
  // iW = 100 - 1.8×2 = 96.4  |  iH = 180 - 1.8 = 178.2  |  iD = 60 - 1.8 = 58.2
  const shell = () =>
    calcCuts("cabinet", 100, 180, 60, 0, 0, false, 0, false, undefined, true, 1.8, 1.8);

  it("מעטפת — צדדים במידות חיצוניות מלאות", () => {
    const cuts = shell();
    const side = cuts.find((c) => c.name === "מעטפת — צד שמאל")!;
    expect(side.w).toBe(600);  // D=60 × 10
    expect(side.h).toBe(1800); // H=180 × 10
  });

  it("מעטפת — טופ ברוחב iW", () => {
    const top = find(shell(), "מעטפת — טופ")!;
    expect(top.w).toBe(964); // iW=96.4 × 10
    expect(top.h).toBe(600); // D=60 × 10
  });

  it("גוף פנימי — צדדים בממדים פנימיים", () => {
    const side = find(shell(), "גוף פנימי — צד שמאל")!;
    expect(side.w).toBe(582);  // iD=58.2 × 10
    expect(side.h).toBe(1782); // iH=178.2 × 10
  });

  it("גוף פנימי — עליון ברוחב iW − 2×tBody", () => {
    const top = find(shell(), "גוף פנימי — עליון")!;
    // (iW - tBody×2) × 10 = (96.4 - 3.6) × 10 = 928
    // toBeCloseTo כי 96.4 - 3.6 יוצר שגיאת floating-point קטנה ב-JS
    expect(top.w).toBeCloseTo(928, 5);
    expect(top.h).toBeCloseTo(582, 5); // iD=58.2 × 10
  });

  it("hasShell=false — לוחות גוף ב-W מלא", () => {
    const classic = calcCuts("cabinet", 100, 180, 60, 0, 0, false, 0, false, undefined, false, 1.8, 1.8);
    const top = find(classic, "עליון")!;
    // (W - tBody×2) × 10 = (100 - 3.6) × 10 = 964
    expect(top.w).toBe(964);
  });
});

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
