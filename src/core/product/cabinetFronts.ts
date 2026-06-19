import type { CabinetInput, SavedCabinetState } from '../../types';
import type { CustomMaterial } from '../../types/materials';
import type { BoxLevel } from '../../types/geometry';
import type { InteriorById, CellInteriorById, InteriorItem } from '../../types/interior';
import type { DrawerFront } from '../../types/doors';
import { decomposeBoxes } from '../geometry/boxDecomposition';
import {
  frontColumnsForBox, computeRowFrontLayout, computeFrontGeometry, computeFrontGeometryForSpan,
  getBoxFirstGlobalFrontIndex, getTotalFrontsInRow, groupBoxesByRow, type RowFrontLayout,
} from '../geometry/frontGeometry';
import {
  computeInnerWidth, computeCarcassDepth, HINGE_GAP_CM,
} from '../boards/boardModel';
import { boxStableKey } from '../interior/interiorUtils';
import {
  calcMainDoorHeight, getItemsForFront, salonHingeSide, defaultHingeSide, shouldCoverSkirt,
  getDrawerFrontVisualHeight, getSkirtCoveringDrawer,
} from '../doors/doorUtils';
import { deriveDrawerFronts } from '../doors/drawerFrontsCalc';
import { getShellSides } from '../../types/cabinet';
import { getMaterialWithCustom } from '../../catalog';
import { isCorner, cornerFrontXLayout, cornerHingeSide } from './cornerModule';

/** One door / drawer-front face of a cabinet, in cabinet-local cm. `x` runs
 *  left→right from the outer-left edge; `y` is height off the floor (y0 bottom,
 *  y1 top). Single source for both the 2D fronts overlay (`CabinetFrontsOverlay`,
 *  which flips y into its top-down SVG) and the detailed 3D fronts view. */
export interface FrontPanel {
  x0: number; x1: number;
  y0: number; y1: number;
  /** Set only on DOOR panels (not drawer fronts / corner filler). The EDGE the
   *  door is hinged on. Drives the elevation hinge-marking triangle, whose apex
   *  points to the OPENING (free) side — the opposite edge. `'top'` = a lift-up
   *  door (קלפה) hinged along the top and opening upward → apex points down. */
  hingeSide?: 'left' | 'right' | 'top';
}

/** Render threshold (cm): a main door shorter than this above an external-drawer
 *  stack is not drawn as a face (matches the 2D fronts sketch). */
const MIN_DOOR_PANEL_H_CM = 0.01;

/** Door rows + external-drawer faces of a WHOLE cabinet as flat panels, in
 *  cabinet-local floor-up cm (x = 0..outerW from the outer-left edge).
 *
 *  This mirrors the cut-list / 3D-board pipeline exactly: the cabinet is
 *  decomposed into bodies (`decomposeBoxes`), each row of bodies gets its own
 *  front layout (`computeRowFrontLayout`), and every body emits one door per
 *  front column plus its external-drawer faces (`deriveDrawerFronts`). The
 *  earlier single-body model (one body keyed `single:single`, columns split
 *  over the FULL width) dropped doors and drawers on multi-body free-standing
 *  cabinets — the wide/tall wardrobe that splits into several bodies. Driving
 *  the same decomposition the cut list uses keeps the rendered faces in step
 *  with the actual door / drawer-front cuts.
 *
 *  Feeds both the 2D fronts overlay (`CabinetFrontsOverlay`) and the 3D fronts
 *  view (`cabinetFrontBoxes`). */
