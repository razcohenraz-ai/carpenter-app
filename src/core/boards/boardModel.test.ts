import { describe, it, expect } from 'vitest';
import {
  buildBoardModel,
  buildPlinthBoardModel,
  calcPlinthGables,
  clampPlinthGableX,
  defaultPlinthGableLeftX,
  effectivePlinthGableLeftX,
  resolveJointMethod,
  resolveCabinetJointMethod,
  deriveEnvelopeFlags,
  boardsToCutItems,
  snapPlinthGableX,
  BACK_THICKNESS_CM,
  LEVELER_GAP_CM,
  PLINTH_GABLE_MID_BODY_THRESHOLD_CM,
  PLINTH_GABLE_SNAP_CM,
  type Board,
  type PlinthGable,
} from './boardModel';
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

// Most carcass-structure tests opt out of the back panel so the assertions
// stay focused on sides/top/bottom/shelves. Production callers default to
// hasBack=true (handled by the dedicated back-panel describe below).
const baseArgs = {
  bodyMaterial: bodyMat,
  frontMaterial: frontMat,
  hasEnvelopeLeft: false,
  hasEnvelopeRight: false,
  hasEnvelopeTop: false,
  items: [] as InteriorItem[],
  hasPartition: false,
  hasBack: false,
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

  it('joint override: a tall box rendered as butt → length = W', () => {
    // Cabinet-level override forces butt on a box that would default to rabbet
    // via resolveJointMethod(box). Verifies the per-cabinet joint applies
    // uniformly across rows regardless of any one body's W/H ratio.
    const b = box({ W: 98.2, H: 71.5 }); // tall enough for rabbet per-box
    expect(resolveJointMethod(b)).toBe('rabbet');
    const boards = buildBoardModel({ ...baseArgs, box: b, joint: 'butt' });
    const top = byRole(boards, 'top')[0]!;
    expect(top.length).toBeCloseTo(98.2); // butt: full W (not W - 2t)
    expect(top.xFrom).toBe(0);
    expect(top.xTo).toBeCloseTo(98.2);
  });

  it('joint override: a short box rendered as rabbet → length = W − 2·t', () => {
    // Reverse direction: cabinet-level decides rabbet even though this box
    // would have flipped to butt on its own.
    const b = box({ W: 98.2, H: 48.5 }); // wide enough for butt per-box
    expect(resolveJointMethod(b)).toBe('butt');
    const boards = buildBoardModel({ ...baseArgs, box: b, joint: 'rabbet' });
    const top = byRole(boards, 'top')[0]!;
    expect(top.length).toBeCloseTo(98.2 - 2 * t);
  });
});

// ── 2b. Cabinet-level joint helper ───────────────────────────────────────────

describe('resolveCabinetJointMethod', () => {
  it('W ≤ 2·H → rabbet (tall cabinet)', () => {
    expect(resolveCabinetJointMethod(80, 220)).toBe('rabbet');
    expect(resolveCabinetJointMethod(200, 130)).toBe('rabbet'); // user's flip case
    expect(resolveCabinetJointMethod(100, 50)).toBe('rabbet'); // boundary
  });

  it('W > 2·H → butt (wide-short cabinet)', () => {
    expect(resolveCabinetJointMethod(240, 80)).toBe('butt');
    expect(resolveCabinetJointMethod(101, 50)).toBe('butt'); // just past boundary
  });

  it('regression: 2-row cabinet — both rows get same joint via cabinet helper', () => {
    // Reproduces the user's flip case: W=200 H=130 with a 2-row split where
    // top H=71.5 (rabbet per-box) and bottom H=48.5 (butt per-box). The
    // cabinet helper resolves to rabbet → both bodies emit length = W − 2·t.
    const topBox = box({ W: 98.2, H: 71.5, level: 'top', position: 'left' });
    const botBox = box({ W: 98.2, H: 48.5, level: 'bottom', position: 'left' });
    const cabinetJoint = resolveCabinetJointMethod(200, 130);
    expect(cabinetJoint).toBe('rabbet');
    const topBoards = buildBoardModel({ ...baseArgs, box: topBox, joint: cabinetJoint });
    const botBoards = buildBoardModel({ ...baseArgs, box: botBox, joint: cabinetJoint });
    const topTop = byRole(topBoards, 'top')[0]!;
    const botTop = byRole(botBoards, 'top')[0]!;
    expect(topTop.length).toBeCloseTo(botTop.length);
    expect(topTop.width).toBeCloseTo(botTop.width);
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
    // shelf length matches the top/bottom panel exactly — no reveal.
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

// ── 9. Back panel ────────────────────────────────────────────────────────────

describe('buildBoardModel — back panel', () => {
  it('hasBack=true (default in production) → 1 back board, visible=false', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasBack: true });
    const backs = byRole(boards, 'back');
    expect(backs).toHaveLength(1);
    const back = backs[0]!;
    expect(back.visible).toBe(false);
    expect(back.thickness).toBeCloseTo(BACK_THICKNESS_CM);
    // Back panel is cut to the outer body dimensions and overlays the rear
    // face — full W × H, not W − 2t × H − 2t.
    expect(back.length).toBeCloseTo(80);
    expect(back.width).toBeCloseTo(200);
  });

  it('hasBack=false → no back board', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasBack: false });
    expect(byRole(boards, 'back')).toHaveLength(0);
  });
});

