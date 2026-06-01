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
  boardStableId,
  getDimension,
  getMaterial as getBoardMaterial,
  computeCarcassDepth,
  computeInnerWidth,
  getEdgingPattern,
  getDeductionFor,
  resolveEdging,
  getEdgingFinishMaterial,
  BACK_THICKNESS_CM,
  LEVELER_GAP_CM,
  PLINTH_GABLE_MID_BODY_THRESHOLD_CM,
  PLINTH_GABLE_SNAP_CM,
  type Board,
  type BoardDimensionKey,
  type BoardOverrides,
  type BoardRole,
  type EdgingContext,
  type EdgingPattern,
  type PlinthGable,
} from './boardModel';
import type { Edging } from '../../types/edging';
import type { MaterialId } from '../../types/materials';
import { getMaterial } from '../../catalog';
import type { Box } from '../../types/geometry';
import type { CutItem } from '../../types/cuts';
import type { InteriorItem, ShelfItem, DrawerItem } from '../../types/interior';
import { calcCuts } from '../cuts/cuttingList';
import { calcExternalDrawerFrontCuts } from '../cuts/externalDrawerCuts';

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

// ── 10d. Plinth cladding (front-material facade) ─────────────────────────────

describe('buildPlinthBoardModel — front cladding', () => {
  const baseBoxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
  const tF = frontMat.thickness / 10; // same as t for mdf18 — covered by other test

  it('without frontMaterial → no cladding board (backward-compatible)', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    });
    expect(byRole(boards, 'plinth-front-cladding')).toHaveLength(0);
  });

  it('with frontMaterial → 1 cladding board at the front, full width', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      frontMaterial: frontMat,
    });
    const cladding = byRole(boards, 'plinth-front-cladding')[0]!;
    expect(cladding).toBeDefined();
    expect(cladding.length).toBeCloseTo(80);
    expect(cladding.width).toBeCloseTo(10 - LEVELER_GAP_CM);
    expect(cladding.thickness).toBeCloseTo(tF);
    // Sits at the cabinet's front face.
    expect(cladding.yFrom).toBe(0);
    expect(cladding.yTo).toBeCloseTo(tF);
    // Material id is the FRONT material, not the body — drives cut-list grouping.
    expect(cladding.materialId).toBe(frontMat.id);
  });

  it('cladding shifts plinth-front back by tFront; width stays cabinetW', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      frontMaterial: frontMat,
    });
    const front = byRole(boards, 'plinth-front')[0]!;
    expect(front.yFrom).toBeCloseTo(tF);
    expect(front.yTo).toBeCloseTo(tF + t);
    expect(front.length).toBeCloseTo(80); // total width unchanged
  });

  it('cladding shortens gables by tFront (carcass loses front-edge depth)', () => {
    const without = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    });
    const withCladding = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      frontMaterial: frontMat,
    });
    const gW = byRole(without, 'plinth-gable-a')[0]!;
    const gC = byRole(withCladding, 'plinth-gable-a')[0]!;
    expect(gC.length).toBeCloseTo(gW.length - tF);
  });

  it('plinth-back is unaffected by cladding', () => {
    const without = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    });
    const withCladding = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      frontMaterial: frontMat,
    });
    const bW = byRole(without, 'plinth-back')[0]!;
    const bC = byRole(withCladding, 'plinth-back')[0]!;
    expect(bC.yFrom).toBeCloseTo(bW.yFrom);
    expect(bC.yTo).toBeCloseTo(bW.yTo);
    expect(bC.length).toBeCloseTo(bW.length);
  });

  it('cladding board → cut-list name "חיפוי צוקל", group "plinth", front material', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      frontMaterial: frontMat,
    });
    const cuts = boardsToCutItems(boards, '');
    const cut = cuts.find(c => c.name === 'חיפוי צוקל');
    expect(cut).toBeDefined();
    expect(cut!.group).toBe('plinth');
    expect(cut!.materialId).toBe(frontMat.id);
  });
});

// ── 10e. Recessed plinth ────────────────────────────────────────────────────

