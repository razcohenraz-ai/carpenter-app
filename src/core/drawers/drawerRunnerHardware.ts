import type { HardwareLineItem } from '../../types/hardware';
import type { DrawerItem, InteriorItem } from '../../types/interior';
import type { RunnerSpec } from '../../types/runners';
import { getRunner } from '../../catalog/runners';
import { selectNominalLength } from './drawerBox';

/** Generic telescopic-slide spec id in the hardware preset. A drawer that gets a
 *  real runner system no longer needs this generic pair — the runner IS the slide. */
export const GENERIC_SLIDE_SPEC_ID = 'slide-telescopic';

/** Unit label for a runner line — one matched left/right SET per drawer. */
const RUNNER_UNIT = 'סט';

/** Price (₪) of one runner SET for the given nominal length. The band is chosen
 *  by NL (first band whose `maxNlMm ≥ NL`; NL beyond the last band falls back to
 *  it). `overrideBands` (from Settings, aligned to the spec's `priceByNlMm` by
 *  index) take precedence over the catalog price for that band. */
export function runnerPriceShekel(spec: RunnerSpec, nl: number, overrideBands?: number[]): number {
  let idx = spec.priceByNlMm.findIndex(b => nl <= b.maxNlMm);
  if (idx === -1) idx = spec.priceByNlMm.length - 1;
  return overrideBands?.[idx] ?? spec.priceByNlMm[idx]?.priceShekel ?? 0;
}

export interface DrawerRunnerHardwareOptions {
  /** Runner used for drawers that don't carry their own `runnerId`. */
  defaultRunnerId?: string;
  /** Carpenter's per-runner price overrides (₪), keyed by runner id; each value
   *  is a band array aligned to that runner's `priceByNlMm`. Missing → catalog. */
  priceOverrides?: Record<string, number[]>;
}

/** ONE runner hardware line (qty 1, a left/right set) per drawer that has a
 *  resolvable runner, priced for THIS body's usable depth (which selects the NL
 *  → the price band). Drawers with no runner are skipped — they keep the generic
 *  telescopic slide from the preset. Grouping across bodies and removing the
 *  superseded generic slides is done by {@link mergeRunnerHardware}. */
export function buildDrawerRunnerHardware(
  items: InteriorItem[],
  usableDepthCm: number,
  opts: DrawerRunnerHardwareOptions = {},
): HardwareLineItem[] {
  const drawers = items.filter((i): i is DrawerItem => i.type === 'drawer');
  const lines: HardwareLineItem[] = [];
  for (const d of drawers) {
    const spec = getRunner(d.runnerId ?? opts.defaultRunnerId ?? '');
    if (!spec) continue;
    const { nl } = selectNominalLength(spec, usableDepthCm * 10);
    const price = runnerPriceShekel(spec, nl, opts.priceOverrides?.[spec.id]);
    lines.push({
      specId: `runner-${spec.id}-nl${nl}`,
      name: `${spec.name} (NL ${nl})`,
      qty: 1,
      unit: RUNNER_UNIT,
      unitPrice: price,
      total: price,
    });
  }
  return lines;
}

/** Folds the per-drawer runner lines into the base hardware list: groups identical
 *  runner lines (same runner + NL → same `specId`) summing qty, and REMOVES that
 *  many generic telescopic slides (a runner drawer's slide IS the runner). Drops
 *  any line that nets to zero. Returns `base` unchanged when there are no runners. */
export function mergeRunnerHardware(
  base: HardwareLineItem[],
  runnerLines: HardwareLineItem[],
): HardwareLineItem[] {
  if (runnerLines.length === 0) return base;
  const runnerCount = runnerLines.reduce((s, l) => s + l.qty, 0);

  // 1) Reduce the generic telescopic slide by the runner-drawer count.
  const adjusted = base
    .map(l => l.specId === GENERIC_SLIDE_SPEC_ID
      ? { ...l, qty: l.qty - runnerCount, total: (l.qty - runnerCount) * l.unitPrice }
      : l)
    .filter(l => l.qty > 0);

  // 2) Group the runner lines (same specId = same runner + NL = same price).
  const grouped = new Map<string, HardwareLineItem>();
  for (const l of runnerLines) {
    const ex = grouped.get(l.specId);
    if (ex) { ex.qty += l.qty; ex.total += l.total; }
    else grouped.set(l.specId, { ...l });
  }
  return [...adjusted, ...grouped.values()];
}
