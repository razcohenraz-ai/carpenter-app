import type { CabinetInput } from '../../types/cabinet';
import type { CutItem } from '../../types/cuts';
import type { Edging } from '../../types/edging';

/** The resolved corner-filler config (present only on corner units). */
export type CornerFiller = NonNullable<CabinetInput['cornerFiller']>;

/** A corner unit (פינה) — one fixed-width door at an edge + an L-shaped filler
 *  covering the rest of the front. Single marker for every corner branch
 *  (front layout, door override, filler cuts, 3D return). */
export function isCorner(input: CabinetInput): boolean {
  return input.cornerFiller !== undefined;
}

/** Horizontal layout (cabinet-local cm, x left→right from the outer-left edge)
 *  of a corner front: a fixed-width DOOR at the chosen edge and a FILLER FACE
 *  covering the rest. A full `gapCm` reveal sits at each outer edge and between
 *  the door and the filler — the same gap convention every other facade in the
 *  app uses (`computeFrontGeometry`). So the filler face width is
 *  `W − doorWidth − 3·gap`. The Y extent (height) is supplied by the caller
 *  (the door row), not here. */
export function cornerFrontXLayout(
  cabinetWcm: number,
  gapCm: number,
  cf: CornerFiller,
): { door: { x0: number; x1: number }; fillerFace: { x0: number; x1: number } } {
  const W = cabinetWcm;
  const doorW = Math.max(0, cf.doorWidthCm);
  if (cf.doorSide === 'right') {
    const doorX1 = W - gapCm;
    const doorX0 = doorX1 - doorW;
    const fillerX0 = gapCm;
    const fillerX1 = doorX0 - gapCm;
    return {
      door: { x0: doorX0, x1: doorX1 },
      fillerFace: { x0: fillerX0, x1: Math.max(fillerX0, fillerX1) },
    };
  }
  // Door on the left edge.
  const doorX0 = gapCm;
  const doorX1 = doorX0 + doorW;
  const fillerX0 = doorX1 + gapCm;
  const fillerX1 = W - gapCm;
  return {
    door: { x0: doorX0, x1: doorX1 },
    fillerFace: { x0: Math.min(fillerX0, fillerX1), x1: fillerX1 },
  };
}

/** The door's hinge side — always the FILLER side (opposite the door's edge),
 *  so the hinges screw into the perpendicular return. Door on the right ⇒
 *  hinges on its left. */
export function cornerHingeSide(cf: CornerFiller): 'left' | 'right' {
  return cf.doorSide === 'right' ? 'left' : 'right';
}

/** The perpendicular hinge-post return as an axis-aligned box in cabinet-local
 *  3D cm (x left→right, y up from floor, z back→front). It stands at the
 *  door↔filler boundary (on the filler side), is `tFrontCm` thick in X, runs
 *  the carcass inner opening in Y, and reaches `returnDepthCm` back from the
 *  front face in Z. Used by the 3D view; the face flange comes from the front
 *  panels. */
export function cornerReturnBox(args: {
  cabinetWcm: number;
  gapCm: number;
  cf: CornerFiller;
  tFrontCm: number;
  fullDepthCm: number;
  innerBottomCm: number;
  innerTopCm: number;
}): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  const { cabinetWcm, gapCm, cf, tFrontCm, fullDepthCm, innerBottomCm, innerTopCm } = args;
  const { fillerFace } = cornerFrontXLayout(cabinetWcm, gapCm, cf);
  // The return sits at the filler's door-side edge (the inner edge nearest the
  // door): the filler's right edge when the door is on the right, else its left.
  const [x0, x1] = cf.doorSide === 'right'
    ? [fillerFace.x1 - tFrontCm, fillerFace.x1]
    : [fillerFace.x0, fillerFace.x0 + tFrontCm];
  return {
    x0, x1,
    y0: innerBottomCm, y1: innerTopCm,
    z0: Math.max(0, fullDepthCm - cf.returnDepthCm), z1: fullDepthCm,
  };
}

/** Cut pieces of the L-shaped filler (both front material, group 'front'):
 *  the FACE flange (covers the rest of the front, door height) and the RETURN
 *  flange (the perpendicular hinge post, `returnDepthCm` × carcass inner
 *  height). Two full-size rectangles joined at a 90° miter. The face is edged
 *  like a door (perimeter band deducted); the return is an internal post, left
 *  raw. */
export function cornerFillerCutItems(args: {
  cabinetWcm: number;
  gapCm: number;
  cf: CornerFiller;
  doorHeightCm: number;
  innerHeightCm: number;
  edging?: Edging;
}): CutItem[] {
  const { cabinetWcm, gapCm, cf, doorHeightCm, innerHeightCm, edging } = args;
  const face = cornerFrontXLayout(cabinetWcm, gapCm, cf).fillerFace;
  const faceW = Math.max(0, face.x1 - face.x0);
  const cm = (v: number) => v * 10; // cm → mm (cut-list units)
  const perimMm = edging ? 2 * edging.thickness : 0;
  const cuts: CutItem[] = [];
  if (faceW > 0 && doorHeightCm > 0) {
    cuts.push({ name: 'מילוי פינה', qty: 1, w: cm(faceW) - perimMm, h: cm(doorHeightCm) - perimMm, group: 'front' });
  }
  if (cf.returnDepthCm > 0 && innerHeightCm > 0) {
    cuts.push({ name: 'זקף ציר פינה', qty: 1, w: cm(cf.returnDepthCm), h: cm(innerHeightCm), group: 'front' });
  }
  return cuts;
}