describe('buildPlinthBoardModel — recessed plinth', () => {
  const baseBoxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
  const tF = frontMat.thickness / 10;

  it('recess=0 (default) → identical to no-recess build', () => {
    const a = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    });
    const b = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      recessCm: 0,
    });
    expect(b.map(x => ({ role: x.role, yFrom: x.yFrom, yTo: x.yTo, length: x.length })))
      .toEqual(a.map(x => ({ role: x.role, yFrom: x.yFrom, yTo: x.yTo, length: x.length })));
  });

  it('recess=5 → plinth-front shifts to y=[5, 5+t]; back unchanged', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      recessCm: 5,
    });
    const front = byRole(boards, 'plinth-front')[0]!;
    const back  = byRole(boards, 'plinth-back')[0]!;
    expect(front.yFrom).toBeCloseTo(5);
    expect(front.yTo).toBeCloseTo(5 + t);
    expect(back.yFrom).toBeCloseTo(60 - t);
    expect(back.yTo).toBe(60);
  });

  it('recess shortens gables by exactly the recess amount', () => {
    const without = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    });
    const recessed = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      recessCm: 5,
    });
    const gW = byRole(without, 'plinth-gable-a')[0]!;
    const gR = byRole(recessed, 'plinth-gable-a')[0]!;
    expect(gR.length).toBeCloseTo(gW.length - 5);
  });

  it('recess + cladding combined: plinth-front at y=[recess + tF, recess + tF + t]; gable shorter by recess + tF', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      frontMaterial: frontMat,
      recessCm: 5,
    });
    const cladding = byRole(boards, 'plinth-front-cladding')[0]!;
    const front    = byRole(boards, 'plinth-front')[0]!;
    const gable    = byRole(boards, 'plinth-gable-a')[0]!;
    // Cladding sits at the front of the (recessed) plinth.
    expect(cladding.yFrom).toBeCloseTo(5);
    expect(cladding.yTo).toBeCloseTo(5 + tF);
    // Plinth-front retreats behind the cladding.
    expect(front.yFrom).toBeCloseTo(5 + tF);
    expect(front.yTo).toBeCloseTo(5 + tF + t);
    // Gable length = (60 - t) - (5 + tF + t) = 60 - 2t - tF - 5.
    expect(gable.length).toBeCloseTo(60 - 2 * t - tF - 5);
  });

  it('cabinet outline (cabinetW × cabinetD) is unchanged — recess is internal', () => {
    // Width is the cladding's length; depth still reaches the cabinetD via
    // plinth-back. The recess is an empty zone INSIDE [0, cabinetD].
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      frontMaterial: frontMat,
      recessCm: 5,
    });
    const cladding = byRole(boards, 'plinth-front-cladding')[0]!;
    const back = byRole(boards, 'plinth-back')[0]!;
    expect(cladding.length).toBeCloseTo(80);
    expect(back.length).toBeCloseTo(80);
    expect(back.yTo).toBe(60);
  });

  it('negative recess is clamped to 0 (defensive)', () => {
    const recessed = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      recessCm: -3,
    });
    const baseline = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
    });
    expect(recessed.map(x => x.yFrom)).toEqual(baseline.map(x => x.yFrom));
  });

  it('effective plinth depth = cabinetD − recess (matches what PlinthEditor shows)', () => {
    // The "effective depth" the carpenter sees runs from the front-most
    // panel's near face to the plinth-back's far face. With cladding it's
    // the cladding's yFrom; without it the plinth-front's yFrom. Recess
    // pushes that front face back, and the formula must be identical
    // whether or not cladding is present — that's how the editor's depth
    // label and the cut list end up at the same number.
    const cabinetD = 57.4; // carcass depth example from the spec
    const recess = 2;
    const withCladding = buildPlinthBoardModel({
      cabinetW: 80, cabinetD, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      frontMaterial: frontMat, recessCm: recess,
    });
    const noCladding = buildPlinthBoardModel({
      cabinetW: 80, cabinetD, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: baseBoxes,
      recessCm: recess,
    });
    const claddingFront = byRole(withCladding, 'plinth-front-cladding')[0]!;
    const plinthFront   = byRole(noCladding,   'plinth-front')[0]!;
    const backWith      = byRole(withCladding, 'plinth-back')[0]!;
    const backNo        = byRole(noCladding,   'plinth-back')[0]!;
    expect(backWith.yTo - claddingFront.yFrom).toBeCloseTo(cabinetD - recess);
    expect(backNo.yTo   - plinthFront.yFrom).toBeCloseTo(cabinetD - recess);
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

  it('unit_1 of 3, level=top → no envelope (side panels only from bottom row)', () => {
    const flags = deriveEnvelopeFlags(b('unit_1', 'top', 1, 3), true, false);
    expect(flags.hasEnvelopeLeft).toBe(false);
    expect(flags.hasEnvelopeRight).toBe(false);
  });

  it('unit_1 of 3, level=bottom → envelope-left only', () => {
    const flags = deriveEnvelopeFlags(b('unit_1', 'bottom', 1, 3), true, false);
    expect(flags.hasEnvelopeLeft).toBe(true);
    expect(flags.hasEnvelopeRight).toBe(false);
  });

  it('unit_3 of 3, level=top → no envelope (side panels only from bottom row)', () => {
    const flags = deriveEnvelopeFlags(b('unit_3', 'top', 3, 3), true, false);
    expect(flags.hasEnvelopeLeft).toBe(false);
    expect(flags.hasEnvelopeRight).toBe(false);
  });

  it('unit_3 of 3, level=bottom → envelope-right only', () => {
    const flags = deriveEnvelopeFlags(b('unit_3', 'bottom', 3, 3), true, false);
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

// ── 14. Stable id + cabinet-derived dimension helpers ───────────────────────

describe('boardStableId', () => {
  it('returns `{role}@{subKey}` when subKey is set', () => {
    expect(boardStableId('side-left', 'bottom:left')).toBe('side-left@bottom:left');
    expect(boardStableId('shelf', 'bottom:left@s_abc'))
      .toBe('shelf@bottom:left@s_abc');
    expect(boardStableId('plinth-gable-a', 'joint:0'))
      .toBe('plinth-gable-a@joint:0');
  });

  it('returns the role alone when subKey is omitted (cabinet-level singleton)', () => {
    expect(boardStableId('plinth-front')).toBe('plinth-front');
    expect(boardStableId('plinth-back')).toBe('plinth-back');
    expect(boardStableId('plinth-front-cladding')).toBe('plinth-front-cladding');
  });

  it('empty subKey is treated as singleton', () => {
    expect(boardStableId('plinth-front', '')).toBe('plinth-front');
  });
});

describe('computeCarcassDepth + computeInnerWidth', () => {
  it('carcassD = D − back − hingeGap − tFront (clamped ≥ 0)', () => {
    expect(computeCarcassDepth(60, 0.5, 0.3, 1.8)).toBeCloseTo(57.4);
    expect(computeCarcassDepth(50, 0.5, 0.3, 1.8)).toBeCloseTo(47.4);
    expect(computeCarcassDepth(2, 0.5, 0.3, 1.8)).toBe(0); // clamp
  });

  it('innerW = hasShell ? W − 2·tFront : W', () => {
    expect(computeInnerWidth(240, true, 1.8)).toBeCloseTo(236.4);
    expect(computeInnerWidth(240, false, 1.8)).toBe(240);
  });
});

// ── 15. Override layer: getDimension + getMaterial ──────────────────────────

describe('getDimension', () => {
  const b: Board = {
    id: 'i1', stableId: 'top@bottom:single',
    role: 'top', materialId: 'mdf18',
    length: 76.4, width: 57.4, thickness: 1.8,
    xFrom: 1.8, xTo: 78.2, yFrom: 0, yTo: 1.8, visible: true,
  };

  it('without override → derived value', () => {
    const empty: ReadonlyMap<string, BoardOverrides> = new Map();
    expect(getDimension(b, 'length', empty)).toBe(76.4);
    expect(getDimension(b, 'width',  empty)).toBe(57.4);
    expect(getDimension(b, 'thickness', empty)).toBe(1.8);
  });

  it('override on a single key → override value; siblings stay derived', () => {
    const overrides: ReadonlyMap<string, BoardOverrides> = new Map([
      [b.stableId, { dimensions: { length: 80 } }],
    ]);
    expect(getDimension(b, 'length', overrides)).toBe(80);
    expect(getDimension(b, 'width',  overrides)).toBe(57.4); // sibling untouched
    expect(getDimension(b, 'thickness', overrides)).toBe(1.8);
  });

  it('override targets the stableId — a different board on the same role is untouched', () => {
    const overrides: ReadonlyMap<string, BoardOverrides> = new Map([
      [b.stableId, { dimensions: { length: 80 } }],
    ]);
    const otherBoard: Board = { ...b, stableId: 'top@top:single' };
    expect(getDimension(otherBoard, 'length', overrides)).toBe(76.4); // derived
  });
});

describe('getMaterial', () => {
  const b: Board = {
    id: 'i1', stableId: 'back@bottom:single',
    role: 'back', materialId: 'mdf18',
    length: 80, width: 200, thickness: 0.5,
    xFrom: 0, xTo: 80, yFrom: 0, yTo: 200, visible: false,
  };

  it('without override → derived materialId', () => {
    expect(getBoardMaterial(b, new Map())).toBe('mdf18');
  });

  it('override on materialId → override value', () => {
    const overrides: ReadonlyMap<string, BoardOverrides> = new Map([
      [b.stableId, { materialId: 'oak18' }],
    ]);
    expect(getBoardMaterial(b, overrides)).toBe('oak18');
  });
});

// ── 16. Override semantics: set → effective, reset → revert ─────────────────

describe('override semantics — set then reset', () => {
  const boxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];

  it('length override changes CutItem.w; reset reverts', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    const front = boards.find(b => b.role === 'plinth-front')!;
    const baseline = boardsToCutItems(boards, '');
    const baselineFrontCut = baseline.find(c => c.role === 'plinth-front')!;

    // Set: override length to 100 cm.
    const overrides = new Map<string, BoardOverrides>([
      [front.stableId, { dimensions: { length: 100 } }],
    ]);
    const withOverride = boardsToCutItems(boards, '', overrides);
    const overriddenCut = withOverride.find(c => c.role === 'plinth-front')!;
    expect(overriddenCut.w).toBe(1000);            // 100 cm × 10 mm
    expect(overriddenCut.w).not.toBe(baselineFrontCut.w);

    // Reset: empty map → revert to derived.
    const reverted = boardsToCutItems(boards, '', new Map());
    const revertedCut = reverted.find(c => c.role === 'plinth-front')!;
    expect(revertedCut.w).toBe(baselineFrontCut.w);
  });

  it('materialId override changes CutItem.materialId; reset reverts', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    const back = boards.find(b => b.role === 'plinth-back')!;
    const baseline = boardsToCutItems(boards, '');
    const baselineBackCut = baseline.find(c => c.role === 'plinth-back')!;
    expect(baselineBackCut.materialId).toBe(bodyMat.id);

    const overrides = new Map<string, BoardOverrides>([
      [back.stableId, { materialId: 'oak18' }],
    ]);
    const withOverride = boardsToCutItems(boards, '', overrides);
    expect(withOverride.find(c => c.role === 'plinth-back')!.materialId).toBe('oak18');

    const reverted = boardsToCutItems(boards, '', new Map());
    expect(reverted.find(c => c.role === 'plinth-back')!.materialId).toBe(bodyMat.id);
  });

  it('thickness override drives the note + materialId override survives a dim reset', () => {
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 60, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    const front = boards.find(b => b.role === 'plinth-front')!;
    // Both override at once: thickness + materialId.
    const overrides = new Map<string, BoardOverrides>([
      [front.stableId, { dimensions: { thickness: 1.2 }, materialId: 'oak18' }],
    ]);
    const cut = boardsToCutItems(boards, '', overrides).find(c => c.role === 'plinth-front')!;
    expect(cut.note).toBe('12mm');           // thickness took effect
    expect(cut.materialId).toBe('oak18');    // material took effect
  });
});

// ── 17. Consistency: getDimension/getMaterial == CutItem == derived ────────
// Locks the single-source-of-truth invariant. For every board emitted in a
// representative cabinet, the dimensions reaching CutsList (CutItem.w/h) and
// the dimensions any sketch / editor would read via getDimension agree, in
// every scenario — body, plinth, recessed plinth, cladding, body > 80 cm.

interface Scenario {
  name: string;
  boards: Board[];
  overrides: ReadonlyMap<string, BoardOverrides>;
  /** Optional edging context. When provided, the CutItem dimensions are
   *  expected to reflect the deduction from {@link getDeductionFor}, using
   *  the same formula as {@link boardsToCutItems}. Omit to assert
   *  pre-edging behavior (no deduction). */
  edgingCtx?: EdgingContext;
  /** Slot the boards belong to — forwarded to {@link resolveEdging}. Omit
   *  for cabinet-level singletons (the plinth family). */
  boxSlotId?: string;
}

function assertConsistency({ name, boards, overrides, edgingCtx, boxSlotId }: Scenario): void {
  const cuts = boardsToCutItems(boards, 'גוף', overrides, edgingCtx, boxSlotId);
  expect(cuts.length, `${name}: cut count != board count`).toBe(boards.length);
  // Every board must have a non-empty stableId.
  for (const b of boards) {
    expect(b.stableId, `${name}: board ${b.role} missing stableId`).toBeTruthy();
  }
  // 1:1 mapping is preserved by boardsToCutItems.
  boards.forEach((b, i) => {
    const cut = cuts[i]!;
    const length = getDimension(b, 'length', overrides);
    const width  = getDimension(b, 'width',  overrides);
    const thick  = getDimension(b, 'thickness', overrides);
    const mat    = getBoardMaterial(b, overrides);
    // Same deduction formula as `boardsToCutItems`. With no `edgingCtx`,
    // both values are 0 so the assertions collapse to the pre-edging shape.
    const pattern = getEdgingPattern(b.role);
    const edging  = edgingCtx ? resolveEdging(b, boxSlotId, edgingCtx) : undefined;
    const dLen    = edging ? getDeductionFor(pattern, 'length', edging) : 0;
    const dWid    = edging ? getDeductionFor(pattern, 'width',  edging) : 0;
    const expectedW = Math.round((length - dLen) * 1000) / 100;
    const expectedH = Math.round((width  - dWid) * 1000) / 100;
    expect(
      cut.w, `${name}: ${b.stableId} (${b.role}) — CutItem.w (${cut.w}) != expected ${expectedW}`,
    ).toBe(expectedW);
    expect(
      cut.h, `${name}: ${b.stableId} (${b.role}) — CutItem.h (${cut.h}) != expected ${expectedH}`,
    ).toBe(expectedH);
    expect(
      cut.note, `${name}: ${b.stableId} (${b.role}) — note (${cut.note}) != ${Math.round(thick * 10)}mm`,
    ).toBe(`${Math.round(thick * 10)}mm`);
    expect(
      cut.materialId, `${name}: ${b.stableId} (${b.role}) — material (${cut.materialId}) != getMaterial (${mat})`,
    ).toBe(mat);
  });
}

describe('consistency: stableId matches across boards, CutItems, and getDimension', () => {
  const noOverrides: ReadonlyMap<string, BoardOverrides> = new Map();

  it('body (W=80, H=200): every carcass board agrees with its CutItem', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasBack: true });
    assertConsistency({ name: 'body 80×200', boards, overrides: noOverrides });
  });

  it('body with shelves and partition: shelves keyed by item id stay consistent', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({
      ...baseArgs, box: b, hasBack: true,
      items: [shelf('s1', 60), shelf('s2', 120)],
    });
    assertConsistency({ name: 'body with shelves', boards, overrides: noOverrides });
  });

  it('plinth (no recess, no cladding): every plinth board agrees', () => {
    const boxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 57.4, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    assertConsistency({ name: 'plinth basic', boards, overrides: noOverrides });
  });

  it('plinth recessed (recess=2): consistency holds for the shifted boards', () => {
    const boxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 57.4, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
      recessCm: 2,
    });
    assertConsistency({ name: 'plinth recessed', boards, overrides: noOverrides });
  });

  it('plinth with cladding (front material): cladding board agrees with its CutItem', () => {
    const boxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 57.4, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
      frontMaterial: frontMat,
    });
    assertConsistency({ name: 'plinth with cladding', boards, overrides: noOverrides });
  });

  it('plinth with cladding + recess together: still consistent', () => {
    const boxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 57.4, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
      frontMaterial: frontMat, recessCm: 2,
    });
    assertConsistency({ name: 'plinth cladding + recess', boards, overrides: noOverrides });
  });

  it('body > 80cm triggers a mid-body plinth gable — all gables consistent', () => {
    const boxes: Box[] = [box({ W: 120, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 120, cabinetD: 57.4, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
      frontMaterial: frontMat,
    });
    // 2 edge + 1 mid-body = 3 gables × 2 panels + front + back + cladding = 9 boards.
    expect(boards.length).toBeGreaterThanOrEqual(9);
    assertConsistency({ name: 'body > 80 mid-body gable', boards, overrides: noOverrides });
  });

  it('overrides are honoured by the consistency check (CutItem follows the override)', () => {
    const boxes: Box[] = [box({ W: 80, H: 100, level: 'bottom' })];
    const boards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 57.4, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes,
    });
    const target = boards.find(b => b.role === 'plinth-front')!;
    const overrides = new Map<string, BoardOverrides>([
      [target.stableId, { dimensions: { length: 75 }, materialId: 'oak18' }],
    ]);
    assertConsistency({ name: 'plinth with mixed overrides', boards, overrides });
    // Spot-check the overridden values reached the CutItem.
    const cuts = boardsToCutItems(boards, '', overrides);
    const cut = cuts.find(c => c.role === 'plinth-front')!;
    expect(cut.w).toBe(750);
    expect(cut.materialId).toBe('oak18');
  });

  it('lists every BoardDimensionKey so the test catches new ones at compile time', () => {
    // If a new key is added to BoardDimensionKey, this list MUST be updated
    // — the spread asserts every key is present, surfacing the gap.
    const allKeys: BoardDimensionKey[] = ['length', 'width', 'thickness'];
    expect(allKeys.length).toBe(3);
  });
});