// ── 10. Plinth board model (cabinet-level) ──────────────────────────────────

describe('buildPlinthBoardModel — front + back', () => {
  const baseBoxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];

  it('plinthHeight=10 → 1 front + 1 back, both panels cabinetW × (plinthH-LEVELER)', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    });
    const front = byRole(boards, 'plinth-front')[0]!;
    const back  = byRole(boards, 'plinth-back')[0]!;
    expect(front).toBeDefined();
    expect(back).toBeDefined();
    expect(front.length).toBeCloseTo(80);
    expect(back.length).toBeCloseTo(80);
    expect(front.width).toBeCloseTo(10 - LEVELER_GAP_CM);
    expect(back.width).toBeCloseTo(10 - LEVELER_GAP_CM);
    expect(front.thickness).toBeCloseTo(t);
    // Top-view rects: front at y=[0,t]; back at y=[D-t, D].
    expect(front.yFrom).toBe(0);
    expect(front.yTo).toBeCloseTo(t);
    expect(back.yFrom).toBeCloseTo(60 - t);
    expect(back.yTo).toBe(60);
  });

  it('plinthHeight=0 → empty', () => {
    expect(buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 0,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    })).toEqual([]);
  });
});

describe('calcPlinthGables', () => {
  it('single 80cm body → 2 edge gables only (no joints, no mid-body)', () => {
    const boxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
    const gables = calcPlinthGables(80, boxes, t);
    expect(gables).toHaveLength(2);
    expect(gables[0]!.kind).toBe('edge-left');
    expect(gables[0]!.xAnchor).toBe(0);
    expect(gables[0]!.direction).toBe('flush-left');
    expect(gables[1]!.kind).toBe('edge-right');
    expect(gables[1]!.xAnchor).toBe(80);
    expect(gables[1]!.direction).toBe('flush-right');
  });

  it('two 80cm bodies (at threshold) → 2 edges + 1 joint = 3 gables; joint at xJoint=80', () => {
    const boxes: Box[] = [
      box({ W: 80, H: 100, position: 'left',  level: 'bottom' }),
      box({ W: 80, H: 100, position: 'right', level: 'bottom' }),
    ];
    const gables = calcPlinthGables(160, boxes, t);
    expect(gables).toHaveLength(3);
    expect(gables.map(g => g.kind)).toEqual(['edge-left', 'joint', 'edge-right']);
    const joint = gables.find(g => g.kind === 'joint')!;
    expect(joint.xAnchor).toBe(80);
    expect(joint.direction).toBe('right');
  });

  it('two 100cm bodies → 2 edges + 1 joint + 2 mid-body = 5 gables', () => {
    const boxes: Box[] = [
      box({ W: 100, H: 100, position: 'left',  level: 'bottom' }),
      box({ W: 100, H: 100, position: 'right', level: 'bottom' }),
    ];
    const gables = calcPlinthGables(200, boxes, t);
    expect(gables).toHaveLength(5);
    // Emission order: edge-left, mid-body (box 0), joint, mid-body (box 1), edge-right.
    expect(gables.map(g => g.kind)).toEqual([
      'edge-left', 'mid-body', 'joint', 'mid-body', 'edge-right',
    ]);
    expect(gables[1]!.xAnchor).toBe(50);  // mid of left body
    expect(gables[2]!.xAnchor).toBe(100); // joint
    expect(gables[3]!.xAnchor).toBe(150); // mid of right body
  });

  it('body wider than 80cm → adds a mid-body gable at box.x + W/2', () => {
    const boxes: Box[] = [box({ W: 120, H: 100, level: 'bottom' })];
    const gables = calcPlinthGables(120, boxes, t);
    // edges + 1 mid-body
    expect(gables).toHaveLength(3);
    const mid = gables.find(g => g.kind === 'mid-body')!;
    expect(mid.xAnchor).toBe(60);
    expect(mid.direction).toBe('right');
  });

  it('threshold is strict — body exactly 80 → no mid-body', () => {
    const boxes: Box[] = [box({ W: PLINTH_GABLE_MID_BODY_THRESHOLD_CM, H: 100, level: 'bottom' })];
    const gables = calcPlinthGables(PLINTH_GABLE_MID_BODY_THRESHOLD_CM, boxes, t);
    expect(gables.filter(g => g.kind === 'mid-body')).toHaveLength(0);
  });

  it('joint between adjacent bodies sits exactly at xJoint', () => {
    const boxes: Box[] = [
      box({ W: 60, H: 100, position: 'left',  level: 'bottom' }),
      box({ W: 90, H: 100, position: 'right', level: 'bottom' }),
    ];
    const gables = calcPlinthGables(150, boxes, t);
    const joint = gables.find(g => g.kind === 'joint')!;
    // Body widths cumulative: 60 then 60+90=150. Joint at the first cumulative.
    expect(joint.xAnchor).toBe(60);
  });

  it('every gable carries a stable, unique id', () => {
    const boxes: Box[] = [
      box({ W: 100, H: 100, position: 'left',  level: 'bottom' }),
      box({ W: 100, H: 100, position: 'right', level: 'bottom' }),
    ];
    const gables = calcPlinthGables(200, boxes, t);
    // 5 gables (see test above): edge-left, mid-body:0, joint:0, mid-body:1, edge-right.
    expect(gables.map(g => g.id)).toEqual([
      'edge-left', 'mid-body:0', 'joint:0', 'mid-body:1', 'edge-right',
    ]);
    expect(new Set(gables.map(g => g.id)).size).toBe(gables.length);
  });
});

