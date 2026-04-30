import { describe, it, expect } from 'vitest';
import { isValidSketchInput, computeSketchGeometry } from './CabinetSketch.utils';

describe('isValidSketchInput', () => {
  it('accepts valid standard dimensions', () => {
    expect(isValidSketchInput('240', '220', '10')).toBe(true);
    expect(isValidSketchInput('60', '200', '0')).toBe(true);
  });

  it('rejects zero or negative W / H', () => {
    expect(isValidSketchInput('0', '220', '10')).toBe(false);
    expect(isValidSketchInput('240', '0', '10')).toBe(false);
    expect(isValidSketchInput('-10', '220', '10')).toBe(false);
  });

  it('rejects plinth >= H', () => {
    expect(isValidSketchInput('240', '220', '220')).toBe(false);
    expect(isValidSketchInput('240', '220', '300')).toBe(false);
  });

  it('accepts plinth = 0', () => {
    expect(isValidSketchInput('60', '180', '0')).toBe(true);
  });

  it('rejects non-numeric strings', () => {
    expect(isValidSketchInput('abc', '220', '10')).toBe(false);
    expect(isValidSketchInput('240', '', '10')).toBe(false);
    expect(isValidSketchInput('240', '220', 'abc')).toBe(false);
  });
});

describe('computeSketchGeometry', () => {
  it('places cabinet rect within SVG bounds', () => {
    const g = computeSketchGeometry(240, 220, 10);
    expect(g.cabinet.x).toBeGreaterThan(0);
    expect(g.cabinet.y).toBeGreaterThan(0);
    expect(g.cabinet.x + g.cabinet.w).toBeLessThanOrEqual(g.svgWidth);
    expect(g.cabinet.y + g.cabinet.h).toBeLessThanOrEqual(g.svgHeight);
  });

  it('returns plinthRect when plinth > 0', () => {
    const g = computeSketchGeometry(100, 200, 10);
    expect(g.plinthRect).not.toBeNull();
    expect(g.plinthRect!.h).toBeGreaterThan(0);
  });

  it('returns null plinthRect when plinth = 0', () => {
    expect(computeSketchGeometry(100, 200, 0).plinthRect).toBeNull();
  });

  it('adds no split lines for a standard small cabinet', () => {
    expect(computeSketchGeometry(60, 180, 0).splitLines).toHaveLength(0);
  });

  it('adds one vertical split line for 60 < W <= 120', () => {
    const lines = computeSketchGeometry(100, 180, 0).splitLines;
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.x1).toBeCloseTo(line!.x2);
  });

  it('adds one horizontal split line for H > 200', () => {
    const lines = computeSketchGeometry(60, 220, 0).splitLines;
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line!.y1).toBeCloseTo(line!.y2);
  });

  it('adds both split lines for wide-tall cabinet', () => {
    expect(computeSketchGeometry(100, 220, 0).splitLines).toHaveLength(2);
  });

  it('adds multiple vertical splits for W > 120', () => {
    const lines = computeSketchGeometry(250, 180, 0).splitLines;
    const verticals = lines.filter(l => l.x1 === l.x2 || Math.abs(l.x1 - l.x2) < 0.01);
    expect(verticals.length).toBeGreaterThanOrEqual(2);
  });
});