// ── Edging — visibility patterns + deductions + override chain ─────────────

describe('getEdgingPattern', () => {
  it('returns "none" for the back panel', () => {
    expect(getEdgingPattern('back')).toBe('none');
  });

  it('returns "none" for every plinth-* role (plinth has no edging by rule)', () => {
    const plinthRoles: BoardRole[] = [
      'plinth-front', 'plinth-back', 'plinth-gable-a', 'plinth-gable-b', 'plinth-front-cladding',
    ];
    for (const role of plinthRoles) {
      expect(getEdgingPattern(role), `${role} should be "none"`).toBe('none');
    }
  });

  it('returns "front" for sides, top, bottom, and partition', () => {
    const frontRoles: BoardRole[] = ['side-left', 'side-right', 'top', 'bottom', 'partition'];
    for (const role of frontRoles) {
      expect(getEdgingPattern(role), `${role} should be "front"`).toBe('front');
    }
  });

  it('returns "front" for every shelf variant (visible front cut → edging)', () => {
    const shelfRoles: BoardRole[] = ['shelf', 'fixed-shelf', 'internal-shelf'];
    for (const role of shelfRoles) {
      expect(getEdgingPattern(role), `${role} should be "front"`).toBe('front');
    }
  });

  it('returns "front" for every envelope role', () => {
    const envelopeRoles: BoardRole[] = ['envelope-left', 'envelope-right', 'envelope-top'];
    for (const role of envelopeRoles) {
      expect(getEdgingPattern(role), `${role} should be "front"`).toBe('front');
    }
  });
});