// ── 10b. Plinth gable helpers (drag math) ────────────────────────────────────

describe('snapPlinthGableX', () => {
  it('rounds to the nearest PLINTH_GABLE_SNAP_CM step', () => {
    expect(PLINTH_GABLE_SNAP_CM).toBe(0.5);
    expect(snapPlinthGableX(0)).toBe(0);
    expect(snapPlinthGableX(0.24)).toBe(0);
    expect(snapPlinthGableX(0.25)).toBe(0.5);
    expect(snapPlinthGableX(0.74)).toBe(0.5);
    expect(snapPlinthGableX(0.75)).toBe(1);
    expect(snapPlinthGableX(12.3)).toBe(12.5);
    expect(snapPlinthGableX(12.2)).toBe(12);
  });
});

describe('defaultPlinthGableLeftX', () => {
  const baseGable = (over: Partial<PlinthGable>): PlinthGable => ({
    id: 'x', xAnchor: 0, direction: 'right', kind: 'joint', ...over,
  });
  it('flush-left → 0', () => {
    expect(defaultPlinthGableLeftX(baseGable({ direction: 'flush-left' }), 1.8, 100)).toBe(0);
  });
  it('flush-right → cabinetW − tBody', () => {
    expect(defaultPlinthGableLeftX(baseGable({ direction: 'flush-right' }), 1.8, 100))
      .toBeCloseTo(98.2);
  });
  it('right / left → xAnchor − tBody/2 (centred)', () => {
    const g = baseGable({ direction: 'right', xAnchor: 60 });
    expect(defaultPlinthGableLeftX(g, 1.8, 200)).toBeCloseTo(59.1);
    expect(defaultPlinthGableLeftX({ ...g, direction: 'left' }, 1.8, 200)).toBeCloseTo(59.1);
  });
});

