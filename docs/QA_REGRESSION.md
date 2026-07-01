# QA Regression Knowledge Base — Carpenter App

> **Living engineering memory for difficult bugs.** Every *significant* real bug
> becomes a permanent entry here: its root cause, the engineering assumption it broke,
> and the test that now guards it. This is where the project remembers the mistakes
> worth not repeating.
>
> Anchored to the engineering model: subsystems **S1–S16**
> ([DEPENDENCY_GRAPH.md](DEPENDENCY_GRAPH.md)), invariants **INV-1…22**
> (same file §6), pipelines ([DATA_FLOW_GRAPH.md](DATA_FLOW_GRAPH.md)), and the QA
> program ([QA_STRATEGY.md](QA_STRATEGY.md), [IMPACT_ANALYSIS.md](IMPACT_ANALYSIS.md)).

---

# Purpose

This document turns each hard-won bug into permanent, structured knowledge, so the
same class of failure is caught mechanically next time instead of re-discovered by a
user. It is deliberately **narrow**: only bugs that taught us something.

**How it differs from the neighbouring docs — do not duplicate them here:**

| Doc | Answers | This doc does *not* |
|---|---|---|
| **DECISIONS_LOG.md** | *"Why did we choose architecture X?"* — deliberate design decisions + rationale | record decisions; it records *failures* (though it may **link** to a decision that a bug later exposed) |
| **CHANGELOG.md** | *"What changed, in user terms?"* — the release-facing history | restate the changelog; it captures the *engineering* root cause behind a fix |
| **QA_STRATEGY.md** | *"How do we test in general?"* — the target QA program + tiers | define strategy; it records concrete *instances* the strategy must keep catching |
| **QA_SURFACE_MAP.md / IMPACT_ANALYSIS.md** | *"Which test guards which module?"* | map modules; it maps *specific past bugs* to their guarding test |

If a fix is a typo, a copy change, a pure refactor, or a routine UI tweak with no
broken engineering assumption, it belongs in the CHANGELOG **only** — not here.

---

# When to create an entry

Create an entry **only when all four hold:**

1. A **real bug** was discovered (wrong cut, wrong render, lost data — not a lint nit).
2. The bug **exposed an incorrect engineering assumption** (a formula, an invariant, a
   "this can only be one body / one side / symmetric" belief).
3. The bug **required non-trivial investigation** (root cause wasn't obvious from the
   symptom).
4. The bug **could reasonably happen again** (the code shape that allowed it still
   exists elsewhere, or the assumption is tempting to re-make).

**Do NOT create an entry for:** typos · minor UI/CSS fixes · formatting · routine
refactors that didn't fix a bug · one-off data-entry mistakes. *Quality, not quantity.*

---

# Entry Template

Copy this block for every new regression. Keep each field to a few lines.

```markdown
## REG-NNN — <short title>

- **ID:** REG-NNN
- **Date:** YYYY-MM-DD (or YYYY-MM if the exact day isn't recorded)
- **Status:** Closed | Open | Watching
- **Summary:** One sentence — the observable symptom.
- **Root Cause:** The actual engineering cause (not the symptom).
- **Engineering Assumption That Failed:** The belief the code encoded that was wrong.
- **Affected Subsystem(s):** S#… (from DEPENDENCY_GRAPH)
- **Affected Pipeline(s):** cut list / fronts / 3D / 2D / hardware / material / room …
- **Affected Renderer(s):** the S16 components that showed it wrong.
- **Failed Engineering Invariant(s):** INV-# (or "none catalogued — candidate new INV").
- **Resolution:** What the fix did, at the engineering level.
- **Regression Test(s):** the test file/case that now fails on the unfixed code — or
  "None (gap)" with a pointer to which QA_STRATEGY tier would cover it.
- **Related Decision(s):** DECISIONS_LOG date/title, if the bug touched one.
- **Notes:** The lesson. What to watch for elsewhere.
```

---

# Statistics

> **Recompute on every add/close.** (No automation harness yet — treat this as a
> manual invariant of editing the file; a future CI script could regenerate it from
> the entries.)

- **Total regressions:** 9
- **Closed:** 9
- **Open:** 0
- **Watching:** 0
- **Most affected subsystems (tie, 3 each):** **S11** render adapters · **S9** cut
  assembly · **S10** orchestrators · **S5** doors · **S2** front geometry