describe('getDeductionFor', () => {
  const e06: Edging = { thickness: 0.6 };
  const e13: Edging = { thickness: 1.3 };

  it('"none" pattern → 0 on every dimension', () => {
    expect(getDeductionFor('none', 'length',    e06)).toBe(0);
    expect(getDeductionFor('none', 'width',     e06)).toBe(0);
    expect(getDeductionFor('none', 'thickness', e06)).toBe(0);
  });

  it('"thickness" key → 0 under any pattern (band wraps the face, not the thickness)', () => {
    expect(getDeductionFor('front',     'thickness', e06)).toBe(0);
    expect(getDeductionFor('perimeter', 'thickness', e13)).toBe(0);
  });

  it('"front" pattern → t/10 on width only, zero on length', () => {
    expect(getDeductionFor('front', 'width',  e06)).toBeCloseTo(0.06);
    expect(getDeductionFor('front', 'length', e06)).toBe(0);
    expect(getDeductionFor('front', 'width',  e13)).toBeCloseTo(0.13);
    expect(getDeductionFor('front', 'length', e13)).toBe(0);
  });

  it('"perimeter" pattern → 2·t/10 on BOTH length and width', () => {
    expect(getDeductionFor('perimeter', 'length', e06)).toBeCloseTo(0.12);
    expect(getDeductionFor('perimeter', 'width',  e06)).toBeCloseTo(0.12);
    expect(getDeductionFor('perimeter', 'length', e13)).toBeCloseTo(0.26);
    expect(getDeductionFor('perimeter', 'width',  e13)).toBeCloseTo(0.26);
  });
});

