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

export type ConsistencyWarning = DimensionMismatchWarning | WidthMismatchWarning;

/**
 * Checks whether box dimensions are mutually consistent after overrides.
 *
 * Two classes of mismatch:
 * - `h_mismatch`: boxes at the same level (side by side) have different H.
 * - `w_mismatch`: stacked levels have different total widths.
 *
 * Only meaningful when `boxDimensionOverrides` is non-empty; pass
 * `result.boxes` which already has overrides applied.
 */
export function checkBoxConsistency(boxes: Box[]): ConsistencyWarning[] {
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

  return warnings;
}