- **Most common root causes:**
  1. **SSOT drift / adapter re-derivation** — a renderer or a second code path
     recomputed geometry independently and diverged from the cut list (REG-001,
     REG-002, REG-003). *4 of 9 touch this class.*
  2. **Over-narrow assumption baked into a formula** — "symmetric shell", "single
     body", "one door" (REG-002, REG-004, REG-005).
  3. **Missing recompute / persistence trigger in the live orchestrator** (REG-008,
     REG-009) — the untested `useCabinet.calculate` half (D1 gap).
  4. **Override not threaded through a derived value** (REG-003, REG-007).
- **Standing lesson:** most regressions here are **single-source-of-truth violations**
  — the reason `renderParity.test.ts` exists and why [SSOT_MAP.md](SSOT_MAP.md) tracks
  duplicate calculations (D1–D6).

---

# Regressions

## REG-001 — קלפה top+bottom envelope caps missing in 3D, drawn body-colour in 2D

- **ID:** REG-001
- **Date:** 2026-06 (post `hasWallEnvelope`, see DECISIONS_LOG 2026-06-14)
- **Status:** Closed
- **Summary:** A wall cabinet (קלפה) with `hasWallEnvelope` emitted both front-material
  caps in the cut list, but the 3D view dropped them entirely and the 2D sketch drew
  them in **body** colour instead of front.
- **Root Cause:** Three board-building paths (cut list, 3D `cabinetBoardBoxes`, 2D
  sketch) each re-derived the board set independently; the envelope caps were only in
  the cut-list path. The 2D emission also lived in the React component, so its role/
  colour tagging drifted from core.
- **Engineering Assumption That Failed:** "The three render paths naturally agree
  because they read the same inputs." They don't — each re-implements the model.
- **Affected Subsystem(s):** S11 (all three adapters), S3 (`deriveEnvelopeFlags`).
- **Affected Pipeline(s):** board generation, 2D + 3D rendering.
- **Affected Renderer(s):** `RoomView3D`, `Body3DView`, `CabinetSketch`.
- **Failed Engineering Invariant(s):** INV-10 (render census == cut list), INV-11
  (envelope caps).
- **Resolution:** Extracted the 2D board emission to core (`cabinetSketchBoards`) so the
  component and the census share one implementation; emitted the shell/caps at cabinet
  level in 3D. Then built the parity net to make the three paths provably agree.
- **Regression Test(s):** `renderParity.test.ts` — the named case *"קלפה (wall cabinet)
  top+bottom envelope"* asserts all three paths carry BOTH caps + the census tests.
- **Related Decision(s):** DECISIONS_LOG 2026-06-14 (envelope-bottom); 2026-05-25/24
  (BoardModel).
- **Notes:** This is **the** incident that created `renderParity.test.ts`. Any new
  render path or board role must be added to its `CASES`. The general shape — "a third
  render path silently omits a board" — is the highest-frequency failure class.

## REG-002 — Multi-body cabinet: 3D/elevation fronts dropped doors and drawers

- **ID:** REG-002
- **Date:** 2026-06-19 (per PROJECT_CONTEXT)
- **Status:** Closed
- **Summary:** A wide/tall cabinet that decomposes into ~6 bodies rendered only a few
  doors and no drawers in the 3D + elevation fronts views, while the cut list was
  correct.
- **Root Cause:** `cabinetFrontPanels` used a **single-body** model — it read only
  `state.interior['single:single']` and split columns across the FULL cabinet width,
  ignoring the body decomposition the cut list uses.
- **Engineering Assumption That Failed:** "A cabinet's fronts can be laid out over one
  body spanning the whole width." False for any cabinet past `MAX_BOX_W`/`MAX_BOX_H`.
- **Affected Subsystem(s):** S11-fronts, S2.
- **Affected Pipeline(s):** front generation, 2D fronts + 3D fronts.
- **Affected Renderer(s):** `CabinetFrontsOverlay`, `RoomView3D`, `ProductElevation`.
- **Failed Engineering Invariant(s):** INV-10 (census), INV-7 (per-body sizing).
- **Resolution:** Rebuilt `cabinetFrontPanels` to decompose into bodies
  (`decomposeBoxes` + per-row layout + `deriveDrawerFronts`), mirroring the cut list /
  3D board pipeline exactly.
- **Regression Test(s):** `renderParity.test.ts` multi-body case + `cabinetFronts.test.ts`
  (door count == cut list; a drawer in a non-default body appears).
