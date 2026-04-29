import { describe, it, expect } from "vitest";
import {
  round, roundInternal, roundOutput,
  INTERNAL_PRECISION_MM, OUTPUT_PRECISION_MM, INPUT_PRECISION_MM,
} from "./round";

describe("קבועי דיוק", () => {
  it("ערכי הקבועים תואמים את הסטנדרטים", () => {
    expect(INTERNAL_PRECISION_MM).toBe(0.01);
    expect(OUTPUT_PRECISION_MM).toBe(0.1);
    expect(INPUT_PRECISION_MM).toBe(0.1);
  });
});

describe("roundInternal — 0.001 ס\"מ (= 0.01 מ\"מ)", () => {
  it("מעגל לשלושה מקומות עשרוניים", () => {
    expect(roundInternal(83.3333)).toBe(83.333);
    expect(roundInternal(83.3336)).toBe(83.334);
    expect(roundInternal(83.3335)).toBe(83.334); // tie → מעלה
  });

  it("פותר את בעיית 0.1+0.2 הקלאסית", () => {
    expect(0.1 + 0.2).not.toBe(0.3);            // הבעיה קיימת ב-JS
    expect(roundInternal(0.1 + 0.2)).toBe(0.3);  // roundInternal פותרת
  });

  it("אין floating-point drift — 100 הוספות עוקבות של 0.1", () => {
    let v = 0;
    for (let i = 0; i < 100; i++) v = roundInternal(v + 0.1);
    expect(v).toBe(10); // 100 × 0.1 = 10.000
  });
});

describe("roundOutput — 0.1 מ\"מ", () => {
  it("מעגל למקום עשרוני אחד", () => {
    expect(roundOutput(83.33)).toBe(83.3);
    expect(roundOutput(83.35)).toBe(83.4);
    expect(roundOutput(226.67)).toBe(226.7);
  });
});

describe("round — גנרי", () => {
  it("מאפשר precision מותאם", () => {
    expect(round(99.876, 0.5)).toBe(100);
    expect(round(99.749, 0.5)).toBe(99.5);
    expect(round(5.555, 0.01)).toBe(5.56);
  });
});
