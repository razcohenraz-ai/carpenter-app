import { describe, it, expect } from 'vitest';
import {
  computeHingeCount,
  computeDefaultHingePositions,
  recomputeDoorHinges,
  defaultHingeSide,
  adjustHingesForInterior,
  computeHingeWarnings,
  assignDoorDisplayNumbers,
  computeHingeSpacingWarnings,
  getDoorThicknessCm,
  shouldCoverSkirt,
  getDoorVisualHeight,
  getDoorStructuralHeight,
  getDoorHeight,
  getDoorWidth,
} from './doorUtils';
import type { Box } from '../../types/geometry';
import type { Door, Hinge } from '../../types/doors';
import type { InteriorItem } from '../../types/interior';

// ── computeHingeCount ─────────────────────────────────────────────────────────

describe('computeHingeCount', () => {
  it('small door < 25cm → 1 hinge', () => {
    expect(computeHingeCount(20)).toBe(1);
    expect(computeHingeCount(24)).toBe(1);
  });
  it('exactly 25cm → 2 hinges', () => {
    expect(computeHingeCount(25)).toBe(2);
  });
  it('well below boundary → 2 hinges', () => {
    expect(computeHingeCount(100)).toBe(2);
    expect(computeHingeCount(149)).toBe(2);
  });
  it('exactly 150cm → 2 hinges', () => {
    expect(computeHingeCount(150)).toBe(2);
  });
  it('just above 150cm → 3 hinges', () => {
    expect(computeHingeCount(150.5)).toBe(3);
    expect(computeHingeCount(151)).toBe(3);
  });
  it('within 3-hinge range → 3 hinges', () => {
    expect(computeHingeCount(170)).toBe(3);
    expect(computeHingeCount(180)).toBe(3);
    expect(computeHingeCount(199)).toBe(3);
  });
  it('exactly 200cm → 3 hinges', () => {
    expect(computeHingeCount(200)).toBe(3);
  });
  it('just above 200cm → 4 hinges', () => {
    expect(computeHingeCount(200.5)).toBe(4);
    expect(computeHingeCount(201)).toBe(4);
  });
  it('tall cabinet → 4 hinges', () => {
    expect(computeHingeCount(240)).toBe(4);
  });
});

// ── computeDefaultHingePositions ──────────────────────────────────────────────

describe('computeDefaultHingePositions', () => {
  it('20cm door → 1 hinge at centre (10cm)', () => {
    const pos = computeDefaultHingePositions(20);
    expect(pos).toHaveLength(1);
    expect(pos[0]).toBeCloseTo(10);
  });

  it('24cm door → 1 hinge at centre (12cm)', () => {
    const pos = computeDefaultHingePositions(24);
    expect(pos).toHaveLength(1);
    expect(pos[0]).toBeCloseTo(12);
  });

  it('25cm door → 2 hinges proportional (offset = 25/4 = 6.25)', () => {
    const pos = computeDefaultHingePositions(25);
    expect(pos).toHaveLength(2);
    expect(pos[0]).toBeCloseTo(6.25);
    expect(pos[1]).toBeCloseTo(18.75);
  });

  it('30cm door → 2 hinges at 7.5 from each end', () => {
    const pos = computeDefaultHingePositions(30);
    expect(pos).toHaveLength(2);
    expect(pos[0]).toBeCloseTo(7.5);
    expect(pos[1]).toBeCloseTo(22.5);
  });

  it('40cm door → 2 hinges at standard 10cm from each end', () => {
    const pos = computeDefaultHingePositions(40);
    expect(pos).toHaveLength(2);
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBeCloseTo(30);
  });

  it('180cm door → 3 hinges', () => {
    const pos = computeDefaultHingePositions(180);
    expect(pos).toHaveLength(3);
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[2]).toBeCloseTo(170);
  });

  it('100cm door → 2 hinges at 10 and 90', () => {
    const pos = computeDefaultHingePositions(100);
    expect(pos).toHaveLength(2);
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBeCloseTo(90);
  });

  it('170cm door → 3 hinges: 10, 2/3*170≈113.3, 160', () => {
    const pos = computeDefaultHingePositions(170);
    expect(pos).toHaveLength(3);
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBeCloseTo(170 * 2 / 3);
    expect(pos[2]).toBeCloseTo(160);
  });

  it('220cm door → 4 hinges with correct positions', () => {
    const pos = computeDefaultHingePositions(220);
    expect(pos).toHaveLength(4);
    expect(pos[0]).toBeCloseTo(10);                          // bottom
    expect(pos[3]).toBeCloseTo(210);                         // top
    expect(pos[2]).toBeCloseTo(220 * 2 / 3);                 // upper-middle
    expect(pos[1]).toBeCloseTo((10 + 220 * 2 / 3) / 2);     // lower-middle
  });

  it('explicit count overrides auto', () => {
    expect(computeDefaultHingePositions(100, 3)).toHaveLength(3);
    expect(computeDefaultHingePositions(220, 2)).toHaveLength(2);
  });
});