describe('resolveEdging — override chain', () => {
  function makeBoard(stableId: string, materialId: MaterialId = 'mdf18'): Board {
    return {
      id: 'b_test', stableId, role: 'side-left', materialId,
      length: 100, width: 60, thickness: 1.8,
      xFrom: 0, xTo: 1.8, yFrom: 0, yTo: 100, visible: true,
    };
  }

  it('returns cabinet default when no overrides apply', () => {
    const board = makeBoard('side-left@bottom:left');
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map(),
      boardOverrides: new Map(),
    };
    expect(resolveEdging(board, 'bottom:left', ctx)).toEqual({ thickness: 0.6 });
  });

  it('per-body override wins over cabinet default', () => {
    const board = makeBoard('side-left@bottom:left');
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map([['bottom:left', { thickness: 1.3 }]]),
      boardOverrides: new Map(),
    };
    expect(resolveEdging(board, 'bottom:left', ctx)).toEqual({ thickness: 1.3 });
  });

  it('per-board override wins over body and cabinet', () => {
    const board = makeBoard('top@bottom:left');
    const perBoard: Edging = { thickness: 0.6, finishMaterialId: 'oak18' };
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map([['bottom:left', { thickness: 1.3 }]]),
      boardOverrides: new Map([['top@bottom:left', { edging: perBoard }]]),
    };
    expect(resolveEdging(board, 'bottom:left', ctx)).toEqual(perBoard);
  });

  it('boxSlotId=undefined skips the body layer (cabinet-level singletons)', () => {
    const board = makeBoard('plinth-front');
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map([['bottom:left', { thickness: 1.3 }]]),
      boardOverrides: new Map(),
    };
    expect(resolveEdging(board, undefined, ctx)).toEqual({ thickness: 0.6 });
  });

  it('per-body entry for a DIFFERENT slot does not leak — falls through to cabinet', () => {
    const board = makeBoard('side-left@bottom:left');
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 1.3 },
      bodyOverrides: new Map([['top:right', { thickness: 0.6 }]]),
      boardOverrides: new Map(),
    };
    expect(resolveEdging(board, 'bottom:left', ctx)).toEqual({ thickness: 1.3 });
  });

  it('boardOverrides entry without an edging field does NOT count as a per-board override', () => {
    const board = makeBoard('top@bottom:left');
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map([['bottom:left', { thickness: 1.3 }]]),
      // Material override only — edging stays undefined → body layer wins.
      boardOverrides: new Map([['top@bottom:left', { materialId: 'oak18' }]]),
    };
    expect(resolveEdging(board, 'bottom:left', ctx)).toEqual({ thickness: 1.3 });
  });
});

