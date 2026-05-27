import { describe, it, expect } from 'vitest';
import { mergeCutItems, type PairLabels } from './mergeCutItems';
import type { CutItem } from '../../types/cuts';

function ci(over: Partial<CutItem> & { name: string; w: number; h: number }): CutItem {
  return { qty: 1, ...over };
}

const PAIR_LABELS: PairLabels = {
  topBottom: 'עליון / תחתון',
  sides: 'צד ימין / צד שמאל',
  envelopeSides: 'מעטפת ימין / מעטפת שמאל',
};

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

describe('mergeCutItems — pair merge (labels supplied)', () => {
  it('without labels: pair merging is skipped', () => {
    const out = mergeCutItems([
      ci({ name: 'עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
      ci({ name: 'תחתון', w: 800, h: 574, materialId: 'mdf18', role: 'bottom' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('top + bottom of same dims/material → single row "עליון / תחתון"', () => {
    const out = mergeCutItems([
      ci({ name: 'עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
      ci({ name: 'תחתון', w: 800, h: 574, materialId: 'mdf18', role: 'bottom' }),
    ], PAIR_LABELS);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('עליון / תחתון');
    expect(out[0]!.qty).toBe(2);
    expect(out[0]!.role).toBeUndefined(); // role cleared on merged row
  });

  it('side-left + side-right of same dims → "צד ימין / צד שמאל"', () => {
    const out = mergeCutItems([
      ci({ name: 'צד שמאל', w: 2000, h: 574, materialId: 'mdf18', role: 'side-left' }),
      ci({ name: 'צד ימין',  w: 2000, h: 574, materialId: 'mdf18', role: 'side-right' }),
    ], PAIR_LABELS);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('צד ימין / צד שמאל');
    expect(out[0]!.qty).toBe(2);
  });

  it('envelope-left + envelope-right → "מעטפת ימין / מעטפת שמאל"', () => {
    const out = mergeCutItems([
      ci({ name: 'מעטפת שמאל', w: 2194, h: 600, materialId: 'mdf18', role: 'envelope-left' }),
      ci({ name: 'מעטפת ימין',  w: 2194, h: 600, materialId: 'mdf18', role: 'envelope-right' }),
    ], PAIR_LABELS);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('מעטפת ימין / מעטפת שמאל');
    expect(out[0]!.qty).toBe(2);
  });

  it('different dims → NOT merged even if roles form a pair', () => {
    const out = mergeCutItems([
      ci({ name: 'עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
      ci({ name: 'תחתון', w: 900, h: 574, materialId: 'mdf18', role: 'bottom' }),
    ], PAIR_LABELS);
    expect(out).toHaveLength(2);
  });

  it('different material → NOT merged', () => {
    const out = mergeCutItems([
      ci({ name: 'עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
      ci({ name: 'תחתון', w: 800, h: 574, materialId: 'oak18', role: 'bottom' }),
    ], PAIR_LABELS);
    expect(out).toHaveLength(2);
  });

  it('only one role of the pair present → NOT merged', () => {
    const out = mergeCutItems([
      ci({ name: 'עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
      ci({ name: 'עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }), // both 'top'
    ], PAIR_LABELS);
    // First-pass merges the two identical tops; pair merge needs BOTH roles
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('עליון');
    expect(out[0]!.qty).toBe(2);
  });

  it('2 tops + 2 bottoms (4-body cabinet, same dims) → 1 row qty=4', () => {
    // Two bodies in a 2-row cabinet, both bodies with same W and D.
    const out = mergeCutItems([
      ci({ name: 'עליון — עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
      ci({ name: 'תחתון — עליון', w: 800, h: 574, materialId: 'mdf18', role: 'bottom' }),
      ci({ name: 'עליון — תחתון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
      ci({ name: 'תחתון — תחתון', w: 800, h: 574, materialId: 'mdf18', role: 'bottom' }),
    ], PAIR_LABELS);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('עליון / תחתון');
    expect(out[0]!.qty).toBe(4);
  });

  it('mixed: a paired group + an unrelated shelf row preserved', () => {
    const out = mergeCutItems([
      ci({ name: 'מדף', w: 760, h: 574, materialId: 'mdf18', role: 'shelf' }),
      ci({ name: 'עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
      ci({ name: 'תחתון', w: 800, h: 574, materialId: 'mdf18', role: 'bottom' }),
    ], PAIR_LABELS);
    expect(out).toHaveLength(2);
    expect(out[0]!.name).toBe('מדף');
    expect(out[1]!.name).toBe('עליון / תחתון');
    expect(out[1]!.qty).toBe(2);
  });

  it('merged row appears at the first-occurrence position', () => {
    const out = mergeCutItems([
      ci({ name: 'מדף', w: 760, h: 574, materialId: 'mdf18', role: 'shelf' }),
      ci({ name: 'תחתון', w: 800, h: 574, materialId: 'mdf18', role: 'bottom' }),
      ci({ name: 'מחיצה', w: 574, h: 2000, materialId: 'mdf18', role: 'partition' }),
      ci({ name: 'עליון', w: 800, h: 574, materialId: 'mdf18', role: 'top' }),
    ], PAIR_LABELS);
    // 'תחתון' is the first of the pair in source order — that's where the
    // merged row should appear.
    expect(out.map(c => c.name)).toEqual(['מדף', 'עליון / תחתון', 'מחיצה']);
  });
});
