import { describe, it, expect } from 'vitest';
import { cabinetFrontPanels } from './cabinetFronts';
import { computeUnitCutsAndHardware } from '../cabinetCompute';
import { defaultInputForType, emptyCabinetState } from './productDefaults';
import { kitchenModuleInput, kitchenModuleState } from './kitchenModules';
import type { CabinetInput, SavedCabinetState } from '../../types';
import type { DrawerItem } from '../../types/interior';

function singleBodyInput(): CabinetInput {
  return { ...defaultInputForType('wardrobe'), doorsPerColumn: 1 };
}
const state = () => emptyCabinetState() as SavedCabinetState;

describe('cabinetFrontPanels', () => {
  it('emits door faces within the width, above the plinth, up to the cabinet top', () => {
    const input = singleBodyInput();
    const panels = cabinetFrontPanels(input, state(), []);
    expect(panels.length).toBeGreaterThan(0);
    for (const p of panels) {
      expect(p.x0).toBeGreaterThanOrEqual(-0.01);
      expect(p.x1).toBeLessThanOrEqual(input.W + 0.01);
      expect(p.y0).toBeGreaterThanOrEqual(input.plinth - 0.01); // faces start above the plinth
      expect(p.y1).toBeLessThanOrEqual(input.H + 0.01);
      expect(p.y1).toBeGreaterThan(p.y0);
    }
  });

  it('an appliance bay (hasFronts:false, no external drawers) has no faces', () => {
    const input = { ...singleBodyInput(), hasFronts: false };
    expect(cabinetFrontPanels(input, state(), [])).toHaveLength(0);
  });

  it('shelled cabinet: door faces sit INSIDE the shell, never past W', () => {
    // Regression: the render used to lay fronts over the full W and shift them
    // right by the left shell, so a shelled face overhung the right edge by one
    // shell thickness. Masked by the old inter-unit gap in 3D; once kitchen
    // units packed flush it overlapped the neighbour. Fronts must match the cut
    // list — inset within the shell opening, within [0, W].
    const W = singleBodyInput().W;
    const noShell = cabinetFrontPanels(singleBodyInput(), state(), []);
    const shelled = cabinetFrontPanels({ ...singleBodyInput(), hasShell: true }, state(), []);

    for (const p of shelled) {
      expect(p.x0).toBeGreaterThanOrEqual(-0.01);
      expect(p.x1).toBeLessThanOrEqual(W + 0.01); // no overhang past the shell
    }
    const leftX0 = (ps: typeof shelled) => Math.min(...ps.map(p => p.x0));
    const doorW = (ps: typeof shelled) => Math.max(...ps.map(p => p.x1 - p.x0));
    expect(leftX0(shelled)).toBeGreaterThan(leftX0(noShell)); // inset by the shell
    expect(doorW(shelled)).toBeLessThan(doorW(noShell));      // spans innerW, not W
  });

  it('door panels carry a hinge side (for the elevation marking symbol)', () => {
    const panels = cabinetFrontPanels(singleBodyInput(), state(), []);
    const doors = panels.filter(p => p.hingeSide !== undefined);
    expect(doors.length).toBeGreaterThan(0);
    // A single-door body defaults to a right-hinged door.
    expect(doors[0]!.hingeSide).toBe('right');
  });

  it('honors a user-saved hinge side over the geometric default', () => {
    // The 2D elevation reads the live doorsById; the overlay + 3D fronts must
    // match — so a saved hinge side wins over the default (single body → right).
    const st = state();
    st.doors['single:single:0'] = { hingeSide: 'left', hingeCount: 'auto', hinges: [], hasDoor: true };
    const panels = cabinetFrontPanels(singleBodyInput(), st, []);
    const doors = panels.filter(p => p.hingeSide !== undefined);
    expect(doors[0]!.hingeSide).toBe('left');
  });

  it('2 fronts, no partition: a saved invalid hinge side is clamped to the outer gable', () => {
    // 90 cm / maxDoorWidth 50 → 2 fronts in one carcass. The doors meet in the
    // open middle (no panel) → each is forced onto its outer gable. A saved
    // 'left' on the RIGHTMOST door (fi=0) is physically impossible and ignored.
    const input = { ...singleBodyInput(), W: 90, maxDoorWidth: 50 };
    const st = state();
    st.doors['single:single:0'] = { hingeSide: 'left', hingeCount: 'auto', hinges: [], hasDoor: true };
    const doors = cabinetFrontPanels(input, st, []).filter(p => p.hingeSide !== undefined);
    expect(doors).toHaveLength(2);
    const rightmost = doors.reduce((a, b) => (b.x0 > a.x0 ? b : a));
    expect(rightmost.hingeSide).toBe('right'); // forced gable, not the saved 'left'
  });

  it('2 fronts WITH a partition: the saved hinge side is honored (inner edge is the divider)', () => {
    const input = { ...singleBodyInput(), W: 90, maxDoorWidth: 50 };
    const st = state();
    st.partitions['single:single'] = true; // a divider panel on the inner edge
    st.doors['single:single:0'] = { hingeSide: 'left', hingeCount: 'auto', hinges: [], hasDoor: true };
    const doors = cabinetFrontPanels(input, st, []).filter(p => p.hingeSide !== undefined);
    const rightmost = doors.reduce((a, b) => (b.x0 > a.x0 ? b : a));
    expect(rightmost.hingeSide).toBe('left'); // now both edges have a panel → honored
  });

  it('corner (פינה): the door panel is hinged on the filler side, the filler has none', () => {
    const input = kitchenModuleInput('corner'); // door on the right → hinge left
    const panels = cabinetFrontPanels(input, kitchenModuleState('corner') as SavedCabinetState, []);
    const hinged = panels.filter(p => p.hingeSide !== undefined);
    expect(hinged).toHaveLength(1);                 // only the door, not the filler
    expect(hinged[0]!.hingeSide).toBe('left');      // filler side (opposite the right edge)
  });

  it('lift-up door (קלפה): the hinge edge is the top (opens upward)', () => {
    const input = kitchenModuleInput('wall'); // liftMechanism: true
    const panels = cabinetFrontPanels(input, kitchenModuleState('wall') as SavedCabinetState, []);
    const hinged = panels.filter(p => p.hingeSide !== undefined);
    expect(hinged.length).toBeGreaterThan(0);
    expect(hinged.every(p => p.hingeSide === 'top')).toBe(true);
  });

  // ── Multi-body free-standing cabinet (the bug) ────────────────────────────
  // A wide + tall wardrobe decomposes into several bodies (3 width columns ×
  // 2 height rows). The earlier single-body model read only `single:single`
  // and split columns over the FULL width, so it emitted a handful of doors
  // and zero drawer faces. The decomposition-based model must produce one door
  // per body front and surface drawers placed in any body.
  describe('multi-body wardrobe', () => {
    const wide = (): CabinetInput => ({ ...defaultInputForType('wardrobe'), W: 240, H: 220, plinth: 0 });

    it('renders one door face per cut-list door (count + width multiset match)', () => {
      const input = wide();
      const { cuts } = computeUnitCutsAndHardware(input, state(), []);
      const cutWidths = cuts.filter(c => c.group === 'door').map(c => c.w).sort((a, b) => a - b);
      const renderWidths = cabinetFrontPanels(input, state(), [])
        .filter(p => p.hingeSide !== undefined)
        .map(p => Math.round((p.x1 - p.x0) * 10))
        .sort((a, b) => a - b);

      expect(cutWidths.length).toBeGreaterThan(4); // genuinely multi-body, not 1–4 doors
      expect(renderWidths.length).toBe(cutWidths.length);
      renderWidths.forEach((rw, i) => expect(Math.abs(rw - cutWidths[i]!)).toBeLessThanOrEqual(2));
    });

    it('surfaces an external drawer placed in a non-default body', () => {
      const input = { ...defaultInputForType('wardrobe'), W: 240, H: 80, plinth: 0 };
      // 240 wide → 3 single-level bodies (unit_1/2/3). Drop a drawer in the middle.
      const st = state();
      const drawer: DrawerItem = { type: 'drawer', id: 'd1', heightFromFloor: 0, drawerHeight: 20, mount: 'external' };
      st.interior['single:unit_2'] = [drawer];
      const panels = cabinetFrontPanels(input, st, []);
      const drawerFaces = panels.filter(p => p.hingeSide === undefined);
      expect(drawerFaces.length).toBe(1); // the drawer in unit_2 has a face now
    });
  });

  // ── doorCoversPlinth (the skirt) — faces extend DOWN over the plinth ───────
  describe('doorCoversPlinth', () => {
    const plinth = 10;

    it('a skirt-covering door drops below the plinth line (~1cm floor clearance)', () => {
      const covers = { ...singleBodyInput(), plinth, doorCoversPlinth: true };
      const plain = { ...singleBodyInput(), plinth, doorCoversPlinth: false };
      const gapCm = covers.doorGapMm / 10;
      const door = cabinetFrontPanels(covers, state(), []).find(p => p.hingeSide !== undefined)!;
      const plainDoor = cabinetFrontPanels(plain, state(), []).find(p => p.hingeSide !== undefined)!;

      expect(door.y0).toBeLessThan(plainDoor.y0);       // drops vs a non-covering door
      expect(door.y0).toBeLessThan(plinth);              // covers the plinth
      expect(door.y0).toBeCloseTo(1 - gapCm, 1);         // ~1cm clearance off the floor
    });

    it('a skirt-covering external drawer face drops below the plinth line', () => {
      const input = { ...singleBodyInput(), plinth, doorCoversPlinth: true };
      const st = state();
      const drawer: DrawerItem = { type: 'drawer', id: 'd1', heightFromFloor: 0, drawerHeight: 20, mount: 'external' };
      st.interior['single:single'] = [drawer];
      const face = cabinetFrontPanels(input, st, []).find(p => p.hingeSide === undefined)!;
      expect(face).toBeDefined();
      expect(face.y0).toBeLessThan(plinth);
      expect(face.y0).toBeGreaterThanOrEqual(0); // never below the floor
    });
  });

  it('קלפה with wall envelope: the lift door sits BETWEEN the caps, not over them', () => {
    // Regression: calcDoors laid the door over the full external H, ignoring the
    // top+bottom envelope caps (front material, tFront each) → the door overlapped
    // both caps in 2D + 3D. It must fit inside the inner opening, mirroring the
    // cut list (door height from box.H, already reduced by the caps).
    const input = { ...kitchenModuleInput('wall'), hasWallEnvelope: true };
    const tFront = 1.8; // oak18 front material → cap thickness
    const door = cabinetFrontPanels(input, kitchenModuleState('wall') as SavedCabinetState, [])
      .find(p => p.hingeSide === 'top')!;
    expect(door).toBeDefined();
    expect(door.y0).toBeGreaterThanOrEqual(input.plinth + tFront - 0.01); // above the bottom cap
    expect(door.y1).toBeLessThanOrEqual(input.H - tFront + 0.01);          // below the top cap
  });
});
