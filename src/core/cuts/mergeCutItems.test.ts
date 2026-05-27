import { describe, it, expect } from 'vitest';
import { mergeCutItems } from './mergeCutItems';
import type { CutItem } from '../../types/cuts';

function ci(over: Partial<CutItem> & { name: string; w: number; h: number }): CutItem {
  return { qty: 1, ...over };
}

describe('mergeCutItems', () => {
  it('empty list → empty list', () => {
    expect(mergeCutItems([])).toEqual([]);
  });

  it('single item → unchanged (cloned)', () => {
    const input: CutItem[] = [ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18' })];
    const out = mergeCutItems(input);
    expect(out).toEqual(input);
    expect(out[0]).not.toBe(input[0]); // returned a new object (clone)
  });

  it('4 identical shelves → 1 line with qty=4', () => {
    const sh = (): CutItem => ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18', group: 'body', note: '18mm' });
    const out = mergeCutItems([sh(), sh(), sh(), sh()]);
    expect(out).toHaveLength(1);
    expect(out[0]!.qty).toBe(4);
    expect(out[0]!.name).toBe('מדף');
    expect(out[0]!.note).toBe('18mm');
    expect(out[0]!.materialId).toBe('mdf18');
  });

  it('sums qty across pre-aggregated items (qty>1 each)', () => {
    const out = mergeCutItems([
      ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18', qty: 3 }),
      ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18', qty: 2 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.qty).toBe(5);
  });

  it('different materialId → separate rows', () => {
    const out = mergeCutItems([
      ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18' }),
      ci({ name: 'מדף', w: 764, h: 574, materialId: 'oak18' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('different dims → separate rows', () => {
    const out = mergeCutItems([
      ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18' }),
      ci({ name: 'מדף', w: 800, h: 574, materialId: 'mdf18' }), // different w
      ci({ name: 'מדף', w: 764, h: 600, materialId: 'mdf18' }), // different h
    ]);
    expect(out).toHaveLength(3);
  });

  it('different name → separate rows', () => {
    const out = mergeCutItems([
      ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18' }),
      ci({ name: 'תחתון', w: 764, h: 574, materialId: 'mdf18' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('undefined materialId is its own bucket — does NOT merge with mdf18', () => {
    const out = mergeCutItems([
      ci({ name: 'צד מגירה', w: 500, h: 200 }), // no materialId
      ci({ name: 'צד מגירה', w: 500, h: 200, materialId: 'mdf18' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('two undefined-materialId rows with same name+dims → merge', () => {
    const out = mergeCutItems([
      ci({ name: 'צד מגירה', w: 500, h: 200, note: '12mm' }),
      ci({ name: 'צד מגירה', w: 500, h: 200, note: '12mm' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.qty).toBe(2);
  });

  it('preserves first-occurrence order', () => {
    const out = mergeCutItems([
      ci({ name: 'A', w: 100, h: 50, materialId: 'mdf18' }),
      ci({ name: 'B', w: 100, h: 50, materialId: 'mdf18' }),
      ci({ name: 'A', w: 100, h: 50, materialId: 'mdf18' }),
      ci({ name: 'C', w: 100, h: 50, materialId: 'mdf18' }),
    ]);
    expect(out.map(c => c.name)).toEqual(['A', 'B', 'C']);
    expect(out[0]!.qty).toBe(2);
  });

  it('does not mutate input items', () => {
    const a = ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18', qty: 1 });
    const b = ci({ name: 'מדף', w: 764, h: 574, materialId: 'mdf18', qty: 1 });
    const snapshotA = { ...a };
    const snapshotB = { ...b };
    mergeCutItems([a, b]);
    expect(a).toEqual(snapshotA);
    expect(b).toEqual(snapshotB);
  });
});
