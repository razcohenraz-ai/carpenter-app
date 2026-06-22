import { describe, it, expect } from 'vitest';
import { RUNNERS } from '../../catalog/runners';
import { computeDrawerFixingHeights, runnerFixingHoles } from './drawerDrilling';

describe('computeDrawerFixingHeights — floor-anchored vertical stack', () => {
  const spec = RUNNERS['tandem-16']!; // screwHeight = 37

  it('bottom drawer: runner on the floor → screw at 37 mm', () => {
    const [f] = computeDrawerFixingHeights(
      [{ id: 'd1', frontBottomFromFloorMm: 0, isBottom: true }], spec,
    );
    expect(f).toEqual({ id: 'd1', runnerBottomFromFloorMm: 0, screwHeightFromFloorMm: 37 });
  });

  it('drawers above: runner = front bottom + 5 → screw = front bottom + 42', () => {
    const fixings = computeDrawerFixingHeights([
      { id: 'd1', frontBottomFromFloorMm: 0,   isBottom: true },
      { id: 'd2', frontBottomFromFloorMm: 200, isBottom: false },
      { id: 'd3', frontBottomFromFloorMm: 420, isBottom: false },
    ], spec);
    expect(fixings[1]).toEqual({ id: 'd2', runnerBottomFromFloorMm: 205, screwHeightFromFloorMm: 242 });
    expect(fixings[2]).toEqual({ id: 'd3', runnerBottomFromFloorMm: 425, screwHeightFromFloorMm: 462 });
  });
});

describe('runnerFixingHoles — front (constant) + per-NL back hole', () => {
  it('front hole = 69 for both systems, all NL', () => {
    expect(runnerFixingHoles(RUNNERS['tandem-16']!, 550).frontHoleMm).toBe(69);
    expect(runnerFixingHoles(RUNNERS['tandem-19']!, 300).frontHoleMm).toBe(69);
  });

  it('back hole by NL: ≤270 → 197, 300–480 → 165, 500–600 → 261', () => {
    const back = (nl: number) => runnerFixingHoles(RUNNERS['tandem-16']!, nl).backHoleMm;
    expect(back(250)).toBe(197);
    expect(back(270)).toBe(197);
    expect(back(300)).toBe(165);
    expect(back(480)).toBe(165);
    expect(back(500)).toBe(261);
    expect(back(600)).toBe(261);
  });

  it('same back-hole table applies to TANDEM 19', () => {
    expect(runnerFixingHoles(RUNNERS['tandem-19']!, 250).backHoleMm).toBe(197);
    expect(runnerFixingHoles(RUNNERS['tandem-19']!, 400).backHoleMm).toBe(165);
    expect(runnerFixingHoles(RUNNERS['tandem-19']!, 550).backHoleMm).toBe(261);
  });
});
