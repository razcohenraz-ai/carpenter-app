import { describe, it, expect } from 'vitest';
import {
  snapToWall, placementRectTopView, placementAABB, clampCentreToRoom,
  type RoomWall,
} from './roomGeometry';
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
