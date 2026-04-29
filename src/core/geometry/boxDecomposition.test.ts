import { describe, it, expect } from "vitest";
import { decomposeBoxes } from "./boxDecomposition";
import { roundInternal } from "../utils/round";

describe("decomposeBoxes", () => {
  // ── קופסה יחידה ─────────────────────────────────────────────────────────────

  it("W≤60 מחזיר קופסה בודדת עם position=single", () => {
    const boxes = decomposeBoxes(50, 180, 60);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.position).toBe("single");
    expect(boxes[0]!.W).toBe(50);
  });

  it("W=60 (גבול תחתון) — עדיין קופסה בודדת", () => {
    const boxes = decomposeBoxes(60, 180, 60);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.position).toBe("single");
  });

  // ── פיצול לשתיים ─────────────────────────────────────────────────────────────

  it("60 < W ≤ 120 מפצל לשתי קופסאות שוות", () => {
    const boxes = decomposeBoxes(80, 180, 60);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.position).toBe("left");
    expect(boxes[1]!.position).toBe("right");
    expect(boxes[0]!.W).toBe(40);
    expect(boxes[1]!.W).toBe(40);
  });

  it("W=120 (גבול עליון לפיצול שתיים) — שתי קופסאות של 60", () => {
    const boxes = decomposeBoxes(120, 180, 60);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.W).toBe(60);
    expect(boxes[1]!.W).toBe(60);
  });

  // ── פיצול לשלוש ומעלה ────────────────────────────────────────────────────────

  it("W=150 מפצל ל-2 קופסאות של 75 ס\"מ", () => {
    const boxes = decomposeBoxes(150, 180, 60);
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => expect(b.W).toBeLessThanOrEqual(120));
  });

  it("W=250 מפצל ל-3 קופסאות, כל אחת ≤ 120", () => {
    const boxes = decomposeBoxes(250, 180, 60);
    expect(boxes).toHaveLength(3);
    boxes.forEach((b) => expect(b.W).toBeLessThanOrEqual(120));
  });

  it("סכום רוחבי הקופסאות שווה לרוחב הכולל", () => {
    for (const W of [50, 80, 120, 150, 250, 360]) {
      const boxes = decomposeBoxes(W, 180, 60);
      const total = Math.round(boxes.reduce((s, b) => s + b.W, 0) * 10) / 10;
      expect(total).toBe(W);
    }
  });

  // ── פיצול גובה ───────────────────────────────────────────────────────────────

  it("H>200 מפצל לקופסה תחתונה ועליונה", () => {
    const boxes = decomposeBoxes(50, 220, 60);
    expect(boxes).toHaveLength(2);
    expect(boxes.some((b) => b.level === "bottom")).toBe(true);
    expect(boxes.some((b) => b.level === "top")).toBe(true);
  });

  it("גובה ברירת מחדל לקופסה תחתונה = 45% מ-H", () => {
    const boxes = decomposeBoxes(50, 220, 60);
    const bottom = boxes.find((b) => b.level === "bottom")!;
    expect(bottom.H).toBe(Math.round(220 * 0.45));
  });

  it("lowerDoorH ידני מכבד את הפרמטר", () => {
    const boxes = decomposeBoxes(50, 220, 60, 90);
    const bottom = boxes.find((b) => b.level === "bottom")!;
    const top    = boxes.find((b) => b.level === "top")!;
    expect(bottom.H).toBe(90);
    expect(top.H).toBe(130);
  });

  it("סכום גבהי הקופסאות שווה ל-H הכולל בפיצול גובה", () => {
    const H = 230;
    const boxes = decomposeBoxes(50, H, 60);
    const total = boxes.reduce((s, b) => s + b.H, 0);
    expect(total).toBe(H);
  });

  // ── מטה-דאטה ─────────────────────────────────────────────────────────────────

  it("כל קופסה מקבלת id ייחודי", () => {
    const boxes = decomposeBoxes(150, 220, 60);
    const ids = boxes.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("כל הקופסאות מקבלות את אותו עומק", () => {
    const D = 58;
    const boxes = decomposeBoxes(250, 180, D);
    boxes.forEach((b) => expect(b.D).toBe(D));
  });

  // ── תיקון ISSUE-005: floating-point בפיצול רוחב ──────────────────────────────

  it("W=200 (2 קופסאות) — כל אחת בדיוק 100.000 ס\"מ ללא floating-point noise", () => {
    const boxes = decomposeBoxes(200, 180, 60);
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => expect(b.W).toBe(100));
  });

  it("W=250 (3 קופסאות) — הקופסה האחרונה מקבלת את השארית, סכום מדויק", () => {
    const boxes = decomposeBoxes(250, 180, 60);
    expect(boxes).toHaveLength(3);
    const sum = boxes.reduce((s, b) => s + b.W, 0);
    expect(roundInternal(sum)).toBe(250);
    boxes.forEach((b) => expect(b.W).toBeLessThanOrEqual(120));
  });

  // ── תיקון ISSUE-002: lowerDoorH=0 לא מתבלבל עם undefined ──────────────────

  it("lowerDoorH=0 מכבד את הערך ולא נופל לברירת מחדל", () => {
    const boxes = decomposeBoxes(50, 220, 60, 0);
    const bottom = boxes.find((b) => b.level === "bottom")!;
    expect(bottom.H).toBe(0);
  });

  it("lowerDoorH=undefined מחזיר ברירת מחדל לפי יחס", () => {
    const boxes = decomposeBoxes(50, 220, 60, undefined);
    const bottom = boxes.find((b) => b.level === "bottom")!;
    expect(bottom.H).toBe(Math.round(220 * 0.45));
  });
});