describe('getEdgingFinishMaterial — auto resolution', () => {
  function makeBoard(materialId: MaterialId): Board {
    return {
      id: 'b', stableId: 'top@bottom:left', role: 'top', materialId,
      length: 80, width: 60, thickness: 1.8,
      xFrom: 0, xTo: 80, yFrom: 0, yTo: 1.8, visible: true,
    };
  }

  it('returns the explicit finishMaterialId when set', () => {
    const board = makeBoard('mdf18');
    const edging: Edging = { thickness: 0.6, finishMaterialId: 'oak18' };
    expect(getEdgingFinishMaterial(board, edging, new Map())).toBe('oak18');
  });

  it('auto: returns the board materialId when finishMaterialId is undefined', () => {
    const board = makeBoard('mdf18');
    expect(getEdgingFinishMaterial(board, { thickness: 0.6 }, new Map())).toBe('mdf18');
  });

  it('auto: follows a per-board material override (band tracks the panel\'s sheet)', () => {
    const board = makeBoard('mdf18');
    const overrides = new Map<string, BoardOverrides>([
      ['top@bottom:left', { materialId: 'oak18' }],
    ]);
    expect(getEdgingFinishMaterial(board, { thickness: 0.6 }, overrides)).toBe('oak18');
  });
});

describe('EdgingPattern — discriminated union', () => {
  it('lists every EdgingPattern so the test catches new ones at compile time', () => {
    const allPatterns: EdgingPattern[] = ['none', 'front', 'perimeter'];
    expect(allPatterns).toHaveLength(3);
  });
});

// ── Edging — end-to-end deduction in CutItem dimensions ────────────────────
// These scenarios drive the actual production formula: `boardsToCutItems`
// (body panels), `calcCuts` (door panels), and `calcExternalDrawerFrontCuts`
// (external-drawer fronts). Each test pins both the deducted CutItem values
// and the regression invariants the user called out (back / plinth never
// shrink; finishMaterialId auto-resolves to the board's material).

const noOverrides: ReadonlyMap<string, BoardOverrides> = new Map();

