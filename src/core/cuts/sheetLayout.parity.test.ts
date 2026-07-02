import { describe, it, expect } from "vitest";
import { computeUnitCutsAndHardware } from "../cabinetCompute";
import {
  kitchenModuleInput,
  kitchenModuleState,
  type KitchenModuleType,
} from "../product/kitchenModules";
import { defaultInputForType } from "../product/productDefaults";
import { layoutSheets, expandPieces } from "./sheetLayout";
import type { CutItem } from "../../types/cuts";
import type { CabinetInput } from "../../types/cabinet";
import type { SavedCabinetState } from "../../types/project";
import type { InteriorItem } from "../../types/interior";

// End-to-end coverage invariant: every piece in a real cut list appears exactly
// once in the פריסה layout (placed on a plate OR flagged oversize) — the layout
// never loses or invents a part. Checked against 5 closets (shelves + drawers)
// and 5 kitchens spanning all 9 kitchen modules, under BOTH grain modes.

const PLATE = { sheetW: 2440, sheetH: 1220 }; // 244×122 cm → mm

function totalPieces(cuts: CutItem[]): number {
  return cuts.reduce((n, c) => n + c.qty, 0);
}

/** Mirror of `LayoutView`: group by material AND thickness note, expand each
 *  cut × qty, lay each group out on a 244×122 plate, and total the placed +
 *  oversize pieces across all groups. */
function layoutCoverage(cuts: CutItem[], allowRotation: boolean): { placed: number; oversize: number } {
  const groups = new Map<string, CutItem[]>();
  for (const c of cuts) {
    const key = `${c.materialId ?? "__none__"}|${c.note ?? ""}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  let placed = 0;
  let oversize = 0;
  for (const [key, gcuts] of groups) {
    const pieces = gcuts.flatMap((c, i) =>
      expandPieces({ name: c.name, w: c.w, h: c.h, qty: c.qty }, `${key}:${i}`),
    );
    const r = layoutSheets(pieces, { ...PLATE, allowRotation });
    placed += r.sheets.reduce((n, s) => n + s.pieces.length, 0);
    oversize += r.oversize.length;
  }
  return { placed, oversize };
}

function assertParity(label: string, cuts: CutItem[]): void {
  const total = totalPieces(cuts);
  expect(total, `${label}: cut list should be non-empty`).toBeGreaterThan(0);
  // Grain free (rotation allowed) and grain locked must BOTH cover every piece.
  for (const allowRotation of [true, false]) {
    const { placed, oversize } = layoutCoverage(cuts, allowRotation);
    expect(placed + oversize, `${label}: layout must place every cut piece (rotation=${allowRotation})`).toBe(total);
    expect(oversize, `${label}: nothing should be oversize on a 244×122 plate (rotation=${allowRotation})`).toBe(0);
  }
}

// ── 5 closets with shelves + external drawers ────────────────────────────────

function makeCloset(
  over: Partial<CabinetInput>,
  shelfHeights: number[],
  drawers: { hff: number; h: number }[],
): { input: CabinetInput; state: SavedCabinetState } {
  const input: CabinetInput = { ...defaultInputForType("wardrobe"), doorsPerColumn: 1, ...over };
  const interior: InteriorItem[] = [
    ...drawers.map((d, i) => ({
      id: `d${i}`,
      type: "drawer" as const,
      heightFromFloor: d.hff,
      drawerHeight: d.h,
      mount: "external" as const,
    })),
    ...shelfHeights.map((hff, i) => ({ id: `s${i}`, type: "shelf" as const, heightFromFloor: hff })),
  ];
  const state: SavedCabinetState = {
    interior: { "single:single": interior },
    cellInterior: {},
    partitions: {},
    doors: {},
    plinthGableOverrides: {},
    boardOverrides: {},
  };
  return { input, state };
}

const CLOSETS: { name: string; input: CabinetInput; state: SavedCabinetState }[] = [
  { name: "closet #1 — wardrobe 90×200", ...makeCloset({ W: 90, H: 200, D: 60 }, [60, 120, 160], [{ hff: 0, h: 25 }, { hff: 26, h: 25 }]) },
  { name: "closet #2 — shelled 100×220", ...makeCloset({ W: 100, H: 220, D: 60, hasShell: true }, [50, 100, 150, 190], [{ hff: 0, h: 25 }, { hff: 26, h: 25 }, { hff: 52, h: 25 }]) },
  { name: "closet #3 — tall narrow 50×230", ...makeCloset({ W: 50, H: 230, D: 40 }, [40, 80, 120, 160, 200], [{ hff: 0, h: 30 }]) },
  { name: "closet #4 — envelope-top 80×210", ...makeCloset({ W: 80, H: 210, D: 55, hasShell: true, hasEnvelopeTop: true }, [70, 140], [{ hff: 0, h: 25 }, { hff: 26, h: 25 }]) },
  { name: "closet #5 — plinth 100×180", ...makeCloset({ W: 100, H: 180, D: 60, plinth: 8, doorCoversPlinth: true }, [50, 100], [{ hff: 0, h: 25 }, { hff: 26, h: 25 }, { hff: 52, h: 25 }]) },
];

describe("sheet layout ↔ cut list parity — closets (shelves + drawers)", () => {
  for (const c of CLOSETS) {
    it(`${c.name}: layout covers the full cut list`, () => {
      const { cuts } = computeUnitCutsAndHardware(c.input, c.state, []);
      // The config genuinely contains shelves and (external) drawers.
      expect(cuts.some((x) => x.name.includes("מדף")), `${c.name}: has shelf parts`).toBe(true);
      expect(cuts.some((x) => x.name.includes("חזית מגירה")), `${c.name}: has drawer-front parts`).toBe(true);
      assertParity(c.name, cuts);
    });
  }
});

// ── 5 kitchens spanning all 9 modules ────────────────────────────────────────

const ALL_MODULES: KitchenModuleType[] = [
  "drawers", "shelves", "sink", "dishwasher", "oven", "pantry", "wall", "pantry-top", "corner",
];

const KITCHENS: { name: string; modules: KitchenModuleType[] }[] = [
  { name: "kitchen A — base run", modules: ["drawers", "shelves", "sink"] },
  { name: "kitchen B — appliances", modules: ["dishwasher", "oven", "drawers"] },
  { name: "kitchen C — corner run", modules: ["corner", "drawers", "shelves"] },
  { name: "kitchen D — tall column", modules: ["pantry", "pantry-top", "wall"] },
  { name: "kitchen E — mixed", modules: ["wall", "sink", "oven", "shelves"] },
];

/** Aggregate a kitchen's cut list: per-unit cuts, name-prefixed by module. */
function kitchenCuts(modules: KitchenModuleType[]): CutItem[] {
  const out: CutItem[] = [];
  modules.forEach((m, i) => {
    const { cuts } = computeUnitCutsAndHardware(kitchenModuleInput(m), kitchenModuleState(m), []);
    for (const c of cuts) out.push({ ...c, name: `${m}${i}: ${c.name}` });
  });
  return out;
}

describe("sheet layout ↔ cut list parity — kitchens (all modules)", () => {
  it("the 5 kitchen scenarios exercise every module type", () => {
    const used = new Set(KITCHENS.flatMap((k) => k.modules));
    for (const m of ALL_MODULES) expect(used.has(m), `module '${m}' must be covered`).toBe(true);
  });

  for (const k of KITCHENS) {
    it(`${k.name}: layout covers the full cut list`, () => {
      const cuts = kitchenCuts(k.modules);
      assertParity(k.name, cuts);
    });
  }
});
