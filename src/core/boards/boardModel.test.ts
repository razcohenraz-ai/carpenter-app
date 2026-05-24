import { describe, it, expect } from 'vitest';
import { buildBoardModel, resolveJointMethod, type Board } from './boardModel';
import { getMaterial } from '../../catalog';
import type { Box } from '../../types/geometry';
import type { InteriorItem, ShelfItem, DrawerItem } from '../../types/interior';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function box(args: Partial<Box> & { W: number; H: number }): Box {
  return {
    id: args.id ?? 'b',
    W: args.W,
    H: args.H,
    D: args.D ?? 60,
    position: args.position ?? 'single',
    level: args.level ?? 'single',
    ...(args.internalShelves ? { internalShelves: args.internalShelves } : {}),
  };
}

function shelf(id: string, hf: number, opts: Partial<ShelfItem> = {}): ShelfItem {
  return { type: 'shelf', id, heightFromFloor: hf, ...opts };
}

function drawer(id: string, hf: number, h: number, mount: 'internal' | 'external' = 'external'): DrawerItem {
  return { type: 'drawer', id, heightFromFloor: hf, drawerHeight: h, mount };
}

const bodyMat  = getMaterial('mdf18');
const frontMat = getMaterial('mdf18');
const t = bodyMat.thickness / 10; // 1.8 cm

const baseArgs = {
  bodyMaterial: bodyMat,
  frontMaterial: frontMat,
  hasEnvelopeLeft: false,
  hasEnvelopeRight: false,
  hasEnvelopeTop: false,
  items: [] as InteriorItem[],
  hasPartition: false,
};

function byRole(boards: Board[], role: string): Board[] {
  return boards.filter(b => b.role === role);
}

// ── 1. Simple body — rabbet joint, 4 boards ─────────────────────────────────

describe('buildBoardModel — rabbet (simple body)', () => {
  it('W=80, H=100 → 4 boards (2 sides + top + bottom)', () => {
    const b = box({ W: 80, H: 100 });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    expect(boards).toHaveLength(4);
    expect(boards.map(x => x.role).sort()).toEqual(['bottom', 'side-left', 'side-right', 'top']);
  });

  it('sides span full height in rabbet', () => {
    const b = box({ W: 80, H: 100 });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    const left  = byRole(boards, 'side-left')[0]!;
    const right = byRole(boards, 'side-right')[0]!;
    expect(left.yFrom).toBe(0);
    expect(left.yTo).toBe(100);
    expect(left.xFrom).toBe(0);
    expect(left.xTo).toBeCloseTo(t);
    expect(left.length).toBe(100);
    expect(right.xFrom).toBeCloseTo(80 - t);
    expect(right.xTo).toBe(80);
  });

  it('top/bottom sit between sides in rabbet', () => {
    const b = box({ W: 80, H: 100 });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    const top    = byRole(boards, 'top')[0]!;
    const bottom = byRole(boards, 'bottom')[0]!;
    expect(top.xFrom).toBeCloseTo(t);
    expect(top.xTo).toBeCloseTo(80 - t);
    expect(top.yFrom).toBe(0);
    expect(top.yTo).toBeCloseTo(t);
    expect(top.length).toBeCloseTo(80 - 2 * t);
    expect(bottom.yFrom).toBeCloseTo(100 - t);
    expect(bottom.yTo).toBe(100);
  });
});

// ── 2. Butt joint when W > 2·H ───────────────────────────────────────────────