// ── defaultHingeSide ──────────────────────────────────────────────────────────

describe('defaultHingeSide', () => {
  it('2 columns: right→right, left→left', () => {
    const cols: ('left' | 'right')[] = ['left', 'right'];
    expect(defaultHingeSide('right', cols)).toBe('right');
    expect(defaultHingeSide('left',  cols)).toBe('left');
  });

  it('3 columns: unit_1→left, unit_2→right (middle), unit_3→right', () => {
    const cols = ['unit_1', 'unit_2', 'unit_3'] as const;
    expect(defaultHingeSide('unit_1', [...cols])).toBe('left');
    expect(defaultHingeSide('unit_2', [...cols])).toBe('right');
    expect(defaultHingeSide('unit_3', [...cols])).toBe('right');
  });

  it('5 columns: 2 left, 3 right (odd center → right)', () => {
    const cols = ['unit_1','unit_2','unit_3','unit_4','unit_5'] as const;
    // sorted LTR: unit_1(0), unit_2(1), unit_3(2=idx, half=2→right), unit_4, unit_5
    expect(defaultHingeSide('unit_1', [...cols])).toBe('left');
    expect(defaultHingeSide('unit_2', [...cols])).toBe('left');
    expect(defaultHingeSide('unit_3', [...cols])).toBe('right'); // middle
    expect(defaultHingeSide('unit_4', [...cols])).toBe('right');
    expect(defaultHingeSide('unit_5', [...cols])).toBe('right');
  });

  it('1 column (single): right', () => {
    expect(defaultHingeSide('single', ['single'])).toBe('right');
  });
});

// ── recomputeDoorHinges ───────────────────────────────────────────────────────

describe('recomputeDoorHinges', () => {
  function makeDoor(height: number, hingePositions: number[], manualIdx?: number): Door {
    const hinges: Hinge[] = hingePositions.map((p, i) => ({
      id: `h${i}`,
      positionFromBottom: p,
      isManual: i === manualIdx,
    }));
    return {
      id: 'd1', boxId: 'b1', frontIndex: 0, height, width: 60, hingeSide: 'right',
      hingeCount: 'auto', hinges, hasDoor: true, coversSkirt: false,
    };
  }

  it('too few hinges (2→3 for 180cm) → count increased', () => {
    const door = makeDoor(180, [10, 170]);          // 2 hinges, needs 3
    const result = recomputeDoorHinges(door, []);
    expect(result.hinges).toHaveLength(3);
  });

  it('too many hinges (4→3 for 180cm) → count decreased', () => {
    const door = makeDoor(180, [10, 50, 120, 170]); // 4 hinges, needs 3
    const result = recomputeDoorHinges(door, []);
    expect(result.hinges).toHaveLength(3);
  });

  it('manual hinge at idx 0 is preserved through resize', () => {
    const door = makeDoor(180, [10, 170], 0);       // idx 0 is manual
    const result = recomputeDoorHinges(door, []);
    expect(result.hinges[0]!.isManual).toBe(true);
    expect(result.hinges[0]!.id).toBe('h0');
    expect(result.hinges[0]!.positionFromBottom).toBeCloseTo(10);
  });

  it('manual hinge at idx 3 dropped when count shrinks to 3', () => {
    const door = makeDoor(180, [10, 50, 120, 170], 3); // idx 3 manual, needs 3
    const result = recomputeDoorHinges(door, []);
    expect(result.hinges).toHaveLength(3);
    expect(result.hinges.every(h => h.id !== 'h3')).toBe(true);
  });

  it('same count → non-manual positions updated to defaults', () => {
    const door = makeDoor(180, [5, 100, 160]);      // 3 hinges, positions off
    const result = recomputeDoorHinges(door, []);
    expect(result.hinges).toHaveLength(3);
    expect(result.hinges[0]!.positionFromBottom).toBeCloseTo(10);
    expect(result.hinges[2]!.positionFromBottom).toBeCloseTo(170);
  });
});

