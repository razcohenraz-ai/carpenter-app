import { describe, it, expect } from "vitest";
import { buildHW } from "./hardwareCalc";

// עזר: חיפוש פריט לפי specId
const byId = (items: ReturnType<typeof buildHW>, id: string) =>
  items.find((h) => h.specId === id);

describe("buildHW — cabinet", () => {
  it("2 דלתות, 0 מגירות — 4 צירים, 2 ידיות, ללא מסילות", () => {
    const hw = buildHW("cabinet", 2, 0, 0);
    expect(byId(hw, "hinge-35mm")!.qty).toBe(4);   // 2 דלתות × 2
    expect(byId(hw, "handle")!.qty).toBe(2);         // 2 דלתות × 1
    expect(byId(hw, "slide-telescopic")).toBeUndefined(); // 0 מגירות → מסונן
  });

  it("0 דלתות, 3 מגירות — 6 מסילות, ללא צירים, עם ידיות למגירות", () => {
    const hw = buildHW("cabinet", 0, 3, 0);
    expect(byId(hw, "slide-telescopic")!.qty).toBe(6); // 3 × 2
    expect(byId(hw, "hinge-35mm")).toBeUndefined();
    expect(byId(hw, "handle")!.qty).toBe(3);           // byDrawer: 3 × 1
  });

  it("פריטים fixed (גב, פלטות, ברגים) תמיד קיימים", () => {
    const hw = buildHW("cabinet", 0, 0, 0);
    expect(byId(hw, "back-panel-6mm")!.qty).toBe(1);
    expect(byId(hw, "cam-lock")!.qty).toBe(1);
    expect(byId(hw, "screw-4x40")!.qty).toBe(2);
  });

  it("total = qty × unitPrice לכל פריט", () => {
    const hw = buildHW("cabinet", 2, 1, 0);
    hw.forEach((item) => {
      expect(item.total).toBe(item.qty * item.unitPrice);
    });
  });
});

describe("buildHW — shelf", () => {
  it("מדפייה עם 3 מדפים — 12 שידות מדף", () => {
    const hw = buildHW("shelf", 0, 0, 3);
    expect(byId(hw, "shelf-pin")!.qty).toBe(12); // 3 × 4
  });

  it("מדפייה ללא מדפים — שידות מדף מסוננות", () => {
    const hw = buildHW("shelf", 0, 0, 0);
    expect(byId(hw, "shelf-pin")).toBeUndefined();
  });
});

describe("buildHW — table", () => {
  it("שולחן — 16 ברגי רגל ו-8 פלטות", () => {
    const hw = buildHW("table", 0, 0, 0);
    expect(byId(hw, "leg-screw")!.qty).toBe(16);
    expect(byId(hw, "corner-bracket")!.qty).toBe(8);
  });
});

describe("buildHW — drawer_unit", () => {
  it("5 מגירות — 10 מסילות ו-5 ידיות", () => {
    const hw = buildHW("drawer_unit", 0, 5, 0);
    expect(byId(hw, "slide-telescopic")!.qty).toBe(10);
    expect(byId(hw, "handle")!.qty).toBe(5);
  });
});

describe("buildHW — תיקון ISSUE-004: else if + ידיות לדלתות ומגירות", () => {
  it("שני כללים נפרדים עם אותו specId נספרים בנפרד", () => {
    // 2 דלתות, 3 מגירות → byDoor→qty=2, byDrawer→qty=3 — שתי שורות נפרדות
    const hw = buildHW("cabinet", 2, 3, 0);
    const handles = hw.filter((h) => h.specId === "handle");
    expect(handles).toHaveLength(2);
    expect(handles.some((h) => h.qty === 2)).toBe(true); // byDoor: 2×1
    expect(handles.some((h) => h.qty === 3)).toBe(true); // byDrawer: 3×1
  });

  it("סה\"כ ידיות = מספר דלתות + מספר מגירות", () => {
    const hw = buildHW("cabinet", 2, 3, 0);
    const total = hw.filter((h) => h.specId === "handle").reduce((s, h) => s + h.qty, 0);
    expect(total).toBe(5); // 2 + 3
  });

  it("else if: כל כלל נבחר לפי מכפיל יחיד — byDoor ו-byDrawer לא מצטברים בתוך כלל אחד", () => {
    // מסילות: byDrawer=2 בלבד. עם 4 דלתות ו-3 מגירות — 6 מסילות, לא 8+6
    const hw = buildHW("cabinet", 4, 3, 0);
    expect(byId(hw, "slide-telescopic")!.qty).toBe(6); // 3×2 בלבד
  });
});

describe("buildHW — כללי", () => {
  it("כל הפריטים המוחזרים הם בכמות חיובית", () => {
    const types = ["cabinet", "shelf", "table", "drawer_unit", "custom"] as const;
    for (const type of types) {
      const hw = buildHW(type, 2, 2, 2);
      hw.forEach((item) => expect(item.qty).toBeGreaterThan(0));
    }
  });
});
