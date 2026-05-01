import { describe, it, expect } from 'vitest';
import { isValidSketchInput, computeSketchGeometry } from './CabinetSketch.utils';

const D = '60';
const Dn = 60;

describe('isValidSketchInput', () => {
  it('accepts valid standard dimensions', () => {
    expect(isValidSketchInput('240', '220', D, '10')).toBe(true);
    expect(isValidSketchInput('60', '200', D, '0')).toBe(true);
  });

  it('rejects zero or negative W / H / D', () => {
    expect(isValidSketchInput('0', '220', D, '10')).toBe(false);
    expect(isValidSketchInput('240', '0', D, '10')).toBe(false);
    expect(isValidSketchInput('-10', '220', D, '10')).toBe(false);
    expect(isValidSketchInput('240', '220', '0', '10')).toBe(false);
  });

  it('rejects plinth >= H', () => {
    expect(isValidSketchInput('240', '220', D, '220')).toBe(false);
    expect(isValidSketchInput('240', '220', D, '300')).toBe(false);
  });

  it('accepts plinth = 0', () => {
    expect(isValidSketchInput('60', '180', D, '0')).toBe(true);
  });

  it('rejects non-numeric strings', () => {
    expect(isValidSketchInput('abc', '220', D, '10')).toBe(false);
    expect(isValidSketchInput('240', '', D, '10')).toBe(false);
    expect(isValidSketchInput('240', '220', D, 'abc')).toBe(false);
  });

  it('accepts valid lowerDoorH when H > plinth', () => {
    expect(isValidSketchInput('300', '220', D, '50', '180')).toBe(true);
  });

  it('rejects lowerDoorH <= plinth', () => {
    expect(isValidSketchInput('300', '220', D, '50', '40')).toBe(false);
  });

  it('rejects lowerDoorH >= H', () => {
    expect(isValidSketchInput('300', '220', D, '10', '220')).toBe(false);
  });
});

describe('computeSketchGeometry', () => {
  it('places cabinet rect within SVG bounds', () => {
    const g = computeSketchGeometry(240, 220, Dn, 10);
    expect(g.cabinet.x).toBeGreaterThan(0);
    expect(g.cabinet.y).toBeGreaterThan(0);
    expect(g.cabinet.x + g.cabinet.w).toBeLessThanOrEqual(g.svgWidth);
    expect(g.cabinet.y + g.cabinet.h).toBeLessThanOrEqual(g.svgHeight);
  });

  it('returns plinthRect when plinth > 0', () => {
    const g = computeSketchGeometry(100, 200, Dn, 10);
    expect(g.plinthRect).not.toBeNull();
    expect(g.plinthRect!.h).toBeGreaterThan(0);
  });

  it('returns null plinthRect when plinth = 0', () => {
    expect(computeSketchGeometry(100, 200, Dn, 0).plinthRect).toBeNull();
  });

  it('adds no split lines for a standard small cabinet', () => {
    expect(computeSketchGeometry(60, 180, Dn, 0).splitLines).toHaveLength(0);
  });

  it('adds one vertical split line for 60 < W <= 120', () => {
    const lines = computeSketchGeometry(100, 180, Dn, 0).splitLines;
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.x1).toBeCloseTo(line!.x2);
  });

  it('adds one horizontal split line for H > 200', () => {
    const lines = computeSketchGeometry(60, 220, Dn, 0).splitLines;
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.y1).toBeCloseTo(line!.y2);
  });

  it('adds both split lines for wide-tall cabinet', () => {
    expect(computeSketchGeometry(100, 220, Dn, 0).splitLines).toHaveLength(2);
  });

  it('adds multiple vertical splits for W > 120', () => {
    const lines = computeSketchGeometry(250, 180, Dn, 0).splitLines;
    const verticals = lines.filter(l => Math.abs(l.x1 - l.x2) < 0.01);
    expect(verticals.length).toBeGreaterThanOrEqual(2);
  });

  it('places horizontal split at exact lowerDoorH fraction (not hardcoded 45%)', () => {
    // W=300, H=220, plinth=50, lowerDoorH=180 → top box H = 220-180 = 40
    // split must be at 40/220 = ~18.2% from top, not at 45% (the old bug)
    const g = computeSketchGeometry(300, 220, Dn, 50, 180);
    const horizLine = g.splitLines.find(l => Math.abs(l.y1 - l.y2) < 0.01);
    expect(horizLine).toBeDefined();
    const splitFraction = (horizLine!.y1 - g.cabinet.y) / g.cabinet.h;
    expect(splitFraction).toBeCloseTo(40 / 220, 3);
  });

  it('doorsPerColumn=3 מייצר 2 קווים אופקיים', () => {
    // H=240, lowerDoorH=80, middleDoorH=80 → top=80, middle=80, bottom=80
    const g = computeSketchGeometry(60, 240, Dn, 0, 80, 3, 80);
    const horiz = g.splitLines.filter(l => Math.abs(l.y1 - l.y2) < 0.01);
    expect(horiz).toHaveLength(2);
  });

  it('doorsPerColumn=3: הקו האופקי הראשון ב-top/H מהחלק העליון', () => {
    // H=240, lowerDoorH=80, middleDoorH=80 → topH=80; first split at 80/240 from top
    const g = computeSketchGeometry(60, 240, Dn, 0, 80, 3, 80);
    const horiz = g.splitLines
      .filter(l => Math.abs(l.y1 - l.y2) < 0.01)
      .sort((a, b) => a.y1 - b.y1);
    const firstFrac = (horiz[0]!.y1 - g.cabinet.y) / g.cabinet.h;
    expect(firstFrac).toBeCloseTo(80 / 240, 3);
  });

  it('doorsPerColumn=1: אין קווים אופקיים גם כש-H>200', () => {
    const g = computeSketchGeometry(60, 240, Dn, 0, undefined, 1);
    const horiz = g.splitLines.filter(l => Math.abs(l.y1 - l.y2) < 0.01);
    expect(horiz).toHaveLength(0);
  });

  it('doorsPerColumn=2: קו אופקי אחד גם כש-H<=200', () => {
    const g = computeSketchGeometry(60, 180, Dn, 0, 90, 2);
    const horiz = g.splitLines.filter(l => Math.abs(l.y1 - l.y2) < 0.01);
    expect(horiz).toHaveLength(1);
  });
});
