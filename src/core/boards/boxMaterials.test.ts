import { describe, it, expect } from 'vitest';
import { resolveBoxMaterials, type BoxMaterialOverride } from './boxMaterials';
import { boxStableKey } from '../interior/interiorUtils';
import { defaultInputForType } from '../product/productDefaults';
import type { Box } from '../../types/geometry';
import type { BoxSlotId } from '../../types/project';

const box: Box = { id: 'b1', W: 60, H: 80, D: 60, position: 'single', level: 'single' };
const input = () => ({ ...defaultInputForType('wardrobe'), bodyMaterialId: 'mdf18' as const, frontMaterialId: 'oak18' as const, backThickness: 0.6 });

describe('resolveBoxMaterials', () => {
  it('falls back to the cabinet default with no override', () => {
    const r = resolveBoxMaterials(box, input(), new Map(), []);
    expect(r.bodyMaterial.id).toBe('mdf18');
    expect(r.frontMaterial.id).toBe('oak18');
    expect(r.backThicknessCm).toBe(0.6);
  });

  it('applies the per-body override (body + front material + back thickness)', () => {
    const ovr = new Map<BoxSlotId, BoxMaterialOverride>([
      [boxStableKey(box), { bodyMaterialId: 'oak18', frontMaterialId: 'mdf18', backThicknessCm: 1.6 }],
    ]);
    const r = resolveBoxMaterials(box, input(), ovr, []);
    expect(r.bodyMaterial.id).toBe('oak18');   // overridden
    expect(r.frontMaterial.id).toBe('mdf18');  // overridden
    expect(r.backThicknessCm).toBe(1.6);       // overridden
  });

  it('a partial override inherits the unset fields', () => {
    const ovr = new Map<BoxSlotId, BoxMaterialOverride>([
      [boxStableKey(box), { frontMaterialId: 'mdf18' }],
    ]);
    const r = resolveBoxMaterials(box, input(), ovr, []);
    expect(r.bodyMaterial.id).toBe('mdf18');   // inherited cabinet default
    expect(r.frontMaterial.id).toBe('mdf18');  // overridden
    expect(r.backThicknessCm).toBe(0.6);       // inherited
  });
});
