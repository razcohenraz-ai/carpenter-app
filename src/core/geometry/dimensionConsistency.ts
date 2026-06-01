import type { Box, BoxLevel } from '../../types/geometry';

export interface DimensionMismatchWarning {
  /** גופים צמודים (אותה שורה) עם גבהים שונים */
  kind: 'h_mismatch';
  level: BoxLevel;
  diffCm: number;
}

export interface WidthMismatchWarning {
  /** קומות מוערמות עם רוחב כולל שונה */
  kind: 'w_mismatch';
  diffCm: number;
}

export interface VerticalGapWarning {
  /** סכום גבהי הקומות קטן מגובה הגוף הפנימי — יש חלל ריק */
  kind: 'v_gap';
  gapCm: number;
}

export type ConsistencyWarning =
  | DimensionMismatchWarning
  | WidthMismatchWarning
  | VerticalGapWarning;

/**
 * Checks whether box dimensions are mutually consistent after overrides.
 *
 * Three classes of mismatch:
 * - `h_mismatch`: boxes at the same level (side by side) have different H.
 * - `w_mismatch`: stacked levels have different total widths.
 * - `v_gap`: sum of level heights is less than the cabinet's inner body height,
 *   leaving empty space between stacked rows.
 *
 * Pass `result.boxes` (overrides already applied) + the original cabinet
 * H and plinth from CabinetInput so the gap check can compare against the
 * expected inner height.
 */
export function checkBoxConsistency(
  boxes: Box[],
  cabinetH?: number,
  plinth?: number,
  envelopeTopH = 0,
): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = [];
  const bodyBoxes = boxes.filter(b => b.level !== 'plinth');

  // Group by level
  const byLevel = new Map<BoxLevel, Box[]>();
  for (const box of bodyBoxes) {
    const arr = byLevel.get(box.level);
    if (arr) arr.push(box);
    else byLevel.set(box.level, [box]);
  }

  // Side-by-side: same level must share H
  for (const [level, levelBoxes] of byLevel) {
    if (levelBoxes.length < 2) continue;
    const heights = levelBoxes.map(b => b.H);
    const maxH = Math.max(...heights);
    const minH = Math.min(...heights);
    const diff = Math.round((maxH - minH) * 10) / 10;
    if (diff > 0.05) {
      warnings.push({ kind: 'h_mismatch', level, diffCm: diff });
    }
  }

  // Stacked: every level must have the same total W
  if (byLevel.size > 1) {
    const totals = [...byLevel.values()].map(arr =>
      Math.round(arr.reduce((s, b) => s + b.W, 0) * 10) / 10
    );
    const maxW = Math.max(...totals);
    const minW = Math.min(...totals);
    const diff = Math.round((maxW - minW) * 10) / 10;
    if (diff > 0.05) {
      warnings.push({ kind: 'w_mismatch', diffCm: diff });
    }
  }

  // Vertical gap: sum of unique level heights vs expected inner body height
  // Only relevant when there are multiple stacked levels AND we know the cabinet dims.
  if (byLevel.size > 1 && cabinetH !== undefined && plinth !== undefined) {
    // envelopeTopH is subtracted from the top box's H by decomposeBoxes when
    // a ceiling envelope panel is present — it is not empty space.
    const expectedBodyH = cabinetH - plinth - envelopeTopH;
    // Each level contributes its representative H (first box in that level)
    const totalLevelH = [...byLevel.values()]
      .reduce((sum, levelBoxes) => sum + (levelBoxes[0]?.H ?? 0), 0);
    const gap = Math.round((expectedBodyH - totalLevelH) * 10) / 10;
    if (gap > 0.1) {
      warnings.push({ kind: 'v_gap', gapCm: gap });
    }
  }

  return warnings;
}