// ── computeHingeSpacingWarnings ───────────────────────────────────────────────

describe('computeHingeSpacingWarnings', () => {
  function doorAt(height: number, positions: number[]): Door {
    return {
      id: 'd1', boxId: 'b1', frontIndex: 0, height, width: 60, hingeSide: 'right',
      hingeCount: 'auto', hasDoor: true, coversSkirt: false,
      hinges: positions.map((p, i) => ({ id: `h${i}`, positionFromBottom: p, isManual: false })),
    };
  }

  it('50cm door (gap=30) → no warnings', () => {
    expect(computeHingeSpacingWarnings(doorAt(50, [10, 40])).size).toBe(0);
  });

  it('45cm door (gap=25 exactly) → no warnings (boundary)', () => {
    expect(computeHingeSpacingWarnings(doorAt(45, [10, 35])).size).toBe(0);
  });

  it('44cm door (gap=24) → both hinges warned', () => {
    const w = computeHingeSpacingWarnings(doorAt(44, [10, 34]));
    expect(w.size).toBe(2);
    expect(w.has('h0') && w.has('h1')).toBe(true);
  });

  it('25cm proportional hinges (gap=12.5) → both warned', () => {
    const positions = computeDefaultHingePositions(25);
    const w = computeHingeSpacingWarnings(doorAt(25, positions));
    expect(w.size).toBe(2);
  });

  it('single-hinge small door → no spacing warnings', () => {
    expect(computeHingeSpacingWarnings(doorAt(20, [10])).size).toBe(0);
  });

  it('hasDoor=false → no warnings', () => {
    const door: Door = {
      id: 'd1', boxId: 'b1', frontIndex: 0, height: 44, width: 60, hingeSide: 'right',
      hingeCount: 'auto', hasDoor: false, coversSkirt: false, hinges: [],
    };
    expect(computeHingeSpacingWarnings(door).size).toBe(0);
  });
});

// ── adjustHingesForInterior ───────────────────────────────────────────────────

