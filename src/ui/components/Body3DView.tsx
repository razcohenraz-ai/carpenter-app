import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import type { BoardBox3D } from '../../core/product/cabinetBoards3D';
import { colorForRole } from './boards3DStyle';
import { ViewButtons, CameraRig, type CamCmd, type ViewPreset } from './cameraViews';
import styles from './Body3DView.module.css';

interface Props {
  /** This body's boards in product-local cm coordinates — straight from
   *  `cabinetBoardBoxes` (the SAME pipeline RoomView3D uses), so the geometry
   *  can never drift from the cut list / 2D sketch / room view. */
  boxes: BoardBox3D[];
}

/** Hinge-marking triangle on a door's outward face (product-local coords, no
 *  room rotation). Apex points to the OPENING (free) side — opposite the hinge.
 *  'top' = lift-up door (קלפה) → apex points down. Mirrors RoomView3D's marking
 *  so 2D, room-3D and the editor-3D all read the same. */
function hingeTriangleLocal(b: BoardBox3D): [number, number, number][] {
  const z = b.z1 + 0.3; // lift just off the face so it never z-fights
  const yTop = b.y1, yBot = b.y0, yMid = (b.y0 + b.y1) / 2;
  if (b.hingeSide === 'top') {
    const midX = (b.x0 + b.x1) / 2;
    return [[b.x0, yTop, z], [midX, yBot, z], [b.x1, yTop, z]];
  }
  // left hinge → apex points right; right hinge → apex points left.
  const apexX = b.hingeSide === 'left' ? b.x1 : b.x0;
  const openX = b.hingeSide === 'left' ? b.x0 : b.x1;
  return [[openX, yTop, z], [apexX, yMid, z], [openX, yBot, z]];
}

/** View-only 3D model of a SINGLE body: every carcass / shelf / drawer / rod
 *  board as its own mesh, with no room walls or placement transform. Used by
 *  the interior editor's 2D/3D toggle so the carpenter can rotate the body and
 *  see the shelves/drawers in space while editing. */
export default function Body3DView({ boxes }: Props): React.JSX.Element {
  // Body bounds → camera framing (extra args guard an empty list against
  // Math.min()/max() returning ±Infinity).
  const x0 = Math.min(...boxes.map(b => b.x0), 0);
  const x1 = Math.max(...boxes.map(b => b.x1), 1);
  const y0 = Math.min(...boxes.map(b => b.y0), 0);
  const y1 = Math.max(...boxes.map(b => b.y1), 1);
  const z0 = Math.min(...boxes.map(b => b.z0), 0);
  const z1 = Math.max(...boxes.map(b => b.z1), 1);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const span = Math.max(x1 - x0, y1 - y0, z1 - z0, 1);
  const center: [number, number, number] = [cx, cy, cz];

  const [camCmd, setCamCmd] = useState<CamCmd | null>(null);
  const pick = (p: ViewPreset) => setCamCmd(c => ({ preset: p, tick: (c?.tick ?? 0) + 1 }));

  return (
    <div className={styles.canvas3d}>
      <ViewButtons onPick={pick} />
      <Canvas
        camera={{ position: [cx + span * 0.9, cy + span * 0.6, cz + span * 1.7], fov: 40, near: 1, far: span * 12 + 2000 }}
      >
        <CameraRig cmd={camCmd} center={center} dist={span * 1.6} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[cx + span, cy + span * 2.2, cz + span * 1.6]} intensity={1.1} />
        <directionalLight position={[cx - span * 0.6, cy + span, cz - span * 0.6]} intensity={0.3} />

        {boxes.map((b, i) => {
          const c: [number, number, number] = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];

          // Hanging rod → a round bar along its longer horizontal axis (mirrors
          // RoomView3D's rod rendering).
          if (b.role === 'rod') {
            const dx = b.x1 - b.x0, dz = b.z1 - b.z0;
            const alongX = dx >= dz;
            const length = Math.max(alongX ? dx : dz, 0.1);
            const radius = Math.max(Math.min(b.y1 - b.y0, alongX ? dz : dx) / 2, 0.4);
            const rotation: [number, number, number] = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
            return (
              <mesh key={i} position={c} rotation={rotation}>
                <cylinderGeometry args={[radius, radius, length, 12]} />
                <meshStandardMaterial color="#9aa0a6" metalness={0.6} roughness={0.4} />
              </mesh>
            );
          }

          const meshEl = (
            <mesh position={c}>
              <boxGeometry args={[
                Math.max(b.x1 - b.x0, 0.1),
                Math.max(b.y1 - b.y0, 0.1),
                Math.max(b.z1 - b.z0, 0.1),
              ]} />
              <meshStandardMaterial color={colorForRole(b.role)} />
            </mesh>
          );

          // Door faces (fronts view) get the hinge/opening triangle on top.
          if (b.role === 'front' && b.hingeSide) {
            return (
              <group key={i}>
                {meshEl}
                <Line points={hingeTriangleLocal(b)} color="#5a5a5a" lineWidth={1.5} transparent opacity={0.75} />
              </group>
            );
          }
          return <group key={i}>{meshEl}</group>;
        })}

        <OrbitControls target={center} makeDefault zoomToCursor />
      </Canvas>
    </div>
  );
}
