# Plan: Doors follow sections (Option A — split fronts at structural shelves)

## Context / the gap

`doorsPerColumn` ("דלתות לגובה", N = 1/2/3) is the carpenter's choice of how many **door
sections** stack vertically. The boundaries come from `lowerDoorH` / `middleDoorH`
(measured from the floor). The decomposition then:

1. Splits the cabinet into **carcasses** and, for `dpc=3`, **merges any section
   shorter than `MIN_BODY_HEIGHT` (60 cm) into the one below it**, turning the
   merged boundary into a fixed **`internalShelves`** entry
   (`core/geometry/boxDecomposition.ts:149`). So a small cabinet ends up with
   fewer carcasses than `dpc`, plus shelves.
2. Builds **fronts per (carcass × width-column)** — `ceil(boxW / maxDoorWidth)`
   columns, each getting **one door spanning the whole carcass height**.

**The bug:** the doors follow the *carcasses*, not the *sections*. When sections
merge, the doors merge with them → a tall closet shows one full‑height door over a
fixed shelf, instead of one door per section. Confirmed in the screenshot
(`H=170, dpc=3, lo=120, mid=45`): the 5 cm + 45 cm sections merged into one carcass
with shelves at 120 and 165, and a single 160 cm door per column.

**Desired (Option A, carpenter‑confirmed):** doors **follow the sections**. A body
with `internalShelves = [s₁…sₖ]` emits **k+1 stacked doors per column**, each
spanning shelf‑center to shelf‑center (the door reveal gap split around the shelf
mid‑line), the bottom one above any external‑drawer stack, the top one to the body
top. The carcass merge (60 cm) stays — only the doors change.

## Already done and CORRECT for this — keep

The recent `CabinetForm` work (uncommitted) is the **"door minimum"** the carpenter
asked for, and it operates on exactly the right values (`lowerDoorH`/`middleDoorH`
ARE the section boundaries = door splits):

- `MIN_SECTION_CM = 30` + `sectionsViolate` + `fitDoorHeights` → re‑balances the
  boundaries so every section ≥ 30 (no sliver doors).
- `maxSections(H, plinth)` → caps `doorsPerColumn` when the height can't hold N
  sections of ≥ 30 ("3 doors only if possible").
- The height‑authoritative blur snap + inline notice.

→ **Keep as‑is.** It guarantees the inputs to the split are always sane. (The
independent fixes — `decomposeBoxes` blank‑screen guards, live‑recalc / no‑חשב‑button,
embedded‑sketch size‑jump fix — are unrelated and can be committed separately.)

## Core decision — section identity, backward‑compatible door ids

- A body's fronts become a grid: **column `c` × section `s`**. Sections are the
  spans between the body's `internalShelves` (plus body bottom/top).
- **`makeDoorId(boxId, columnIndex, sectionIndex = 0)`** — the new 3rd arg. For
  `s = 0` it returns **today's id**, so any body *without* `internalShelves` (1
  section) is **byte‑identical** — no churn for existing cabinets or saved hinge
  state. Only merged bodies grow extra section‑doors.
- **Saved hinge keys:** `${slot}:${fi}` for `s = 0` (unchanged); `${slot}:${fi}:${s}`
  for `s > 0`. A body that *newly* splits keeps its old hinge on the bottom door
  (`s = 0`) and **defaults** the new upper sections — **no migration** (decision 1,
  approved). Hinge side stays a per‑column (left/right) decision; sections don't
  affect it.
