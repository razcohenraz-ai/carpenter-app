import type { CutItem } from '../../types/cuts';

// ── Merge duplicate cut items ────────────────────────────────────────────────
// Two cuts are "the same piece" — and therefore mergeable into one line on the
// saw operator's list — when they share materialId, both dimensions (w, h),
// and the visible description (name). All other fields (group, note, role) are
// preserved from the first occurrence.
//
// Why merge: a 4-body cabinet emits 4 identical shelf boards as 4 separate
// CutItems with qty=1 each. A single line "qty=4" is what the saw operator
// reads. The grouping happens here in core (not in the UI) so any consumer
// — print, JSON export, sheet calculator — sees the same compact list.
//
// Optional second pass (`labels` provided): collapses known carpentry PAIRS
// of identical-dimension pieces — top + bottom, side-left + side-right,
// envelope-left + envelope-right — into a single row labelled e.g.
// "עליון / תחתון". The labels are passed in (not hardcoded) so the UI can
// supply translations.

/** Display labels for the three known carpentry pairs. Pass to
 *  {@link mergeCutItems} to enable the pair-merge second pass. Each label
 *  replaces the `name` of the merged row. */
export interface PairLabels {
  topBottom: string;
  sides: string;
  envelopeSides: string;
}

interface PairDef {
  roles: readonly [string, string];
  labelKey: keyof PairLabels;
}

const PAIRS: readonly PairDef[] = [
  { roles: ['top', 'bottom'], labelKey: 'topBottom' },
  { roles: ['side-left', 'side-right'], labelKey: 'sides' },
  { roles: ['envelope-left', 'envelope-right'], labelKey: 'envelopeSides' },
];

function mergeKey(c: CutItem): string {
  // The undefined materialId is its own bucket: drawer-box parts share a
  // bucket only with other drawer-box parts of the same name+dims.
  return `${c.materialId ?? ''}|${c.w}|${c.h}|${c.name}`;
}

function dimsKey(c: CutItem): string {
  return `${c.materialId ?? ''}|${c.w}|${c.h}`;
}

export function mergeCutItems(items: CutItem[], labels?: PairLabels): CutItem[] {
  // First pass: aggregate by (materialId, w, h, name). Map preserves insertion
  // order in JS — the first occurrence of each key anchors the row's position
  // in the output. Subsequent matches add to qty without re-ordering.
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
  const firstPass = Array.from(buckets.values());

  if (!labels) return firstPass;
  return mergePairs(firstPass, labels);
}

function mergePairs(items: CutItem[], labels: PairLabels): CutItem[] {
  // Group by (materialId, w, h). Within each group, look for items carrying
  // the two roles of any known pair. If both are present we collapse every
  // matching row into a single entry (qty = sum), positioned at the first
  // occurrence so the row's place in the list stays predictable.
  const dimsGroups = new Map<string, Array<{ item: CutItem; idx: number }>>();
  items.forEach((item, idx) => {
    const k = dimsKey(item);
    const arr = dimsGroups.get(k) ?? [];
    arr.push({ item, idx });
    dimsGroups.set(k, arr);
  });

  const replacements = new Map<number, CutItem>();
  const consumed = new Set<number>();

  for (const group of dimsGroups.values()) {
    for (const pair of PAIRS) {
      const inPair = group.filter(g => {
        const r = g.item.role;
        return r !== undefined && (pair.roles as readonly string[]).includes(r);
      });
      const rolesSeen = new Set(inPair.map(g => g.item.role));
      // Both roles of the pair must be present.
      if (rolesSeen.size < 2) continue;

      const totalQty = inPair.reduce((s, g) => s + g.item.qty, 0);
      const firstIdx = inPair.reduce((m, g) => Math.min(m, g.idx), Infinity);
      const firstItem = inPair.find(g => g.idx === firstIdx)!.item;
      const merged: CutItem = {
        ...firstItem,
        name: labels[pair.labelKey],
        qty: totalQty,
      };
      // The merged row is no longer a single role — clearing prevents it
      // from accidentally participating in a further pair merge.
      delete merged.role;

      replacements.set(firstIdx, merged);
      for (const g of inPair) {
        if (g.idx !== firstIdx) consumed.add(g.idx);
      }
    }
  }

  const result: CutItem[] = [];
  items.forEach((item, idx) => {
    if (consumed.has(idx)) return;
    result.push(replacements.get(idx) ?? item);
  });
  return result;
}
