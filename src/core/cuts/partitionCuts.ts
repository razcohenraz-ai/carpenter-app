import type { Box, CutItem, MaterialId } from '../../types';

/** Hebrew label for an internal-partition cut, e.g.
 *  "מחיצה פנימית — עליונה — שמאל". */
export function buildPartitionCutLabel(box: Box): string {
  const parts: string[] = ['מחיצה פנימית'];
  const levelMap: Record<string, string> = { top: 'עליונה', middle: 'אמצעית', bottom: 'תחתונה' };
  if (box.level !== 'single' && levelMap[box.level]) parts.push(levelMap[box.level]!);
  if (box.position === 'left') parts.push('שמאל');
  else if (box.position === 'right') parts.push('ימין');
  else if (box.unitIndex !== undefined) parts.push(`יחידה ${box.unitIndex}`);
  return parts.join(' — ');
}

/** Internal-partition cuts — one per extra front in a partitioned body.
 *  SINGLE SOURCE shared by the pure compute path (cabinetCompute) and the live
 *  hook (useCabinet) so the two can never drift (Gotcha #8).
 *
 *  A partition is cut from its body's effective body material. Callers that
 *  have the resolved per-body material pass `bodyMatForBox` (id for cut
 *  grouping, cm thickness for the note). The live add/remove-partition handlers
 *  re-key without a full recompute and have no per-body material at hand — they
 *  omit `bodyMatForBox` and fall back to the cabinet `fallbackTBodyCm` (and emit
 *  no materialId). */
export function computePartitionCuts(
  boxes: Box[],
  nfMap: Map<string, number>,
  pMap: Map<string, boolean>,
  fallbackTBodyCm: number,
  bodyMatForBox?: (box: Box) => { id: MaterialId | string; tCm: number },
): CutItem[] {
  const cuts: CutItem[] = [];
  for (const box of boxes) {
    if (box.level === 'plinth') continue;
    if (!pMap.get(box.id)) continue;
    const nf = nfMap.get(box.id) ?? 1;
    const count = nf - 1;
    if (count <= 0) continue;
    const mat = bodyMatForBox?.(box);
    const tCm = mat?.tCm ?? fallbackTBodyCm;
    cuts.push({
      name: buildPartitionCutLabel(box),
      qty: count,
      w: box.D * 10,
      // Internal opening between the top & bottom panels — matches the physical
      // board (`buildBoardModel` partition length = H − 2t). The external box.H
      // over-reported the cut by 2× the body thickness.
      h: Math.max(0, box.H - 2 * tCm) * 10,
      group: 'body',
      note: `${Math.round(tCm * 10)}mm`,
      ...(mat ? { materialId: mat.id } : {}),
    });
  }
  return cuts;
}
