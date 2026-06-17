import { describe, it, expect } from 'vitest';
import { cabinetBoardBoxes, productBoardBoxes, productFrontBoxes } from './cabinetBoards3D';
import { productBounds, productSubBoxes } from '../room/productBounds';
import { defaultInputForType, emptyCabinetState } from './productDefaults';
import type { CabinetInput, SavedCabinetState } from '../../types';
import type { ShelfItem, DrawerItem, RodItem } from '../../types/interior';
import type { ProductUnit } from '../../types/project';

// doorsPerColumn:1 → single body, stable slot 'single:single'.
function singleBodyInput(): CabinetInput {
  return { ...defaultInputForType('wardrobe'), doorsPerColumn: 1 };
}
const state = () => emptyCabinetState() as SavedCabinetState;

describe('cabinetBoardBoxes', () => {
  it('emits the carcass boards of a single body and stays within the footprint', () => {
    const input = singleBodyInput();
    const boards = cabinetBoardBoxes(input, state(), []);
    // sides ×2, top, bottom, back = 5 minimum (no shelves, no shell).
    expect(boards.length).toBeGreaterThanOrEqual(5);
    const roles = new Set(boards.map(b => b.role));
    expect(roles).toContain('side-left');
    expect(roles).toContain('side-right');
    expect(roles).toContain('top');
    expect(roles).toContain('bottom');
    expect(roles).toContain('back');

    // Every board lies inside the cabinet's outer envelope.
    for (const b of boards) {
      expect(b.x0).toBeGreaterThanOrEqual(-0.001);
      expect(b.x1).toBeLessThanOrEqual(input.W + 0.001);
      expect(b.y0).toBeGreaterThanOrEqual(-0.001);
      expect(b.y1).toBeLessThanOrEqual(input.H + 0.001);
      expect(b.z0).toBeGreaterThanOrEqual(-0.001);
      expect(b.z1).toBeLessThanOrEqual(input.D + 0.001);
    }
  });

  it('places the back panel flush against the rear (z≈0)', () => {
    const back = cabinetBoardBoxes(singleBodyInput(), state(), []).find(b => b.role === 'back')!;
    expect(back).toBeDefined();
    expect(back.z0).toBeCloseTo(0, 5);
    expect(back.z1).toBeCloseTo(singleBodyInput().backThickness, 5);
  });

  it('a shelf at heightFromFloor lands at that height (body-bottom relative)', () => {
    const shelf: ShelfItem = { id: 'sh1', type: 'shelf', heightFromFloor: 100 };
    const st = { ...emptyCabinetState(), interior: { 'single:single': [shelf] } } as unknown as SavedCabinetState;
    const input = singleBodyInput();
    const boards = cabinetBoardBoxes(input, st, []);
    const shelfBox = boards.find(b => b.role === 'shelf');
    expect(shelfBox).toBeDefined();
    // The body floor sits at the plinth; the shelf's bottom edge is plinth + 100.
    expect(shelfBox!.y0).toBeCloseTo(input.plinth + 100, 1);
  });

  it('side panels span the full body height between plinth top and cabinet top', () => {
    const input = singleBodyInput();
    const left = cabinetBoardBoxes(input, state(), []).find(b => b.role === 'side-left')!;
    expect(left.y1).toBeCloseTo(input.H, 1);            // reaches the cabinet top
    expect(left.y0).toBeGreaterThanOrEqual(input.plinth - 0.01); // sits on the plinth
  });

  it('front faces sit at the cabinet front plane (z = D − tFront … D), within the width', () => {
    const input = singleBodyInput();
    const fronts = productFrontBoxes(
      { id: 'p', name: 'ארון', productType: 'wardrobe', cabinet: { input, state: state() } } as ProductUnit,
      [],
    );
    expect(fronts.length).toBeGreaterThan(0);
    for (const f of fronts) {
      expect(f.role).toBe('front');
      expect(f.z1).toBeCloseTo(input.D, 5);        // at the very front
      expect(f.z0).toBeLessThan(f.z1);             // a real (thin) panel
      expect(f.z1 - f.z0).toBeLessThan(3);         // front-material thickness
      expect(f.x0).toBeGreaterThanOrEqual(-0.01);
      expect(f.x1).toBeLessThanOrEqual(input.W + 0.01);
    }
  });

  it('outer shell: side panels reach the cabinet top, flush with the envelope-top cap', () => {
    const input = { ...singleBodyInput(), hasShell: true, hasEnvelopeTop: true };
    const boards = cabinetBoardBoxes(input, state(), []);
    const left = boards.find(b => b.role === 'envelope-left')!;
    const top = boards.find(b => b.role === 'envelope-top')!;
    expect(left).toBeDefined();
    expect(top).toBeDefined();
    // Cap top and side top are both the cabinet top — no proud cap.
    expect(top.y1).toBeCloseTo(input.H, 5);
    expect(left.y1).toBeCloseTo(input.H, 5);
    // Side runs the full height; cap is just the top band.
    expect(left.y0).toBeCloseTo(0, 5);
    expect(top.y0).toBeLessThan(top.y1);
    // Cap sits between the sides (inner width), sides at the outer edges.
    expect(left.x0).toBeCloseTo(0, 5);
    expect(top.x0).toBeGreaterThanOrEqual(left.x1 - 1e-6);
  });

  it('wall cabinet (קלפה): top + bottom front caps wrap the body, no side shell', () => {
    const input = { ...singleBodyInput(), mount: 'wall' as const, hasWallEnvelope: true, plinth: 0 };
    const boards = cabinetBoardBoxes(input, state(), []);
    const top = boards.find(b => b.role === 'envelope-top');
    const bottom = boards.find(b => b.role === 'envelope-bottom');
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    // A wall cabinet has no side shell.
    expect(boards.find(b => b.role === 'envelope-left')).toBeUndefined();
    expect(boards.find(b => b.role === 'envelope-right')).toBeUndefined();
    // Caps sit at the very top and the very bottom, full external width.
    expect(top!.y1).toBeCloseTo(input.H, 5);
    expect(bottom!.y0).toBeCloseTo(0, 5);
    expect(top!.x0).toBeCloseTo(0, 5);
    expect(top!.x1).toBeCloseTo(input.W, 5);
    // The body is sandwiched between the caps — a cap-thickness band each end.
    const tF = top!.y1 - top!.y0;
    expect(bottom!.y1 - bottom!.y0).toBeCloseTo(tF, 5);
    const side = boards.find(b => b.role === 'side-left')!;
    expect(side.y1).toBeCloseTo(input.H - tF, 1);   // under the top cap
    expect(side.y0).toBeCloseTo(tF, 1);             // above the bottom cap
  });

  it('a hanging rod becomes a slender bar at its height, spanning the inner width', () => {
    const rod: RodItem = { id: 'r1', type: 'rod', heightFromFloor: 150 };
    const st = { ...emptyCabinetState(), interior: { 'single:single': [rod] } } as unknown as SavedCabinetState;
    const input = singleBodyInput();
    const bar = cabinetBoardBoxes(input, st, []).find(b => b.role === 'rod')!;
    expect(bar).toBeDefined();
    const yMid = (bar.y0 + bar.y1) / 2;
    expect(yMid).toBeCloseTo(input.plinth + 150, 1);     // body-bottom relative
    expect(bar.x1 - bar.x0).toBeGreaterThan(input.W * 0.7); // runs across the inside
    expect(bar.y1 - bar.y0).toBeLessThan(5);             // thin
  });

  it('the plinth renders, and a recess sets the kick-board back in depth (not buried)', () => {
    const flush = cabinetBoardBoxes({ ...singleBodyInput(), plinth: 10, plinthRecess: 0 }, state(), []);
    const recessed = cabinetBoardBoxes({ ...singleBodyInput(), plinth: 10, plinthRecess: 4 }, state(), []);
    const flushFront = flush.find(b => b.role === 'plinth-front')!;
    const recessedFront = recessed.find(b => b.role === 'plinth-front')!;
    expect(flushFront).toBeDefined();        // plinth shows
    expect(recessedFront).toBeDefined();
    // The kick-board's front face (max z) is the same axis in both; recess
    // pushes it back toward the wall by ~4 cm — and it stays in front of the back.
    expect(flushFront.z1 - recessedFront.z1).toBeCloseTo(4, 1);
    expect(recessedFront.z1).toBeGreaterThan(0);
  });

  it('an internal drawer becomes a tray box, inset from the carcass sides', () => {
    const drawer: DrawerItem = { id: 'd1', type: 'drawer', mount: 'internal', heightFromFloor: 40, drawerHeight: 20 };
    const st = { ...emptyCabinetState(), interior: { 'single:single': [drawer] } } as unknown as SavedCabinetState;
    const input = singleBodyInput();
    const tray = cabinetBoardBoxes(input, st, []).find(b => b.role === 'drawer-box')!;
    expect(tray).toBeDefined();
    expect(tray.x0).toBeGreaterThan(0);          // inset from the left side
    expect(tray.x1).toBeLessThan(input.W);       // inset from the right side
    expect(tray.y0).toBeCloseTo(input.plinth + 40 + 2, 1);  // bottom gap
    expect(tray.y1).toBeCloseTo(input.plinth + 40 + 20 - 3, 1); // top gap
  });
});