describe('effectivePlinthGableLeftX', () => {
  const g: PlinthGable = { id: 'g', xAnchor: 60, direction: 'right', kind: 'joint' };
  it('without override → default', () => {
    expect(effectivePlinthGableLeftX(g, 1.8, 200)).toBeCloseTo(59.1);
  });
  it('with override → override (default ignored)', () => {
    expect(effectivePlinthGableLeftX({ ...g, userPositionX: 12 }, 1.8, 200)).toBe(12);
  });
});

describe('clampPlinthGableX — bounds and overlap', () => {
  const tBody = 1.8;
  const cabinetW = 200;
  // Three gables: flush-left, a centred joint at 100, flush-right.
  const gables: PlinthGable[] = [
    { id: 'edge-left',  xAnchor: 0,        direction: 'flush-left',  kind: 'edge-left' },
    { id: 'joint:0',    xAnchor: 100,      direction: 'right',       kind: 'joint' },
    { id: 'edge-right', xAnchor: cabinetW, direction: 'flush-right', kind: 'edge-right' },
  ];

  it('clamps below 0 to 0', () => {
    expect(clampPlinthGableX({
      proposedX: -5, gableId: 'joint:0', allGables: gables, cabinetW, tBody,
    })).toBe(1.8); // pushed off edge-left at [0, t]
  });

  it('clamps above cabinetW − tBody to that cap', () => {
    expect(clampPlinthGableX({
      proposedX: 500, gableId: 'joint:0', allGables: gables, cabinetW, tBody,
    })).toBeCloseTo(cabinetW - 2 * tBody); // pushed off edge-right at [cabinetW-t, cabinetW]
  });

  it('keeps the joint clear of an adjacent gable by ≥ tBody', () => {
    // Dragging the joint toward edge-left: the joint cannot enter the
    // interval [0, t] of edge-left, so the minimum is t (= edge-left.right).
    const result = clampPlinthGableX({
      proposedX: 0.5, gableId: 'joint:0', allGables: gables, cabinetW, tBody,
    });
    expect(result).toBeCloseTo(tBody);
  });

  it('clears the right neighbour by ≥ tBody when dragging right', () => {
    const result = clampPlinthGableX({
      proposedX: cabinetW - tBody, // would overlap edge-right
      gableId: 'joint:0', allGables: gables, cabinetW, tBody,
    });
    expect(result).toBeCloseTo(cabinetW - 2 * tBody);
  });

  it('respects an override on a neighbour (uses effective position)', () => {
    // Edge-left override at x=50 — Panel A occupies [50, 51.8]. The joint
    // dragged INTO that interval at x=51 must hop to the nearest legal side
    // (right of the override at 51.8), proving the override is consulted.
    const withOverride: PlinthGable[] = gables.map(g =>
      g.id === 'edge-left' ? { ...g, userPositionX: 50 } : g,
    );
    const result = clampPlinthGableX({
      proposedX: 51, gableId: 'joint:0', allGables: withOverride, cabinetW, tBody,
    });
    expect(result).toBeCloseTo(50 + tBody);
  });

  it('valid gap left of an override → does NOT push past it', () => {
    // The override at x=50 leaves a perfectly legal gap [0, 48.2] to its
    // left; a proposed x=30 belongs there and must stay there.
    const withOverride: PlinthGable[] = gables.map(g =>
      g.id === 'edge-left' ? { ...g, userPositionX: 50 } : g,
    );
    const result = clampPlinthGableX({
      proposedX: 30, gableId: 'joint:0', allGables: withOverride, cabinetW, tBody,
    });
    expect(result).toBe(30);
  });

  it('no legal slot → falls back to edge-clamped proposed', () => {
    // 4-cm cabinet packed with two edge gables that consume all the space:
    // edge-left [0, 1.8] and edge-right [2.2, 4]. The joint has zero room.
    const narrow: PlinthGable[] = [
      { id: 'edge-left',  xAnchor: 0,   direction: 'flush-left',  kind: 'edge-left' },
      { id: 'joint:0',    xAnchor: 2,   direction: 'right',       kind: 'joint' },
      { id: 'edge-right', xAnchor: 4,   direction: 'flush-right', kind: 'edge-right' },
    ];
    const result = clampPlinthGableX({
      proposedX: 2, gableId: 'joint:0', allGables: narrow, cabinetW: 4, tBody: 1.8,
    });
    // No legal slot → the proposed value comes back unchanged (already
    // inside cabinet bounds). The UI keeps the gable where the user dragged
    // it without throwing; the user can resize the cabinet to recover.
    expect(result).toBe(2);
  });
});

