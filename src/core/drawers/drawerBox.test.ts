import { describe, it, expect } from 'vitest';
import { RUNNERS } from '../../catalog/runners';
import { computeDrawerBox, selectNominalLength } from './drawerBox';

// Worked example agreed with the carpenter:
// body 60×60 cm, gables 16.5 mm → LW = 600 − 33 = 567; usable depth 600 → NL 550;
// drawer sides 16 mm; bottom T = 12 mm; external facade front 310 mm; 45° miter.
describe('computeDrawerBox — TANDEM 16, 60×60 external drawer (hand-checked)', () => {
  const spec = RUNNERS['tandem-16']!;
  const box = computeDrawerBox(spec, {
    internalWidthMm: 567,
    internalDepthMm: 600,
    sidePanelThicknessMm: 16,
    bottomThicknessMm: 12,
    kind: 'external',
    heightMm: 310,
  });

  it('selects NL = 550 (largest with NL+3 ≤ 600)', () => {
    expect(box.nominalLengthMm).toBe(550);
  });

  it('outer envelope = 557 wide × 540 deep', () => {
    expect(box.outerWidthMm).toBe(557);   // SKW(525) + 2×16
    expect(box.outerDepthMm).toBe(540);   // SKL = 550 − 10
  });

  it('side height = front − 40 = 270; front/back = side − M − T = 247', () => {
    expect(box.sidePanelHeightMm).toBe(270);
    expect(box.frontBackHeightMm).toBe(270 - 11 - 12);
  });

  it('panel cut list — miter, full-outer front/back', () => {
    const side = box.panels.find(p => p.role === 'side')!;
    const front = box.panels.find(p => p.role === 'front')!;
    const bottom = box.panels.find(p => p.role === 'bottom')!;
    expect([side.qty, side.lengthMm, side.heightMm, side.thicknessMm, side.joint])
      .toEqual([2, 540, 270, 16, 'miter45']);
    expect([front.lengthMm, front.heightMm, front.joint])
      .toEqual([557, 247, 'miter45']);            // full outer width, not SKW
    expect([bottom.lengthMm, bottom.heightMm, bottom.thicknessMm, bottom.joint])
      .toEqual([536, 540, 12, 'groove']);          // LW−31 × SKL × T
  });

  it('screw height = 37 mm', () => {
    expect(box.screwHeightMm).toBe(37);
  });

  it('no warnings for an in-spec drawer', () => {
    expect(box.warnings).toHaveLength(0);
  });
});

describe('computeDrawerBox — TANDEM 19 differs (SKW=LW−49, bottom=LW−39) + inner + buttGroove', () => {
  const spec = RUNNERS['tandem-19']!;
  const box = computeDrawerBox(spec, {
    internalWidthMm: 567,
    internalDepthMm: 600,
    sidePanelThicknessMm: 18,
    bottomThicknessMm: 12,
    kind: 'inner',
    heightMm: 200,
    joinery: 'buttGroove',
  });

  it('uses the 19 mm offsets', () => {
    expect(box.outerWidthMm).toBe(567 - 49 + 2 * 18); // SKW 518 + 36 = 554
    const bottom = box.panels.find(p => p.role === 'bottom')!;
    expect(bottom.lengthMm).toBe(567 - 39);           // 528
  });

  it('buttGroove → front/back at internal width (SKW), butt joint', () => {
    const front = box.panels.find(p => p.role === 'front')!;
    expect(front.lengthMm).toBe(567 - 49);            // 518
    expect(front.joint).toBe('butt');
  });

  it('inner drawer → side height = drawer height (no −40)', () => {
    expect(box.sidePanelHeightMm).toBe(200);
  });
});

describe('selectNominalLength + warnings', () => {
  const spec = RUNNERS['tandem-16']!;

  it('falls back to the shortest NL (with a warning) when depth is too shallow', () => {
    const { nl, fits } = selectNominalLength(spec, 200); // 250+3 > 200
    expect(nl).toBe(250);
    expect(fits).toBe(false);
    const box = computeDrawerBox(spec, {
      internalWidthMm: 567, internalDepthMm: 200, sidePanelThicknessMm: 16,
      bottomThicknessMm: 12, kind: 'external', heightMm: 310,
    });
    expect(box.warnings.some(w => w.includes('NL'))).toBe(true);
  });

  it('warns (does not block) on an out-of-range side thickness', () => {
    const box = computeDrawerBox(spec, {
      internalWidthMm: 567, internalDepthMm: 600, sidePanelThicknessMm: 19, // 19 > 16 for TANDEM 16
      bottomThicknessMm: 12, kind: 'external', heightMm: 310,
    });
    expect(box.warnings.some(w => w.includes('עובי'))).toBe(true);
  });
});
