import type { BoardBox3D } from '../../core/product/cabinetBoards3D';

/** The grey the selected product's boards are washed TOWARD (a soft, very-light
 *  grey shade). Each board keeps its own role colour, just blended part-way to
 *  this — so a selected item reads as highlighted while staying fully detailed. */
export const SELECTED_COLOR = '#e5e5e5';

/** Blend hex `a` toward hex `b` by `t` (0..1) → `#rrggbb`. Used to shade a
 *  selected product without flattening its per-board colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const lerp = (sh: number) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  const r = lerp(16), g = lerp(8), bl = lerp(0);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/** Wood-tone palette by board-role family — reads as carpentry in 3D. Shared by
 *  every 3D board renderer (RoomView3D, the body-editor Body3DView) so the
 *  colours can never drift between them. */
export function colorForRole(role: BoardBox3D['role']): string {
  if (role === 'front') return '#e8934a';      // door / drawer face
  if (role === 'rod') return '#9aa0a6';        // brushed metal
  if (role === 'drawer-box') return '#b59f82'; // greyer tray
  if (role === 'back') return '#9c7f55';
  if (role === 'shelf' || role === 'fixed-shelf' || role === 'internal-shelf') return '#d8bb8a';
  if (role.startsWith('envelope')) return '#b89668';
  if (role.startsWith('plinth')) return '#8a6f4a';
  return '#c8a877'; // sides / top / bottom / partition / traverses
}
