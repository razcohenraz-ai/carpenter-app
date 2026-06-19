import { describe, it, expect } from 'vitest';
import { computePartitionCuts } from './partitionCuts';
import { buildBoardModel } from '../boards/boardModel';
import { getMaterial } from '../../catalog';
import type { Box } from '../../types/geometry';

const mat = getMaterial('mdf18');
const tCm = mat.thickness / 10; // 1.8 cm

function mkBox(over: Partial<Box> & { id: string }): Box {
  return { W: 80, H: 180, D: 60, position: 'single', level: 'single', ...over };
}

describe('computePartitionCuts — internal height (Bug B)', () => {
  it('cuts the partition to the internal opening (H − 2·t), not the external H', () => {
    const box = mkBox({ id: 'b' });
    const cuts = computePartitionCuts([box], new Map([['b', 2]]), new Map([['b', true]]), tCm);

    expect(cuts).toHaveLength(1);
    const c = cuts[0]!;
    expect(c.h).toBeCloseTo((180 - 2 * 1.8) * 10, 6); // 1764 mm — NOT the external 1800
    expect(c.w).toBeCloseTo(60 * 10, 6);              // depth
    expect(c.qty).toBe(1);                            // numFronts − 1
    expect(c.group).toBe('body');
    expect(c.note).toBe('18mm');
  });

  it('uses the per-body overridden thickness for both the height and the note', () => {
    const box = mkBox({ id: 'b' });
    const cuts = computePartitionCuts(
      [box], new Map([['b', 2]]), new Map([['b', true]]), tCm,
      () => ({ id: 'oak25', tCm: 2.5 }),
    );
    const c = cuts[0]!;
    expect(c.h).toBeCloseTo((180 - 2 * 2.5) * 10, 6); // 1750 mm
    expect(c.note).toBe('25mm');
    expect(c.materialId).toBe('oak25');
  });

  it('emits qty = numFronts − 1 and skips bodies without a partition', () => {
    const boxes = [mkBox({ id: 'a' }), mkBox({ id: 'b' })];
    const cuts = computePartitionCuts(
      boxes,
      new Map([['a', 3], ['b', 2]]),
      new Map([['a', true], ['b', false]]), // only 'a' is partitioned
      tCm,
    );
    expect(cuts).toHaveLength(1);
    expect(cuts[0]!.qty).toBe(2); // 3 − 1
  });

  it('skips plinth boxes', () => {
    const box = mkBox({ id: 'p', level: 'plinth' });
    const cuts = computePartitionCuts([box], new Map([['p', 2]]), new Map([['p', true]]), tCm);
    expect(cuts).toHaveLength(0);
  });

  it('matches the physical partition board from buildBoardModel (no drift)', () => {
    const box = mkBox({ id: 'b' });
    const board = buildBoardModel({
      box,
      bodyMaterial: mat,
      frontMaterial: mat,
      hasEnvelopeLeft: false,
      hasEnvelopeRight: false,
      hasEnvelopeTop: false,
      items: [],
      hasPartition: true,
      hasBack: false,
    }).find(b => b.role === 'partition')!;

    const cut = computePartitionCuts([box], new Map([['b', 2]]), new Map([['b', true]]), tCm)[0]!;
    // The cut-list partition (mm) must equal the rendered board (cm × 10).
    expect(cut.h).toBeCloseTo(board.length * 10, 6); // height = inner opening H − 2t
    expect(cut.w).toBeCloseTo(board.width * 10, 6);   // depth
  });
});
