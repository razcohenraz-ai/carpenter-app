import { describe, it, expect } from "vitest";
import {
  layoutSheets,
  expandPieces,
  DEFAULT_KERF_MM,
  type LayoutPiece,
  type PlacedPiece,
  type SheetLayoutResult,
} from "./sheetLayout";

// Standard plate 244×122 cm → mm.
const PLATE = { sheetW: 2440, sheetH: 1220 };
// Big plate 305×122 cm → mm.
const BIG_PLATE = { sheetW: 3050, sheetH: 1220 };

// ── invariant helpers (the engine's contract) ────────────────────────────────

/** No two parts on the same plate overlap (kerf-respecting layouts never do). */
function noOverlap(pieces: PlacedPiece[]): boolean {
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]!;
      const b = pieces[j]!;
      const disjoint =
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      if (!disjoint) return false;
    }
  }
  return true;
}

/** Every part lies inside the usable area. */
function withinUsable(r: SheetLayoutResult): boolean {
  for (const sheet of r.sheets) {
    for (const p of sheet.pieces) {
      if (p.x < 0 || p.y < 0 || p.x + p.w > r.usableW + 1e-6 || p.y + p.h > r.usableH + 1e-6) {
        return false;
      }
    }
  }
  return true;
}

/** Guillotine (2-stage shelf) structure: parts sharing a plate group into
 *  horizontal bands — every part's top y equals the band's y, bands do not
 *  overlap vertically. This is what makes the layout saw-reproducible. */
function isGuillotineShelved(pieces: PlacedPiece[]): boolean {
  const bands = new Map<number, PlacedPiece[]>();
  for (const p of pieces) {
    const arr = bands.get(p.y) ?? [];
    arr.push(p);
    bands.set(p.y, arr);
  }
  const tops = [...bands.keys()].sort((a, b) => a - b);
  for (let i = 0; i < tops.length - 1; i++) {
    const band = bands.get(tops[i]!)!;
    const bandHeight = Math.max(...band.map((p) => p.h));
    if (tops[i]! + bandHeight > tops[i + 1]! + 1e-6) return false; // band bleeds into the next
  }
  return true;
}

function totalPlaced(r: SheetLayoutResult): number {
  return r.sheets.reduce((n, s) => n + s.pieces.length, 0);
}

// ── coverage: nothing lost, nothing duplicated ───────────────────────────────

describe("layoutSheets — coverage", () => {
  it("places every piece exactly once (placed + oversize = input)", () => {
    const pieces: LayoutPiece[] = [
      ...expandPieces({ name: "צד", w: 580, h: 720, qty: 2 }, "a"),
      ...expandPieces({ name: "מדף", w: 764, h: 560, qty: 3 }, "b"),
      ...expandPieces({ name: "דלת", w: 397, h: 700, qty: 4 }, "c"),
    ];
    const r = layoutSheets(pieces, PLATE);
    expect(totalPlaced(r) + r.oversize.length).toBe(pieces.length);
    expect(r.oversize).toHaveLength(0);
  });

  it("preserves the multiset of labels", () => {
    const pieces = [
      ...expandPieces({ name: "צד", w: 580, h: 720, qty: 2 }, "a"),
      ...expandPieces({ name: "מדף", w: 764, h: 560, qty: 3 }, "b"),
    ];
    const r = layoutSheets(pieces, PLATE);
    const placedLabels = r.sheets.flatMap((s) => s.pieces.map((p) => p.label)).sort();
    expect(placedLabels).toEqual(["מדף", "מדף", "מדף", "צד", "צד"].sort());
  });

  it("empty input → no sheets, zero utilization", () => {
    const r = layoutSheets([], PLATE);
    expect(r.sheets).toHaveLength(0);
    expect(r.utilization).toBe(0);
  });
});

// ── geometry invariants ──────────────────────────────────────────────────────

describe("layoutSheets — geometry invariants", () => {
  const pieces = [
    ...expandPieces({ name: "צד", w: 580, h: 720, qty: 6 }, "a"),
    ...expandPieces({ name: "מדף", w: 764, h: 560, qty: 8 }, "b"),
    ...expandPieces({ name: "דלת", w: 397, h: 700, qty: 10 }, "c"),
    ...expandPieces({ name: "גב", w: 1200, h: 300, qty: 4 }, "d"),
  ];
  const r = layoutSheets(pieces, PLATE);

  it("no two parts overlap on any plate", () => {
    for (const s of r.sheets) expect(noOverlap(s.pieces)).toBe(true);
  });

  it("every part is inside the usable area (plate − 1cm per axis)", () => {
    expect(r.usableW).toBe(2430);
    expect(r.usableH).toBe(1210);
    expect(withinUsable(r)).toBe(true);
  });

  it("layout is guillotine (2-stage shelf) on every plate", () => {
    for (const s of r.sheets) expect(isGuillotineShelved(s.pieces)).toBe(true);
  });
});

// ── kerf ─────────────────────────────────────────────────────────────────────

