import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import { DoubleSide } from 'three';
import type { Room, ProductUnit } from '../../types/project';
import type { CustomMaterial } from '../../types/materials';
import { productBounds, productSubBoxes } from '../../core/room/productBounds';
import { placementSubBoxAABBs } from '../../core/room/roomGeometry';
import { productBoardBoxes, productFrontBoxes, type BoardBox3D } from '../../core/product/cabinetBoards3D';
import { colorForRole, SELECTED_COLOR, mixHex } from './boards3DStyle';
import { ViewButtons, CameraRig, type CamCmd, type ViewPreset } from './cameraViews';
import styles from './RoomView.module.css';

/** Distinct fill colours cycled per placed product (used by the fallback
 *  simple-box render; the detailed render colours by board role). */
const PALETTE = ['#6b8cae', '#b08968', '#7a9e7e', '#a87ca0', '#c0a062', '#8a8a8a'];

/** Interior pieces hidden behind closed doors — dropped in the fronts view. */
const INTERIOR_ROLES = new Set<BoardBox3D['role']>(['rod', 'drawer-box', 'shelf', 'fixed-shelf', 'internal-shelf']);

type Vec3 = [number, number, number];
interface Aabb { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; }

/** The elevation hinge-marking triangle for a door face, in ROOM coordinates.
 *  The apex points to the OPENING (free) side — the opposite edge from the
 *  hinge. 'top' = a lift-up door (hinged along the top, opens up) → apex points
 *  down. The door face is thin along its facing axis; the facing direction and
 *  which room edge the cabinet-local hinge side maps to are both fixed by the
 *  placement rotation (same convention as `subBoxRoomAABB`). Returns the 3
 *  points [openCornerA, apex, openCornerB]. */
function hingeTrianglePoints(b: Aabb, rotationDeg: number, hingeEdge: 'left' | 'right' | 'top'): Vec3[] {
  const r = ((rotationDeg % 360) + 360) % 360;
  const yTop = b.y1, yBot = b.y0, yMid = (b.y0 + b.y1) / 2;
  const eps = 0.3; // lift the marking just off the face so it never z-fights
  const facesZ = r === 0 || r === 180;
  const zFace = r === 180 ? b.z0 - eps : b.z1 + eps;
  const xFace = r === 90 ? b.x0 - eps : b.x1 + eps;

  if (hingeEdge === 'top') {
    // Hinged at the top, opens up → apex at the bottom, mid-width.
    if (facesZ) {
      const midX = (b.x0 + b.x1) / 2;
      return [[b.x0, yTop, zFace], [midX, yBot, zFace], [b.x1, yTop, zFace]];
    }
    const midZ = (b.z0 + b.z1) / 2;
    return [[xFace, yTop, b.z0], [xFace, yBot, midZ], [xFace, yTop, b.z1]];
  }

  if (facesZ) {
    // Width runs along X. local-left → x0 at 0°, x1 at 180°. Apex = opening side.
    const hingeAtX0 = (hingeEdge === 'left') === (r === 0);
    const apexX = hingeAtX0 ? b.x1 : b.x0;
    const openX = hingeAtX0 ? b.x0 : b.x1;
    return [[openX, yTop, zFace], [apexX, yMid, zFace], [openX, yBot, zFace]];
  }
  // Width runs along Z. local-left → z0 at 90°, z1 at 270°. Apex = opening side.
  const hingeAtZ0 = (hingeEdge === 'left') === (r === 90);
  const apexZ = hingeAtZ0 ? b.z1 : b.z0;
  const openZ = hingeAtZ0 ? b.z0 : b.z1;
  return [[xFace, yTop, openZ], [xFace, yMid, apexZ], [xFace, yBot, openZ]];
}

/** The outward-facing rectangle of a front panel, in ROOM coordinates, lifted
 *  just off the face. Drawn as a faint line it emphasises the reveal gaps
 *  between adjacent doors/drawers (and the door↔carcass edges). Returns 5
 *  points (closed loop). The facing axis is fixed by the placement rotation,
 *  same convention as `subBoxRoomAABB` / `hingeTrianglePoints`. */