describe('adjustHingesForInterior', () => {
  function h(pos: number, manual = false): Hinge {
    return { id: `h_${pos}`, positionFromBottom: pos, isManual: manual };
  }

  it('no items → hinges unchanged', () => {
    const hinges = computeDefaultHingePositions(170).map(p => h(p));
    const { hinges: out, warnings } = adjustHingesForInterior(hinges, [], 170);
    expect(warnings).toHaveLength(0);
    out.forEach((o, i) => expect(o.positionFromBottom).toBeCloseTo(hinges[i]!.positionFromBottom));
  });

  it('middle hinge conflicts with shelf → moves away', () => {
    // 170cm door, middle hinge at 2/3*170≈113.3, shelf at 113.3
    const doorH = 170;
    const midPos = (doorH * 2) / 3; // ≈113.3
    const hinges = computeDefaultHingePositions(doorH).map(p => h(p));
    const items: InteriorItem[] = [{ type: 'shelf', id: 's1', heightFromFloor: midPos }];
    const { hinges: out, warnings } = adjustHingesForInterior(hinges, items, doorH);
    expect(warnings).toHaveLength(0);
    // Middle hinge (index 1) moved ≥1cm away from shelf
    const moved = out[1]!;
    expect(Math.abs(moved.positionFromBottom - midPos)).toBeGreaterThanOrEqual(1);
  });

  it('manual hinge is never moved', () => {
    const doorH = 170;
    const hinges = computeDefaultHingePositions(doorH).map(p => h(p));
    hinges[1] = { ...hinges[1]!, isManual: true }; // mark middle as manual
    const shelfAt = hinges[1]!.positionFromBottom;
    const items: InteriorItem[] = [{ type: 'shelf', id: 's1', heightFromFloor: shelfAt }];
    const { hinges: out } = adjustHingesForInterior(hinges, items, doorH);
    expect(out[1]!.positionFromBottom).toBeCloseTo(shelfAt); // unchanged
  });

  it('shelf far from hinge → no move', () => {
    const doorH = 100;
    const hinges = computeDefaultHingePositions(doorH).map(p => h(p));
    const items: InteriorItem[] = [{ type: 'shelf', id: 's1', heightFromFloor: 50 }];
    const { hinges: out } = adjustHingesForInterior(hinges, items, doorH);
    // 2 hinges at 10 and 90, shelf at 50 (gap > 1cm from both)
    expect(out[0]!.positionFromBottom).toBeCloseTo(10);
    expect(out[1]!.positionFromBottom).toBeCloseTo(90);
  });

  it('bottom hinge conflicts with shelf → moves up (top direction closer)', () => {
    const doorH = 100;
    // 2 hinges: bottom at 10, top at 90
    const [bottom, top] = computeDefaultHingePositions(doorH).map(p => h(p));
    // shelf at 9.5 → |10-9.5|=0.5 < 1 → conflict
    const items: InteriorItem[] = [{ type: 'shelf', id: 's1', heightFromFloor: 9.5 }];
    const { hinges: out, warnings } = adjustHingesForInterior([bottom!, top!], items, doorH);
    expect(warnings).toHaveLength(0);
    // zoneHi=10.5 (dist 0.5 up), zoneLo=8.5 (dist 1.5 down) → prefer up
    expect(out[0]!.positionFromBottom).toBeCloseTo(10.5);
    expect(out[1]!.positionFromBottom).toBeCloseTo(90); // top unaffected
  });

  it('top hinge conflicts with shelf → moves down (bottom direction closer)', () => {
    const doorH = 100;
    const [bottom, top] = computeDefaultHingePositions(doorH).map(p => h(p));
    // shelf at 90.5 → |90-90.5|=0.5 < 1 → conflict
    const items: InteriorItem[] = [{ type: 'shelf', id: 's1', heightFromFloor: 90.5 }];
    const { hinges: out, warnings } = adjustHingesForInterior([bottom!, top!], items, doorH);
    expect(warnings).toHaveLength(0);
    // zoneHi=91.5 (dist 1.5 up), zoneLo=89.5 (dist 0.5 down) → prefer down
    expect(out[1]!.positionFromBottom).toBeCloseTo(89.5);
    expect(out[0]!.positionFromBottom).toBeCloseTo(10); // bottom unaffected
  });

  // drawer tests
  it('drawer 100-120, hinge at 113.3 → moves to 121 (1cm above drawer top)', () => {
    // doorH=200, 3 hinges, middle at ~133; use custom hinge at 113.3 for test
    const doorH = 200;
    const hinges = [h(10), h(113.3), h(190)];
    const items: InteriorItem[] = [{ type: 'drawer', id: 'd1', heightFromFloor: 100, drawerHeight: 20 }];
    const { hinges: out, warnings } = adjustHingesForInterior(hinges, items, doorH);
    expect(warnings).toHaveLength(0);
    // upPos = 100+20+1 = 121, downPos = 100-1 = 99
    // upDist = 121-113.3 = 7.7, downDist = 113.3-99 = 14.3 → prefer up
    expect(out[1]!.positionFromBottom).toBeCloseTo(121);
  });

  it('drawer 100-120, hinge at 105 → moves to 99 (1cm below drawer bottom)', () => {
    const doorH = 200;
    const hinges = [h(10), h(105), h(190)];
    const items: InteriorItem[] = [{ type: 'drawer', id: 'd1', heightFromFloor: 100, drawerHeight: 20 }];
    const { hinges: out, warnings } = adjustHingesForInterior(hinges, items, doorH);
    expect(warnings).toHaveLength(0);
    // upPos = 121, downPos = 99
    // upDist = 121-105 = 16, downDist = 105-99 = 6 → prefer down
    expect(out[1]!.positionFromBottom).toBeCloseTo(99);
  });

  it('adjusted hinge is always ≥1cm from drawer edges', () => {
    // Exhaustive: try 5 hinge positions inside or near drawer [100, 120]
    const doorH = 200;
    const drawer: InteriorItem = { type: 'drawer', id: 'd1', heightFromFloor: 100, drawerHeight: 20 };
    const drawerBottom = 100, drawerTop = 120;

    for (const startPos of [95, 99.5, 110, 120.5, 125]) {
      const hinges = [h(10), h(startPos), h(190)];
      const { hinges: out, warnings } = adjustHingesForInterior(hinges, [drawer], doorH);
      const finalPos = out[1]!.positionFromBottom;
      if (warnings.length === 0) {
        // Must be ≥1cm from both drawer edges
        expect(finalPos).toSatisfy(
          (p: number) => p <= drawerBottom - 1 || p >= drawerTop + 1,
          `hinge at ${startPos} → ${finalPos} not ≥1cm from drawer [${drawerBottom},${drawerTop}]`,
        );
      }
    }
  });

  it('hinge outside drawer range → no move', () => {
    const doorH = 200;
    const hinges = [h(10), h(130), h(190)];
    const items: InteriorItem[] = [{ type: 'drawer', id: 'd1', heightFromFloor: 100, drawerHeight: 20 }];
    // hinge at 130 is 10cm above drawer top (120) — outside conflict zone
    const { hinges: out } = adjustHingesForInterior(hinges, items, doorH);
    expect(out[1]!.positionFromBottom).toBeCloseTo(130);
  });
});