- **Related Decision(s):** DECISIONS_LOG 2026-05-20 (cabinet-level front logic).
- **Notes:** Watch for the same single-body shortcut anywhere reading a hardcoded
  `'single:single'` key.

## REG-003 — Door cut ignored per-body dimension override

- **ID:** REG-003
- **Date:** 2026-06-13 (per DECISIONS_LOG)
- **Status:** Closed
- **Summary:** Overriding a body's width changed the carcass and external-drawer cuts
  but **not** the door-panel cut width — the door cut stayed at the un-overridden size.
- **Root Cause:** Door cuts were produced by `calcCuts` (a single-row path) which
  recomputed the panel from the global `input.W`/`input.H`, duplicating the door math
  that `doorsById` already owned and ignoring the override.
- **Engineering Assumption That Failed:** "`calcCuts` can re-derive door dimensions
  from the cabinet input." It can't once any per-body override exists — the door
  dimensions live on `DoorById`.
- **Affected Subsystem(s):** S9 (`doorCuts`), S5 (`DoorById`), S10.
- **Affected Pipeline(s):** cut list generation.
- **Affected Renderer(s):** `CutsList`.
- **Failed Engineering Invariant(s):** INV-8 (door cuts derive from `DoorById`).
- **Resolution:** Introduced `buildDoorCutItems`, deriving door cuts from the finished
  `DoorById` (which already reflects overrides + external-drawer shortening +
  `envelopeTopH`). `calcCuts` is now off the live cabinet path.
- **Regression Test(s):** `doorCuts.test.ts`; `cabinetCompute.test.ts` — *"door cut
  tracks per-body overrides"*.
- **Related Decision(s):** DECISIONS_LOG 2026-06-13 (doors derived from `doorsById`),
  closing the 2026-05-25 debt.
- **Notes:** Classic duplicate-calculation drift (SSOT_MAP D4). `calcCuts` still exists
  for legacy furniture types — editing its door path does **not** affect real cabinets.

## REG-004 — Wide קלפה split into two doors + a phantom partition (regression of a fix)

- **ID:** REG-004
- **Date:** 2026-06
- **Status:** Closed
- **Summary:** After the per-row front-width fix landed, a wide wall cabinet (קלפה)
  started rendering as **two** doors with a fake middle partition instead of one lift-up
  panel.
- **Root Cause:** The per-row width change interacted with the column-count logic: a
  wide wall body was split by `maxDoorWidth` into 2 columns, but a קלפה is physically a
  single lift-up panel. Column count was keyed off width alone, not the module's
  single-front nature.
