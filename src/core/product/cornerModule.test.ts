import { describe, it, expect } from 'vitest';
import { isCorner, cornerFrontXLayout, cornerHingeSide, cornerFillerCutItems, cornerReturnBox, type CornerFiller } from './cornerModule';
import { kitchenModuleInput } from './kitchenModules';

const cf = (over: Partial<CornerFiller> = {}): CornerFiller => ({
  doorSide: 'right', doorWidthCm: 60, returnDepthCm: 7, ...over,
});

describe('isCorner', () => {
  it('true only when cornerFiller is present', () => {
    expect(isCorner(kitchenModuleInput('corner'))).toBe(true);
    expect(isCorner(kitchenModuleInput('shelves'))).toBe(false);
  });
});

describe('cornerFrontXLayout', () => {
  const W = 125;
  const gap = 0.3; // doorGapMm 3 → 0.3 cm

  it('door on the RIGHT: door hugs the right edge, filler covers the left rest', () => {
    const { door, fillerFace } = cornerFrontXLayout(W, gap, cf({ doorSide: 'right' }));
    expect(door.x1).toBeCloseTo(W - gap, 5);          // door at the right edge
    expect(door.x1 - door.x0).toBeCloseTo(60, 5);     // fixed 60 cm
    expect(fillerFace.x0).toBeCloseTo(gap, 5);         // filler from the left edge
    expect(fillerFace.x1).toBeCloseTo(door.x0 - gap, 5); // a gap between them
    // Filler covers the rest: W − door − 3 gaps.
    expect(fillerFace.x1 - fillerFace.x0).toBeCloseTo(W - 60 - 3 * gap, 5);
  });

  it('door on the LEFT: mirror image', () => {
    const { door, fillerFace } = cornerFrontXLayout(W, gap, cf({ doorSide: 'left' }));
    expect(door.x0).toBeCloseTo(gap, 5);              // door at the left edge
    expect(door.x1 - door.x0).toBeCloseTo(60, 5);
    expect(fillerFace.x1).toBeCloseTo(W - gap, 5);    // filler to the right edge
    expect(fillerFace.x0).toBeCloseTo(door.x1 + gap, 5);
    expect(fillerFace.x1 - fillerFace.x0).toBeCloseTo(W - 60 - 3 * gap, 5);
  });

  it('the door + filler + gaps span the full width with no overlap', () => {
    const { door, fillerFace } = cornerFrontXLayout(W, gap, cf({ doorSide: 'right' }));
    expect(fillerFace.x1).toBeLessThanOrEqual(door.x0);   // no overlap
    expect(door.x1).toBeLessThanOrEqual(W);               // inside the body
    expect(fillerFace.x0).toBeGreaterThanOrEqual(0);
  });
});

describe('cornerHingeSide', () => {
  it('hinges land on the filler side (opposite the door edge)', () => {
    expect(cornerHingeSide(cf({ doorSide: 'right' }))).toBe('left');
    expect(cornerHingeSide(cf({ doorSide: 'left' }))).toBe('right');
  });
});

describe('cornerFillerCutItems', () => {
  it('emits a face piece (rest × door height) and a return piece (depth × inner height), both front material', () => {
    const cuts = cornerFillerCutItems({
      cabinetWcm: 125, gapCm: 0.3, cf: cf(), doorHeightCm: 78, innerHeightCm: 76.4,
    });
    expect(cuts).toHaveLength(2);
    const [face, ret] = cuts;
    expect(face!.group).toBe('front');
    expect(ret!.group).toBe('front');
    // Face: (125 − 60 − 3·0.3) × 78 cm, in mm.
    expect(face!.w).toBeCloseTo((125 - 60 - 0.9) * 10, 3);
    expect(face!.h).toBeCloseTo(780, 3);
    // Return: 7 × 76.4 cm.
    expect(ret!.w).toBeCloseTo(70, 3);
    expect(ret!.h).toBeCloseTo(764, 3);
  });

  it('edging deducts a perimeter band from the (edged) face only, not the raw return', () => {
    const cuts = cornerFillerCutItems({
      cabinetWcm: 125, gapCm: 0.3, cf: cf(), doorHeightCm: 78, innerHeightCm: 76.4,
      edging: { thickness: 1.3 },
    });
    const [face, ret] = cuts;
    expect(face!.w).toBeCloseTo((125 - 60 - 0.9) * 10 - 2 * 1.3, 3); // −2×band
    expect(ret!.w).toBeCloseTo(70, 3);                               // untouched
  });
});

describe('cornerReturnBox', () => {
  it('stands at the door↔filler boundary, thin in X, 7 cm deep from the front', () => {
    const ret = cornerReturnBox({
      cabinetWcm: 125, gapCm: 0.3, cf: cf({ doorSide: 'right' }),
      tFrontCm: 1.8, fullDepthCm: 60, innerBottomCm: 11.8, innerTopCm: 88.2,
    });
    // door right → filler on the left; the return sits at the filler's inner
    // (door-side) edge = fillerFace.x1 = (125−0.3−60) − 0.3 = 64.4.
    expect(ret.x1).toBeCloseTo(64.4, 5);
    expect(ret.x1 - ret.x0).toBeCloseTo(1.8, 5);   // front-material thick in X
    expect(ret.z1).toBeCloseTo(60, 5);             // reaches the front face
    expect(ret.z1 - ret.z0).toBeCloseTo(7, 5);     // 7 cm deep
    expect(ret.y0).toBeCloseTo(11.8, 5);           // carcass inner opening
    expect(ret.y1).toBeCloseTo(88.2, 5);
  });

  it('mirrors to the filler-right edge when the door is on the left', () => {
    const ret = cornerReturnBox({
      cabinetWcm: 125, gapCm: 0.3, cf: cf({ doorSide: 'left' }),
      tFrontCm: 1.8, fullDepthCm: 60, innerBottomCm: 11.8, innerTopCm: 88.2,
    });
    // door left → filler on the right; return at fillerFace.x0 = door(0.3..60.3)+gap = 60.6.
    expect(ret.x0).toBeCloseTo(60.6, 5);
    expect(ret.x1 - ret.x0).toBeCloseTo(1.8, 5);
  });
});
