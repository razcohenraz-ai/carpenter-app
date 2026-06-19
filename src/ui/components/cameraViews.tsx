import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useTranslation } from '../hooks/useTranslation';
import styles from './cameraViews.module.css';

export type ViewPreset = 'front' | 'top' | 'side' | 'diagL' | 'diagR';
export type Vec3 = [number, number, number];

/** A camera-move request. `tick` increments on every click so pressing the same
 *  preset twice (after orbiting away) re-fires the move. */
export interface CamCmd { preset: ViewPreset; tick: number; }

/** Place the camera at `dist` from `center` along a fixed direction per preset.
 *  Y is up; Z points toward the room's open (front) side. */
export function presetCameraPosition(preset: ViewPreset, center: Vec3, dist: number): Vec3 {
  const dir: Vec3 =
    preset === 'front' ? [0, 0, 1] :
    preset === 'top'   ? [0, 1, 0.0015] :   // tiny Z so "up" resolves cleanly
    preset === 'side'  ? [1, 0, 0] :
    preset === 'diagL' ? [-0.85, 0.6, 0.85] :
                         [0.85, 0.6, 0.85];  // diagR
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return [
    center[0] + (dir[0] / len) * dist,
    center[1] + (dir[1] / len) * dist,
    center[2] + (dir[2] / len) * dist,
  ];
}

interface OrbitLike { target: { set(x: number, y: number, z: number): void }; update(): void }

/** Lives INSIDE the <Canvas>. On each new `cmd` it snaps the camera to the
 *  preset position (and re-centres OrbitControls on the body/room). */
export function CameraRig({ cmd, center, dist }: { cmd: CamCmd | null; center: Vec3; dist: number }): null {
  const camera = useThree(s => s.camera);
  const controls = useThree(s => s.controls) as unknown as OrbitLike | null;
  useEffect(() => {
    if (!cmd) return;
    const p = presetCameraPosition(cmd.preset, center, dist);
    camera.position.set(p[0], p[1], p[2]);
    camera.lookAt(center[0], center[1], center[2]);
    if (controls?.target) {
      controls.target.set(center[0], center[1], center[2]);
      controls.update();
    }
    // Fire only on a new click (tick); center/dist changes shouldn't yank the
    // camera while the carpenter is freely orbiting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd?.tick]);
  return null;
}

/** HTML overlay row of standard-view buttons, anchored to the top of a
 *  position:relative canvas container. Sits OUTSIDE the <Canvas>. */
export function ViewButtons({ onPick }: { onPick: (p: ViewPreset) => void }): React.JSX.Element {
  const { t } = useTranslation();
  const items: [ViewPreset, string][] = [
    ['front', t.camViews.front],
    ['top', t.camViews.top],
    ['side', t.camViews.side],
    ['diagL', t.camViews.diagLeft],
    ['diagR', t.camViews.diagRight],
  ];
  return (
    <div className={styles.viewButtons}>
      {items.map(([p, label]) => (
        <button key={p} type="button" className={styles.viewButton} onClick={() => onPick(p)}>
          {label}
        </button>
      ))}
    </div>
  );
}