export function cabinetFrontPanels(
  input: CabinetInput,
  state: SavedCabinetState,
  customMaterials: CustomMaterial[],
): FrontPanel[] {
  const inp = input;
  if (inp.W <= 0 || inp.H <= 0 || inp.D <= 0) return [];

  const frontMat = getMaterialWithCustom(inp.frontMaterialId, customMaterials);
  const tFront = frontMat.thickness / 10;
  const sides = getShellSides(inp);
  const hasAnyShell = sides.left || sides.right;
  const gapCm = inp.doorGapMm / 10;
  const skipFronts = (inp.hasFronts ?? true) === false;

  // Top/bottom envelope caps (front material, tFront each) — same gating as the
  // cut list / 3D. The body decomposition already drops them from box.H, so the
  // door/drawer faces fall inside the inner opening automatically.
  const wallEnv = inp.hasWallEnvelope === true && inp.mount === 'wall';
  const envelopeTopH = ((inp.hasEnvelopeTop && hasAnyShell) || wallEnv) ? tFront : 0;
  const envelopeBottomH = wallEnv ? tFront : 0;

  const innerW = computeInnerWidth(inp.W, sides, tFront);
  const carcassD = computeCarcassDepth(inp.D, inp.backThickness, HINGE_GAP_CM, tFront);

  // ── Decompose into bodies (mirror cabinetCompute / cabinetBoardBoxes) ────────
  const rawBoxes = decomposeBoxes(
    innerW, inp.H, carcassD, inp.lowerDoorH, inp.plinth,
    inp.doorsPerColumn, inp.middleDoorH, envelopeTopH, envelopeBottomH,
    isCorner(inp),
  );
  const overrides = new Map(Object.entries(state.boxDimensionOverrides ?? {}));
  const boxes = overrides.size === 0 ? rawBoxes : rawBoxes.map(box => {
    const o = overrides.get(boxStableKey(box));
    if (!o) return box;
    return {
      ...box,
      ...(o.W !== undefined ? { W: o.W } : {}),
      ...(o.H !== undefined ? { H: o.H } : {}),
      ...(o.D !== undefined ? { D: o.D } : {}),
    };
  });
  const bodyBoxes = boxes.filter(b => b.level !== 'plinth');
  if (bodyBoxes.length === 0) return [];
  const allPositions = bodyBoxes.map(b => b.position);

  // ── Per-body interior / partitions / front-column counts ────────────────────
  const interiorById: InteriorById = {};
  const cellInteriorById: CellInteriorById = {};
  const partitionsById = new Map<string, boolean>();
  const numFrontsPerBox = new Map<string, number>();
  for (const box of bodyBoxes) {
    const key = boxStableKey(box);
    const numFronts = frontColumnsForBox(box.W, inp.maxDoorWidth, inp.mount, inp.singleFront);
    numFrontsPerBox.set(box.id, numFronts);
    interiorById[box.id] = (state.interior[key] as InteriorItem[] | undefined) ?? [];
    if (state.partitions[key] && numFronts > 1) {
      partitionsById.set(box.id, true);
      cellInteriorById[box.id] = (state.cellInterior[key] as InteriorItem[][] | undefined) ?? [[], []];
    }
  }

  // ── Per-row front layouts (mirror cabinetCompute) ───────────────────────────
  const rowsByLevel = groupBoxesByRow(bodyBoxes);
  const layoutByRow = new Map<BoxLevel, RowFrontLayout>();
  for (const [level, rowBoxes] of rowsByLevel) {
    const totalFrontsInRow = getTotalFrontsInRow(rowBoxes, numFrontsPerBox);
    const rowInnerW = rowBoxes.reduce((s, b) => s + b.W, 0);
    const rowEffectiveOuterW = (inp.W - innerW) + rowInnerW;
    layoutByRow.set(level, computeRowFrontLayout({
      cabinetW: rowEffectiveOuterW,
      hasOuterShell: hasAnyShell,
      shellSides: sides,
      shellThicknessCm: tFront,
      totalFrontsInRow,
      gapCm,
    }));
  }

  // ── Per-level vertical stack: each body's bottom-from-floor (mirror 3D) ──────
  const LEVEL_ORDER: BoxLevel[] = ['top', 'middle', 'bottom', 'single'];
  const levelHeight = new Map<BoxLevel, number>();
  for (const b of bodyBoxes) if (!levelHeight.has(b.level)) levelHeight.set(b.level, b.H);
  const activeLevels = LEVEL_ORDER.filter(l => levelHeight.has(l));
  const bottomFromFloor = new Map<BoxLevel, number>();
  {
    let cumY = inp.plinth + envelopeBottomH;
    for (const level of [...activeLevels].reverse()) {
      bottomFromFloor.set(level, cumY);
      cumY += levelHeight.get(level)!;
    }
  }

  // ── Corner unit (פינה): one fixed-width door at the chosen edge + a filler
  //    face covering the rest. A corner is a single wide body (no width split,
  //    shelf-only), so its door isn't the equal-split column. ──────────────────
  if (isCorner(inp)) {
    const box = bodyBoxes[0];
    if (!box) return [];
    const cf = inp.cornerFiller!;
    const boxBottom = bottomFromFloor.get(box.level) ?? inp.plinth;
    const coversSkirt = inp.doorCoversPlinth && shouldCoverSkirt(box.level);
    const isBottomMost = box.level === 'bottom' || box.level === 'single';
    const hasBottomGap = !(isBottomMost && inp.plinth > 0 && !coversSkirt);
    const hasTopGap = box.level === 'top' || box.level === 'single';
    const panelH = Math.max(0, calcMainDoorHeight(box.H, interiorById[box.id] ?? [], inp.doorGapMm, hasBottomGap, hasTopGap));
    const outerW = box.W + (sides.left ? tFront : 0) + (sides.right ? tFront : 0);
    const xl = cornerFrontXLayout(outerW, gapCm, cf);
    const y0 = boxBottom;
    const y1 = boxBottom + panelH;
    return [
      { x0: xl.door.x0, x1: xl.door.x1, y0, y1, hingeSide: cornerHingeSide(cf) },
      { x0: xl.fillerFace.x0, x1: xl.fillerFace.x1, y0, y1 },
    ];
  }

  // ── External-drawer faces (shared core — re-stacks from each body's floor) ───
  const drawerFronts = deriveDrawerFronts({
    bodyBoxes,
    interiorById,
    cellInteriorById,
    partitionsById,
    numFrontsPerBox,
    doorCoversPlinth: inp.doorCoversPlinth,
    doorGapMm: inp.doorGapMm,
    layoutByRow,
  });

  // Group drawer fronts so a door above a stack starts at the right height
  // (mirrors CabinetFrontsSketch.stackTopForDoor).
  const bodyFrontsByBox = new Map<string, DrawerFront[]>();
  const cellFrontsByBoxFi = new Map<string, DrawerFront[]>();
  for (const f of Object.values(drawerFronts)) {
    if (f.cellIndex !== undefined) {
      const k = `${f.boxId}:${f.frontIndex}`;
      const arr = cellFrontsByBoxFi.get(k) ?? [];
      arr.push(f);
      cellFrontsByBoxFi.set(k, arr);
    } else {
      const arr = bodyFrontsByBox.get(f.boxId) ?? [];
      arr.push(f);
      bodyFrontsByBox.set(f.boxId, arr);
    }
  }
  const stackTopForDoor = (boxId: string, fi: number): number => {
    const list = [
      ...(cellFrontsByBoxFi.get(`${boxId}:${fi}`) ?? []),
      ...(bodyFrontsByBox.get(boxId) ?? []),
    ];
    if (list.length === 0) return 0;
    return Math.max(...list.map(f => f.positionFromBoxBottom + f.height + f.gapMm / 10));
  };

  const panels: FrontPanel[] = [];

  for (const box of bodyBoxes) {
    const layout = layoutByRow.get(box.level);
    if (!layout) continue;
    const boxBottom = bottomFromFloor.get(box.level) ?? inp.plinth;
    const numFronts = numFrontsPerBox.get(box.id)!;
    const hasPartition = partitionsById.get(box.id) === true;
    const bodyItems = interiorById[box.id] ?? [];
    const cellItems = cellInteriorById[box.id];
    const rowBoxes = rowsByLevel.get(box.level) ?? [];
    const boxFirstGlobal = getBoxFirstGlobalFrontIndex({ rowBoxes, numFrontsPerBox, targetBoxId: box.id });
    const x0base = layout.cabinetLeftOffset;

    // A skirt-covering drawer face extends DOWN over the plinth (visual height),
    // leaving ~1 cm floor clearance — its `y0` drops, its top stays put.
    const pushDrawerFront = (x0: number, f: DrawerFront) => {
      const base = boxBottom + f.positionFromBoxBottom;
      const ext = getDrawerFrontVisualHeight(f, inp.plinth) - f.height; // 0 unless coversSkirt
      panels.push({ x0, x1: x0 + Math.max(f.width, 0), y0: base - ext, y1: base + Math.max(f.height, 0) });
    };

    // ── External-drawer faces of this body ────────────────────────────────────
    const bodyWide = bodyFrontsByBox.get(box.id) ?? [];
    if (bodyWide.length > 0) {
      const span = computeFrontGeometryForSpan({
        startGlobalIndexInRow: boxFirstGlobal, spanLength: numFronts, layout, gapCm,
      });
      for (const f of bodyWide) pushDrawerFront(x0base + span.x, f);
    }
    for (let fi = 0; fi < numFronts; fi++) {
      const cellFronts = cellFrontsByBoxFi.get(`${box.id}:${fi}`) ?? [];
      if (cellFronts.length === 0) continue;
      const globalIndex = boxFirstGlobal + (numFronts - 1 - fi);
      const geo = computeFrontGeometry({ globalFrontIndexInRow: globalIndex, layout, gapCm });
      for (const f of cellFronts) pushDrawerFront(x0base + geo.x, f);
    }

    // ── Door faces of this body (one per front column, above any drawer stack) ─
    if (skipFronts) continue;
    const originalCoversSkirt = inp.doorCoversPlinth && shouldCoverSkirt(box.level);
    const isBottomMost = box.level === 'bottom' || box.level === 'single';
    const hasBottomGap = !(isBottomMost && inp.plinth > 0 && !originalCoversSkirt);
    const hasTopGap = box.level === 'top' || box.level === 'single';

    for (let fi = 0; fi < numFronts; fi++) {
      const itemsForFront = getItemsForFront(fi, numFronts, hasPartition, bodyItems, cellItems);
      const panelH = calcMainDoorHeight(box.H, itemsForFront, inp.doorGapMm, hasBottomGap, hasTopGap);
      if (panelH <= MIN_DOOR_PANEL_H_CM) continue;
      // Door.frontIndex 0 is the body's RIGHTMOST column → highest global index.
      const globalIndex = boxFirstGlobal + (numFronts - 1 - fi);
      const geo = computeFrontGeometry({ globalFrontIndexInRow: globalIndex, layout, gapCm });
      const hingeSide: 'left' | 'right' | 'top' =
        inp.liftMechanism === true
          ? 'top'
          : numFronts > 1
            ? salonHingeSide(fi, numFronts)
            : defaultHingeSide(box.position, allPositions);
      // When this door (not an external drawer) carries the skirt, it extends
      // DOWN over the plinth — its bottom drops, the top stays. Mirrors
      // getDoorVisualHeight; the structural panelH is unchanged.
      const doorCoversSkirt = originalCoversSkirt && getSkirtCoveringDrawer(itemsForFront, originalCoversSkirt) === null;
      const skirtExt = doorCoversSkirt && inp.plinth > 0 ? (inp.plinth - 1) + gapCm : 0;
      const bottom = boxBottom + stackTopForDoor(box.id, fi);
      panels.push({
        x0: x0base + geo.x,
        x1: x0base + geo.x + Math.max(geo.width, 0),
        y0: bottom - skirtExt,
        y1: bottom + panelH,
        hingeSide,
      });
    }
  }

  return panels;
}
