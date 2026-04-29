import { describe, it, expect } from "vitest";
import { calcDoors } from "./doorCalc";
import { roundInternal } from "../utils/round";

// doorAreaH = H - doorStart - 0.2
// tallThreshold = 180cm → H שגורם לקופסת דלתות > 180

describe("calcDoors", () => {
  // ── שורה אחת ─────────────────────────────────────────────────────────────────

  it("ארון נמוך — שורה אחת ודלת יחידה", () => {
    // H=180, doorAreaH = 180 - 0.2 - 0.2 = 179.6 ≤ 180 → rows=1
    const d = calcDoors(50, 180, 0, false, undefined, false, 0);
    expect(d.rows).toBe(1);
    expect(d.n).toBe(1);
    expect(d.upperH).toBeNull();
    expect(d.total).toBe(1);
  });

  it("רוחב > 60 ס\"מ — שתי דלתות בשורה", () => {
    const d = calcDoors(100, 180, 0, false, undefined, false, 0);
    expect(d.n).toBe(2);
    expect(d.doorW).toBe(50);
    expect(d.total).toBe(2);
  });

  it("ללא צוקל — doorStart = 0.2 ס\"מ", () => {
    const d = calcDoors(80, 180, 0, false, undefined, false, 0);
    expect(d.doorStart).toBe(0.2);
  });

  it("עם צוקל, ללא כיסוי — doorStart = plinth - 0.2", () => {
    const d = calcDoors(80, 180, 15, false, undefined, false, 0);
    expect(d.doorStart).toBeCloseTo(14.8);
  });

  it("doorCoversPlinth=true — doorStart = 1 ס\"מ קבוע", () => {
    const d = calcDoors(80, 180, 15, true, undefined, false, 0);
    expect(d.doorStart).toBe(1);
  });

  // ── שתי שורות (ארון גבוה) ────────────────────────────────────────────────────

  it("H=220 — שתי שורות דלתות", () => {
    // doorAreaH = 220 - 0.4 = 219.6 > 180 → tall
    const d = calcDoors(50, 220, 0, false, undefined, false, 0);
    expect(d.rows).toBe(2);
    expect(d.upperH).not.toBeNull();
    expect(d.total).toBe(d.n * 2);
  });

  it("lowerH ידני מכבד את הפרמטר", () => {
    const d = calcDoors(50, 220, 0, false, 100, false, 0);
    expect(d.lowerH).toBe(100);
  });

  it("ברירת מחדל lowerH = 45% מאזור הדלתות", () => {
    const d = calcDoors(50, 220, 0, false, undefined, false, 0);
    const doorAreaH = 220 - 0.2 - 0.2; // 219.6
    // roundInternal(219.6 × 0.45) = 98.82, לא 99 (כמו Math.round)
    expect(d.lowerH).toBe(roundInternal(doorAreaH * 0.45));
  });

  it("סכום גבהי שתי השורות + רווח = אזור הדלתות", () => {
    const d = calcDoors(50, 220, 0, false, undefined, false, 0);
    const doorAreaH = Math.round((220 - 0.4) * 10) / 10;
    if (d.rows === 2 && d.upperH !== null) {
      const used = Math.round((d.lowerH + d.upperH + 0.4) * 10) / 10;
      expect(used).toBeCloseTo(doorAreaH, 1);
    }
  });

  it("רוחב דלת = innerW / n (עגול לעשרון)", () => {
    const d = calcDoors(90, 180, 0, false, undefined, false, 0);
    // n = ceil(90/60) = 2, doorW = 90/2 = 45
    expect(d.n).toBe(2);
    expect(d.doorW).toBe(45);
  });

  // ── תיקון ISSUE-001: tShell עכשיו ב-ס"מ ──────────────────────────────────

  it("hasShell + tShell ב-ס\"מ — innerW מחושב נכון", () => {
    // W=100, tShell=1.8cm → innerW = 100 - 3.6 = 96.4
    const d = calcDoors(100, 180, 0, false, undefined, true, 1.8);
    expect(d.n).toBe(2);              // ceil(96.4 / 60) = 2
    expect(d.doorW).toBe(48.2);       // 96.4 / 2
  });

  it("hasShell=false — tShell לא משפיע על innerW", () => {
    const withShell    = calcDoors(100, 180, 0, false, undefined, true,  1.8);
    const withoutShell = calcDoors(100, 180, 0, false, undefined, false, 1.8);
    expect(withoutShell.doorW).toBe(50);    // 100 / 2
    expect(withShell.doorW).toBe(48.2);     // 96.4 / 2
  });

  // ── תיקון ISSUE-002: lowerH=0 לא מתבלבל עם undefined ────────────────────────

  it("lowerH=0 מכבד את הערך ולא נופל לברירת מחדל", () => {
    const d = calcDoors(50, 220, 0, false, 0, false, 0);
    expect(d.lowerH).toBe(0);
  });

  it("lowerH=undefined מחזיר ברירת מחדל לפי יחס", () => {
    const d = calcDoors(50, 220, 0, false, undefined, false, 0);
    const doorAreaH = 220 - 0.2 - 0.2;
    expect(d.lowerH).toBe(roundInternal(doorAreaH * 0.45));
  });
});
