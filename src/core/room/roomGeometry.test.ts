import { describe, it, expect } from 'vitest';
import {
  snapToWall, placementRectTopView, placementAABB, clampCentreToRoom,
  placementElevationRects, placementSubBoxAABBs, maxWallOffset, facesWall, type RoomWall,
} from './roomGeometry';
import type { ProductSubBox } from './productBounds';
import type { ProductPlacement } from '../../types/project';

const room = { width: 300, depth: 400 };
const bounds = { width: 200, height: 90, depth: 60 };

/** Build a placement from a snapToWall result (adds the productId). */
function place(wall: RoomWall, offset: number): ProductPlacement {
  return { productId: 'x', ...snapToWall(room, bounds, wall, offset) };
}

describe('snapToWall — back flush against each wall', () => {
  it('north: faces forward (rot 0), back edge at z=0', () => {
    const r = snapToWall(room, bounds, 'north', 30);
    expect(r.rotationDeg).toBe(0);
    expect(r.position).toEqual({ x: 30 + 100, z: 30 }); // offset+W/2 , D/2
    const aabb = placementAABB(place('north', 30), bounds);
    expect(aabb.z0).toBeCloseTo(0, 5);
    expect(aabb.x0).toBeCloseTo(30, 5); // offset from left
  });

  it('south: faces back (rot 180), back edge at z=depth', () => {
    const r = snapToWall(room, bounds, 'south', 0);
    expect(r.rotationDeg).toBe(180);
    const aabb = placementAABB(place('south', 0), bounds);
    expect(aabb.z1).toBeCloseTo(400, 5);
  });

  it('west: turned a quarter (rot 90), depth runs along X, back edge at x=0', () => {
    const r = snapToWall(room, bounds, 'west', 50);
    expect(r.rotationDeg).toBe(90);
    expect(r.position).toEqual({ x: 30, z: 50 + 100 }); // D/2 , offset+W/2
    const aabb = placementAABB(place('west', 50), bounds);
    expect(aabb.x0).toBeCloseTo(0, 5);
    expect(aabb.x1 - aabb.x0).toBeCloseTo(60, 5);  // depth along X
    expect(aabb.z1 - aabb.z0).toBeCloseTo(200, 5); // width along Z
    expect(aabb.z0).toBeCloseTo(50, 5);            // offset from back
  });

  it('east: rot 270, back edge at x=width', () => {
    const r = snapToWall(room, bounds, 'east', 0);
    expect(r.rotationDeg).toBe(270);
    const aabb = placementAABB(place('east', 0), bounds);
    expect(aabb.x1).toBeCloseTo(300, 5);
  });
});

describe('placementRectTopView', () => {
  it('passes through centre + un-rotated footprint + rotation', () => {
    const rect = placementRectTopView(
      { productId: 'x', position: { x: 100, z: 50 }, rotationDeg: 90 }, bounds,
    );
    expect(rect).toEqual({ cx: 100, cz: 50, w: 200, d: 60, rotationDeg: 90 });
  });
});

describe('placementAABB — footprint swaps on a quarter turn', () => {
  it('rot 0 → width×depth; rot 90 → depth×width', () => {
    const flat = placementAABB({ productId: 'x', position: { x: 100, z: 30 }, rotationDeg: 0 }, bounds);
    expect(flat.x1 - flat.x0).toBeCloseTo(200, 5);
    expect(flat.z1 - flat.z0).toBeCloseTo(60, 5);
    const turned = placementAABB({ productId: 'x', position: { x: 30, z: 100 }, rotationDeg: 90 }, bounds);
    expect(turned.x1 - turned.x0).toBeCloseTo(60, 5);
    expect(turned.z1 - turned.z0).toBeCloseTo(200, 5);
  });
});