// ── computeHingeWarnings ──────────────────────────────────────────────────────

describe('computeHingeWarnings', () => {
  function doorWithHinge(pos: number, manual: boolean): Door {
    return {
      id: 'd1', boxId: 'b1', frontIndex: 0, height: 100, width: 60, hingeSide: 'right',
      hingeCount: 'auto', hasDoor: true, coversSkirt: false,
      hinges: [{ id: 'h0', positionFromBottom: pos, isManual: manual }],
    };
  }

  it('non-manual hinge in conflict → warning', () => {
    const w = computeHingeWarnings(doorWithHinge(50, false), [
      { type: 'shelf', id: 's1', heightFromFloor: 50 },
    ]);
    expect(w.has('h0')).toBe(true);
  });

  it('manual hinge in conflict → warning shown (not moved but flagged)', () => {
    const w = computeHingeWarnings(doorWithHinge(50, true), [
      { type: 'shelf', id: 's1', heightFromFloor: 50 },
    ]);
    expect(w.has('h0')).toBe(true);
  });

  it('hinge exactly 1cm from shelf → no warning', () => {
    const w = computeHingeWarnings(doorWithHinge(51, false), [
      { type: 'shelf', id: 's1', heightFromFloor: 50 },
    ]);
    expect(w.has('h0')).toBe(false);
  });

  it('no items → no warnings', () => {
    expect(computeHingeWarnings(doorWithHinge(50, false), []).size).toBe(0);
  });
});

// ── recomputeDoorHinges — hingeCount persistence ──────────────────────────────