- **Door↔shelf seam:** door edges meet at the shelf **center**, the reveal gap
  split around the mid‑line (matches "top of each door ends on the middle of a
  shelf"). Confirm against the rendered `internal-shelf` board position so there's
  no overlap/gap.

## The drift risk — unify before splitting

The per‑body door loop is **duplicated in three places**, each emitting one door
per `(box, fi)`:

| Path | Location | Produces |
|---|---|---|
| `useCabinet.calculate` | `src/ui/hooks/useCabinet.ts:1040` | live `doorsById` + door cuts |
| `cabinetCompute` | `src/core/cabinetCompute.ts:240` | scoped cut list (body editor / kitchen) |
| `cabinetFrontPanels` | `src/core/product/cabinetFronts.ts:209` | 2D overlay + 3D fronts |

Consumers: `buildDoorCutItems` (`core/cuts/doorCuts.ts`) and
`assignDoorDisplayNumbers` (`core/doors/doorUtils.ts:450`) both iterate
`makeDoorId(box.id, fi)` for `fi < numFrontsPerBox`.

→ If we add the split in each loop independently it **will** drift. **Phase 0
extracts ONE shared generator** so the split lands in a single place.

## Phases (each tsc + vitest green)

### Phase 0 — Extract a shared body‑door generator (behavior‑preserving)
- New `core/doors/bodyDoors.ts`: `buildBodyDoorCells(box, ctx)` returning the door
  cells for one body. Today = one cell per column (section count = 1). Route all
  three paths through it; output **identical** to now.
- Update `buildDoorCutItems` + `assignDoorDisplayNumbers` to iterate the cells.
- **Tests:** `renderParity.test.ts` + `doorCuts.test.ts` unchanged; full suite green.

### Phase 1 — Section split in the generator (the visible change)
- In `buildBodyDoorCells`, derive sections from `box.internalShelves`: split each
  column's vertical span at the shelf mid‑lines (gap split around each). Bottom
  section sits above the external‑drawer stack; top section to the body top.
- Emit one cell per `(column × section)`; height = section span; id via
  `makeDoorId(box.id, fi, si)`. Add `sectionIndex` to the `Door` type.
- `cabinetFrontPanels` consumes the same sections for per‑section `y0/y1`.
- Map interior items / external drawers to the section containing their height
  (drawers → bottom section).
- **Files:** `bodyDoors.ts`, `doors/doorUtils.ts` (`makeDoorId`), `types` (`Door`),
  `cabinetFronts.ts`, `doorCuts.ts`.
- **Tests:** body with `internalShelves=[s₁,s₂]` → 3 doors/column with the section
  heights; door‑cut count == rendered doors; **un‑merged bodies byte‑identical**;
  overlay/3D/cut agree (`renderParity`).

### Phase 2 — Hinge / numbering / saved‑state across sections
- `assignDoorDisplayNumbers` numbers the grid (pick + document order — e.g. bottom→top
  within a column, columns right→left to match the elevation).
- Saved‑hinge restore: `s = 0` inherits the old key, `s > 0` defaults. Serialize
  round‑trip test.
- Verify `DoorEditor` + the clickable overlays (cabinet main, body editor, kitchen
  overview) open the correct section‑door now that ids carry a section.

### Phase 3 — Edge interactions
- **Partition × section:** a vertically partitioned body that *also* has
  `internalShelves` → `2 columns × N sections`. Confirm the cell/partition logic
  composes with the section split; feature‑gate if it gets hairy.
- **Lift (קלפה) / corner:** corner is one wide door, lift is a single top‑hinged
  panel — assert they stay **single‑section** (no split).
- **Drawer‑filled section** (door height ≤ 0): that section's door is absent
  (`hasDoor = false`), as today.

### Phase 4 — Tests + docs
- `bodyDoors.test.ts` (section split incl. drawers/partition); `renderParity` census
  over a merged‑body cabinet; `serialize.test.ts` (old keys → defaults).
- Docs: `CARPENTRY_RULES.md` (doors follow sections; shelf = door seam at center;
  carcass merge stays 60, door min 30), `DECISIONS_LOG.md` (Option A; doors decouple
  from carcasses), `PROJECT_CONTEXT.md`, `CHANGELOG.md`.

## Biggest risks
1. **Three‑way drift** — Phase 0 unification is mandatory; extend `renderParity`
   beyond boards to per‑section door parity.
2. **Item → section mapping** (which interior items / drawers belong to which
   section) is the fiddly part — guard with tests.
3. **Door‑id compatibility** — the `s = 0 ⇒ old id` rule keeps existing cabinets and
   saved hinges intact; prove with a serialize round‑trip.
4. **Seam geometry** — door edges at the shelf center must line up with the rendered
   shelf board (no overlap/gap).

## Verification (no autonomous browser — ask the carpenter)
- **Phase 1:** `dpc=3` on a short closet → **3 stacked doors** (each ≥ 30), split at
  the shelves; a tall closet (3 real carcasses) is unchanged.
- **Cross‑check:** the cabinet **חיתוכים** door count == the rendered doors, and the
  body editor / kitchen / room elevation all show the same split.
