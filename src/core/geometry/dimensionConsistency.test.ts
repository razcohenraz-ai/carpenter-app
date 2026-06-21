import { describe, it, expect } from 'vitest';
import { checkBoxConsistency } from './dimensionConsistency';
import type { Box } from '../../types/geometry';

const box = (W: number, partial: Partial<Box> = {}): Box => ({
  id: `b_${W}`, W, H: 80, D: 58, position: 'single', level: 'single', ...partial,
});

describe('checkBoxConsistency — body_too_wide', () => {
  it('flags a body wider than the single-carcass limit (overridden W)', () => {
    const ws = checkBoxConsistency([box(160)], undefined, 0, 0, 100);
    const w = ws.find(x => x.kind === 'body_too_wide');
    expect(w).toBeDefined();
    if (w?.kind === 'body_too_wide') {
      expect(w.widthCm).toBeCloseTo(160, 1);
      expect(w.maxCm).toBe(100);
    }
  });

  it('does not flag a body at the limit', () => {
    expect(checkBoxConsistency([box(100)], undefined, 0, 0, 100)
      .some(w => w.kind === 'body_too_wide')).toBe(false);
  });

  it('skips the check when no limit is given (e.g. corner units)', () => {
    expect(checkBoxConsistency([box(160)], undefined, 0, 0, undefined)
      .some(w => w.kind === 'body_too_wide')).toBe(false);
  });
});