describe("layoutSheets — kerf", () => {
  it("adjacent parts in a band are separated by ≥ kerf", () => {
    // Three parts that share one band; check the horizontal gaps.
    const pieces = expandPieces({ name: "p", w: 500, h: 400, qty: 3 }, "p");
    const r = layoutSheets(pieces, PLATE);
    const band = r.sheets[0]!.pieces.slice().sort((a, b) => a.x - b.x);
    for (let i = 0; i < band.length - 1; i++) {
      const gap = band[i + 1]!.x - (band[i]!.x + band[i]!.w);
      expect(gap).toBeGreaterThanOrEqual(DEFAULT_KERF_MM - 1e-6);
    }
  });

  it("stacked bands are separated by ≥ kerf vertically", () => {
    // Parts too wide to share a band → each opens its own band.
    const pieces = expandPieces({ name: "wide", w: 2000, h: 300, qty: 3 }, "w");
    const r = layoutSheets(pieces, PLATE);
    const bands = r.sheets[0]!.pieces.slice().sort((a, b) => a.y - b.y);
    for (let i = 0; i < bands.length - 1; i++) {
      const gap = bands[i + 1]!.y - (bands[i]!.y + bands[i]!.h);
      expect(gap).toBeGreaterThanOrEqual(DEFAULT_KERF_MM - 1e-6);
    }
  });
});

// ── rotation ─────────────────────────────────────────────────────────────────

describe("layoutSheets — grain (rotation lock)", () => {
  it("grain locked: a tall part is laid long-side along the plate length (244)", () => {
    // Grain runs along the plate's 2430 usable length, so the part's long side
    // (1250) is forced along x — the part is placed on its side (rotated).
    const pieces: LayoutPiece[] = [{ id: "x:0", label: "long", w: 300, h: 1250 }];
    const r = layoutSheets(pieces, { ...PLATE, allowRotation: false });
    expect(r.oversize).toHaveLength(0);
    const p = r.sheets[0]!.pieces[0]!;
    expect(p.w).toBe(1250); // long side along the 244 length
    expect(p.h).toBe(300);
    expect(p.rotated).toBe(true);
    expect(withinUsable(r)).toBe(true);
  });

  it("grain locked: an already grain-aligned part is not turned", () => {
    const pieces: LayoutPiece[] = [{ id: "x:0", label: "wide", w: 1250, h: 300 }];
    const r = layoutSheets(pieces, { ...PLATE, allowRotation: false });
    const p = r.sheets[0]!.pieces[0]!;
    expect(p.w).toBe(1250);
    expect(p.h).toBe(300);
    expect(p.rotated).toBe(false);
  });

  it("grain locked: EVERY placed part lies long-side along the plate length", () => {
    const pieces = [
      ...expandPieces({ name: "צד", w: 580, h: 720, qty: 4 }, "a"),
      ...expandPieces({ name: "מדף", w: 764, h: 300, qty: 6 }, "b"),
      ...expandPieces({ name: "דלת", w: 397, h: 900, qty: 5 }, "c"),
    ];
    const r = layoutSheets(pieces, { ...PLATE, allowRotation: false });
    for (const s of r.sheets) {
      for (const p of s.pieces) expect(p.w).toBeGreaterThanOrEqual(p.h);
    }
  });

  it("grain free: a part may be turned off-grain and is still placed", () => {
    const pieces: LayoutPiece[] = [{ id: "x:0", label: "long", w: 300, h: 1250 }];
    const r = layoutSheets(pieces, { ...PLATE, allowRotation: true });
    expect(r.oversize).toHaveLength(0);
    expect(withinUsable(r)).toBe(true);
  });
});

// ── oversize / big plate ─────────────────────────────────────────────────────

describe("layoutSheets — oversize and big plates", () => {
  it("a part longer than the standard usable length is oversize on a 244 plate", () => {
    // 2500 > usable 2430 in both axes (can't rotate into 1210) → oversize.
    const pieces: LayoutPiece[] = [{ id: "x:0", label: "counter", w: 2500, h: 600 }];
    const r = layoutSheets(pieces, { ...PLATE, allowRotation: true });
    expect(r.oversize).toHaveLength(1);
  });

  it("the same part fits once the material is moved to a 305 plate", () => {
    const pieces: LayoutPiece[] = [{ id: "x:0", label: "counter", w: 2500, h: 600 }];
    const r = layoutSheets(pieces, { ...BIG_PLATE, allowRotation: true });
    expect(r.oversize).toHaveLength(0);
    expect(r.usableW).toBe(3040);
    expect(totalPlaced(r)).toBe(1);
  });
});

// ── determinism ──────────────────────────────────────────────────────────────

describe("layoutSheets — determinism", () => {
  it("identical input yields identical output", () => {
    const mk = () => [
      ...expandPieces({ name: "צד", w: 580, h: 720, qty: 4 }, "a"),
      ...expandPieces({ name: "מדף", w: 764, h: 560, qty: 6 }, "b"),
    ];
    const a = layoutSheets(mk(), PLATE);
    const b = layoutSheets(mk(), PLATE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