describe('buildBoardModel — butt (wide & short)', () => {
  it('W=80, H=30 → joint=butt; top/bottom span full width', () => {
    const b = box({ W: 80, H: 30 });
    expect(resolveJointMethod(b)).toBe('butt');
    const boards = buildBoardModel({ ...baseArgs, box: b });
    const top    = byRole(boards, 'top')[0]!;
    const bottom = byRole(boards, 'bottom')[0]!;
    expect(top.xFrom).toBe(0);
    expect(top.xTo).toBe(80);
    expect(top.length).toBe(80);
    expect(bottom.xFrom).toBe(0);
    expect(bottom.xTo).toBe(80);
    expect(bottom.length).toBe(80);
  });

  it('sides sit between top and bottom in butt', () => {
    const b = box({ W: 80, H: 30 });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    const left = byRole(boards, 'side-left')[0]!;
    expect(left.yFrom).toBeCloseTo(t);
    expect(left.yTo).toBeCloseTo(30 - t);
    expect(left.length).toBeCloseTo(30 - 2 * t);
  });

  it('boundary: W=2·H → rabbet (strict > triggers butt)', () => {
    expect(resolveJointMethod(box({ W: 100, H: 50 }))).toBe('rabbet');
    expect(resolveJointMethod(box({ W: 101, H: 50 }))).toBe('butt');
  });
});

// ── 3. Internal shelves (from items) ─────────────────────────────────────────

describe('buildBoardModel — shelves from items', () => {
  it('body with 2 user shelves → 6 boards (4 + 2 shelves)', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs,
      box: b,
      items: [shelf('s1', 60), shelf('s2', 120)],
    });
    const shelves = byRole(boards, 'shelf');
    expect(shelves).toHaveLength(2);
    expect(boards).toHaveLength(6);
  });

  it('shelf y-range follows convention (heightFromFloor = bottom)', () => {
    // hf=60, H=200, t=1.8 → top at y=200-60-1.8=138.2; bottom at y=200-60=140
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs,
      box: b,
      items: [shelf('s', 60)],
    });
    const s = byRole(boards, 'shelf')[0]!;
    expect(s.yFrom).toBeCloseTo(138.2);
    expect(s.yTo).toBeCloseTo(140);
    expect(s.xFrom).toBeCloseTo(t);
    expect(s.xTo).toBeCloseTo(80 - t);
    expect(s.length).toBeCloseTo(80 - 2 * t);
  });

  it('drawers and rods are NOT boards', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs,
      box: b,
      items: [
        shelf('s', 60),
        drawer('d', 0, 20, 'external'),
        { type: 'rod', id: 'r', heightFromFloor: 180 },
      ],
    });
    expect(boards).toHaveLength(5);
    expect(byRole(boards, 'shelf')).toHaveLength(1);
    expect(boards.find(x => x.id === 'd')).toBeUndefined();
    expect(boards.find(x => x.id === 'r')).toBeUndefined();
  });
});

// ── 4. Partition + per-cell shelves ──────────────────────────────────────────

describe('buildBoardModel — partition', () => {
  it('partition adds 1 board between top and bottom, centered', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs,
      box: b,
      hasPartition: true,
    });
    expect(boards).toHaveLength(5);
    const p = byRole(boards, 'partition')[0]!;
    expect(p.xFrom).toBeCloseTo((80 - t) / 2);
    expect(p.xTo).toBeCloseTo((80 + t) / 2);
    expect(p.yFrom).toBeCloseTo(t);
    expect(p.yTo).toBeCloseTo(200 - t);
    expect(p.length).toBeCloseTo(200 - 2 * t);
  });

  it('cell shelves use cell-width x-range (right=cell0, left=cell1)', () => {
    const b = box({ W: 120, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs,
      box: b,
      hasPartition: true,
      cellItems: [
        [shelf('r', 80)],   // right cell
        [shelf('l', 100)],  // left cell
      ],
    });
    const shelves = byRole(boards, 'shelf').sort((a, b) => a.xFrom - b.xFrom);
    expect(shelves).toHaveLength(2);
    // Left cell: x from t to (W-t)/2
    expect(shelves[0]!.xFrom).toBeCloseTo(t);
    expect(shelves[0]!.xTo).toBeCloseTo((120 - t) / 2);
    // Right cell: x from (W+t)/2 to W-t
    expect(shelves[1]!.xFrom).toBeCloseTo((120 + t) / 2);
    expect(shelves[1]!.xTo).toBeCloseTo(120 - t);
  });
});