// ── 10c. buildPlinthBoardModel — override semantics ─────────────────────────

describe('buildPlinthBoardModel — gable overrides', () => {
  const baseBoxes: Box[] = [
    box({ W: 100, H: 100, position: 'left',  level: 'bottom' }),
    box({ W: 100, H: 100, position: 'right', level: 'bottom' }),
  ];

  it('override on edge-left moves Panel A; default position is replaced', () => {
    const overrides = new Map<string, number>([['edge-left', 30]]);
    const boards = buildPlinthBoardModel({
      cabinetW: 200, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      gableOverrides: overrides,
    });
    // edge-left is the FIRST gable emitted → its Panel A is the first
    // 'plinth-gable-a' board.
    const a = byRole(boards, 'plinth-gable-a')[0]!;
    const b = byRole(boards, 'plinth-gable-b')[0]!;
    expect(a.xFrom).toBe(30);
    expect(a.xTo).toBeCloseTo(30 + t);
    // Panel B is still to the right (flush-left direction).
    const panelBWidth = 10 - LEVELER_GAP_CM;
    expect(b.xFrom).toBeCloseTo(30 + t);
    expect(b.xTo).toBeCloseTo(30 + t + panelBWidth);
  });

  it('override on flush-right keeps Panel B on the left side', () => {
    // Default for edge-right (flush-right): Panel A at [W-t, W], Panel B at
    // [W-t-panelH, W-t]. After moving Panel A to x=120, Panel B should be
    // immediately to its LEFT (direction property unchanged).
    const overrides = new Map<string, number>([['edge-right', 120]]);
    const boards = buildPlinthBoardModel({
      cabinetW: 200, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      gableOverrides: overrides,
    });
    const aList = byRole(boards, 'plinth-gable-a');
    const bList = byRole(boards, 'plinth-gable-b');
    const a = aList[aList.length - 1]!;
    const b = bList[bList.length - 1]!;
    const panelBWidth = 10 - LEVELER_GAP_CM;
    expect(a.xFrom).toBe(120);
    expect(a.xTo).toBeCloseTo(120 + t);
    expect(b.xTo).toBeCloseTo(120);
    expect(b.xFrom).toBeCloseTo(120 - panelBWidth);
  });

  it('override on a joint keeps Panel B on the right (direction=right)', () => {
    const overrides = new Map<string, number>([['joint:0', 70]]);
    const boards = buildPlinthBoardModel({
      cabinetW: 200, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      gableOverrides: overrides,
    });
    // joint:0 is 3rd in emission (edge-left, mid-body:0, joint:0, ...).
    const a = byRole(boards, 'plinth-gable-a')[2]!;
    const b = byRole(boards, 'plinth-gable-b')[2]!;
    expect(a.xFrom).toBe(70);
    expect(a.xTo).toBeCloseTo(70 + t);
    expect(b.xFrom).toBeCloseTo(70 + t);
  });

  it('absent override → default position (unchanged from override-less build)', () => {
    const without = buildPlinthBoardModel({
      cabinetW: 200, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    });
    const withEmpty = buildPlinthBoardModel({
      cabinetW: 200, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      gableOverrides: new Map<string, number>(),
    });
    expect(withEmpty.map(b => ({ role: b.role, xFrom: b.xFrom, xTo: b.xTo })))
      .toEqual(without.map(b => ({ role: b.role, xFrom: b.xFrom, xTo: b.xTo })));
  });

  it('snapshot — gable Panel A xFrom across a 200×50 cabinet with two overrides', () => {
    // Locks the override flow end-to-end: stable ids + direction-respecting
    // Panel B placement + untouched gables stay at their defaults.
    const overrides = new Map<string, number>([
      ['edge-left', 5],
      ['joint:0',   105],
    ]);
    const boards = buildPlinthBoardModel({
      cabinetW: 200, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      gableOverrides: overrides,
    });
    const a = byRole(boards, 'plinth-gable-a').map(b => Number(b.xFrom.toFixed(3)));
    // Emission order: edge-left, mid-body:0, joint:0, mid-body:1, edge-right.
    // mid-body:0 default = 50 − t/2 = 49.1; mid-body:1 = 150 − t/2 = 149.1;
    // edge-right default = 200 − t = 198.2.
    expect(a).toEqual([5, 49.1, 105, 149.1, 198.2]);
  });
});