describe('maxWallOffset — furthest a wall-snapped product can slide', () => {
  it('north/south span = room.width − product width', () => {
    expect(maxWallOffset(room, 'north', bounds)).toBeCloseTo(100, 5); // 300 − 200
    expect(maxWallOffset(room, 'south', bounds)).toBeCloseTo(100, 5);
  });

  it('east/west span = room.depth − product width', () => {
    expect(maxWallOffset(room, 'west', bounds)).toBeCloseTo(200, 5); // 400 − 200
    expect(maxWallOffset(room, 'east', bounds)).toBeCloseTo(200, 5);
  });

  it('never negative — a product wider than the wall yields 0', () => {
    expect(maxWallOffset(room, 'north', { width: 500 })).toBe(0); // 300 − 500 → 0
  });
});

describe('facesWall — parallel to the wall = detail, perpendicular = silhouette', () => {
  it('north/south: detail at 0/180, silhouette at 90/270', () => {
    for (const w of ['north', 'south'] as const) {
      expect(facesWall(0, w)).toBe(true);
      expect(facesWall(180, w)).toBe(true);
      expect(facesWall(90, w)).toBe(false);
      expect(facesWall(270, w)).toBe(false);
    }
  });

  it('east/west: detail at 90/270, silhouette at 0/180', () => {
    for (const w of ['east', 'west'] as const) {
      expect(facesWall(90, w)).toBe(true);
      expect(facesWall(270, w)).toBe(true);
      expect(facesWall(0, w)).toBe(false);
      expect(facesWall(180, w)).toBe(false);
    }
  });
});

describe('clampCentreToRoom — keeps the footprint inside while dragging', () => {
  it('clamps a centre that would push the footprint out (rot 0)', () => {
    // halfW = 100, halfD = 30 → x ∈ [100, 200], z ∈ [30, 370]
    expect(clampCentreToRoom(room, bounds, 0, { x: -10, z: 10 })).toEqual({ x: 100, z: 30 });
    expect(clampCentreToRoom(room, bounds, 0, { x: 999, z: 999 })).toEqual({ x: 200, z: 370 });
  });

  it('a centre already inside is unchanged', () => {
    expect(clampCentreToRoom(room, bounds, 0, { x: 150, z: 200 })).toEqual({ x: 150, z: 200 });
  });
});

describe('placementElevationRects — project a product onto a wall plane', () => {
  // One full-footprint sub-box (200 wide × 90 tall × 60 deep).
  const fullBox: ProductSubBox[] = [{ x0: 0, x1: 200, y0: 0, y1: 90, z0: 0, z1: 60 }];
  /** First projected rect (every fixture here has exactly one sub-box). */
  const elev = (pl: ProductPlacement, boxes: ProductSubBox[], wall: RoomWall) =>
    placementElevationRects(pl, boxes, bounds, wall, room)[0]!;

  it('north: horizontal = X, vertical = Y from the floor', () => {
    const pl = { productId: 'x', ...snapToWall(room, bounds, 'north', 0) };
    expect(elev(pl, fullBox, 'north')).toMatchObject({ h0: 0, h1: 200, y0: 0, y1: 90 });
  });

  it('south: horizontal mirrors X (left↔right)', () => {
    const pl = { productId: 'x', ...snapToWall(room, bounds, 'south', 0) };
    const r = elev(pl, fullBox, 'south');
    // product spans x 0..200 in a 300 room → mirrored to 100..300
    expect(r.h0).toBeCloseTo(100, 5);
    expect(r.h1).toBeCloseTo(300, 5);
  });

  it('west: horizontal = Z (depth runs along the wall), offset from the back', () => {
    const pl = { productId: 'x', ...snapToWall(room, bounds, 'west', 50) };
    const r = elev(pl, fullBox, 'west');
    expect(r.h0).toBeCloseTo(50, 5);   // offset from back corner
    expect(r.h1).toBeCloseTo(250, 5);  // + width 200
  });

  it('east: horizontal mirrors Z', () => {
    const pl = { productId: 'x', ...snapToWall(room, bounds, 'east', 0) };
    const r = elev(pl, fullBox, 'east');
    expect(r.h0).toBeCloseTo(200, 5);  // depth 400 − z1(200)
    expect(r.h1).toBeCloseTo(400, 5);  // depth 400 − z0(0)
  });

  it('position.y lifts the rect off the floor', () => {
    const pl: ProductPlacement = { productId: 'x', position: { x: 100, z: 30, y: 50 }, rotationDeg: 0 };
    const r = elev(pl, fullBox, 'north');
    expect(r.y0).toBeCloseTo(50, 5);
    expect(r.y1).toBeCloseTo(140, 5);  // 50 + 90
  });

  it('an offset sub-box keeps its offset under rotation (local +X → +Z on a quarter turn)', () => {
    // Right-half box (local x 100..200) of a 200-wide / 60-deep product.
    const rightHalf: ProductSubBox[] = [{ x0: 100, x1: 200, y0: 0, y1: 90, z0: 0, z1: 60 }];
    // Placed flush to the west wall (rot 90): local +X maps to +Z, so the box
    // sits at the FAR (high-Z) part of the wall span.
    const pl = { productId: 'x', ...snapToWall(room, bounds, 'west', 0) };
    const r = elev(pl, rightHalf, 'west');
    // local x 100..200 (centre 150, half 50) about footprint centre 100 → +50,
    // half-width 50 → z 100..200 along the wall.
    expect(r.h0).toBeCloseTo(100, 5);
    expect(r.h1).toBeCloseTo(200, 5);
  });

  it('depth key orders by distance from the viewer (farther = larger key)', () => {
    // Viewed from north the viewer is on the +Z side, so a high-Z box is NEARER.
    // The farther box gets the larger key → sorted descending it draws first
    // (behind), leaving the nearer box on top.
    const near: ProductPlacement = { productId: 'n', position: { x: 100, z: 300 }, rotationDeg: 0 };
    const far: ProductPlacement = { productId: 'f', position: { x: 100, z: 30 }, rotationDeg: 0 };
    expect(elev(far, fullBox, 'north').depth).toBeGreaterThan(elev(near, fullBox, 'north').depth);
  });
});

