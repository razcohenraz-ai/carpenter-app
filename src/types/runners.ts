// Drawer runner systems (Blum TANDEM, …) + drawer-box dimensioning types.
//
// A RunnerSpec is pure DATA (catalog/runners.json). The drawer-box dimensions
// are a pure derivation from it + the carpenter's inputs — see
// core/drawers/drawerBox.ts. The runner spec fixes the OUTER envelope + bottom +
// drilling (joinery-independent); the joinery method only changes how the panels
// are cut from that envelope.

export type RunnerManufacturer = 'blum' | 'hettich' | 'grass' | 'generic';

/** One drawer-runner system. All dimensions in mm. The offset fields are the
 *  constants in Blum's planning formulas, derived from the internal cabinet
 *  width (LW) and the chosen nominal runner length (NL):
 *    internal drawer width (SKW) = LW − skwOffsetMm
 *    drawer bottom width          = LW − bottomWidthOffsetMm
 *    drawer side length (SKL)     = NL − sklOffsetMm
 *    min internal cabinet depth   = NL + minDepthExtraMm   (selects the NL)
 *  Loaded from catalog/runners.json — edit the JSON to add/adjust a system. */
export interface RunnerSpec {
  id: string;
  name: string;
  family: string;
  manufacturer: RunnerManufacturer;
  loadKg: number;
  /** Accepted drawer SIDE panel thickness (mm); the carpenter picks within it. */
  sidePanelThicknessMm: { min: number; max: number };
  /** Available nominal runner lengths (mm), ascending. */
  nominalLengthsMm: number[];
  skwOffsetMm: number;
  bottomWidthOffsetMm: number;
  sklOffsetMm: number;
  minDepthExtraMm: number;
  /** Mount-over-runner (M): the side's leg below the bottom panel that sits over
   *  the runner. Front/back panels are shorter than the sides by (M + bottomT). */
  mountOverRunnerMm: number;
  /** Fixing-screw height above the side-panel bottom (= runner bottom), mm. */
  screwHeightMm: number;
  /** Side-panel fixing-hole positions (the two screws this carpenter uses). */
  fixing: RunnerFixing;
  /** Price (₪) of one runner SET (left+right pair) banded by nominal length —
   *  first entry whose `maxNlMm ≥ NL` wins (entries ascending by `maxNlMm`;
   *  NL longer than the last band falls back to it). Edit in the JSON. */
  priceByNlMm: RunnerPriceRange[];
}

export interface RunnerPriceRange {
  /** Applies to nominal lengths up to and including this (mm). */
  maxNlMm: number;
  /** Price of one runner set (₪) for this length band. */
  priceShekel: number;
}

/** Which runner fixing holes to screw into the body side panel. The front hole
 *  is constant; the back hole is looked up by nominal length. Positions are mm
 *  from the runner's front reference. (Carpenter-supplied 560-series table.) */
export interface RunnerFixing {
  frontHoleMm: number;
  /** Back-screw hole by nominal length — first entry whose `maxNlMm ≥ NL` wins;
   *  entries ascending by `maxNlMm`. */
  backHoleByNlMm: RunnerBackHoleRange[];
}

export interface RunnerBackHoleRange {
  /** Applies to nominal lengths up to and including this (mm). */
  maxNlMm: number;
  /** Back-screw hole position, mm from the runner front. */
  holeMm: number;
}

export type RunnerCatalog = Record<string, RunnerSpec>;

export type DrawerKind = 'external' | 'inner';
/** Corner construction. `miter` = this carpenter's 4-corner 45° method with all
 *  panels at the full outer footprint; `buttGroove` = the common method with
 *  front/back butted between the sides at the internal width (SKW). */
export type DrawerJoinery = 'miter' | 'buttGroove';

export interface DrawerBoxInput {
  /** Internal clear cabinet width LW (mm) — body inner width between the gables. */
  internalWidthMm: number;
  /** Usable internal cabinet depth (mm) — selects the nominal runner length. */
  internalDepthMm: number;
  /** Drawer side panel thickness (mm) — carpenter's choice within the range. */
  sidePanelThicknessMm: number;
  /** Drawer bottom thickness T (mm) — carpenter's choice (= the groove). */
  bottomThicknessMm: number;
  kind: DrawerKind;
  /** external → the facade front height (mm); inner → the drawer height (mm). */
  heightMm: number;
  /** Corner joinery. Default `miter`. */
  joinery?: DrawerJoinery;
}

export interface DrawerPanelCut {
  role: 'side' | 'front' | 'back' | 'bottom';
  qty: number;
  /** Longer planar dimension (mm): side = depth, front/back = width, bottom = width. */
  lengthMm: number;
  /** Vertical height (mm) for side/front/back; for the bottom = its depth (mm). */
  heightMm: number;
  thicknessMm: number;
  joint: 'miter45' | 'butt' | 'groove';
}

export interface DrawerBox {
  runnerId: string;
  nominalLengthMm: number;
  outerWidthMm: number;
  outerDepthMm: number;
  sidePanelHeightMm: number;
  frontBackHeightMm: number;
  panels: DrawerPanelCut[];
  /** Fixing-screw height above the side-panel bottom (mm) — for side-panel drilling. */
  screwHeightMm: number;
  /** Non-blocking notes (out-of-range thickness, NL didn't fit, …). */
  warnings: string[];
}