describe('recomputeDoorHinges — hingeCount', () => {
  it('hingeCount=4 preserved after interior change (200cm auto→3)', () => {
    const positions = computeDefaultHingePositions(200, 4);
    const door: Door = {
      id: 'd1', boxId: 'b1', frontIndex: 0, height: 200, width: 60, hingeSide: 'right',
      hingeCount: 4,
      hinges: positions.map((p, i) => ({ id: `h${i}`, positionFromBottom: p, isManual: false })),
      hasDoor: true, coversSkirt: false,
    };
    const items: InteriorItem[] = [{ type: 'shelf', id: 's1', heightFromFloor: 100 }];
    const result = recomputeDoorHinges(door, items);
    expect(result.hinges).toHaveLength(4);
    expect(result.hingeCount).toBe(4);
  });

  it('hingeCount=4 preserved when height changes to 180cm, positions recomputed', () => {
    const positions = computeDefaultHingePositions(200, 4);
    const door: Door = {
      id: 'd1', boxId: 'b1', frontIndex: 0, height: 200, width: 60, hingeSide: 'right',
      hingeCount: 4,
      hinges: positions.map((p, i) => ({ id: `h${i}`, positionFromBottom: p, isManual: false })),
      hasDoor: true, coversSkirt: false,
    };
    const resized = { ...door, height: 180 };
    const result = recomputeDoorHinges(resized, []);
    expect(result.hinges).toHaveLength(4);
    // computeDefaultHingePositions(180, 4): offset=10 → [10, 65, 120, 170]
    const sorted = [...result.hinges].sort((a, b) => a.positionFromBottom - b.positionFromBottom);
    expect(sorted[0]!.positionFromBottom).toBeCloseTo(10);
    expect(sorted[1]!.positionFromBottom).toBeCloseTo(65);
    expect(sorted[2]!.positionFromBottom).toBeCloseTo(120);
    expect(sorted[3]!.positionFromBottom).toBeCloseTo(170);
  });

  it('hingeCount=auto respects height-based count', () => {
    const door: Door = {
      id: 'd1', boxId: 'b1', frontIndex: 0, height: 200, width: 60, hingeSide: 'right',
      hingeCount: 'auto',
      hinges: [10, 71, 133, 190].map((p, i) => ({ id: `h${i}`, positionFromBottom: p, isManual: false })),
      hasDoor: true, coversSkirt: false,
    };
    const result = recomputeDoorHinges(door, []);
    // computeHingeCount(200) = 3
    expect(result.hinges).toHaveLength(3);
    expect(result.hingeCount).toBe('auto');
  });
});

// ── getDoorThicknessCm ────────────────────────────────────────────────────────

describe('getDoorThicknessCm', () => {
  const baseDoor: Door = {
    id: 'd1', boxId: 'b1', frontIndex: 0, height: 100, width: 60,
    hingeSide: 'right', hingeCount: 'auto', hinges: [], hasDoor: true, coversSkirt: false,
  };

  it('uses global material (mdf18 = 1.8cm) when no override', () => {
    expect(getDoorThicknessCm(baseDoor, 'mdf18')).toBeCloseTo(1.8);
  });

  it('uses override (mdf12 = 1.2cm) over global (mdf18)', () => {
    const door = { ...baseDoor, thicknessOverride: 'mdf12' };
    expect(getDoorThicknessCm(door, 'mdf18')).toBeCloseTo(1.2);
  });

  it('override has priority: oak18 (1.8cm) over mdf12 global (1.2cm)', () => {
    const door = { ...baseDoor, thicknessOverride: 'oak18' };
    expect(getDoorThicknessCm(door, 'mdf12')).toBeCloseTo(1.8);
  });

  it('clears override: no thicknessOverride → falls back to global', () => {
    expect(getDoorThicknessCm(baseDoor, 'mdf12')).toBeCloseTo(1.2);
  });
});

// ── shouldCoverSkirt ──────────────────────────────────────────────────────────

describe('shouldCoverSkirt', () => {
  it('bottom → true',  () => expect(shouldCoverSkirt('bottom')).toBe(true));
  it('single → true',  () => expect(shouldCoverSkirt('single')).toBe(true));
  it('top → false',    () => expect(shouldCoverSkirt('top')).toBe(false));
  it('middle → false', () => expect(shouldCoverSkirt('middle')).toBe(false));
  it('plinth → false', () => expect(shouldCoverSkirt('plinth')).toBe(false));
});

