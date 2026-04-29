import { describe, it, expect } from "vitest";
import { sheetsNeeded, sheetsNeededByGroup } from "./sheetCalculator";
import { calcCuts } from "./cuttingList";
import type { CutItem, Material } from "../../types";

// לוח סטנדרטי 244×122 ס"מ
const MAT: Material = {
  id: "mdf18",
  name: "MDF 18mm",
  thickness: 18,
  pricePerSheet: 120,
  sheetW: 244,
  sheetH: 122,
};

describe("sheetsNeeded — תיקון ISSUE-003", () => {
  it("פריט עם group='back' לא נספר בחישוב הלוחות", () => {
    const cuts: CutItem[] = [
      { name: "גב ארון", qty: 1, w: 1000, h: 1000, note: "6mm", group: "back" },
    ];
    expect(sheetsNeeded(cuts, MAT)).toBe(0);
  });

  it("תיקון ISSUE-006: sheetsNeededByGroup('drawer') מחזיר > 0 לארון עם מגירות", () => {
    const cuts = calcCuts("cabinet", 80, 180, 60, 0, 2, false, 0, false, undefined, false);
    expect(sheetsNeededByGroup(cuts, MAT, "drawer")).toBeGreaterThan(0);
  });

  it("פריט עם 'גב' ב-note אבל group שונה — כן נספר", () => {
    // לפני התיקון: regex /(4mm|גב)/ היה מסנן פריט זה בשקט
    const cuts: CutItem[] = [
      { name: "גב מגירה", qty: 1, w: 500, h: 300, note: "גב מגירה 12mm" },
    ];
    // area = 500×300 = 150,000mm²; sheetArea = 2440×1220 = 2,976,800mm²
    // sheets = ceil(150000/2976800 × 1.10) = ceil(0.0554) = 1
    expect(sheetsNeeded(cuts, MAT)).toBe(1);
  });
});