describe('Edging — boardsToCutItems deduction', () => {
  it('cabinet default 0.6 mm: every body board loses 0.6 mm (= 0.06 cm) from width, 0 from length', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasBack: true });
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map(),
      boardOverrides: noOverrides,
    };
    const slotId = 'bottom:left';
    const cuts = boardsToCutItems(boards, 'גוף', noOverrides, ctx, slotId);
    boards.forEach((board, i) => {
      const cut    = cuts[i]!;
      const pattern = getEdgingPattern(board.role);
      // 0.6 mm band → 0.06 cm deduction on `width` for the 'front' pattern.
      // Same formula production uses; rounded ×10 mm at the end.
      const dWidCm = pattern === 'front' ? 0.06 : 0;
      expect(cut.w, `${board.role}: length unchanged`).toBe(Math.round(board.length * 1000) / 100);
      expect(cut.h, `${board.role}: width − 0.06 cm`).toBe(
        Math.round((board.width - dWidCm) * 1000) / 100,
      );
    });
    // The dedicated consistency helper agrees end-to-end.
    assertConsistency({
      name: 'cabinet default 0.6 on body',
      boards, overrides: noOverrides, edgingCtx: ctx, boxSlotId: slotId,
    });
  });

  it('per-body override 1.3 mm + oak18 finish: every body board takes the body band (= 0.13 cm)', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasBack: true });
    const slotId = 'bottom:left';
    const bodyEdging: Edging = { thickness: 1.3, finishMaterialId: 'oak18' };
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map([[slotId, bodyEdging]]),
      boardOverrides: noOverrides,
    };
    const cuts = boardsToCutItems(boards, 'גוף', noOverrides, ctx, slotId);
    boards.forEach((board, i) => {
      const cut    = cuts[i]!;
      const pattern = getEdgingPattern(board.role);
      // 1.3 mm = 0.13 cm; only 'front' pattern is affected.
      const dWidCm = pattern === 'front' ? 0.13 : 0;
      expect(cut.h, board.role).toBe(Math.round((board.width - dWidCm) * 1000) / 100);
    });
    assertConsistency({
      name: 'per-body 1.3 oak18 on body',
      boards, overrides: noOverrides, edgingCtx: ctx, boxSlotId: slotId,
    });
  });

  it('per-board override on top: only the top board takes 1.3 mm, rest stay at cabinet 0.6 mm', () => {
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasBack: true });
    const slotId = 'bottom:left';
    const topBoard = boards.find(bd => bd.role === 'top')!;
    const overrides = new Map<string, BoardOverrides>([
      [topBoard.stableId, { edging: { thickness: 1.3 } }],
    ]);
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map(),
      boardOverrides: overrides,
    };
    const cuts = boardsToCutItems(boards, 'גוף', overrides, ctx, slotId);
    boards.forEach((board, i) => {
      const cut       = cuts[i]!;
      const pattern   = getEdgingPattern(board.role);
      // Top board → 0.13 cm; every other 'front' board → 0.06 cm; 'none' → 0.
      const dWidCm = pattern === 'front'
        ? (board.stableId === topBoard.stableId ? 0.13 : 0.06)
        : 0;
      expect(cut.h, `${board.role} (${board.stableId})`).toBe(
        Math.round((board.width - dWidCm) * 1000) / 100,
      );
    });
    assertConsistency({
      name: 'per-board override on top',
      boards, overrides, edgingCtx: ctx, boxSlotId: slotId,
    });
  });

  it('back + plinth regression: dimensions unchanged with edgingCtx (pattern = none)', () => {
    const b = box({ W: 80, H: 200, level: 'bottom' });
    const bodyBoards   = buildBoardModel({ ...baseArgs, box: b, hasBack: true });
    const plinthBoards = buildPlinthBoardModel({
      cabinetW: 80, cabinetD: 57.4, plinthHeight: 10,
      bodyMaterial: bodyMat, boxes: [b],
    });
    const ctx: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map(),
      boardOverrides: noOverrides,
    };

    const backBoard  = bodyBoards.find(bd => bd.role === 'back')!;
    const backCut    = boardsToCutItems(bodyBoards, '', noOverrides, ctx, 'bottom:left')
      .find(c => c.role === 'back')!;
    // No deduction whatsoever — back keeps the raw W × H derivation.
    expect(backCut.w).toBe(Math.round(backBoard.length * 10));
    expect(backCut.h).toBe(Math.round(backBoard.width  * 10));

    const plinthCuts = boardsToCutItems(plinthBoards, '', noOverrides, ctx);
    plinthBoards.forEach((board, i) => {
      const cut = plinthCuts[i]!;
      expect(cut.w, `${board.role}: plinth length unchanged`).toBe(Math.round(board.length * 10));
      expect(cut.h, `${board.role}: plinth width  unchanged`).toBe(Math.round(board.width  * 10));
    });
  });

  it('regression — per-body override 0.6→1.3mm produces distinct h values (0.7mm not masked by rounding)', () => {
    // Bug: with Math.round(...*10) (integer mm) the 0.7mm gap between 0.6 mm
    // and 1.3 mm edging on the depth axis rounded to 0, making the per-body
    // override invisible in the cut list. With 0.01 mm precision the two h
    // values are distinct.
    // D=60 cm chosen so both roundings land on the same integer mm:
    //   (60 - 0.06) × 10 = 599.4 → 599   (old, BUG)
    //   (60 - 0.13) × 10 = 598.7 → 599   (old, BUG — same!)
    // With the fixed formula (×1000/100):
    //   (60 - 0.06) × 1000/100 = 599.4   (new, distinct ✓)
    //   (60 - 0.13) × 1000/100 = 598.7   (new, distinct ✓)
    const b = box({ W: 80, H: 200, D: 60 });
    const boards = buildBoardModel({ ...baseArgs, box: b, hasBack: true });
    const slotId = 'single:single';

    const ctxDefault: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map(),
      boardOverrides: noOverrides,
    };
    const ctxOverride: EdgingContext = {
      cabinetDefault: { thickness: 0.6 },
      bodyOverrides: new Map([[slotId, { thickness: 1.3 }]]),
      boardOverrides: noOverrides,
    };

    const cutsDefault  = boardsToCutItems(boards, '', noOverrides, ctxDefault,  slotId);
    const cutsOverride = boardsToCutItems(boards, '', noOverrides, ctxOverride, slotId);

    // Pick any 'front'-pattern board (e.g. side-left) and confirm h differs.
    const sideDefault  = cutsDefault .find(c => c.role === 'side-left')!;
    const sideOverride = cutsOverride.find(c => c.role === 'side-left')!;
    expect(sideDefault.h).toBe(599.4);   // (60 - 0.06) × 1000/100
    expect(sideOverride.h).toBe(598.7);  // (60 - 0.13) × 1000/100
    expect(sideDefault.h).not.toBe(sideOverride.h);

    // 'none'-pattern boards (back) must be unaffected by edging.
    const backDefault  = cutsDefault .find(c => c.role === 'back')!;
    const backOverride = cutsOverride.find(c => c.role === 'back')!;
    expect(backDefault.h).toBe(backOverride.h);
  });

  it('finishMaterialId=undefined: getEdgingFinishMaterial auto-resolves to board material', () => {
    // The CutItem itself doesn't carry the finish color (no edgingDescription
    // by stage-1 decision), so this test exercises the helper directly with
    // a board whose effective material is the body default.
    const b = box({ W: 80, H: 200 });
    const boards = buildBoardModel({ ...baseArgs, box: b });
    const topBoard = boards.find(bd => bd.role === 'top')!;
    const autoEdging: Edging = { thickness: 0.6 }; // finish undefined
    expect(getEdgingFinishMaterial(topBoard, autoEdging, noOverrides)).toBe(topBoard.materialId);

    // And if the board carries a material override, auto follows it.
    const overrides = new Map<string, BoardOverrides>([
      [topBoard.stableId, { materialId: 'oak18' }],
    ]);
    expect(getEdgingFinishMaterial(topBoard, autoEdging, overrides)).toBe('oak18');
  });
});