// ── getDoorVisualHeight ───────────────────────────────────────────────────────

describe('getDoorVisualHeight', () => {
  const skirtDoor: Door = {
    id: 'd1', boxId: 'b1', frontIndex: 0, height: 190, width: 60,
    hingeSide: 'right', hingeCount: 'auto', hinges: [], hasDoor: true, coversSkirt: true,
  };
  const noSkirtDoor: Door = { ...skirtDoor, coversSkirt: false };

  it('coversSkirt=true, plinthH=10 → 199 (190 + 9)', () => {
    expect(getDoorVisualHeight(skirtDoor, 10)).toBe(199);
  });
  it('coversSkirt=false → structural height regardless of plinth', () => {
    expect(getDoorVisualHeight(noSkirtDoor, 10)).toBe(190);
  });
  it('coversSkirt=true, plinthH=0 → structural height', () => {
    expect(getDoorVisualHeight(skirtDoor, 0)).toBe(190);
  });
  it('coversSkirt=true, plinthH=1 → structural height (extension = 0)', () => {
    expect(getDoorVisualHeight(skirtDoor, 1)).toBe(190);
  });
  it('coversSkirt=true, plinthH=15 → 190 + 14 = 204', () => {
    expect(getDoorVisualHeight(skirtDoor, 15)).toBe(204);
  });
  it('getDoorStructuralHeight always returns door.height', () => {
    expect(getDoorStructuralHeight(skirtDoor)).toBe(190);
    expect(getDoorStructuralHeight(noSkirtDoor)).toBe(190);
  });

  // ── gapMm correction for skirt-covering doors ─────────────────────────────
  // getDoorHeight deducts both top and bottom gaps from door.height.
  // For skirt-covering doors the bottom gap is replaced by the absolute 1cm
  // floor clearance; getDoorVisualHeight must add it back.

  it('coversSkirt=true, plinthH=10, gapMm=2 → door.height + 9 + 0.2', () => {
    const door: Door = { ...skirtDoor, height: 149.7, gapMm: 2 };
    expect(getDoorVisualHeight(door, 10)).toBeCloseTo(158.9); // original bug scenario
  });

  it('coversSkirt=true, plinthH=10, gapMm=0 → door.height + 9 (no correction)', () => {
    const door: Door = { ...skirtDoor, height: 150, gapMm: 0 };
    expect(getDoorVisualHeight(door, 10)).toBeCloseTo(159);
  });

  it('coversSkirt=true, plinthH=10, gapMm=4 → door.height + 9 + 0.4', () => {
    const door: Door = { ...skirtDoor, height: 149.5, gapMm: 4 };
    expect(getDoorVisualHeight(door, 10)).toBeCloseTo(149.5 + 9 + 0.4);
  });

  it('coversSkirt=false, gapMm=2 → structural height only (no skirt extension)', () => {
    const door: Door = { ...noSkirtDoor, height: 149.7, gapMm: 2 };
    expect(getDoorVisualHeight(door, 10)).toBeCloseTo(149.7);
  });

  it('coversSkirt=true, plinthH=0, gapMm=2 → structural height (plinth guard)', () => {
    const door: Door = { ...skirtDoor, height: 149.7, gapMm: 2 };
    expect(getDoorVisualHeight(door, 0)).toBeCloseTo(149.7);
  });

  it('skirt door: getDoorVisualHeight adds plinthH-1+gapCm to structural height', () => {
    const structuralH = getDoorHeight(150, 2); // 149.6 (2 gaps, default)
    const door: Door = { ...skirtDoor, height: structuralH, gapMm: 2 };
    expect(getDoorVisualHeight(door, 10)).toBeCloseTo(149.6 + 9 + 0.2); // 158.8
  });
});

// ── assignDoorDisplayNumbers ──────────────────────────────────────────────────

