import type { CutItem } from '../../types/cuts';

// ── Merge duplicate cut items ────────────────────────────────────────────────
// Two cuts are "the same piece" — and therefore mergeable into one line on the
// saw operator's list — when they share materialId, both dimensions (w, h),
// and the visible description (name). All other fields (group, note) are
// preserved from the first occurrence.
//
// Why merge: a 4-body cabinet emits 4 identical shelf boards as 4 separate
// CutItems with qty=1 each. A single line "qty=4" is what the saw operator
// reads. The grouping happens here in core (not in the UI) so any consumer
// — print, JSON export, sheet calculator — sees the same compact list.

function mergeKey(c: CutItem): string {
  // The undefined materialId is its own bucket: drawer-box parts share a
  // bucket only with other drawer-box parts of the same name+dims.
  return `${c.materialId ?? ''}|${c.w}|${c.h}|${c.name}`;
}

export function mergeCutItems(items: CutItem[]): CutItem[] {
  // Map preserves insertion order in JS — the first occurrence of each key
  // anchors the row's position in the output. Subsequent matches add to qty
  // without re-ordering.
  const buckets = new Map<string, CutItem>();
  for (const c of items) {
    const key = mergeKey(c);
    const existing = buckets.get(key);
    if (existing) {
      existing.qty += c.qty;
    } else {
      // Shallow clone so we never mutate the caller's input.
      buckets.set(key, { ...c });
    }
  }
  return Array.from(buckets.values());
}
