# Data-Flow Graphs — Carpenter App

> **What this is.** One data-flow graph per engineering concern, showing how a
> value flows from `CabinetInput` + `SavedCabinetState` through pure functions to
> a renderer. These are **data** flows (what feeds what), complementing the
> **dependency** view in [DEPENDENCY_GRAPH.md](DEPENDENCY_GRAPH.md).
>
> **How to keep it current.** Each graph names real functions. When you insert a
> stage, add a node and an edge; when you delete one, remove it. If a new renderer
> appears, it almost always hangs off an existing adapter node (`cabinetFrontPanels`,
> `cabinetBoardBoxes`, `cabinetSketchBoards`, `placementSubBoxAABBs`).
>
> **Legend.** `▢ pure function` · `▤ stateful/side-effect` · dashed edge = "must
> match / kept in sync". All dimensions cm unless a node says mm.

**Contents:** [Cabinet](#1-cabinet-generation) · [Board](#2-board-generation) ·
[Front](#3-front-generation) · [Hardware](#4-hardware-calculation) ·
[Material](#5-material-resolution) · [2D render](#6-2d-rendering) ·
[3D render](#7-3d-rendering) · [DXF](#8-dxf-generation-not-implemented) ·
[Cut list](#9-cut-list-generation) · [Sketch](#10-sketch-generation)

---

## 1. Cabinet generation

The spine every other flow branches from: input → carcasses → per-row layout → doors.

```mermaid
flowchart TD
    IN["CabinetInput"] --> SHELL["getShellSides ▢"]
    IN --> MAT["getMaterialWithCustom ▢ (tBody, tFront)"]
    SHELL --> IW["computeInnerWidth ▢ → innerW"]
    IN --> CD["computeCarcassDepth ▢ → carcassD"]
    IW & CD --> DEC["decomposeBoxes ▢ → rawBoxes"]
    ST["SavedCabinetState.boxDimensionOverrides"] --> AO["applyBoxDimensionOverrides ▢"]
    DEC --> AO --> BOXES["boxes: Box[]"]
    BOXES --> ROWS["groupBoxesByRow ▢"]
    BOXES --> NF["frontColumnsForBox ▢ → numFrontsPerBox"]
    ROWS & NF --> RL["computeRowFrontLayout ▢ (per level, effective outer W)"]
    RL --> BFL["bodyFrontLayout ▢ (per body)"]
    BOXES & BFL & INT["interior (from state)"] --> DOORS["door loop → DoorById"]
    DOORS --> RES["CabinetResult / UnitComputeResult"]
```

- **Sources of truth:** `getShellSides` (shell), `computeInnerWidth`/`computeCarcassDepth` (derived dims), `decomposeBoxes` (carcasses), `frontColumnsForBox` (door count), `bodyFrontLayout` (per-body door width).
- **Two runners:** `useCabinet.calculate` (live) and `computeUnitCutsAndHardware` (batch) run *this exact flow* — kept in sync by hand.
- **Effective outer width per row** = `(W − innerW) + Σ row body widths` — so a per-body `W` override widens that row's fronts to match the carcasses beneath.

---

## 2. Board generation

Carcass panels + plinth. This is the physical model that becomes both the cut list and the board renders.

```mermaid
flowchart TD
    BOX["Box (per body)"] --> BBM["buildBoardModel ▢"]
    RBM["resolveBoxMaterials ▢ → body/front material, backThicknessCm"] --> BBM
    ENV["deriveEnvelopeFlags ▢ (which body carries the shell)"] --> BBM
    JOINT["resolveCabinetJointMethod ▢ (rabbet | butt)"] --> BBM
    INT["interior shelves"] --> BBM
    BBM --> BOARDS["Board[] (each: stableId, role, length/width/thickness, xFrom..yTo)"]

    BOTROW["bottom-row boxes"] --> PGW["plinthOuterWidth ▢"]
    PGW --> BPM["buildPlinthBoardModel ▢"]
    GABLE["plinthGableOverrides"] --> BPM
    BPM --> PBOARDS["plinth Board[] (front/back/gables/cladding)"]

    BOARDS & PBOARDS --> B2C["boardsToCutItems ▢ (+ edging deduction)"]
    OVR["boardOverrides (dim/material/edging)"] --> B2C
    B2C --> CUTS["CutItem[] (groups: body/shell/back/plinth)"]
    BOARDS --> R3D["cabinetBoardBoxes ▢ → BoardBox3D[]"]
    BOARDS --> R2D["cabinetSketchBoards ▢ → Board[] (2D)"]
```

- **`Board.stableId`** (e.g. `side-left@bottom:left`) is the override key; `Board.id` is a fresh React key.
- **Edging deduction** happens only in `boardsToCutItems` (`none`/`front`/`perimeter`).
- **One board model → three consumers:** cut list, 3D, 2D sketch — the parity net (`renderParity.test.ts`) asserts they carry the same board-role census.

---

## 3. Front generation

Doors + external-drawer faces. Fronts are an overlay on the carcass; they size per-body.

```mermaid
flowchart TD
    BOXES["bodyBoxes"] --> BFL["bodyFrontLayout ▢ (per-body frontWidth, x)"]
    NF["numFrontsPerBox"] --> BFL
    BOXES --> CELLS["buildBodyDoorCells ▢ (section split via internalShelves)"]
    INT["interior items"] --> IFF["getItemsForFront ▢"]
    IFF --> DH["calcMainDoorHeight ▢ (minus external stack)"]
    CELLS & BFL & DH --> DOORLOOP["door loop"]
    HINGE["hinge side/positions ▢ (salon/default/corner)"] --> DOORLOOP
    SAVED["saved doors"] --> DOORLOOP
    DOORLOOP --> DBYID["DoorById (width=frontW, height=panelH, hasDoor)"]

    INT --> DDF["deriveDrawerFronts ▢ → DrawerFrontById"]
    DBYID --> DCUT["buildDoorCutItems ▢ → door CutItem[]"]
    DDF --> ECUT["calcExternalDrawerFrontCuts ▢ → front CutItem[]"]

    IN["input + state"] -.parity.-> FP["cabinetFrontPanels ▢ → FrontPanel[]"]
    DBYID -.same width/height rules.-> FP
    FP --> OVL["CabinetFrontsOverlay (2D)"]
    FP --> F3D["cabinetFrontBoxes ▢ → BoardBox3D[] (3D fronts)"]
```

- **`DoorById` is the door-dimension SSOT** — `buildDoorCutItems` reads it, so the cut reflects overrides.
- **`cabinetFrontPanels` re-derives the same faces** for rendering. It is an *adapter*: `renderParity` asserts every rendered door width matches a cut-list door and no face overhangs `[0, W]`.
- **`hasDoor=false`** (height ≤ 0, or `hasFronts=false`) drops the door from both cuts and faces.

---

## 4. Hardware calculation

Counts + priced hardware sets, merged into one BOM.

```mermaid
flowchart TD
    DOORS["DoorById (hasDoor)"] --> CH["calcHardware ▢ (counts doors)"]
    INT["interior + cellInterior"] --> CH
    CH --> BW["buildHW ▢ (preset: cabinet | wall_cabinet)"]
    HWJSON["catalog/hardware/presets.json"] --> BW
    BW --> BASE["HardwareLineItem[] (base)"]

    INT --> RUN["buildDrawerRunnerHardware ▢ (per runner-equipped drawer)"]
    RUNJSON["catalog/runners"] --> RUN
    PRICE["runnerPriceOverrides (settings)"] --> RUN
    RUN --> MRUN["mergeRunnerHardware ▢ (replace generic slide)"]
    BASE --> MRUN

    LIFTJSON["catalog/liftMechanisms"] --> BLM["buildLiftMechanismHardware ▢ (AVENTOS, per flap)"]
    LPRICE["liftMechanismPriceOverrides"] --> BLM
    MRUN --> MLM["mergeLiftMechanismHardware ▢ (wall cabinet only)"]
    BLM --> MLM
    MLM --> HW["hardwareItems"]
    HW --> HWUI["HardwareList / KitchenOverview"]
```

- **Runner-equipped drawers replace** the generic telescopic slide; a **קלפה AVENTOS** family replaces the generic lift line.
- Counts come from `hasDoor` doors + interior item types; prices are JSON + settings overrides.

---

## 5. Material resolution

How a body ends up cut from a specific sheet + coloured in 3D.

```mermaid
flowchart TD
    IN["CabinetInput.bodyMaterialId / frontMaterialId / backThickness"] --> RBM["resolveBoxMaterials ▢"]
    OVR["boxMaterialOverrides[boxStableKey] (per-body)"] --> RBM
    CUST["useSettings.customMaterials"] --> GMC["getMaterialWithCustom ▢"]
    CATJSON["catalog/materials.json"] --> GMC
    GMC --> RBM
    RBM --> RES["ResolvedBoxMaterials: bodyMaterial, frontMaterial, backThicknessCm"]
    RES --> BBM["buildBoardModel: carcass/back from body, envelope/faces from front"]
    RES --> DTAG["door/drawer/partition cut tagging by per-body front id"]
    RES --> C3D["cabinetBoardBoxes colour"]

    IN -->|cabinet front material ONLY| SHELLINSET["computeInnerWidth + computeCarcassDepth<br/>deliberately ignore per-body overrides"]
```

- **`resolveBoxMaterials` is the single per-body lookup** shared by cut/2D/3D.
- **Exception:** the cabinet-wide shell inset and carcass depth always use the *cabinet* front material (one physical shell).
- **Board-level material override** (`boardOverrides[stableId].materialId`) can re-sheet a single board (e.g. real-wood back), read via `getMaterial` in `boardsToCutItems`.

---

## 6. 2D rendering

Two 2D families: **bodies** (carcass elevation) and **fronts** (facade).

```mermaid
flowchart TD
    IN["input + SavedCabinetState + customMaterials"] --> SKM["buildCabinetSketchModel ▢ (prop bundle)"]
    IN --> SKB["cabinetSketchBoards ▢ → Board[]"]
    SKM --> CS["CabinetSketch ▤ (2D bodies + interior + gaps)"]
    SKB --> CS
    SKM --> PE["ProductElevation ▤ (room elevation detail)"]
    IN --> FP["cabinetFrontPanels ▢ → FrontPanel[]"]
    FP --> OVL["CabinetFrontsOverlay / CabinetFrontsSketch ▤ (fronts, hinge marks)"]
    BOARDS["Board[] (from calculate)"] --> CCS["CabinetCutSketch ▤ (per-body cut sketch)"]
    PLB["plinth Board[]"] --> PLE["PlinthEditor ▤ (top-view gable drag)"]
    CUC["computeUnitCutsAndHardware"] --> KOV["KitchenOverview ▤ (embeds CabinetSketch per unit)"]
```

- `CabinetSketch` uses `computeSketchGeometry` (in `CabinetSketch.utils`) for the SVG scale/rects and `cabinetSketchBoards` for the role-tagged board set (the split that closed the "קלפה cap in body colour" bug).
- Interior clear-opening gaps come from `computeInteriorGaps` (`showGaps` prop, bodies views only).

---

## 7. 3D rendering

three.js meshes, from the same board model.

```mermaid
flowchart TD
    PROD["ProductUnit"] --> PBB["productBoardBoxes ▢"]
    PROD --> PFB["productFrontBoxes ▢"]
    PBB -->|non-kitchen| CBB["cabinetBoardBoxes ▢ → BoardBox3D[]"]
    PBB -->|kitchen| KLB["kitchenLayoutBoxes ▢ (per unit, RTL)"]
    KLB --> CBB
    PFB --> CFB["cabinetFrontBoxes ▢ (wraps cabinetFrontPanels)"]
    CBB --> BDEPTH["boardDepthRange ▢ (front-view rect → Z)"]
    CBB --> FIX["drawer trays / runners / rods / lift units (fixtures)"]
    CBB --> RV3["RoomView3D ▤ (mesh per board)"]
    CBB --> B3V["Body3DView ▤ (per-body editor 3D)"]
    CFB --> RV3 & B3V
    ROOMXF["placementSubBoxAABBs ▢ (local → room)"] --> RV3
    CBB --> ROOMXF
```

- `cabinetBoardBoxes` lifts each 2D board's front-view rect into 3D via `boardDepthRange` (per-role Z placement), then adds non-board fixtures (drawer box from `computeDrawerBox`, C-channel runners, rods, AVENTOS plates).
- Envelope/shell + plinth are emitted **once at cabinet level** so side panels run full height (matches the cut list).
- Kitchen units are laid out by `kitchenElevationLayout` and mirrored RTL to match `KitchenOverview`.

---

## 8. DXF generation — *NOT IMPLEMENTED*

> **Status: does not exist.** There is no DXF exporter in the codebase. DXF is
> listed only under "future direction" in `PROJECT_CONTEXT.md`. This section is a
> **placeholder + design sketch**, not documentation of existing behaviour.

**Current export surface (what *does* exist):**

| Export | Mechanism | Location |
|---|---|---|
| Cut list | `window.print()` (browser print of the rendered `CutsList`) | `CutsList.tsx` |
| Project file | JSON `Blob` download (`serializeProject`) | `useProject.ts` |
| CSV / PDF / DXF | — none — | — |

**If/when DXF is added, the natural data source is the board model**, because it
already carries per-board dimensions + 2D rectangles:

```mermaid
flowchart TD
    BOARDS["Board[] (buildBoardModel + buildPlinthBoardModel)"] -.planned.-> DXF["toDXF ▢ (per-panel outlines / nesting)"]
    FP["cabinetFrontPanels"] -.planned.-> DXF
    DXF -.planned.-> FILE["download .dxf"]
    style DXF stroke-dasharray: 5 5
    style FILE stroke-dasharray: 5 5
```

Recommended seam: a pure `core/export/toDxf.ts` consuming `Board[]`/`CutItem[]`
(never React), mirroring how `sheetCalculator` consumes `CutItem[]`. Do **not**
let a renderer build DXF.

---

## 9. Cut-list generation

The saw-operator's list = union of independent emitters, folded once.

```mermaid
flowchart TD
    BOARDS["carcass Board[]"] --> B2C["boardsToCutItems ▢ → body/shell/back CutItem[]"]
    PBOARDS["plinth Board[]"] --> B2C2["boardsToCutItems ▢ → plinth CutItem[]"]
    DOORS["DoorById"] --> DCUT["buildDoorCutItems ▢ → door CutItem[]"]
    EXT["external drawers"] --> ECUT["calcExternalDrawerFrontCuts ▢ → front CutItem[]"]
    EXT --> DBC["buildDrawerBoxCuts ▢ → drawer CutItem[]"]
    PART["partitions"] --> PCUT["computePartitionCuts ▢ → body CutItem[]"]
    CORN["corner"] --> CFC["cornerFillerCutItems ▢ → front CutItem[]"]

    B2C & B2C2 & DCUT & ECUT & DBC & PCUT & CFC --> ENRICH["enrich ▢ (assign materialId by group)"]
    ENRICH --> ALL["allCuts: CutItem[] (mm)"]
    ALL --> MERGE["mergeCutItems ▢ (fold identical + pairs)"]
    MERGE --> GRP["group by material"]
    GRP --> SHEET["sheetsNeeded ▢ (skip 'back', ×wasteFactor)"]
    GRP --> CUTUI["CutsList ▤ → window.print"]
    SHEET --> CUTUI
```

- **Assembly order** is owned by the orchestrators (`useCabinet.calculate` /
  `computeUnitCutsAndHardware`) — identical in both, by hand.
- **Kitchen:** `KitchenOverview` loops `computeUnitCutsAndHardware(..., {skipPlinth})`
  per unit and adds one **unified** kitchen-level plinth (`kitchenPlinth`).
- **Body view:** `computeUnitCutsAndHardware(..., {onlyBoxStableKey})` decomposes the
  whole cabinet (full row context) but emits cuts for **one body** — a faithful slice.

---

## 10. Sketch generation

"Sketch" = the SVG geometry layer feeding 2D views (distinct from the board model it renders).

```mermaid
flowchart TD
    DIMS["W, H, carcassD, plinth, doorsPerColumn, shell, envelope"] --> CSG["computeSketchGeometry ▢ (CabinetSketch.utils)"]
    CSG --> RECTS["viewBox + body/envelope/plinth rects + scale"]
    SKB["cabinetSketchBoards ▢ → role-tagged Board[]"] --> DRAW["CabinetSketch draws boards"]
    RECTS --> DRAW
    SKM["buildCabinetSketchModel ▢ → interior/fronts/layout props"] --> DRAW
    IG["computeInteriorGaps ▢ (clear openings)"] --> DRAW
    FP["cabinetFrontPanels"] --> FDRAW["CabinetFrontsSketch draws faces + hinge marks"]
    DRAW --> EMB["embedded mode → KitchenOverview / ProductElevation"]
```

- `computeSketchGeometry` owns the SVG **layout** (rects, scale, envelope-cap presence — parity-checked); `cabinetSketchBoards` owns the **role-tagged board set**; `buildCabinetSketchModel` owns the **interior + front layout props**. Three concerns, three functions, one picture.
- The same `CabinetSketch` renders standalone (single cabinet), embedded (kitchen overview), and as room elevation detail (`ProductElevation`).

---

## Cross-cutting: the input → everything fan-out

```mermaid
flowchart LR
    IN["CabinetInput + SavedCabinetState"] --> D["decompose + layout + doors + materials (§1)"]
    D --> C["Cut list (§9)"]
    D --> H["Hardware (§4)"]
    D --> F["Fronts (§3)"]
    D --> B["Boards (§2)"]
    B --> R2["2D bodies (§6)"]
    B --> R3["3D (§7)"]
    F --> R2F["2D fronts (§6)"]
    F --> R3
    B -.-> DXFX["DXF (§8 — absent)"]
    C -.-> DXFX
    style DXFX stroke-dasharray: 5 5
```