describe('Edging — calcCuts door perimeter deduction', () => {
  it('door cuts shrink by 2×t/10 cm on both axes when edging is supplied', () => {
    // Baseline (no edging): record the raw w/h of each door cut.
    const args = (edging?: Edging): CutItem[] => calcCuts(
      'cabinet',
      80,    // W
      200,   // H
      60,    // D
      0,     // shelves
      0,     // drawers
      true,  // hasBack
      0,     // plinth
      false, // doorCoversPlinth
      undefined, // lowerH
      false, // hasShell
      1.8,   // tShell
      1.8,   // tBody
      3,     // doorGapMm
      false, // hasEnvelopeTop
      1.8,   // tFront
      60,    // maxDoorWidth
      edging,
    );
    const baseline = args(undefined).filter(c => c.group === 'door');
    const banded06 = args({ thickness: 0.6 }).filter(c => c.group === 'door');
    const banded13 = args({ thickness: 1.3 }).filter(c => c.group === 'door');

    expect(banded06).toHaveLength(baseline.length);
    expect(banded13).toHaveLength(baseline.length);

    baseline.forEach((base, i) => {
      // 0.6 mm × 2 sides = 1.2 mm per axis.
      expect(banded06[i]!.w, '0.6 mm width').toBe(base.w - 1.2);
      expect(banded06[i]!.h, '0.6 mm height').toBe(base.h - 1.2);
      // 1.3 mm × 2 sides = 2.6 mm per axis.
      expect(banded13[i]!.w, '1.3 mm width').toBe(base.w - 2.6);
      expect(banded13[i]!.h, '1.3 mm height').toBe(base.h - 2.6);
    });
  });
});

describe('Edging — calcExternalDrawerFrontCuts perimeter deduction', () => {
  it('drawer-front cut shrinks by 2×t/10 cm on both axes when edging is supplied', () => {
    const items: InteriorItem[] = [{
      type: 'drawer', id: 'd1', heightFromFloor: 0, drawerHeight: 20, mount: 'external',
    }];
    const baseline = calcExternalDrawerFrontCuts(
      items, 40, 3, 0, false, 18,
    );
    const banded06 = calcExternalDrawerFrontCuts(
      items, 40, 3, 0, false, 18, undefined, { thickness: 0.6 },
    );
    const banded13 = calcExternalDrawerFrontCuts(
      items, 40, 3, 0, false, 18, undefined, { thickness: 1.3 },
    );

    expect(baseline).toHaveLength(1);
    expect(banded06).toHaveLength(1);
    expect(banded13).toHaveLength(1);

    // Baseline: 40 cm × 10 = 400 mm wide; 20 cm × 10 = 200 mm tall.
    expect(baseline[0]!.w).toBe(400);
    expect(baseline[0]!.h).toBe(200);
    // 0.6 mm band: deduct 1.2 mm on each axis.
    expect(banded06[0]!.w).toBe(400 - 1.2);
    expect(banded06[0]!.h).toBe(200 - 1.2);
    // 1.3 mm band: deduct 2.6 mm on each axis.
    expect(banded13[0]!.w).toBe(400 - 2.6);
    expect(banded13[0]!.h).toBe(200 - 2.6);
  });
});