function frontFaceOutline(b: Aabb, rotationDeg: number): Vec3[] {
  const r = ((rotationDeg % 360) + 360) % 360;
  const eps = 0.3;
  if (r === 0 || r === 180) {
    const z = r === 180 ? b.z0 - eps : b.z1 + eps;
    return [[b.x0, b.y0, z], [b.x1, b.y0, z], [b.x1, b.y1, z], [b.x0, b.y1, z], [b.x0, b.y0, z]];
  }
  const x = r === 90 ? b.x0 - eps : b.x1 + eps;
  return [[x, b.y0, b.z0], [x, b.y0, b.z1], [x, b.y1, b.z1], [x, b.y1, b.z0], [x, b.y0, b.z0]];
}

interface Props {
  room: Room;
  products: ProductUnit[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenProduct: (id: string) => void;
  customMaterials?: CustomMaterial[];
  /** 'bodies' = carcass + interior (open); 'fronts' = shell + closed doors. */
  detailMode?: 'bodies' | 'fronts';
}

/** Rough 3D view of the room: floor + back/left walls for spatial reference,
 *  and one box mesh per product sub-box. Reads the SAME `placementSubBoxAABBs`
 *  the elevation projects, so the three views render one model — this is the
 *  validation pass that exercises depth and height together (which the flat
 *  views structurally cannot). Click selects; double-click opens the product. */
export function RoomView3D({ room, products, selectedId, onSelect, onOpenProduct, customMaterials = [], detailMode = 'bodies' }: Props): React.JSX.Element {
  const productById = new Map(products.map(p => [p.id, p]));
  const { width: W, height: H, depth: D } = room;
  const center: [number, number, number] = [W / 2, H / 2, D / 2];
  const span = Math.max(W, H, D);
  const [camCmd, setCamCmd] = useState<CamCmd | null>(null);
  const pick = (p: ViewPreset) => setCamCmd(c => ({ preset: p, tick: (c?.tick ?? 0) + 1 }));

  return (
    <div className={styles.canvas3d}>
      <ViewButtons onPick={pick} />
      <Canvas
        camera={{ position: [W + span * 0.6, H + span * 0.7, D + span * 0.9], fov: 45, near: 1, far: span * 12 + 2000 }}
        onPointerMissed={() => onSelect(null)}
      >
        <CameraRig cmd={camCmd} center={center} dist={span * 1.6} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[W, H * 2.2, D * 1.6]} intensity={1.1} />
        <directionalLight position={[-W * 0.5, H, -D * 0.5]} intensity={0.3} />

        {/* Floor (XZ plane at y=0) */}
        <mesh position={[W / 2, 0, D / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[W, D]} />
          <meshStandardMaterial color="#e8e4dc" side={DoubleSide} />
        </mesh>
        {/* Back wall (z=0) */}
        <mesh position={[W / 2, H / 2, 0]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial color="#d6d2ca" transparent opacity={0.55} side={DoubleSide} />
        </mesh>
        {/* Left wall (x=0) */}
        <mesh position={[0, H / 2, D / 2]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[D, H]} />
          <meshStandardMaterial color="#d6d2ca" transparent opacity={0.4} side={DoubleSide} />
        </mesh>

        {/* Products — every carcass board as its own thin mesh (sides, top,
            bottom, shelves, partition, back, envelope, plinth). Falls back to
            one box per sub-box when no board model is available. Both paths use
            the SAME placementSubBoxAABBs transform, so they agree with the
            top/elevation views. */}
        {room.placements.map((pl, pi) => {
          const product = productById.get(pl.productId);
          if (!product) return null;
          const bounds = productBounds(product);
          const isSel = pl.productId === selectedId;

          const carcass = productBoardBoxes(product, customMaterials);
          const detailed = carcass.length > 0;
          // Fronts view: shell + closed door/drawer faces (interior hidden);
          // bodies view: full carcass + interior. Fall back to one box per
          // sub-box when there is no board model.
          const local: BoardBox3D[] | ReturnType<typeof productSubBoxes> = !detailed
            ? productSubBoxes(product)
            : detailMode === 'fronts'
              ? [...carcass.filter(b => !INTERIOR_ROLES.has(b.role)), ...productFrontBoxes(product, customMaterials)]
              : carcass;
          const roles = detailed ? (local as BoardBox3D[]).map(b => b.role) : null;
          const hingeSides = detailed ? (local as BoardBox3D[]).map(b => b.hingeSide) : null;
          const aabbs = placementSubBoxAABBs(pl, local, bounds);
          if (aabbs.length === 0) return null;

          const labelX = (Math.min(...aabbs.map(b => b.x0)) + Math.max(...aabbs.map(b => b.x1))) / 2;
          const labelZ = (Math.min(...aabbs.map(b => b.z0)) + Math.max(...aabbs.map(b => b.z1))) / 2;
          const labelTop = Math.max(...aabbs.map(b => b.y1));
          const fallbackColor = PALETTE[pi % PALETTE.length]!;

          return (
            <group key={pl.productId}>
              {aabbs.map((b, i) => {
                const role = roles ? roles[i]! : undefined;
                const hingeSide = hingeSides ? hingeSides[i] : undefined;
                // Keep each board's own role colour; when selected, wash it
                // part-way toward the grey shade so the item reads as highlighted
                // WITHOUT flattening its detail (a single flat fill hid it all).
                const base = role ? colorForRole(role) : fallbackColor;
                const color = isSel ? mixHex(base, SELECTED_COLOR, 0.5) : base;
                const center: [number, number, number] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
                const onClick = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onSelect(pl.productId); };
                const onDoubleClick = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onOpenProduct(pl.productId); };

                // Hanging rod → a round bar along its longer horizontal axis.
                if (role === 'rod') {
                  const dx = b.x1 - b.x0;
                  const dz = b.z1 - b.z0;
                  const alongX = dx >= dz;
                  const length = Math.max(alongX ? dx : dz, 0.1);
                  const radius = Math.max(Math.min(b.y1 - b.y0, alongX ? dz : dx) / 2, 0.4);
                  const rotation: [number, number, number] = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
                  return (
                    <mesh key={i} position={center} rotation={rotation} onClick={onClick} onDoubleClick={onDoubleClick}>
                      <cylinderGeometry args={[radius, radius, length, 12]} />
                      <meshStandardMaterial color={isSel ? mixHex('#9aa0a6', SELECTED_COLOR, 0.5) : '#9aa0a6'} metalness={0.6} roughness={0.4} />
                    </mesh>
                  );
                }

                const faceMesh = (
                  <mesh position={center} onClick={onClick} onDoubleClick={onDoubleClick}>
                    <boxGeometry args={[
                      Math.max(b.x1 - b.x0, 0.1),
                      Math.max(b.y1 - b.y0, 0.1),
                      Math.max(b.z1 - b.z0, 0.1),
                    ]} />
                    <meshStandardMaterial
                      color={color}
                      {...(detailed ? {} : { transparent: true, opacity: isSel ? 0.95 : 0.85 })}
                    />
                  </mesh>
                );

                // Front faces (fronts view) → outline the reveal gaps; doors
                // additionally get the elevation hinge-marking triangle.
                const isFrontFace = detailMode === 'fronts' && role === 'front';
                if (isFrontFace || hingeSide) {
                  return (
                    <group key={i}>
                      {faceMesh}
                      {isFrontFace && (
                        <Line
                          points={frontFaceOutline(b, pl.rotationDeg)}
                          color="#6b5840"
                          lineWidth={1}
                          transparent
                          opacity={0.6}
                        />
                      )}
                      {hingeSide && (
                        <Line
                          points={hingeTrianglePoints(b, pl.rotationDeg, hingeSide)}
                          color="#8a8a8a"
                          lineWidth={1}
                          transparent
                          opacity={0.65}
                        />
                      )}
                    </group>
                  );
                }
                return <React.Fragment key={i}>{faceMesh}</React.Fragment>;
              })}
              <Html position={[labelX, labelTop + 5, labelZ]} center style={{ pointerEvents: 'none' }}>
                <div className={styles.label3d}>{product.name}</div>
              </Html>
            </group>
          );
        })}

        <OrbitControls target={center} makeDefault zoomToCursor />
      </Canvas>
    </div>
  );
}