describe('placementSubBoxAABBs — local sub-box → room coordinates (3D source)', () => {
  const fullBox: ProductSubBox[] = [{ x0: 0, x1: 200, y0: 0, y1: 90, z0: 0, z1: 60 }];
  const aabb = (pl: ProductPlacement, boxes: ProductSubBox[]) =>
    placementSubBoxAABBs(pl, boxes, bounds)[0]!;

  it('north (rot 0): box spans its footprint in room X/Z, on the floor', () => {
    const pl = { productId: 'x', ...snapToWall(room, bounds, 'north', 0) };
    const a = aabb(pl, fullBox);
    expect(a).toMatchObject({ x0: 0, x1: 200, z0: 0, z1: 60, y0: 0, y1: 90 });
  });

  it('west (rot 90): depth runs along X, width along Z, back flush at x=0', () => {
    const pl = { productId: 'x', ...snapToWall(room, bounds, 'west', 50) };
    const a = aabb(pl, fullBox);
    expect(a.x0).toBeCloseTo(0, 5);
    expect(a.x1).toBeCloseTo(60, 5);    // depth along X
    expect(a.z0).toBeCloseTo(50, 5);    // offset from back
    expect(a.z1).toBeCloseTo(250, 5);   // + width 200
  });

  it('position.y lifts the box off the floor', () => {
    const pl: ProductPlacement = { productId: 'x', position: { x: 100, z: 30, y: 50 }, rotationDeg: 0 };
    const a = aabb(pl, fullBox);
    expect(a.y0).toBeCloseTo(50, 5);
    expect(a.y1).toBeCloseTo(140, 5);
  });

  it('agrees with the elevation projection (north: AABB x → elevation h)', () => {
    // The elevation must be a pure projection of these AABBs — same source.
    const pl = { productId: 'x', ...snapToWall(room, bounds, 'north', 30) };
    const a = placementSubBoxAABBs(pl, fullBox, bounds)[0]!;
    const e = placementElevationRects(pl, fullBox, bounds, 'north', room)[0]!;
    expect(e.h0).toBeCloseTo(a.x0, 5);
    expect(e.h1).toBeCloseTo(a.x1, 5);
    expect(e.y0).toBeCloseTo(a.y0, 5);
    expect(e.y1).toBeCloseTo(a.y1, 5);
  });
});
