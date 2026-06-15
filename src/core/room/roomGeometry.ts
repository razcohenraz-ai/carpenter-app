import type { ProductPlacement, Room } from '../../types/project';
import type { ProductBounds } from './productBounds';

/** A wall of a rectangular room (see the coordinate system on
 *  {@link ProductPlacement}): north z=0, south z=depth, west x=0, east x=width. */
export type RoomWall = 'north' | 'south' | 'east' | 'west';

/** Top-view (X-Z plane) draw spec for a placed product: the footprint
 *  rectangle, centred at (cx, cz), rotated `rotationDeg` about that centre.
 *  A renderer draws `<rect>` centred at (cx,cz) sized w×d and applies a
 *  `rotate(rotationDeg, cx, cz)` transform. */
export interface TopViewRect {
  cx: number;
  cz: number;
  /** Un-rotated footprint width (X) and depth (Z), cm. */
  w: number;
  d: number;
  rotationDeg: number;
}

/** True when the product is turned a quarter (90° or 270°) — its depth then
 *  runs along X and its width along Z. */
function isTurned(rotationDeg: number): boolean {
  return Math.abs(((rotationDeg % 180) + 180) % 180 - 90) < 1e-6;
}

export function placementRectTopView(
  placement: ProductPlacement,
  bounds: ProductBounds,
): TopViewRect {
  return {
    cx: placement.position.x,
    cz: placement.position.z,
    w: bounds.width,
    d: bounds.depth,
    rotationDeg: placement.rotationDeg,
  };
}

/** Axis-aligned footprint of a placement in room coordinates (after rotation).
 *  For 0/180 the footprint is width×depth; for 90/270 it is depth×width. Used
 *  to test wall-flushness and to clamp a product inside the room. */
export function placementAABB(
  placement: ProductPlacement,
  bounds: ProductBounds,
): { x0: number; z0: number; x1: number; z1: number } {
  const turned = isTurned(placement.rotationDeg);
  const w = turned ? bounds.depth : bounds.width;
  const d = turned ? bounds.width : bounds.depth;
  const { x, z } = placement.position;
  return { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 };
}

/** Position (footprint CENTRE) + rotation that snaps a product's back flush
 *  against `wall`, `offset` cm from the wall's start corner:
 *    north / south → offset measured from the left corner (x=0);
 *    west  / east  → offset measured from the back corner (z=0).
 *  Against a side wall the product turns 90°, so its depth runs along X and its
 *  width along Z. */
export function snapToWall(
  room: Pick<Room, 'width' | 'depth'>,
  bounds: ProductBounds,
  wall: RoomWall,
  offset: number,
): { position: { x: number; z: number }; rotationDeg: number; anchorWall: RoomWall } {
  const { width: W, depth: D } = bounds;
  switch (wall) {
    case 'north': // back wall z=0, faces +Z
      return { position: { x: offset + W / 2, z: D / 2 }, rotationDeg: 0, anchorWall: wall };
    case 'south': // front wall z=depth, faces -Z
      return { position: { x: offset + W / 2, z: room.depth - D / 2 }, rotationDeg: 180, anchorWall: wall };
    case 'west': // left wall x=0, turned a quarter (depth along X)
      return { position: { x: D / 2, z: offset + W / 2 }, rotationDeg: 90, anchorWall: wall };
    case 'east': // right wall x=width
      return { position: { x: room.width - D / 2, z: offset + W / 2 }, rotationDeg: 270, anchorWall: wall };
  }
}

/** Clamps a footprint centre so the whole (rotated) footprint stays inside the
 *  room rectangle. Used while dragging. */
export function clampCentreToRoom(
  room: Pick<Room, 'width' | 'depth'>,
  bounds: ProductBounds,
  rotationDeg: number,
  centre: { x: number; z: number },
): { x: number; z: number } {
  const turned = isTurned(rotationDeg);
  const halfW = (turned ? bounds.depth : bounds.width) / 2;
  const halfD = (turned ? bounds.width : bounds.depth) / 2;
  return {
    x: Math.min(Math.max(centre.x, halfW), Math.max(halfW, room.width - halfW)),
    z: Math.min(Math.max(centre.z, halfD), Math.max(halfD, room.depth - halfD)),
  };
}