describe('assignDoorDisplayNumbers', () => {
  function box(id: string, pos: Box['position'], level: Box['level']): Box {
    return { id, W: 80, H: 100, D: 60, position: pos, level };
  }

  it('2 single-level columns: right=1, left=2', () => {
    const boxes = [box('b0', 'right', 'single'), box('b1', 'left', 'single')];
    const nums = assignDoorDisplayNumbers(boxes);
    expect(nums.get('b0')).toBe('1');
    expect(nums.get('b1')).toBe('2');
  });

  it('plinth boxes excluded', () => {
    const boxes = [box('b0', 'single', 'single'), box('p0', 'single', 'plinth')];
    const nums = assignDoorDisplayNumbers(boxes);
    expect(nums.has('p0')).toBe(false);
    expect(nums.get('b0')).toBe('1');
  });

  it('split column gets Hebrew letters bottom→top', () => {
    const boxes = [
      box('bot', 'single', 'bottom'),
      box('top', 'single', 'top'),
    ];
    const nums = assignDoorDisplayNumbers(boxes);
    expect(nums.get('bot')).toBe('1א');
    expect(nums.get('top')).toBe('1ב');
  });

  it('2-col split: right-bottom=1א, right-top=1ב, left-bottom=2א, left-top=2ב', () => {
    const boxes = [
      box('rb', 'right', 'bottom'),
      box('rt', 'right', 'top'),
      box('lb', 'left',  'bottom'),
      box('lt', 'left',  'top'),
    ];
    const nums = assignDoorDisplayNumbers(boxes);
    expect(nums.get('rb')).toBe('1א');
    expect(nums.get('rt')).toBe('1ב');
    expect(nums.get('lb')).toBe('2א');
    expect(nums.get('lt')).toBe('2ב');
  });

  it('mixed: single right + split left', () => {
    const boxes = [
      box('r',  'right', 'single'),
      box('lb', 'left',  'bottom'),
      box('lt', 'left',  'top'),
    ];
    const nums = assignDoorDisplayNumbers(boxes);
    expect(nums.get('r')).toBe('1');
    expect(nums.get('lb')).toBe('2א');
    expect(nums.get('lt')).toBe('2ב');
  });
});

// ── getDoorHeight ─────────────────────────────────────────────────────────────

describe('getDoorHeight', () => {
  it('gap=0: returns boxH unchanged', () => {
    expect(getDoorHeight(180, 0)).toBeCloseTo(180);
    expect(getDoorHeight(180, 0, false)).toBeCloseTo(180);
  });
  it('gap=2mm, hasBottomGap=true (default): boxH − 2×0.2', () => {
    expect(getDoorHeight(180, 2)).toBeCloseTo(179.6);
    expect(getDoorHeight(180, 2, true)).toBeCloseTo(179.6);
  });
  it('gap=1mm, hasBottomGap=true: boxH − 2×0.1', () => {
    expect(getDoorHeight(180, 1)).toBeCloseTo(179.8);
  });
  it('gap=2mm, hasBottomGap=false (plinth, no skirt): boxH − 0.2 only', () => {
    expect(getDoorHeight(180, 2, false)).toBeCloseTo(179.8);
  });
  it('gap=2mm, hasBottomGap=false, 88.2cm box → 88.0 (bug scenario)', () => {
    expect(getDoorHeight(88.2, 2, false)).toBeCloseTo(88.0);
  });
});

// ── getDoorWidth ──────────────────────────────────────────────────────────────

describe('getDoorWidth', () => {
  it('gap=0: returns innerW/n unchanged', () => {
    expect(getDoorWidth(100, 1, 0)).toBe(100);
    expect(getDoorWidth(100, 2, 0)).toBe(50);
  });
  it('gap=2mm, 1 door: 100 − 2×0.2 = 99.6', () => {
    expect(getDoorWidth(100, 1, 2)).toBeCloseTo(99.6);
  });
  it('gap=2mm, 2 doors: (100 − 3×0.2)/2 = 49.7', () => {
    expect(getDoorWidth(100, 2, 2)).toBeCloseTo(49.7);
  });
  it('gap=4mm, 1 door: 100 − 2×0.4 = 99.2', () => {
    expect(getDoorWidth(100, 1, 4)).toBeCloseTo(99.2);
  });
});
