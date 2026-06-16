import type { ProductPlacement, Room } from '../../types/project';
import type { ProductBounds, ProductSubBox } from './productBounds';

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
): { position: { x: number; z: number }; rotationDeg: number; anchorWall: RoomWall; anchorOffset: number } {
  const { width: W, depth: D } = bounds;
  switch (wall) {
    case 'north': // back wall z=0, faces +Z
      return { position: { x: offset + W / 2, z: D / 2 }, rotationDeg: 0, anchorWall: wall, anchorOffset: offset };
    case 'south': // front wall z=depth, faces -Z
      return { position: { x: offset + W / 2, z: room.depth - D / 2 }, rotationDeg: 180, anchorWall: wall, anchorOffset: offset };
    case 'west': // left wall x=0, turned a quarter (depth along X)
      return { position: { x: D / 2, z: offset + W / 2 }, rotationDeg: 90, anchorWall: wall, anchorOffset: offset };
    case 'east': // right wall x=width
      return { position: { x: room.width - D / 2, z: offset + W / 2 }, rotationDeg: 270, anchorWall: wall, anchorOffset: offset };
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

/** Largest wall-offset that still keeps a wall-snapped product fully inside the
 *  room: the wall's span minus the product's along-wall width (never negative).
 *  In every {@link snapToWall} case the product's WIDTH runs along the wall, so
 *  the span is room.width for north/south and room.depth for east/west. Callers
 *  clamp a requested offset to [0, this] — the wall analogue of the height-off-
 *  floor clamp. An oversized product (wider than the wall) yields 0. */
export function maxWallOffset(
  room: Pick<Room, 'width' | 'depth'>,
  wall: RoomWall,
  bounds: Pick<ProductBounds, 'width'>,
): number {
  const span = wall === 'north' || wall === 'south' ? room.width : room.depth;
  return Math.max(0, span - bounds.width);
}

// ── Elevation projection (X-Y / Z-Y) ─────────────────────────────────────────

/** One product sub-box projected onto a wall's elevation plane. `h` runs left
 *  →right along the viewed wall as the viewer sees it; `y` is height off the
 *  floor; `depth` is a draw-order key — LARGER means farther from the viewer,
 *  so a renderer sorts descending and draws nearest last (on top). */
export interface ElevationRect {
  h0: number; h1: number;
  y0: number; y1: number;
  depth: number;
}

/** A product sub-box expressed in room coordinates (cm): X along the back wall,
 *  Y up from the floor, Z front-to-back. A 3D renderer places a box mesh centred
 *  at ((x0+x1)/2, (y0+y1)/2, (z0+z1)/2) sized (x1−x0, y1−y0, z1−z0); the
 *  elevation projects it onto a wall plane. Single source for both views. */
export interface RoomAABB {
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
}

/** Room-space AABB of a product's LOCAL sub-box, after centring the product's
 *  footprint at `placement.position` and rotating it about the vertical Y axis.
 *  Cardinal rotations (0/90/180/270 — the only ones the UI offers) keep the box
 *  axis-aligned; any other angle falls back to 0°. The rotation direction
 *  matches the top view's SVG `rotate(rotationDeg)`, so both views agree. This
 *  generalises {@link placementAABB} (which is the full-footprint special case)
 *  and is the same local→room transform the 3D view reuses. */
function subBoxRoomAABB(
  box: ProductSubBox,
  placement: ProductPlacement,
  bounds: Pick<ProductBounds, 'width' | 'depth'>,
): RoomAABB {
  const { width: W, depth: D } = bounds;
  const rx = (box.x0 + box.x1) / 2 - W / 2;   // local centre, relative to footprint centre
  const rz = (box.z0 + box.z1) / 2 - D / 2;
  const hx = (box.x1 - box.x0) / 2;
  const hz = (box.z1 - box.z0) / 2;
  const r = (((placement.rotationDeg % 360) + 360) % 360);
  let cx: number, cz: number, ex: number, ez: number;
  if (r === 90)       { cx = -rz; cz =  rx; ex = hz; ez = hx; }
  else if (r === 180) { cx = -rx; cz = -rz; ex = hx; ez = hz; }
  else if (r === 270) { cx =  rz; cz = -rx; ex = hz; ez = hx; }
  else                { cx =  rx; cz =  rz; ex = hx; ez = hz; }
  const px = placement.position.x + cx;
  const pz = placement.position.z + cz;
  const y = placement.position.y ?? 0;
  return { x0: px - ex, x1: px + ex, z0: pz - ez, z1: pz + ez, y0: y + box.y0, y1: y + box.y1 };
}

/** Every sub-box of a placed product, transformed into room coordinates (cm).
 *  The 3D view renders these as box meshes directly; the elevation projects
 *  them. The single local→room transform lives here, so all views agree. */
export function placementSubBoxAABBs(
  placement: ProductPlacement,
  subBoxes: ProductSubBox[],
  bounds: Pick<ProductBounds, 'width' | 'depth'>,
): RoomAABB[] {
  return subBoxes.map(box => subBoxRoomAABB(box, placement, bounds));
}

/** Projects every sub-box of a placed product onto the chosen wall's elevation.
 *  `viewWall` names the wall the elevation depicts (architectural convention):
 *    north (back z=0)  → horizontal = X;            span = room.width
 *    south (front)     → horizontal = X mirrored;   span = room.width
 *    west  (left x=0)  → horizontal = Z;            span = room.depth
 *    east  (right)     → horizontal = Z mirrored;   span = room.depth
 *  The mirror on south/east makes the far wall read left-to-right as the viewer
 *  standing in the room sees it. The exact convention is pinned by tests. */
export function placementElevationRects(
  placement: ProductPlacement,
  subBoxes: ProductSubBox[],
  bounds: Pick<ProductBounds, 'width' | 'depth'>,
  viewWall: RoomWall,
  room: Pick<Room, 'width' | 'depth'>,
): ElevationRect[] {
  return placementSubBoxAABBs(placement, subBoxes, bounds).map(a => {
    const xc = (a.x0 + a.x1) / 2;
    const zc = (a.z0 + a.z1) / 2;
    switch (viewWall) {
      case 'north': return { h0: a.x0, h1: a.x1, y0: a.y0, y1: a.y1, depth: -zc };
      case 'south': return { h0: room.width - a.x1, h1: room.width - a.x0, y0: a.y0, y1: a.y1, depth: zc };
      case 'west':  return { h0: a.z0, h1: a.z1, y0: a.y0, y1: a.y1, depth: -xc };
      case 'east':  return { h0: room.depth - a.z1, h1: room.depth - a.z0, y0: a.y0, y1: a.y1, depth: xc };
    }
  });
}
