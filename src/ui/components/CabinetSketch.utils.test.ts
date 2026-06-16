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

  it('adds one vertical split line for 100 < W <= 200', () => {
    const lines = computeSketchGeometry(150, 180, Dn, 0).splitLines;
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
    expect(computeSketchGeometry(150, 220, Dn, 0).splitLines).toHaveLength(2);
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

  it('ללא איחוד: internalShelfLines ריק', () => {
    // all bodies >= 60cm
    const g = computeSketchGeometry(60, 240, Dn, 0, 80, 3, 80);
    expect(g.internalShelfLines).toHaveLength(0);
  });

  it('איחוד top+middle: קו פיצול אחד + קו מדף פנימי אחד', () => {
    // H=240, plinth=5, loDoor=170, midDoor=50
    // top=20<60 → merge with middle; 2 bodies: 1 split line + 1 internal shelf
    const g = computeSketchGeometry(60, 240, 60, 5, 170, 3, 50);
    const horiz = g.splitLines.filter(l => Math.abs(l.y1 - l.y2) < 0.01);
    expect(horiz).toHaveLength(1);         // קו בין 2 הגופים
    expect(g.internalShelfLines).toHaveLength(1); // מדף בתוך הגוף המאוחד
  });

  it('איחוד כל 3 גופים: אין קווי פיצול, 2 קווי מדף פנימי', () => {
    // H=200, plinth=10, loDoor=170, midDoor=20
    // top=10, mid=20 → merge all → single body with 2 shelves
    const g = computeSketchGeometry(60, 200, 60, 10, 170, 3, 20);
    const horiz = g.splitLines.filter(l => Math.abs(l.y1 - l.y2) < 0.01);
    expect(horiz).toHaveLength(0);          // גוף יחיד — אין פיצולים
    expect(g.internalShelfLines).toHaveLength(2); // 2 מדפים פנימיים
  });

  it('מיקום קו המדף הפנימי תואם לגובה המוחלט', () => {
    // H=240, plinth=5, loDoor=170, midDoor=50 → shelf at h=220 (absolute from floor)
    // SVG y = cabY + (H - 220) * scale = cabY + 20 * scale
    const g = computeSketchGeometry(60, 240, 60, 5, 170, 3, 50);
    const shelf = g.internalShelfLines[0]!;
    const expectedY = g.cabinet.y + (240 - 220) * (g.cabinet.h / 240);
    expect(shelf.y1).toBeCloseTo(expectedY, 1);
  });

  // ── Per-body dimension overrides drive the EFFECTIVE outline ────────────────
  // The override map is keyed by boxStableKey; for a single-box cabinet that key
  // is 'single:single'. A W or H override must grow BOTH the outline and the
  // body rect together — the bug was the outline scaling to the raw W/H param
  // while the body rect used the overridden box size (a "broken" layout where
  // the front/body didn't fill the outline).
  describe('box dimension overrides → effective outline', () => {
    const ovr = (dims: { W?: number; H?: number; D?: number }) =>
      new Map([['single:single', dims]]);

    it('H override grows the outline and the H label (wall cabinet 50 → 60)', () => {
      const base = computeSketchGeometry(100, 50, 35, 0);
      const tall = computeSketchGeometry(100, 50, 35, 0, undefined, 'auto', undefined, undefined, false, ovr({ H: 60 }));
      expect(base.hLabel.text).toBe('50');
      expect(tall.hLabel.text).toBe('60');
      // Taller body → cabinet occupies more vertical space (or same scale-bound).
      expect(tall.cabinet.h).toBeGreaterThan(base.cabinet.h);
    });

    it('outline height matches the single body rect after an H override', () => {
      // The exact bug: outline (cabH) used raw H while the body rect used box.H.
      // For a single full-height body (plinth 0) the two must be equal.
      const g = computeSketchGeometry(100, 50, 35, 0, undefined, 'auto', undefined, undefined, false, ovr({ H: 60 }));
      const onlyBox = g.boxes.find(b => b.level !== 'plinth')!;
      const rect = g.boxSvgRects[onlyBox.id]!;
      expect(rect.h).toBeCloseTo(g.cabinet.h, 1);
      expect(rect.y).toBeCloseTo(g.cabinet.y, 1);
    });

    it('W override updates the W label and keeps the body rect flush with the outline', () => {
      // The cabinet rect is scale-bound to the draw area, so its pixel WIDTH
      // doesn't necessarily grow — but the label reflects the effective width,
      // and the single body rect must still span the full outline width.
      const wide = computeSketchGeometry(100, 50, 35, 0, undefined, 'auto', undefined, undefined, false, ovr({ W: 120 }));
      expect(wide.wLabel.text).toBe('120');
      const onlyBox = wide.boxes.find(b => b.level !== 'plinth')!;
      const rect = wide.boxSvgRects[onlyBox.id]!;
      expect(rect.w).toBeCloseTo(wide.cabinet.w, 1);
      expect(rect.x).toBeCloseTo(wide.cabinet.x, 1);
    });

    it('no override → labels equal the raw params (no behavioural change)', () => {
      const g = computeSketchGeometry(100, 50, 35, 0);
      expect(g.wLabel.text).toBe('100');
      expect(g.hLabel.text).toBe('50');
    });
  });

  // ── Wall envelope (קלפה — מעטפת עליון+תחתון) ────────────────────────────────
  describe('wall envelope caps', () => {
    it('wallEnvelopeCm=0 → no caps, no change to external H', () => {
      const g = computeSketchGeometry(100, 50, 35, 0);
      expect(g.envelopeBottomPanel).toBeNull();
      expect(g.hLabel.text).toBe('50');
    });

    it('wallEnvelopeCm>0 → both top and bottom caps appear, external H preserved', () => {
      const g = computeSketchGeometry(
        100, 50, 35, 0, undefined, 'auto', undefined,
        undefined, false, undefined, undefined,
        1.8,
      );
      expect(g.envelopeTopPanel).not.toBeNull();
      expect(g.envelopeBottomPanel).not.toBeNull();
      // External H is preserved (body shrinks by 2×, caps add 2× back).
      // Float-arithmetic from the subtract+add cycle leaves a hair of noise;
      // assert closeness rather than the string text.
      expect(parseFloat(g.hLabel.text)).toBeCloseTo(50, 5);
    });

    it('top cap sits at cabY (top of cabinet)', () => {
      const g = computeSketchGeometry(
        100, 50, 35, 0, undefined, 'auto', undefined,
        undefined, false, undefined, undefined,
        1.8,
      );
      expect(g.envelopeTopPanel!.y).toBeCloseTo(g.cabinet.y, 3);
    });

    it('bottom cap sits flush with cabinet bottom (y+cap.h = cabinet.y+cabinet.h)', () => {
      const g = computeSketchGeometry(
        100, 50, 35, 0, undefined, 'auto', undefined,
        undefined, false, undefined, undefined,
        1.8,
      );
      const cap = g.envelopeBottomPanel!;
      expect(cap.y + cap.h).toBeCloseTo(g.cabinet.y + g.cabinet.h, 3);
    });
  });

  // ── Shell envelope-top (מעטפת תקרה) ───────────────────────────────────────
  describe('shell envelope-top band', () => {
    it('reserves a top band so the body box sits below the cap (cap no longer proud)', () => {
      // tEnvelope=1.8, hasEnvelopeTop=true, shell both sides.
      const g = computeSketchGeometry(
        100, 200, 35, 0, undefined, 'auto', undefined,
        1.8, true, undefined, { left: true, right: true }, 0,
      );
      expect(g.envelopeTopPanel).not.toBeNull();
      const boxes = Object.values(g.boxSvgRects);
      const topBox = boxes.reduce((a, b) => (b.y < a.y ? b : a)); // topmost
      // The top body box now starts a cap-thickness below the cabinet top; the
      // envelope-top board fills that band, flush with the full-height sides.
      expect(topBox.y).toBeCloseTo(g.cabinet.y + g.envelopeTopPanel!.h, 2);
      expect(topBox.y).toBeGreaterThan(g.cabinet.y + 0.5);
    });
  });
});
