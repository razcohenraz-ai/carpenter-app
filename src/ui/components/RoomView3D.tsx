import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { DoubleSide } from 'three';
import type { Room, ProductUnit } from '../../types/project';
import { productBounds, productSubBoxes } from '../../core/room/productBounds';
import { placementSubBoxAABBs } from '../../core/room/roomGeometry';
import styles from './RoomView.module.css';

/** Distinct fill colours cycled per placed product (selected overrides). */
const PALETTE = ['#6b8cae', '#b08968', '#7a9e7e', '#a87ca0', '#c0a062', '#8a8a8a'];
const SELECTED_COLOR = '#e07a3c';

interface Props {
  room: Room;
  products: ProductUnit[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenProduct: (id: string) => void;
}

/** Rough 3D view of the room: floor + back/left walls for spatial reference,
 *  and one box mesh per product sub-box. Reads the SAME `placementSubBoxAABBs`
 *  the elevation projects, so the three views render one model — this is the
 *  validation pass that exercises depth and height together (which the flat
 *  views structurally cannot). Click selects; double-click opens the product. */
export function RoomView3D({ room, products, selectedId, onSelect, onOpenProduct }: Props): React.JSX.Element {
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

        {/* Products — one box mesh per sub-box (base units, wall cabinets, …) */}
        {room.placements.map((pl, pi) => {
          const product = productById.get(pl.productId);
          if (!product) return null;
          const boxes = placementSubBoxAABBs(pl, productSubBoxes(product), productBounds(product));
          if (boxes.length === 0) return null;
          const isSel = pl.productId === selectedId;
          const color = isSel ? SELECTED_COLOR : PALETTE[pi % PALETTE.length]!;
          const labelX = (Math.min(...boxes.map(b => b.x0)) + Math.max(...boxes.map(b => b.x1))) / 2;
          const labelZ = (Math.min(...boxes.map(b => b.z0)) + Math.max(...boxes.map(b => b.z1))) / 2;
          const labelTop = Math.max(...boxes.map(b => b.y1));
          return (
            <group key={pl.productId}>
              {boxes.map((b, i) => (
                <mesh key={i}
                  position={[(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]}
                  onClick={e => { e.stopPropagation(); onSelect(pl.productId); }}
                  onDoubleClick={e => { e.stopPropagation(); onOpenProduct(pl.productId); }}
                >
                  <boxGeometry args={[
                    Math.max(b.x1 - b.x0, 0.1),
                    Math.max(b.y1 - b.y0, 0.1),
                    Math.max(b.z1 - b.z0, 0.1),
                  ]} />
                  <meshStandardMaterial color={color} transparent opacity={isSel ? 0.95 : 0.85} />
                </mesh>
              ))}
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
