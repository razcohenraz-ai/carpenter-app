# QA Strategy — Carpenter App

> **What this is.** The project's long-term quality-assurance *strategy* — not a set
> of tests. It is designed around the **engineering invariants** in
> [DEPENDENCY_GRAPH.md §6](DEPENDENCY_GRAPH.md#6-engineering-invariants-inferred-from-code--not-invented)
> and the drift hazards in [SSOT_MAP.md §4](SSOT_MAP.md#4-duplicate-calculations--drift-hazards),
> so it survives refactors: we test *what the cabinet must be*, not *how a function
> currently computes it*.
>
> **How to keep it current.** Subsystems are the S1–S16 IDs from
> [DEPENDENCY_GRAPH.md](DEPENDENCY_GRAPH.md); invariants are INV-1…INV-22 from the
> same file; duplicates are D1–D6 from [SSOT_MAP.md](SSOT_MAP.md). When you add a
> subsystem, add a matrix row. When you promote a test tier (e.g. turn on mutation),
> update the maturity model. Companion: [QA_SURFACE_MAP.md](QA_SURFACE_MAP.md) is the
> *current* net; this file is the *target* net.
>
> **Status of tooling.** `vitest` is in the stack (38 core suites today).
> `fast-check` (property), `@stryker-mutator` (mutation), and deterministic SVG
> snapshotting are **proposed additions**, not yet installed — flagged as such below.

---

## 1. Testing principles (the constitution)

1. **Invariant-first, not implementation-first.** A unit test pins a *carpentry
   formula* (few, exact, golden). A property test pins an *invariant* (many,
   random). Everything in between — internal helper outputs, intermediate shapes —
   stays untested so refactors are free. If a test breaks on a refactor that didn't
   change the product, the test was wrong.
2. **Test at the purity boundary.** `core/` is pure and deterministic → it carries
   the heavy net (unit + property + mutation). `ui/hooks` is stateful → integration
   + differential tests. `ui/components` renderers *must not compute* (CLAUDE.md) →
   they are covered by their **adapter's** geometry tests + a thin visual layer, not
   by re-testing math in the DOM.
3. **The parity net is the keystone.** The cut list (`computeUnitCutsAndHardware`) is
   the single source of truth; every renderer is an adapter that must match it.
   Renderer-consistency testing = expanding `renderParity.test.ts`, never
   pixel-diffing math.
4. **Differential testing for the twin orchestrators.** D1 (two hand-mirrored
   pipelines) cannot be closed by testing each in isolation — it needs a test that
   asserts they produce the *same* result for the same input. This is a first-class
   strategy, not an afterthought (§5.1).
5. **Warnings are outcomes, not failures.** Per the freedom principle, validation
   emits warnings (`ShelfWarning`, `main_door_too_short`) instead of throwing. Tests
   assert *"a warning is produced"*, never *"an error is thrown"* — asserting a throw
   would encode a constraint the product deliberately refuses to impose.
6. **Golden masters are review gates, not assertions.** A frozen cut-list/board-census
   snapshot changing is neither pass nor fail — it is a **diff to review**. The gate
   is "a human approved this change", which catches unintended ripple from D1/D2.
7. **No autonomous browser verification** (project rule). Visual correctness of the
   *geometry* is proven in core (deterministic); visual correctness of *pixels*
   (colour, z-order, label overlap, WebGL) is a carpenter checklist, never an agent
   screenshot loop (§5.7).

---

## 2. The seven test types, defined for this codebase

| Type | Scope here | Tool | Gates on | Applies to |
|---|---|---|---|---|
| **Unit** | One pure function's carpentry formula, exact values | vitest | Correct arithmetic | S1–S9, S12, S13 (pure core) |
| **Integration** | A whole pipeline stage sequence end-to-end | vitest | Assembly order, emitter union | S10 orchestrators, S14 persistence, S12 kitchen |
| **Property** | Random cabinets satisfy an invariant | vitest + **fast-check** *(proposed)* | Invariants INV-1…22 | S1–S6, S10, S11 |
| **Renderer consistency** | Adapter output ≡ cut list (census/positions) | vitest (`renderParity`) | No 2D/3D drift | S11 adapters |
| **Regression** | Frozen golden masters + named-bug corpus | vitest snapshots + fixtures | Unintended ripple | S10, S11, S14 |
| **Mutation** | Do tests actually catch changes? | **StrykerJS** *(proposed)* | Test *strength* on core | S1–S9 (pure, high-value) |
| **Visual** | Deterministic SVG snapshot + human checklist | vitest+jsdom snapshot / carpenter | Pixel/colour/z-order | S16 renderers (2D deterministic; 3D checklist) |

**Applicability rule:** not every type fits every subsystem. Mutation testing on the
dormant pricing module (S15) or property testing on a preset lookup (S8) is waste.
The matrix in §4 marks **●** (primary), **○** (secondary), **—** (not applicable).

---

## 3. Risk register

Scored **Likelihood of change (L)** × **Blast radius (B)**, each 1–5 → **Risk = L×B**.
Likelihood is informed by git activity + the open auto-split plan; blast from the
reverse-dependency table in [DEPENDENCY_GRAPH.md §3](DEPENDENCY_GRAPH.md#3-reverse-dependency-graph--if-this-changes-what-may-break).

### 3.1 High-risk modules

| Module (S#) | L | B | Risk | Why |
|---|---|---|---|---|
| `boxDecomposition` (S1) | 5 | 5 | **25** | Feeds every path; actively changing (auto-split Phase 3 is live in the plan); owns split/merge thresholds + `internalShelves` |
| `frontGeometry` (S2) | 4 | 5 | **20** | Door count/width/x for the whole app; **two layout models coexist (D6)**; per-body sizing recently landed |
| `useCabinet.calculate` + `cabinetCompute` (S10) | 4 | 5 | **20** | The 16-stage recipe, **duplicated (D1)**; live half has **no direct test** |
| `boardModel` (S3) | 3 | 5 | **15** | Joint/edging/envelope/plinth complexity; every carcass dimension + sheet count |
| `boxMaterials` (S4) | 3 | 4 | **12** | Per-body override × cabinet default interactions; cut grouping + 3D colour + cost |
| `interiorUtils.boxStableKey` (S6) | 2 | 5 | **10** | Changing the key orphans **all** saved state — silent data loss |
| `doors/*` (S5) | 3 | 4 | **12** | Section-split, external-stack, skirt-cover, hinge rules — many edge cases |

### 3.2 High-risk render adapters

| Adapter (S11) | L | B | Risk | Why |
|---|---|---|---|---|
| `cabinetBoards3D` | 4 | 4 | **16** | Most logic of any adapter: `boardDepthRange`, drawer-box/runner/rod/lift fixtures, kitchen RTL layout, cabinet-level shell re-emission |
| `cabinetFronts` | 3 | 4 | **12** | Face positions/widths; historically dropped doors on multi-body cabinets; straddle/overhang risk |
| `cabinetSketchBoards` / `SketchModel` | 2 | 3 | **6** | Thinner, but drove the "קלפה cap in body colour" bug before extraction |

### 3.3 High-risk engineering calculations

| Calculation | Where | Why high-risk |
|---|---|---|
| Per-body door **tiling / x-position** (prefix-sum) | `bodyFrontLayout`/`bodyFrontX` | A wrong offset → doors **straddle or overlap** carcass boundaries (INV-7); the plan's own "biggest risk" |
| **Carcass depth / inner width** chain | `computeCarcassDepth`/`computeInnerWidth` | Every downstream dimension depends on it; envelope-vs-carcass depth split (INV-1, INV-11) |
| **External-drawer stack** height + skirt cover | `calcExternalStackHeight`, `getSkirtCoveringDrawer`, `calcMainDoorHeight` | Non-linear: a stack can make the main door **absent** (INV-14) |
| **Section split** for merged bodies | `bodyDoors.buildBodyDoorCells` | k+1 doors + body-local `internalShelves` (INV-13); off-by-one risk |
| **Plinth gable** positioning + clamp | `calcPlinthGables`/`clampPlinthGableX` | Overlap/order under drag + effective-width follow (INV-16) |
| **Runner NL banding** → drawer-box size | `selectNominalLength`/`computeDrawerBox` | Hardware-exact; wrong band → unbuildable drawer |
| **Auto-split idempotence** *(incoming)* | `decomposeBoxes` (Phase 3) | Must not infinite-split (override consumed pre-split) — a *property*, not an example |

### 3.4 High regression-probability areas

| Area | Trigger | Guard priority |
|---|---|---|
| **D1 orchestrator drift** | Any pipeline change touching one twin | Differential test (§5.1) — **P0** |
| **D2 five-path prologue** | Decompose/layout change | Parity net + golden masters — **P0** |
| **Override interactions** (W × material × edging × board per body) | Adding/altering an override layer | Property + golden masters — **P1** |
| **Kitchen aggregation** (`skipPlinth` + unified plinth) | Kitchen or plinth change | Integration + regression corpus — **P1** |
| **Persistence keys** (`boxStableKey`, `Board.stableId`) | Identity formula change | Round-trip + orphan detector (§5.4) — **P1** |
| **Named past bugs** (קלפה caps, multi-body fronts, door straddle, phantom door) | Any nearby edit | Permanent named-bug corpus (§5.5) — **P0** |

---

## 4. Per-subsystem QA matrix

Legend: **●** primary strategy · **○** secondary · **—** N/A. "Invariants under test"
cite INV-# from [DEPENDENCY_GRAPH.md §6](DEPENDENCY_GRAPH.md#6-engineering-invariants-inferred-from-code--not-invented).

| Subsystem | Unit | Integ | Prop | Rend | Regr | Mut | Vis | Invariants under test |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| **S1 boxDecomposition** | ● | ○ | ● | ○ | ● | ● | — | INV-4,5,13,16 |
| **S2 frontGeometry** | ● | ○ | ● | ● | ● | ● | — | INV-6,7 |
| **S3 boardModel** | ● | — | ● | ● | ● | ● | — | INV-1,10,11,17,21 |
| **S4 boxMaterials** | ● | — | ● | ○ | ● | ● | — | INV-12 |
| **S5 doors** | ● | ○ | ● | ○ | ● | ● | — | INV-7,8,13,14,15 |
| **S6 interior** | ● | — | ● | — | ○ | ● | — | INV-2 (`boxStableKey`), INV-22 |
| **S7 drawers/lift** | ● | — | ○ | — | ● | ● | — | drawer-box NL, AVENTOS selection |
| **S8 hardware BOM** | ● | — | — | — | ● | ○ | — | preset counts |
| **S9 cut assembly** | ● | ○ | ● | ● | ● | ● | — | INV-9,17,18 |
| **S10 orchestrators** | — | ● | ● | ● | ● | ○ | — | **all** (differential, §5.1) |
| **S11 render adapters** | — | ○ | ● | ● | ● | ○ | ● | INV-10 (census), INV-7 (containment) |
| **S12 product/modules** | ● | ● | ○ | ● | ● | ○ | ○ | INV-22 (corner), kitchen layout |
| **S13 room/placement** | ● | ○ | ● | ● | ○ | ○ | ○ | INV-19 (one transform) |
| **S14 persistence** | ● | ● | ● | — | ● | ○ | — | INV-2 round-trip, migration |
| **S15 pricing (dormant)** | ○ | — | — | — | — | — | — | (defer until wired) |
| **S16 renderers** | — | — | — | ● | ○ | — | ● | visual only (§5.7) |

**Per-subsystem emphasis notes** (only where there's something specific):

- **S1** — *Property is the star.* Random `(W,H,D,plinth,dpc,overrides)` → assert:
  `Σ body widths == innerW`; no body `W > MAX_BOX_W` unless `noWidthSplit`/override;
  every body `H > 0`; merged-body `internalShelves` are body-local and sorted;
  `plinthOuterWidth == Σ bottom-row W + shell`. **Idempotence** property is mandatory
  before auto-split (Phase 3) ships: `decompose∘applyOverride` is a fixed point.
- **S2** — Property: fronts **tile** their row with no overlap and no straddle across
  a carcass boundary (prefix-sum of body widths); `frontWidth ≥ 0`; uniform bodies
  match row-even within ≤1 mm (INV-7). This is the highest-value property in the app.
- **S3** — Property: no board escapes its box AABB; `boardsToCutItems` back panels
  excluded from sheet area; edging deduction monotonic in band thickness. Unit: pin
  the exact rabbet/butt formulas + leveler/hinge gaps (these are *carpentry facts*,
  golden).
- **S4** — Property: `resolveBoxMaterials` = `override ?? default` field-wise;
  shell/carcass-depth always use cabinet front material regardless of per-body
  override (INV-12) — a metamorphic test (override a body's front → shell dims unchanged).
- **S5** — Unit: skirt-cover truth table; property: main-door height ≤ 0 ⇒ absent
  everywhere (cut + face + hinges) (INV-14); section count = k+1 for k internal
  shelves (INV-13).
- **S9** — Property: `mergeCutItems` is order-independent on qty totals and idempotent
  (`merge∘merge == merge`); pair-merge only fires when *both* roles present.
- **S10** — No unit tests; **differential + integration + property** (§5.1). The
  golden-master corpus lives here.
- **S11** — **Renderer-consistency is primary** (§5.2). Add visual (●) only for the
  2D deterministic SVG layer; 3D stays geometry-parity + checklist.
- **S14** — Property: `deserialize∘serialize == id` for a generated `Project`;
  `restore∘snapshot == id` for live state; migration is total over all prior schema
  versions (§5.4).

---

## 5. Cross-cutting strategies

### 5.1 Differential testing of the twin orchestrators (closes D1) — **P0**

The single most important addition. For a generated `(input, SavedCabinetState)`,
build the live result via `useCabinet.calculate` (in a hook test harness) and the
pure result via `computeUnitCutsAndHardware`, then assert **equivalence of the
observable contract**: merged cut list (by material/dims/qty), hardware BOM, and door
census. They may differ in *interactive-only* state (preservation, display numbers),
so the differential compares the *serialisable outputs*, not internal refs.

```
property: for all (input, state):
    normalize(calculate(input, state).cuts)  ==  normalize(computeUnit(input, state).cuts)
    calculate(...).hardwareItems              ==  computeUnit(...).hardwareItems
```

This converts D1 from "hope they stay in sync" to "CI fails the moment they don't."
Until it exists, every pipeline change must be manually applied to both twins and the
reviewer must confirm it (checklist item).

### 5.2 Renderer consistency — the parity net, generalised

`renderParity.test.ts` is the backbone. The long-term program:

- **Census parity (have):** 3D & 2D board-role multiset == cut list.
- **Containment (have):** faces within `[0,W]`, clear caps, door width ⊆ cut widths.
- **Position parity (add):** for uniform cabinets, assert door/drawer face *x-ranges*
  tile without gaps — catches straddle that census misses.
- **Matrix growth (rule):** every new cabinet shape, module, or override combination
  adds a `CASES` entry. The matrix is the contract surface; it should only grow.
- **Adapter symmetry (add):** `cabinetFrontPanels` (2D) vs `cabinetFrontBoxes` (3D)
  must agree face-for-face — a property, since one wraps the other.

### 5.3 Property invariant catalog (the master list)

The properties every generator must exercise, keyed to invariants. This is the
"design QA around invariants" mandate made concrete:

| ID | Property | Invariant |
|---|---|---|
| P-DEC-1 | `Σ body W == innerW`; no over-wide body (mod corner/override) | INV-4,5 |
| P-DEC-2 | Decompose is idempotent under its own override consumption | INV-4 (Phase 3) |
| P-FRONT-1 | Fronts tile the row: no overlap, no straddle | INV-6,7 |
| P-FRONT-2 | Uniform bodies: per-body width ≈ row-even (≤1 mm) | INV-7 |
| P-BOARD-1 | No board escapes its box/cabinet AABB | INV-10 |
| P-BOARD-2 | Back excluded from sheet area | INV-17 |
| P-MAT-1 | `resolve == override ?? default`; shell uses cabinet front | INV-12 |
| P-DOOR-1 | height ≤ 0 ⇒ absent in cut+face+hinges | INV-14 |
| P-CUT-1 | cut list = union of emitters; census stable | INV-9,10 |
| P-CUT-2 | merge idempotent + order-independent | INV-18 |
| P-ROOM-1 | all three room views project one sub-box set | INV-19 |
| P-PERSIST-1 | serialize/deserialize + snapshot/restore round-trip | INV-2 |
| P-ORCH-1 | live twin == pure twin (differential, §5.1) | all |

Generators must include the mean cases *and* the edge fixtures: `plinth=0`, full
external-drawer stack, `dpc=3` merge, single-side shell, corner, wall (קלפה),
per-body overrides stacked. Bias the generator toward these — random alone rarely
hits the merge-to-single-body path.

### 5.4 Persistence & identity — **P1**

- **Round-trip property (P-PERSIST-1).**
- **Orphan detector:** a test that, if `boxStableKey`/`Board.stableId` formulas change,
  fails loudly by asserting a curated set of legacy fixtures still resolves its
  overrides after `restoreState`. This is the tripwire for silent saved-project loss.
- **Migration totality:** for every `schemaVersion` from 1…CURRENT, a fixture migrates
  cleanly to CURRENT and validates. A missing migration step must fail, not silently pass.

### 5.5 Regression — golden masters + named-bug corpus

- **Golden masters:** freeze the *merged* cut list + hardware BOM + 3D/2D board census
  for the `renderParity` cabinet matrix as JSON snapshots under `__fixtures__/`. A diff
  is a **review gate** (Principle 6), not a hard fail — it catches D1/D2 ripple.
- **Named-bug corpus (permanent):** each shipped bug becomes an eternal case, named:
  `regression: קלפה top+bottom caps in all 3 paths`, `regression: multi-body cabinet
  renders all doors+drawers`, `regression: door never straddles a carcass`,
  `regression: drawers unit has no phantom door`. These never get deleted — they encode
  hard-won knowledge. (`renderParity.test.ts` already hosts the first two.)

### 5.6 Mutation testing program (core only)

- **Scope:** `core/` pure modules only — small, deterministic, high-value. Never UI.
- **Priority targets:** S1, S2, S3, S5, S9 (the invariant-critical arithmetic).
- **Gate:** a **mutation-score threshold on `core/geometry` + `core/boards` +
  `core/cuts`** (start at the measured baseline, ratchet up). A dropped score on a PR
  means a new code path is unguarded even if line coverage is green.
- **Why here:** mutation testing answers the question line coverage can't — *do the
  invariant assertions actually catch a wrong `+`/`-`/`<`?* The prefix-sum tiler (INV-7)
  and the depth/inner-width chain (INV-1) are exactly where a silent sign error hides.

### 5.7 Visual testing (honest about the limit)

Two tiers, because the project forbids autonomous browser verification:

1. **Deterministic geometry/SVG (automatable, no browser).** The 2D output is a pure
   function of geometry. Snapshot either the geometry model (`computeSketchGeometry`
   output — already tested for cap presence) or the serialised SVG string in jsdom.
   This catches structural regressions (a missing rect, a wrong viewBox) without pixels.
   Applies to `CabinetSketch`, `CabinetFrontsSketch`, `ProductElevation`, `PlinthEditor`.
2. **Human-in-the-loop carpenter checklist (pixels/WebGL).** Colour, z-order, label
   overlap, and the three.js scene are *not* deterministically snapshot-able in CI and
   the agent may not verify them. Ship a per-feature checklist ("open a 2-row shelled
   cabinet → envelope caps drawn in front colour; no door overhangs; 3D fronts align
   with bodies") for the carpenter. This is a **process** control, not a test.

> We deliberately do **not** pursue screenshot pixel-diff CI for 3D: it is flaky, and
> the geometry parity (BoardBox3D census + bounding box) already proves the model is
> correct. Pixels only add colour/lighting — a checklist concern.

---

## 6. Maturity model (phased, long-term)

| Phase | Goal | Adds | Exit criterion |
|---|---|---|---|
| **0 — Baseline (today)** | Invariants captured in prose + parity net | `renderParity` + 38 suites | This doc set exists |
| **1 — Close the P0 gaps** | Kill silent drift | Differential test (§5.1); named-bug corpus formalised (§5.5); `useCabinet.calculate` harness | D1 fails CI on divergence; live orchestrator has a test |
| **2 — Property layer** | Invariants over examples | `fast-check`; the P-* catalog (§5.3); persistence round-trip + orphan detector | Every INV-# has a property; generator hits all edge fixtures |
| **3 — Strength + regression infra** | Prove the tests bite | StrykerJS on core with a score gate (§5.6); golden-master fixtures (§5.5) | Mutation gate green in CI; golden diffs reviewed |
| **4 — Visual + release** | Structural visual net | Deterministic SVG snapshots (§5.7 tier 1); carpenter checklist template (tier 2) | 2D structural regressions caught pre-merge |

Sequencing rationale: **differential + named-bug first** (they stop the bleeding from
the two biggest hazards, D1 and past regressions), *then* properties (breadth), *then*
mutation (depth/strength), *then* visual (polish). Do not invert — properties without
the differential test still let the two orchestrators drift.

---

## 7. CI gates & coverage targets by layer

Coverage is a **floor per layer**, not a global number (a global % lets thin core
coverage hide behind fat UI coverage or vice-versa):

| Layer | Line floor | Real gate | Rationale |
|---|---|---|---|
| `core/geometry`, `core/boards`, `core/cuts`, `core/doors` | 90% | **Mutation score** + property pass | Invariant-critical, pure, cheap |
| `core/product` (adapters + modules) | 85% | **Parity net** green | Adapters own no truth; parity is the real check |
| `core/room`, `core/drawers`, `core/lift`, `core/hardware` | 80% | Unit + round-trip | Well-bounded pure logic |
| `ui/hooks` | 60% | **Differential test** (§5.1) | Stateful; contract matters more than lines |
| `ui/components` | — | Deterministic SVG snapshot + checklist | Must not compute; no line target |

**Blocking CI gates (merge-blocking):** `tsc --noEmit`; `vitest run`; parity net;
differential test (once Phase 1). **Non-blocking (report + review):** golden-master
diffs; mutation score trend. **Always** the CLAUDE.md rule: no "green" claim before
`tsc` + `vitest` both pass.

---

## 8. Maintenance rules

1. **New invariant → new property + matrix cell**, and register it as INV-# in
   [DEPENDENCY_GRAPH.md §6](DEPENDENCY_GRAPH.md#6-engineering-invariants-inferred-from-code--not-invented).
2. **New render path or cabinet shape → new `renderParity` `CASES` entry** (§5.2).
3. **New override layer → a metamorphic property** (override changes the intended
   axis and *only* that axis) + a golden-master row.
4. **Pipeline stage change → apply to BOTH orchestrators** and extend the differential
   test's normalised contract (§5.1).
5. **Identity-formula change (`boxStableKey`/`stableId`) → run the orphan detector**
   (§5.4) and accept the saved-project cost consciously (it's the documented price of
   the per-body identity model).
6. **Every shipped bug → a permanent named-regression case** before the fix merges
   (§5.5). The case is written to fail on the *unfixed* code first.
7. **Refactor with no product change must not touch tests.** If it does, the test was
   coupled to implementation — fix the test, not just the code.