// ── 5. Envelope panels ───────────────────────────────────────────────────────

describe('buildBoardModel — envelope', () => {
  it('hasEnvelopeLeft + hasEnvelopeRight: 2 extra boards outside body', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs, box: b,
      hasEnvelopeLeft: true,
      hasEnvelopeRight: true,
    });
    expect(boards).toHaveLength(6);
    const eL = byRole(boards, 'envelope-left')[0]!;
    const eR = byRole(boards, 'envelope-right')[0]!;
    expect(eL.xFrom).toBeCloseTo(-t);
    expect(eL.xTo).toBe(0);
    expect(eR.xFrom).toBe(80);
    expect(eR.xTo).toBeCloseTo(80 + t);
    // Material is the FRONT material (visible facade)
    expect(eL.materialId).toBe(frontMat.id);
    expect(eR.materialId).toBe(frontMat.id);
  });

  it('hasEnvelopeTop: 1 extra board above the body', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs, box: b,
      hasEnvelopeTop: true,
    });
    const eT = byRole(boards, 'envelope-top')[0]!;
    expect(eT).toBeDefined();
    expect(eT.yFrom).toBeCloseTo(-t);
    expect(eT.yTo).toBe(0);
    expect(eT.xFrom).toBe(0);
    expect(eT.xTo).toBe(80);
    expect(eT.materialId).toBe(frontMat.id);
  });

  it('no envelope flags → no envelope boards', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    expect(byRole(boards, 'envelope-left')).toHaveLength(0);
    expect(byRole(boards, 'envelope-right')).toHaveLength(0);
    expect(byRole(boards, 'envelope-top')).toHaveLength(0);
  });
});

// ── 6. Fixed shelf above external drawers ────────────────────────────────────

describe('buildBoardModel — fixed shelf', () => {
  it('isFixedAboveExternals=true → role "fixed-shelf"', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs, box: b,
      items: [shelf('fix', 18.2, { isFixedAboveExternals: true })],
    });
    const fs = byRole(boards, 'fixed-shelf');
    expect(fs).toHaveLength(1);
    expect(fs[0]!.yFrom).toBeCloseTo(200 - 18.2 - t);
    expect(fs[0]!.yTo).toBeCloseTo(200 - 18.2);
  });
});

// ── 7. Internal shelves from box.internalShelves[] ───────────────────────────

describe('buildBoardModel — internal-shelf from box.internalShelves', () => {
  it('box.internalShelves emits boards with role "internal-shelf"', () => {
    const b = box({ W: 80, H: 200, internalShelves: [70, 140] });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    const ins = byRole(boards, 'internal-shelf');
    expect(ins).toHaveLength(2);
    // First internal shelf at hf=70: y range [200-70-t, 200-70] = [128.2, 130]
    const lower = ins.sort((a, b) => a.yFrom - b.yFrom)[1]!;
    expect(lower.yFrom).toBeCloseTo(200 - 70 - t);
    expect(lower.yTo).toBeCloseTo(200 - 70);
    expect(lower.xFrom).toBeCloseTo(t);
    expect(lower.xTo).toBeCloseTo(80 - t);
  });
});

// ── 8. Surface-area sanity (rabbet) ──────────────────────────────────────────

describe('buildBoardModel — invariants', () => {
  it('carcass total face area = 2·H·t + 2·(W − 2t)·t for rabbet', () => {
    const W = 80, H = 100;
    const b = box({ W, H });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    // Each board's face area in the front view = (xTo - xFrom) × (yTo - yFrom).
    const sumFace = boards.reduce(
      (s, brd) => s + (brd.xTo - brd.xFrom) * (brd.yTo - brd.yFrom),
      0,
    );
    const expected = 2 * H * t + 2 * (W - 2 * t) * t;
    expect(sumFace).toBeCloseTo(expected);
  });

  it('plinth box returns []', () => {
    const b = box({ W: 80, H: 10, level: 'plinth' });
    expect(buildBoardModel({ ...baseArgs, box: b })).toEqual([]);
  });
});