describe('buildPlinthBoardModel — gables', () => {
  it('cabinet 120×50, one body 120cm → 8 boards (2 base + 3 gables × 2 panels)', () => {
    // 1 body of 120cm is > 80cm threshold → 1 mid-body gable.
    // Total gables: edge-L + mid + edge-R = 3. Each gable = 2 panels. Plus
    // 2 base panels (front + back) = 2 + 6 = 8.
    const boxes: Box[] = [box({ W: 120, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 120, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    expect(boards).toHaveLength(8);
    expect(byRole(boards, 'plinth-front')).toHaveLength(1);
    expect(byRole(boards, 'plinth-back')).toHaveLength(1);
    expect(byRole(boards, 'plinth-gable-a')).toHaveLength(3);
    expect(byRole(boards, 'plinth-gable-b')).toHaveLength(3);
  });

  it('cabinet 200×50, two 100cm bodies → 12 boards (2 base + 5 gables × 2)', () => {
    // 2 bodies neither > 80cm → no mid-body. Gables: edge-L + joint + edge-R = 3.
    // Wait — 100cm > 80cm threshold, so each body ALSO gets a mid-body gable.
    // Edges (2) + joint (1) + 2 mid-body = 5 gables × 2 panels = 10. Plus 2 base.
    const boxes: Box[] = [
      box({ W: 100, H: 100, position: 'left',  level: 'bottom' }),
      box({ W: 100, H: 100, position: 'right', level: 'bottom' }),
    ];
    const boards = buildPlinthBoardModel({
      cabinetW: 200, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    expect(boards).toHaveLength(12);
    expect(byRole(boards, 'plinth-gable-a')).toHaveLength(5);
    expect(byRole(boards, 'plinth-gable-b')).toHaveLength(5);
  });

  it('each gable Panel A and Panel B have identical cut dimensions', () => {
    const boxes: Box[] = [box({ W: 100, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 100, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    const a = byRole(boards, 'plinth-gable-a')[0]!;
    const b = byRole(boards, 'plinth-gable-b')[0]!;
    expect(a.length).toBeCloseTo(50 - 2 * t);
    expect(a.width).toBeCloseTo(10 - LEVELER_GAP_CM);
    expect(b.length).toBeCloseTo(a.length);
    expect(b.width).toBeCloseTo(a.width);
    expect(b.thickness).toBeCloseTo(a.thickness);
  });

  it('flush-left gable: Panel A at x=[0, t], Panel B to its right at x=[t, t+panelH]', () => {
    const boxes: Box[] = [box({ W: 100, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 100, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    const panelH = 10 - LEVELER_GAP_CM;
    // The first plinth-gable-a in emission order is the left-edge one.
    const a = byRole(boards, 'plinth-gable-a')[0]!;
    const b = byRole(boards, 'plinth-gable-b')[0]!;
    expect(a.xFrom).toBe(0);
    expect(a.xTo).toBeCloseTo(t);
    expect(b.xFrom).toBeCloseTo(t);
    expect(b.xTo).toBeCloseTo(t + panelH);
  });

  it('flush-right gable: Panel A at x=[W-t, W], Panel B to its left', () => {
    const boxes: Box[] = [box({ W: 100, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 100, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    const panelH = 10 - LEVELER_GAP_CM;
    const gablesA = byRole(boards, 'plinth-gable-a');
    const gablesB = byRole(boards, 'plinth-gable-b');
    const aRight = gablesA[gablesA.length - 1]!;
    const bRight = gablesB[gablesB.length - 1]!;
    expect(aRight.xFrom).toBeCloseTo(100 - t);
    expect(aRight.xTo).toBe(100);
    expect(bRight.xFrom).toBeCloseTo(100 - t - panelH);
    expect(bRight.xTo).toBeCloseTo(100 - t);
  });

  it('joint gable: Panel A centered on xJoint, Panel B to the right', () => {
    const boxes: Box[] = [
      box({ W: 60, H: 100, position: 'left',  level: 'bottom' }),
      box({ W: 60, H: 100, position: 'right', level: 'bottom' }),
    ];
    const boards = buildPlinthBoardModel({
      cabinetW: 120, cabinetD: 50, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    // Find the joint gable by matching xAnchor = 60 from calcPlinthGables.
    const gables: PlinthGable[] = calcPlinthGables(120, boxes, t);
    const jointIdx = gables.findIndex(g => g.kind === 'joint');
    const aBoards = byRole(boards, 'plinth-gable-a');
    const bBoards = byRole(boards, 'plinth-gable-b');
    const a = aBoards[jointIdx]!;
    const b = bBoards[jointIdx]!;
    const panelH = 10 - LEVELER_GAP_CM;
    expect(a.xFrom).toBeCloseTo(60 - t / 2);
    expect(a.xTo).toBeCloseTo(60 + t / 2);
    expect(b.xFrom).toBeCloseTo(60 + t / 2);
    expect(b.xTo).toBeCloseTo(60 + t / 2 + panelH);
  });
});

// ── 11. Shelf dimensions match top/bottom (no reveal) ───────────────────────

describe('buildBoardModel — shelf dimensions match top/bottom', () => {
  it('regular shelf: length = W − 2·t, width = D (same as top/bottom)', () => {
    const b = box({ W: 80, H: 200, D: 60 });
    const boards = buildBoardModel({
      ...baseArgs, box: b,
      items: [shelf('s', 100)],
    });
    const s = byRole(boards, 'shelf')[0]!;
    const top = byRole(boards, 'top')[0]!;
    expect(s.length).toBeCloseTo(80 - 2 * t);
    expect(s.width).toBeCloseTo(60);
    // Shelves are cut exactly the same as the top/bottom panel.
    expect(s.length).toBeCloseTo(top.length);
    expect(s.width).toBeCloseTo(top.width);
  });

  it('internal-shelf: length = W − 2·t, width = D', () => {
    const b = box({ W: 80, H: 200, D: 60, internalShelves: [100] });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    const ins = byRole(boards, 'internal-shelf')[0]!;
    expect(ins.length).toBeCloseTo(80 - 2 * t);
    expect(ins.width).toBeCloseTo(60);
  });

  it('fixed-shelf: length = W − 2·t, width = D', () => {
    const b = box({ W: 80, H: 200, D: 60 });
    const boards = buildBoardModel({
      ...baseArgs, box: b,
      items: [shelf('fix', 18.2, { isFixedAboveExternals: true })],
    });
    const fs = byRole(boards, 'fixed-shelf')[0]!;
    expect(fs.length).toBeCloseTo(80 - 2 * t);
    expect(fs.width).toBeCloseTo(60);
  });
});

// ── 12. Envelope flags helper ────────────────────────────────────────────────

describe('deriveEnvelopeFlags', () => {
  function b(position: Box['position'], level: Box['level'] = 'single', unitIndex?: number, unitTotal?: number): Box {
    return {
      id: 't', W: 80, H: 100, D: 60, position, level,
      ...(unitIndex !== undefined ? { unitIndex } : {}),
      ...(unitTotal !== undefined ? { unitTotal } : {}),
    };
  }

  it('hasShell=false → all false', () => {
    const flags = deriveEnvelopeFlags(b('single'), false, true);
    expect(flags).toEqual({ hasEnvelopeLeft: false, hasEnvelopeRight: false, hasEnvelopeTop: false });
  });

  it('single + shell + envelopeTop → all three', () => {
    const flags = deriveEnvelopeFlags(b('single'), true, true);
    expect(flags.hasEnvelopeLeft).toBe(true);
    expect(flags.hasEnvelopeRight).toBe(true);
    expect(flags.hasEnvelopeTop).toBe(true);
  });

  it("position='left' → envelope-left only", () => {
    const flags = deriveEnvelopeFlags(b('left'), true, false);
    expect(flags.hasEnvelopeLeft).toBe(true);
    expect(flags.hasEnvelopeRight).toBe(false);
  });

  it('unit_1 of 3 → envelope-left only', () => {
    const flags = deriveEnvelopeFlags(b('unit_1', 'top', 1, 3), true, false);
    expect(flags.hasEnvelopeLeft).toBe(true);
    expect(flags.hasEnvelopeRight).toBe(false);
  });

  it('unit_3 of 3 → envelope-right only', () => {
    const flags = deriveEnvelopeFlags(b('unit_3', 'top', 3, 3), true, false);
    expect(flags.hasEnvelopeLeft).toBe(false);
    expect(flags.hasEnvelopeRight).toBe(true);
  });

  it('unit_2 of 3 → neither edge', () => {
    const flags = deriveEnvelopeFlags(b('unit_2', 'top', 2, 3), true, false);
    expect(flags.hasEnvelopeLeft).toBe(false);
    expect(flags.hasEnvelopeRight).toBe(false);
  });

  it("level='bottom' + envelopeTop=true → envelopeTop stays false", () => {
    const flags = deriveEnvelopeFlags(b('single', 'bottom'), true, true);
    expect(flags.hasEnvelopeTop).toBe(false);
  });

  it("level='top' + envelopeTop=true → envelopeTop true", () => {
    const flags = deriveEnvelopeFlags(b('single', 'top'), true, true);
    expect(flags.hasEnvelopeTop).toBe(true);
  });
});

// ── 13. boardsToCutItems ─────────────────────────────────────────────────────

describe('boardsToCutItems', () => {
  it('includes back panel (visible=false) in cut list', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasBack: true });
    const cuts = boardsToCutItems(boards, 'גוף');
    const backCut = cuts.find(c => c.name.startsWith('גב'));
    expect(backCut).toBeDefined();
    expect(backCut!.group).toBe('back');
    expect(backCut!.note).toBe(`${Math.round(BACK_THICKNESS_CM * 10)}mm`);
    // Back panel name carries NO body tag — the saw operator only needs the
    // dimensions, so identical backs across multiple bodies collapse into
    // one row in mergeCutItems.
    expect(backCut!.name).toBe('גב');
  });

  it('emits one CutItem per Board with mm dimensions', () => {
    const b = box({ W: 80, H: 100 });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    const cuts = boardsToCutItems(boards, 'גוף תחתון');
    expect(cuts).toHaveLength(boards.length);
    // Sample: top board length 80-2t cm = 764 mm; width 60 cm = 600 mm.
    const topCut = cuts.find(c => c.name.startsWith('עליון'));
    expect(topCut).toBeDefined();
    expect(topCut!.w).toBe(Math.round((80 - 2 * t) * 10));
    expect(topCut!.h).toBe(600);
  });

  it('label is appended to each name', () => {
    const b = box({ W: 80, H: 100 });
    const cuts = boardsToCutItems(buildBoardModel({ ...baseArgs, box: b }), 'גוף תחתון שמאל');
    expect(cuts.every(c => c.name.endsWith(' — גוף תחתון שמאל'))).toBe(true);
  });

  it('empty label → no separator', () => {
    const b = box({ W: 80, H: 100 });
    const cuts = boardsToCutItems(buildBoardModel({ ...baseArgs, box: b }), '');
    const topCut = cuts.find(c => c.name === 'עליון');
    expect(topCut).toBeDefined();
  });

  it('envelope boards map to group "shell"', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasEnvelopeLeft: true, hasEnvelopeTop: true });
    const cuts = boardsToCutItems(boards, '');
    expect(cuts.find(c => c.name === 'מעטפת — צד שמאל')!.group).toBe('shell');
    expect(cuts.find(c => c.name === 'מעטפת תקרה')!.group).toBe('shell');
  });

  it('plinth boards (cabinet-level) map to group "plinth"', () => {
    const boxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    const cuts = boardsToCutItems(boards, '');
    expect(cuts.find(c => c.name === 'צוקל קדמי')!.group).toBe('plinth');
    expect(cuts.find(c => c.name === 'צוקל אחורי')!.group).toBe('plinth');
    expect(cuts.find(c => c.name === 'גיבל צוקל א׳')!.group).toBe('plinth');
    expect(cuts.find(c => c.name === 'גיבל צוקל ב׳')!.group).toBe('plinth');
  });
});