- **Engineering Assumption That Failed:** "Column count is purely `ceil(W /
  maxDoorWidth)`." A lift-mechanism (or drawers) body is **one** front regardless of
  width.
- **Affected Subsystem(s):** S2 (`frontColumnsForBox`), S1, S5.
- **Affected Pipeline(s):** front generation, cut list.
- **Affected Renderer(s):** `CabinetFrontsSketch`, `KitchenOverview`.
- **Failed Engineering Invariant(s):** INV-6 (row layout); the single-front rule.
- **Resolution:** `frontColumnsForBox` gained an explicit `singleFront` lock (used by
  drawers units + קלפה), separated from `mount` — so a wide single-front body stays one
  column.
- **Regression Test(s):** `frontGeometry.test.ts` (`frontColumnsForBox` singleFront);
  `renderParity.test.ts` *"kitchen — wall (קלפה)"* case.
- **Related Decision(s):** DECISIONS_LOG 2026-06 area (singleFront separated from mount).
- **Notes:** A **regression caused by another fix** — exactly what this KB exists to
  prevent recurring. Any width-driven fix must be checked against single-front modules.

## REG-005 — Front shortened by 2× shell thickness when only one side had shell

- **ID:** REG-005
- **Date:** 2026-06
- **Status:** Closed
- **Summary:** A kitchen unit flush against a wall (shell on one side only) had its
  door width reduced by **two** shell thicknesses instead of one, leaving a visible gap.
- **Root Cause:** The front layout used a symmetric `hasShell` boolean to inset both
  edges, with no notion of per-side shell.
- **Engineering Assumption That Failed:** "Shell is symmetric — both sides or neither."
  Kitchen units routinely have one-sided shell.
- **Affected Subsystem(s):** T1 (`getShellSides`), S2.
- **Affected Pipeline(s):** front generation, cut list, all renders (inner width).
- **Affected Renderer(s):** fronts (2D/3D), `KitchenOverview`.
- **Failed Engineering Invariant(s):** INV-20 (`getShellSides` single source).
- **Resolution:** Introduced `getShellSides` (per-side `{left,right}`, falling back to
  `hasShell`) as the single shell source; `computeInnerWidth` and `computeRowFrontLayout`
  take per-side flags.
- **Regression Test(s):** `frontGeometry.test.ts` (asymmetric `shellSides`);
  `renderParity.test.ts` shelled cases (faces within `[0,W]`).
- **Related Decision(s):** —
- **Notes:** Any new "×2 the shell" arithmetic is suspect — always ask "which side?".

## REG-006 — Sheet-count / wood-cost estimate ignored the waste factor

- **ID:** REG-006
- **Date:** 2026-06
- **Status:** Closed
- **Summary:** "Sheets needed" and the derived wood cost were under-counted — the global
  waste factor wasn't applied, so estimates were optimistic.
- **Root Cause:** The sheet-area calculation summed cut areas and divided by sheet area
  without multiplying by `APP_DEFAULTS.wasteFactor`.
- **Engineering Assumption That Failed:** "Panel area ÷ sheet area = sheets." Real
  cutting wastes offcuts; the factor is not optional.
- **Affected Subsystem(s):** S9 (`sheetCalculator`).
- **Affected Pipeline(s):** cut list / sheet estimate.
- **Affected Renderer(s):** `CutsList` (sheets + cost readout).
- **Failed Engineering Invariant(s):** INV-17 (sheet count skips `back`, applies waste
  factor).
- **Resolution:** `sheetsNeeded` / `sheetsNeededByGroup` multiply the raw area ratio by
  `wasteFactor` and exclude the `back` group.
- **Regression Test(s):** `sheetCalculator.test.ts`.
- **Related Decision(s):** —
- **Notes:** Cost bugs are silent — they don't crash, they just quote wrong. Guard every
  aggregate estimate with an explicit test that pins the factor.

## REG-007 — Phantom door in the drawers unit + plinth ignored width override

- **ID:** REG-007
- **Date:** 2026-06
- **Status:** Closed
- **Summary:** A drawers unit (full external-drawer stack) emitted a zero-height
  "door" cut + hinges; separately, overriding a bottom body's width didn't widen the
  plinth.
- **Root Cause:** (a) A main door whose height computed to ≤ 0 above a full drawer stack
  was still treated as present. (b) The plinth width read `input.W` instead of the
  bottom row's *effective* (overridden) width.
- **Engineering Assumption That Failed:** (a) "Every front column has a door." (b) "The
  plinth spans the entered cabinet width." Both false under drawers / per-body overrides.
- **Affected Subsystem(s):** S5 (absent-door), S1 (`plinthOuterWidth`), S10.
- **Affected Pipeline(s):** cut list, hardware, plinth (2D/3D + `PlinthEditor`).
- **Affected Renderer(s):** `CutsList`, `HardwareList`, `PlinthEditor`, 3D.
- **Failed Engineering Invariant(s):** INV-14 (height ≤ 0 ⇒ absent), INV-16 (plinth
  follows effective bottom-row width).
- **Resolution:** Absent-door pass sets `hasDoor=false` when height ≤ 0 (skipped by
  `buildDoorCutItems` + hardware + render); `plinthOuterWidth` sums the effective
  bottom-row widths + shell offset.
- **Regression Test(s):** `cabinetCompute.test.ts` — *"drawers unit has no phantom
  door"*; `boxDecomposition.test.ts` (`plinthOuterWidth`).
- **Related Decision(s):** —
- **Notes:** Two independent "read the raw input instead of the derived value" bugs in
  one area — the recurring override-threading class (see also REG-003).

## REG-008 — User-added shelves silently missing from the cut list

- **ID:** REG-008
- **Date:** 2026-05/06
- **Status:** Closed
- **Summary:** Adding a shelf in the interior editor updated the sketch but the shelf
  board never appeared in the cut list.
- **Root Cause:** `setBoxInterior` / `setCellItems` gated the full recompute on
  `externalStackChanged` — a shelf edit didn't change the external-drawer stack, so
  `calculate()` (which emits shelf boards) never re-ran.
- **Engineering Assumption That Failed:** "Only external-drawer changes need a full
  recompute." Interior items feed **both** hinges and the cut list; any change needs it.
- **Affected Subsystem(s):** S10-live (`useCabinet.calculate`), S6, S9.
- **Affected Pipeline(s):** cut list generation (live path).
- **Affected Renderer(s):** `CutsList`.
- **Failed Engineering Invariant(s):** INV-9 (cut list = union of emitters, incl.
  shelves).
- **Resolution:** Removed the `externalStackChanged` shortcut — interior mutations
  always run the full pipeline so `result.cuts` and door hinges refresh together.
- **Regression Test(s):** **None (gap).** This lives in the *untested* live orchestrator
  (`useCabinet.calculate`) — see [QA_SURFACE_MAP.md §4](QA_SURFACE_MAP.md#4-known-qa-gaps--risks)
  gap #1. The **differential test** ([QA_STRATEGY.md §5.1](QA_STRATEGY.md#51-differential-testing-of-the-twin-orchestrators-closes-d1--p0))
  would cover it by proving the live twin == the tested pure twin.
- **Related Decision(s):** —
- **Notes:** The single biggest QA gap (D1). Prioritise the differential test — this bug
  class can recur silently because the live path has no direct coverage.

## REG-009 — Kitchen shell toggle not reflected in the body-editor 3D preview

- **ID:** REG-009
- **Date:** 2026-07-01
- **Status:** Closed
- **Summary:** Toggling a kitchen unit's shell updated the cut list and kitchen overview
  but the body-editor's isolated 3D preview never showed the shell.
- **Root Cause:** The editor's isolated `bodyInput3d` hardcoded
  `hasShell/hasShellLeft/hasShellRight = false`, so the live shell flags never reached
  the preview's `cabinetBoardBoxes` call.
- **Engineering Assumption That Failed:** "The body editor's isolated 3D input never
  carries shell (shell is a cabinet-level concept)." True for a standalone cabinet, but
  **false in `kitchenDirectEdit`**, where a unit *is* the cabinet and owns its shell.
- **Affected Subsystem(s):** S16 (`CabinetForm` 3D preview wiring), S11-3d.
- **Affected Pipeline(s):** 3D rendering (preview).
- **Affected Renderer(s):** `Body3DView` (in the kitchen body editor).
- **Failed Engineering Invariant(s):** none catalogued — a preview-input fidelity bug
  (the isolated input must mirror the real unit's flags).
- **Resolution:** In `kitchenDirectEdit`, feed the live shell flags into `bodyInput3d`
  and widen `W` by `frontThickness × shelledSides` so the inner carcass still matches
  `editingBox.W`.
- **Regression Test(s):** **None (gap).** Preview wiring in `CabinetForm.tsx` is a
  renderer — covered today only by the carpenter checklist ([QA_STRATEGY.md §5.7](QA_STRATEGY.md#57-visual-testing-honest-about-the-limit)).
  A deterministic check would assert `bodyInput3d` mirrors the unit's shell flags.
- **Related Decision(s):** —
- **Notes:** Isolated / "preview" inputs that **hardcode** a flag are a recurring trap —
  when the surrounding context changes (standalone → kitchen unit), the hardcode lies.
  Audit other hardcoded flags in isolated compute inputs.

---

# Maintenance Rules

Whenever a **significant** bug is fixed, **before** considering the task complete:

1. **Add or update** its `REG-NNN` entry using the template — root cause and the
   *failed assumption*, not just the symptom.
2. **Ensure a regression test exists** when appropriate: a test that **fails on the
   unfixed code** and passes after. If none exists (a live-orchestrator or renderer
   gap), say so explicitly and name the QA tier that *would* cover it — don't leave the
   field blank.
3. **Link a related decision** in [DECISIONS_LOG.md](DECISIONS_LOG.md) if the bug
   exposed or contradicted one (this doc records failures; that one records choices).
4. **Recompute the [Statistics](#statistics)** (totals, most-affected subsystem,
   root-cause tallies).
5. **Keep it concise and high-value.** One tight entry per lesson. If two bugs share a
   root cause, cross-reference rather than duplicate.
6. **Promote recurring root causes to invariants.** If the same class appears 3×,
   propose a new **INV-#** in [DEPENDENCY_GRAPH.md §6](DEPENDENCY_GRAPH.md#6-engineering-invariants-inferred-from-code--not-invented)
   and a property test in [QA_STRATEGY.md §5.3](QA_STRATEGY.md#53-property-invariant-catalog-the-master-list)
   so the *pattern* is guarded, not just the instances.

The goal is the project's long-term engineering memory for difficult bugs — **quality,
not quantity.**