describe('productBoardBoxes — kitchen', () => {
  function kitchenProduct(): ProductUnit {
    const mk = (w: number) => ({
      id: `u_${w}`,
      name: `unit ${w}`,
      moduleType: 'drawers',
      cabinet: { input: { ...singleBodyInput(), W: w, H: 90, D: 60, plinth: 10 }, state: state() },
    });
    return {
      id: 'k1', name: 'kitchen', productType: 'kitchen',
      cabinet: { input: singleBodyInput(), state: state() },
      kitchenUnits: [mk(60) as never, mk(80) as never],
    };
  }

  it('lays out each unit and keeps all boards inside the kitchen footprint', () => {
    const product = kitchenProduct();
    const boards = productBoardBoxes(product, []);
    expect(boards.length).toBeGreaterThan(0);
    const bounds = productBounds(product);
    for (const b of boards) {
      expect(b.x0).toBeGreaterThanOrEqual(-0.01);
      expect(b.x1).toBeLessThanOrEqual(bounds.width + 0.01);
      expect(b.y1).toBeLessThanOrEqual(bounds.height + 0.01);
      expect(b.z1).toBeLessThanOrEqual(bounds.depth + 0.01);
    }
    expect(Math.max(...boards.map(b => b.x1))).toBeGreaterThan(60);
  });

  it('mirrors the unit order to match the kitchen viewer (unit 1 on the right)', () => {
    // Units: u_60 (first), u_80 (second). The product view is RTL, so unit 1
    // sits on the RIGHT — the rightmost sub-box must be the 60 cm-wide first unit.
    const subs = productSubBoxes(kitchenProduct());
    const rightmost = subs.reduce((a, b) => (b.x1 > a.x1 ? b : a));
    expect(rightmost.x1 - rightmost.x0).toBeCloseTo(60, 1);
  });
});
