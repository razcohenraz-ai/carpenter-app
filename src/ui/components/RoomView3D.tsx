import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { DoubleSide } from 'three';
import type { Room, ProductUnit } from '../../types/project';
import type { CustomMaterial } from '../../types/materials';
import { productBounds, productSubBoxes } from '../../core/room/productBounds';
import { placementSubBoxAABBs } from '../../core/room/roomGeometry';
import { productBoardBoxes, productFrontBoxes, type BoardBox3D } from '../../core/product/cabinetBoards3D';
import styles from './RoomView.module.css';

/** Distinct fill colours cycled per placed product (used by the fallback
 *  simple-box render; the detailed render colours by board role). */
const PALETTE = ['#6b8cae', '#b08968', '#7a9e7e', '#a87ca0', '#c0a062', '#8a8a8a'];
const SELECTED_COLOR = '#e07a3c';

/** Interior pieces hidden behind closed doors — dropped in the fronts view. */
const INTERIOR_ROLES = new Set<BoardBox3D['role']>(['rod', 'drawer-box', 'shelf', 'fixed-shelf', 'internal-shelf']);

/** Wood-tone palette by board role family — reads as carpentry in the 3D view. */
function colorForRole(role: BoardBox3D['role']): string {
  if (role === 'front') return '#e8934a';      // door / drawer face
  if (role === 'rod') return '#9aa0a6';        // brushed metal
  if (role === 'drawer-box') return '#b59f82'; // greyer tray
  if (role === 'back') return '#9c7f55';
  if (role === 'shelf' || role === 'fixed-shelf' || role === 'internal-shelf') return '#d8bb8a';
  if (role.startsWith('envelope')) return '#b89668';
  if (role.startsWith('plinth')) return '#8a6f4a';
  return '#c8a877'; // sides / top / bottom / partition / traverses
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

  return (
    <div className={styles.canvas3d}>
      <Canvas
        camera={{ position: [W + span * 0.6, H + span * 0.7, D + span * 0.9], fov: 45, near: 1, far: span * 12 + 2000 }}
        onPointerMissed={() => onSelect(null)}
      >
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
          const aabbs = placementSubBoxAABBs(pl, local, bounds);
          if (aabbs.length === 0) return null;

          const labelX = (Math.min(...aabbs.map(b => b.x0)) + Math.max(...aabbs.map(b => b.x1))) / 2;
          const labelZ = (Math.min(...aabbs.map(b => b.z0)) + Math.max(...aabbs.map(b => b.z1))) / 2;
          const labelTop = Math.max(...aabbs.map(b => b.y1));
          const fallbackColor = isSel ? SELECTED_COLOR : PALETTE[pi % PALETTE.length]!;

          return (
            <group key={pl.productId}>
              {aabbs.map((b, i) => {
                const role = roles ? roles[i]! : undefined;
                const color = isSel
                  ? SELECTED_COLOR
                  : role ? colorForRole(role) : fallbackColor;
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
                      <meshStandardMaterial color={isSel ? SELECTED_COLOR : '#9aa0a6'} metalness={0.6} roughness={0.4} />
                    </mesh>
                  );
                }

                return (
                  <mesh key={i} position={center} onClick={onClick} onDoubleClick={onDoubleClick}>
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
              })}
              <Html position={[labelX, labelTop + 5, labelZ]} center style={{ pointerEvents: 'none' }}>
                <div className={styles.label3d}>{product.name}</div>
              </Html>
            </group>
          );
        })}

        <OrbitControls target={center} makeDefault />
      </Canvas>
    </div>
  );
}
