import type { RunnerSpec, DrawerBoxInput, DrawerBox, DrawerPanelCut } from '../../types/runners';
import { roundOutput } from '../utils/round';

/** External drawers: the box side panels are this much shorter than the facade
 *  front (carpenter convention). Inner drawers use their own height directly. */
export const EXTERNAL_SIDE_HEIGHT_REDUCTION_MM = 40;

/** Largest nominal length whose required depth (NL + minDepthExtra) fits the
 *  cabinet's usable internal depth. Falls back to the shortest NL (flagged
 *  `fits:false`) when even that doesn't fit. */
export function selectNominalLength(
  spec: RunnerSpec,
  internalDepthMm: number,
): { nl: number; fits: boolean } {
  const fitting = spec.nominalLengthsMm.filter(nl => nl + spec.minDepthExtraMm <= internalDepthMm);
  if (fitting.length > 0) return { nl: Math.max(...fitting), fits: true };
  return { nl: Math.min(...spec.nominalLengthsMm), fits: false };
}

/** Computes the exact drawer-box cut list for ONE drawer on a given runner.
 *  Pure — no React. The runner spec fixes the OUTER envelope + bottom (these are
 *  joinery-independent); the joinery only changes how the front/back are cut:
 *  `miter` → full outer width, 45° corners; `buttGroove` → internal width (SKW),
 *  butted between the sides. Front/back are always shorter than the sides by
 *  (M + bottom thickness); the bottom sits under them at full depth. */
export function computeDrawerBox(spec: RunnerSpec, input: DrawerBoxInput): DrawerBox {
  const warnings: string[] = [];

  const { nl, fits } = selectNominalLength(spec, input.internalDepthMm);
  if (!fits) {
    warnings.push(`עומק פנימי ${input.internalDepthMm}מ"מ קצר מהמסילה הקצרה ביותר — נבחר NL=${nl}`);
  }

  const t = input.sidePanelThicknessMm;
  if (t < spec.sidePanelThicknessMm.min || t > spec.sidePanelThicknessMm.max) {
    warnings.push(
      `עובי דופן מגירה ${t}מ"מ מחוץ לטווח של ${spec.name} ` +
      `(${spec.sidePanelThicknessMm.min}–${spec.sidePanelThicknessMm.max}מ"מ)`,
    );
  }

  const skl = nl - spec.sklOffsetMm;                              // side length (depth)
  const skw = input.internalWidthMm - spec.skwOffsetMm;          // internal drawer width
  const bottomWidth = input.internalWidthMm - spec.bottomWidthOffsetMm;
  const outerWidth = skw + 2 * t;

  // external → side panel is `front − 40`; inner → the drawer height itself.
  const sideHeight = input.kind === 'external'
    ? input.heightMm - EXTERNAL_SIDE_HEIGHT_REDUCTION_MM
    : input.heightMm;
  // front/back are shorter than the sides by (mount-over-runner + bottom thickness).
  const frontBackHeight = sideHeight - spec.mountOverRunnerMm - input.bottomThicknessMm;

  const joinery = input.joinery ?? 'miter';
  const frontBackWidth = joinery === 'miter' ? outerWidth : skw;
  const corner: DrawerPanelCut['joint'] = joinery === 'miter' ? 'miter45' : 'butt';

  const panels: DrawerPanelCut[] = [
    { role: 'side',   qty: 2, lengthMm: skl,            heightMm: sideHeight,      thicknessMm: t,                       joint: corner },
    { role: 'front',  qty: 1, lengthMm: frontBackWidth, heightMm: frontBackHeight, thicknessMm: t,                       joint: corner },
    { role: 'back',   qty: 1, lengthMm: frontBackWidth, heightMm: frontBackHeight, thicknessMm: t,                       joint: corner },
    { role: 'bottom', qty: 1, lengthMm: bottomWidth,    heightMm: skl,             thicknessMm: input.bottomThicknessMm, joint: 'groove' },
  ];

  return {
    runnerId: spec.id,
    nominalLengthMm: nl,
    outerWidthMm: roundOutput(outerWidth),
    outerDepthMm: roundOutput(skl),
    sidePanelHeightMm: roundOutput(sideHeight),
    frontBackHeightMm: roundOutput(frontBackHeight),
    panels: panels.map(p => ({ ...p, lengthMm: roundOutput(p.lengthMm), heightMm: roundOutput(p.heightMm) })),
    screwHeightMm: spec.screwHeightMm,
    warnings,
  };
}
