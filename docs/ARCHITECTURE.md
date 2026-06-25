# ארכיטקטורה — Carpenter App

## טכנולוגיות

| כלי | תפקיד |
|-----|--------|
| React 19 + TypeScript | ממשק משתמש |
| Vite | dev server + bundler |
| Vitest | בדיקות יחידה |
| CSS Modules | סגנון מבודד לכל קומפוננטה |

## מבנה תיקיות

```
src/
├── types/
│   ├── geometry.ts     Box, BoxPosition, BoxLevel
│   ├── doors.ts        Door, Hinge, DoorById, DrawerFront, DrawerFrontById
│   ├── interior.ts     InteriorItem (Shelf + isManuallyPositioned/isFixedAboveExternals, Drawer, Rod), CellInteriorById
│   ├── cuts.ts         CutItem, CutGroup (כולל 'front' לחזיתות external drawers)
│   ├── materials.ts    Material, MaterialId, CustomMaterial
│   ├── hardware.ts     HardwareSpec, HardwareLineItem, FurnitureType
│   ├── cabinet.ts      CabinetInput + getShellSides() — single source לפיצול per-side shell
│   │                   שדות appliance-bay: hasFronts? hasBack? hasBottom? (ברירת מחדל true)
│   │                   כש-hasFronts=false: hasDoor:false לכל הדלתות → buildDoorCutItems מדלג (אין cut 'door')
│   │                   כש-hasBottom=false: דפנות מתארכות ל-H−t−LEVELER_GAP_CM (רגלי בונד)
│   │                   mount? ('base'|'wall', ברירת מחדל base): wall=קלפה → elevation + shelf-only.
│   │                   מטא-דאטה UI בלבד; לא משפיע על חישוב לוחות/חיתוכים
│   │                   כש-hasBack=false: אין לוח גב (אבל backThickness עדיין משמש ב-carcassD)
│   ├── edging.ts       Edging interface, DEFAULT_EDGING
│   ├── project.ts      Project (products[]) + ProductUnit + KitchenUnit + Cabinet + SavedCabinetState + SavedDoor/SavedHinge/SavedBoardOverride + BoxSlotId/DoorSlotKey
│   └── index.ts        re-exports
│
├── core/               לוגיקה טהורה — ללא React
│   ├── geometry/
│   │   ├── boxDecomposition.ts   decomposeBoxes — פיצול לגופים
│   │   └── frontGeometry.ts      computeRowFrontLayout / computeFrontGeometry — מקור יחיד לחישוב x+width של חזיתות
│   ├── boards/
│   │   ├── boardModel.ts         buildBoardModel / buildPlinthBoardModel / boardsToCutItems / deriveEnvelopeFlags / getDimension / getMaterial / boardStableId / computeCarcassDepth / computeInnerWidth (תומך {left,right}) / resolveCabinetJointMethod
│   │   └── boxMaterials.ts       resolveBoxMaterials — חומרי גוף/חזית/עובי-גב אפקטיביים פר-body (override ?? cabinet default); מקור יחיד לכל מסלולי בניית-הלוחות
│   ├── doors/
│   │   ├── doorCalc.ts           חישוב מספר דלתות + שורות
│   │   ├── doorUtils.ts          צירים, kindings, coversSkirt, calcMainDoorHeight, calcExternalStackHeight, getSkirtCoveringDrawer
│   │   └── drawerFrontsCalc.ts   deriveDrawerFronts
│   ├── cuts/
│   │   ├── cuttingList.ts        calcCuts (drawer-box parts; doors נגזרים ב-doorCuts, קורפוס ב-BoardModel)
│   │   ├── doorCuts.ts           buildDoorCutItems — חיתוכי דלת נגזרים מ-doorsById (single source)
│   │   ├── externalDrawerCuts.ts calcExternalDrawerFrontCuts
│   │   ├── mergeCutItems.ts      קיבוץ זוגות (top+bottom וכו') לפלט קומפקטי
│   │   └── sheetCalculator.ts    ספירת לוחות
│   ├── hardware/
│   │   └── calcHardware.ts       חישוב פרזולים מ-doors + interior + cellInterior
│   ├── interior/
│   │   ├── interiorUtils.ts      init/preserve, redistributeShelves, defaultDrawerPlacement, defaultRodPlacement, equalizeExternalDrawersIfOverflow
│   │   └── fixedShelfUtils.ts    syncFixedShelf — מדף קבוע מעל external drawers
│   ├── product/
│   │   ├── kitchenModules.ts     kitchenModuleInput/State — defaults למודולי drawers/shelves/sink/dishwasher/oven/pantry/wall/pantry-top/corner
│   │   ├── cornerModule.ts       isCorner/cornerFrontXLayout/cornerHingeSide/cornerFillerCutItems/cornerReturnBox — מקור יחיד לגאומטריית הפינה (cut/2D/3D)
│   │   ├── kitchenPlinth.ts      groupKitchenUnitsForPlinth / buildKitchenPlinthCuts / buildKitchenPlinthBoxes
│   │   ├── kitchenFootprint.ts   WALL_BOTTOM_CM + effectiveUnitDims/unitOuterW/isWallUnit/kitchenFootprint/kitchenElevationLayout (חולץ מ-KitchenOverview)
│   │   ├── cabinetSketchModel.ts buildCabinetSketchModel — props של CabinetSketch ממקור יחיד (UnitsView + ProductElevation)
│   │   ├── cabinetFronts.ts      cabinetFrontPanels → FrontPanel[] (door/drawer faces, floor-up) — מקור יחיד ל-CabinetFrontsOverlay (2D) ולמבט-חזית 3D
│   │   ├── cabinetSketchBoards.ts buildSketchBoards/cabinetSketchBoards → Board[] (לוחות-גוף ל-2D) — מקור יחיד ש-CabinetSketch.tsx צורך + רשת ה-parity מבקרת
│   │   └── cabinetBoards3D.ts    cabinetBoardBoxes/productBoardBoxes (carcass+פנים) + productFrontBoxes (חזיתות) → BoardBox3D[] (מקור למבט-3D המפורט)
│   ├── room/                     תצוגת חדר (floor plan) — core טהור
│   │   ├── productBounds.ts      productBounds → bounding box W×H×D · productSubBoxes → תיבות מקומיות 3D (לחזית + 3D)
│   │   └── roomGeometry.ts       snapToWall / placementRectTopView / placementAABB / clampCentreToRoom · placementSubBoxAABBs → RoomAABB[] (מקור: top/elevation/3D) · placementElevationRects (היטל חזית)
│   ├── pricing/
│   │   └── laborCalc.ts          אומדן עבודה (לא מחובר ל-UI)
│   ├── project/
│   │   ├── migrations.ts         CURRENT_SCHEMA_VERSION + migrate()
│   │   ├── serialize.ts          serializeProject + deserializeProject + validation
│   │   └── serialize.test.ts
│   ├── utils/                    עזרי עיגול
│   ├── cabinetCompute.ts         computeUnitCutsAndHardware — pure compute עבור unit; משמש ב-KitchenOverview לאגרגציה
│   └── index.ts                  re-exports
│
├── catalog/
│   ├── materials.ts              MATERIALS, getMaterial()
│   ├── materials.json            5 חומרי קטלוג
│   ├── materialCombiner.ts       getMaterialWithCustom / getCombinedMaterials / getEffectiveMaterial — שילוב catalog + custom
│   └── hardware/                 קטלוג פרזולים + presets.json
│
├── i18n/
│   ├── translations.ts           עברית + אנגלית
│   └── LanguageContext.tsx
│
├── styles/
│   └── theme.css
│
└── ui/
    ├── hooks/
    │   ├── useCabinet.ts         state יחיד של cabinet — calc + interior + doors + overrides (boxDimension/boxMaterial/bodyEdging/board)
    │   ├── useProject.ts         Project + products[] + kitchen units + localStorage save/load
    │   ├── useSettings.ts        AppSettings (customMaterials, enabled IDs per body/front, price overrides) — localStorage 'carpenter-settings-v2'
    │   └── useTranslation.ts
    ├── pages/
    │   └── SettingsPage.tsx      דף הגדרות מלא: לכל חומר checkbox (כלול/לא ב-dropdown) + מחיר + תוספת custom material
    └── components/
        ├── App.tsx               ניווט: project → (product | room) → kitchen unit
        ├── ProjectView.tsx       אזור חדרים + אזור products (הוספה/מחיקה/פתיחה)
        ├── RoomView.tsx          floor plan: toggle מבט-על/חזית/3D · מבט-על (snap מספרי + גרירה) · חזית (בחירת קיר + sub-boxes + גובה-מהרצפה)
        ├── RoomView3D.tsx        מבט תלת-ממד (react-three-fiber, lazy) · mesh לכל לוח מ-productBoardBoxes; toggle גופים/חזיתות (productFrontBoxes) · fallback: תיבה לכל sub-box · OrbitControls
        ├── AddProductDialog.tsx  בחירת סוג מוצר (wardrobe / bookcase / sideboard / kitchen / free-build)
        ├── KitchenEditor.tsx     ניהול kitchen units (הוסף/הסר/סדר)
        ├── KitchenOverview.tsx   תצוגה מאוחדת של units עם 4 טאבים (גופים/חזיתות/חיתוכים/פרזולים); UnitsView + UnitFrontPanelsStandalone overlay
        ├── CabinetForm.tsx       טופס cabinet יחיד; props אופציונליים hideMainDimensions/hideDoorsPerColumn/hideEnvelopeTop/splitShellSides ל-kitchen mode
        ├── CabinetSketch.tsx     סקיצת ארון — boards per body; embedded mode מצמצם viewBox ל-cabinet rect (לKitchenOverview)
        ├── CabinetCutSketch.tsx  per-body boards rendering
        ├── CabinetFrontsSketch.tsx סקיצת חזיתות (בעורך unit יחיד)
        ├── BoxBodySketch.tsx     סקיצת SVG לפנים גוף
        ├── BoxesList.tsx         רשימת קופסאות
        ├── BoxInteriorEditor.tsx עורך הגוף (לחיצה על גוף → ישירות לכאן). 4 לשוניות גופים/חזיתות/חיתוכים/פרזולים (2D+3D); overrides W/H/D + חומר גוף/חזית + עובי-גב פר-body + edging; עריכת פנים; hideRodOption ב-kitchen. `unitControls` — סקציית "הגדרות יחידה" (מטבח kitchenDirectEdit: מעטפת-צד/מרווח/קלפה/פינה, מחשבות-חי)
        ├── DoorEditor.tsx        עורך חזית (צירים, hasDoor, thickness override)
        ├── DoorsList.tsx         רשימת חזיתות
        ├── ExternalDrawerEditor.tsx מודאל מגירה חיצונית
        ├── PlinthEditor.tsx      עורך צוקל top-view (גרירת גיבלים, גובה, recess)
        ├── CutsList.tsx          רשימת חיתוכים מקובצת לפי חומר (מודע ל-custom materials)
        ├── HardwareList.tsx      רשימת פרזולים מצטברת
        └── [*.module.css]
```

## זרימת נתונים

```
CabinetForm (input) 
    → useCabinet.calculate(input)
        → decomposeBoxes()     → boxes: Box[]
        → calcDoors()          → doors: DoorCalcResult (row layout heights)
        → buildBoardModel()    → Board[] per body (every board carries stableId)
        → buildPlinthBoardModel() → Board[] (cabinet-level plinth)
        → boardsToCutItems(_, _, boardOverridesByStableId)
                               → cuts: CutItem[] (carcass + plinth, effective values)
        → door preservation    → doorsById: DoorById (width/height reflect box overrides)
        → buildDoorCutItems(doorsById) → cuts: CutItem[] (group 'door', single source)
        → interior preservation → interiorById: InteriorById
        → external drawer cuts → cuts (group 'front')
        → deriveDrawerFronts()  → drawerFrontsById: DrawerFrontById
        → cell interior preservation → cellInteriorById: CellInteriorById
        → partition preservation → partitionsById: Map<string,boolean>
        → CabinetResult { …, carcassD, innerW } — UI never re-derives these
    → setState → תצוגה מתעדכנת
```

### שכבת override ללוחות

```
useCabinet.setBoardDimensionOverride(stableId, key, value)
    → boardOverridesByStableId Map updated
    → calculate(lastInput) reruns
        → buildBoardModel emits derived boards (formulas unchanged)
        → boardsToCutItems applies overrides → effective CutItem dimensions
        → CutsList renders effective values
        → CabinetCutSketch + PlinthEditor read effective via getDimension / getMaterial
    → reset → derived restored, no rebuild needed
```

`Board.stableId` is the persistence key (e.g. `side-left@bottom:left`, `plinth-gable-a@joint:0`). `Board.id` is freshly generated each `calculate()` and is only safe as a React key.

### שכבת override לחומרי גוף (per-body material)

`boxMaterialOverrides` (keyed by `BoxSlotId`) עוקף את חומר הגוף/החזית + עובי-הגב לגוף בודד. `useCabinet.setBoxMaterial(slotId, patch)` → ref+state → `calculate()` רץ. בכל מסלולי בניית-הלוחות (cut/2D/3D) הגוף נפתר דרך `resolveBoxMaterials(box, input, overrides, customMaterials)` (מקור יחיד) → `buildBoardModel` מקבל את החומר האפקטיבי; חיתוכי הדלת/מגירה-חיצונית/מילוי-פינה/מחיצה מתויגים בחומר-החזית של הגוף. ה-shell וה-carcassD המשותפים נשארים על חומר-החזית של הארון (מעטפת אחת). מסך הגוף (`BodyView`) מציג טאבים (גופים/חזיתות/חיתוכים/פרזולים) שמחושבים על הגוף **כיחידה עצמאית**.

## ממשקים מרכזיים

### Box
```typescript
interface Box {
  id: string;            // box_0, box_1, ... (מתאפס בכל calculate)
  W, H, D: number;       // ס"מ
  position: BoxPosition; // "single" | "left" | "right" | "unit_N"
  level: BoxLevel;       // "single" | "bottom" | "middle" | "top" | "plinth"
  unitIndex?: number;    // לפיצולי unit_N
  internalShelves?: number[];      // גבהים מוחלטים של מדפים מבניים
  hasInternalPartitions?: boolean; // מחיצות אנכיות בין חזיתות
}
```

### Door
```typescript
interface Door {
  id: string;         // doorId = makeDoorId(boxId, frontIndex)
  boxId: string;
  frontIndex: number; // 0-based — איזו חזית בגוף (לגוף עם numFronts>1)
  height, width: number; // ס"מ — מידות הלוח הפיזי
  hingeSide: 'left' | 'right';
  hingeCount: 2 | 3 | 4 | 'auto';
  hinges: Hinge[];
  hasDoor: boolean;
  coversSkirt: boolean;
  gapMm: number;
  thicknessOverride?: MaterialId;
}
```

### InteriorItem
```typescript
type InteriorItem = ShelfItem | DrawerItem | RodItem;
// כולם: { id, type, heightFromFloor }
// ShelfItem גם: { isManuallyPositioned?: boolean }  ← true לאחר גרירה/שינוי ידני
// DrawerItem גם: { drawerHeight, mount, frontThicknessOverride? }
//   - mount: 'internal' (רגיל) | 'external' (עם חזית עצמאית בקדמת הארון)
//   - frontThicknessOverride?: MaterialId — דריסת עובי לחזית external (כמו thicknessOverride של Door)

// תאים (גוף עם מחיצה):
type CellInteriorById = Record<string, InteriorItem[][]>;
// מפתח = Box.id, ערך = [rightCellItems, leftCellItems]
```

### ShelfWarning — אזהרות חלוקת מדפים
```typescript
type ShelfWarning =
  | { kind: 'small_zone' }                                                    // פער <25 ס"מ בין פריטים סמוכים
  | { kind: 'rod_low'; rodHeight: number; rodId: string }                     // מוט <80 ס"מ
  | { kind: 'rod_drawer_close'; gap: number; rodId: string; drawerId: string }; // gap <70 בין מגירה למוט
```
מופקות ע"י `redistributeShelves`, `defaultDrawerPlacement`, `defaultRodPlacement`. מוצגות כבאנר בעורך הפנים (`boxShelfWarnings`, `cellShelfWarnings`).

### חתימות פונקציות placement (כולן מחזירות `{ item, warnings }`)
```typescript
redistributeShelves(items, containerH, shelfThickness=1.8)
  → { items: InteriorItem[]; warnings: ShelfWarning[] }
addShelfRedistributed(items, containerH)
  → { items: InteriorItem[]; warnings: ShelfWarning[] }
defaultDrawerPlacement(existingItems, bodyH, drawerH=20)
  → { drawer: DrawerItem; warnings: ShelfWarning[] }
defaultRodPlacement(bodyH, existingItems)
  → { rod: RodItem; warnings: ShelfWarning[] }
```

### Helpers פנימיים ב-`interiorUtils.ts`
- `roundCm(h)` — עיגול ל-1 ספרה עשרונית. מיושם בכל פלט של פונקציות placement.
- `findLowestRod(items)` — מחזיר את המוט הנמוך ביותר (לחישוב hanger).
- `findDrawerJustBelowRod(items, rodH)` — מחזיר את המגירה עם ראש הכי גבוה מתחת למוט.
- `physicalZone(item, shelfThickness)` — אזור פיזי של פריט: מדף=[h,h+1.8], מגירה=[h,h+dH], מוט=[h-1.5,h+1.5].
- `hasSmallGap(items, shelfThickness)` — True אם יש זוג פריטים סמוכים בפער 0<gap<25 ס"מ.
- קבועים: `HANGER_DROP=80`, `HANGER_MIN_GAP=70`, `MIN_AUTO_SHELF_ZONE=25`, `ROD_CEILING_CLEARANCE=10`.

### External drawers — ליבה ב-`core/doors/doorUtils.ts`
- `getExternalDrawers(items)` — סינון + מיון לפי `heightFromFloor` עולה (נמוך ראשון).
- `calcExternalStackHeight(items, gapMm)` — `sum(drawerHeights) + N × gapCm` (גובה ערימת חזיתות + רווח מעל כל אחת).
- `calcMainDoorHeight(boxH, items, gapMm, hasBottomGap, hasTopGap)` — `getDoorHeight(...) − calcExternalStackHeight(...)`. יכול להחזיר ≤0.
- `validateMainDoorHeight(h)` → `'main_door_absent' | 'main_door_too_short' | null`.
- `isExternalDrawer(item)` — type-guard.
- `cellIndexToFrontIndex(cellIndex, numFronts)` — מיפוי תא→frontIndex.
- `getSkirtCoveringDrawer(items, mainDoorCoversSkirt)` — המגירה הנמוכה ביותר שמקבלת `coversSkirt` במקום הדלת.
- `getDrawerFrontThicknessCm(drawer, globalFrontMaterialId)` — עובי חזית מגירה ב-cm (עם override רק ל-external).
- `deriveDrawerFronts(input)` — מייצר `DrawerFrontById` מ-(boxes, interiorById, cellInteriorById, partitionsById, numFrontsPerBox, doorCoversPlinth, doorGapMm, tBody). חישוב פוזיציה לפי `positionFromBoxBottom` עולה.
- `getDrawerFrontVisualHeight(front, plinthH)` — מקביל ל-`getDoorVisualHeight`: מוסיף `(plinth-1) + gapCm` כשה-front יורש `coversSkirt`.
- `externalStackChanged`, `externalStackSignature`, `getItemsForFront` — נחשפים גם ל-`useCabinet` (חיווט mount-toggle detection).
- קבועים: `MIN_COMFORTABLE_MAIN_DOOR_H_CM=10`.

### External drawer cuts — `core/cuts/externalDrawerCuts.ts`
- `calcExternalDrawerFrontCuts(items, frontWidthCm, gapMm, plinthCm, mainDoorCoversSkirt, frontThicknessMm, perDrawerThicknessMm?)` → `CutItem[]`
- מייצר `CutItem` אחד לכל external drawer, בקבוצה `'front'`, עם `note` עובי ב-mm.
- המגירה הנמוכה ביותר מקבלת קיצור חזית עם `coversSkirt` (אם הדלת המקורית הייתה skirt-cover).
- נצרך ב-`useCabinet.calculate()` (2.1) ומצרף את ה-cuts לפלט.

## Project schema & migrations

תשתית `cloud-readiness` — שמירה/טעינה של ארון שלם כ-JSON עם schema גרסאי. עדיין לא מחוברת ל-UI; מוכנה לפיצ'ר "שמירה בענן" עתידי.

### מבנה Project

```typescript
interface Project {
  schemaVersion: number;     // הגרסה שכותב הקוד הנוכחי = CURRENT_SCHEMA_VERSION (1)
  projectName?: string;
  createdAt?: string;        // ISO 8601 — נקבע ב-serialize הראשון
  updatedAt?: string;        // ISO 8601 — מתעדכן בכל serialize
  cabinet: Cabinet;
}

interface Cabinet {
  input: CabinetInput;          // ערכי הטופס שמזינים את calculate
  state: SavedCabinetState;     // בחירות משתמש לאחסון יציב
}

interface SavedCabinetState {
  interior:               Record<BoxSlotId, InteriorItem[]>;
  cellInterior:           Record<BoxSlotId, InteriorItem[][]>;
  partitions:             Record<BoxSlotId, boolean>;
  doors:                  Record<DoorSlotKey, SavedDoor>;
  plinthGableOverrides:   Record<string, number>;          // by PlinthGable.id
  boardOverrides:         Record<string, SavedBoardOverride>; // by Board.stableId
  bodyEdgingOverrides?:   Record<BoxSlotId, Edging>;       // per-body edging
  doorEdgingOverrides?:   Record<DoorSlotKey, Edging>;     // per-door edging
  boxDimensionOverrides?: Record<BoxSlotId, { W?: number; H?: number; D?: number }>;
  boxMaterialOverrides?:  Record<BoxSlotId, { bodyMaterialId?: MaterialId; frontMaterialId?: MaterialId; backThicknessCm?: number }>; // per-body material (resolveBoxMaterials)
}
```

**`CabinetInput`** (`types/cabinet.ts`) — שדות עיקריים:
`W, H, D, backThickness, hasShell, hasShellLeft?, hasShellRight?, hasEnvelopeTop, bodyMaterialId, frontMaterialId, plinth, plinthRecess, doorCoversPlinth, lowerDoorH?, middleDoorH?, doorsPerColumn, doorGapMm, maxDoorWidth, edging?, topVariant?, sinkTraverseWidthCm?`

`getShellSides(input)` → `{ left, right }` — single source לפיצול per-side shell (fallback ל-`hasShell` אם השדות המפוצלים undefined).

### Project → multiple products + kitchen units

```typescript
interface Project {
  schemaVersion: number;
  projectName?: string;
  createdAt?: string;
  updatedAt?: string;
  products: ProductUnit[];        // ← לא cabinet יחיד; רשימת מוצרים
}

interface ProductUnit {
  id: string;
  name: string;
  productType: 'wardrobe' | 'bookcase' | 'sideboard' | 'kitchen' | 'free-build';
  cabinet: Cabinet;                              // ל-non-kitchen
  kitchenUnits?: KitchenUnit[];                  // רק ל-productType='kitchen'
}

interface KitchenUnit {
  id: string;
  name: string;
  moduleType: 'drawers' | 'shelves' | 'sink';
  cabinet: Cabinet;
}
```

`SavedDoor` כוללת רק את מה שהמשתמש בחר (`hingeSide`, `hingeCount`, `hinges[]`, `hasDoor`, `thicknessOverride?`). שדות נגזרים (`height`, `width`, `coversSkirt`, `gapMm`) משוחזרים ב-`calculate()`. `SavedHinge` שומרת רק `positionFromBottom` ו-`isManual` — ה-`id` מיוצר מחדש ע"י `newItemId()` ב-deserialize (זהות hinge פנימית לדלת בלבד).

### Serialize / Deserialize

```typescript
serializeProject(project: Project): string
  → JSON.stringify(project עם updatedAt=now, createdAt=now אם חסר)

deserializeProject(json: string): Project
  → JSON.parse → migrate → validateProject → Project
```

שניהם **טהורים**, ללא תלות ב-React/UI. `serializeProject` לא mutate את ה-input.

### ולידציה ב-deserialize

`validateProject` בודק:
- `schemaVersion` שווה ל-`CURRENT_SCHEMA_VERSION` אחרי migrate.
- `cabinet` הוא object.
- כל מפתחות `REQUIRED_INPUT_KEYS` קיימים ב-`cabinet.input` עם types נכונים (numbers, booleans, strings; `doorsPerColumn ∈ {'auto',1,2,3}`).
- `lowerDoorH` / `middleDoorH` — אם קיימים, חייבים להיות numbers (excluded מ-`REQUIRED_INPUT_KEYS` כי `JSON.stringify` מפיל `undefined` ו-`number | undefined` הוא הטיפוס).
- כל שש המפות ב-`cabinet.state` קיימות וכל אחת היא plain object (לא array, לא null).

ולידציה רדודה מודעת — תוכן `InteriorItem`/`SavedDoor` לא נבדק בעומק; פגמים פנימיים ייתפסו מאוחר יותר ב-`calculate()`. בהמשך schemaVersion bumps אפשר להחמיר.

### Migration framework

`core/project/migrations.ts`:
- `CURRENT_SCHEMA_VERSION = 1` — גרסת הקוד הנוכחית.
- `migrations: Record<number, Migration>` — registry של מעברי גרסה (כרגע ריק).
- `migrate(data: unknown): Project` — מריץ migrations ב-order מ-`data.schemaVersion` עד `CURRENT_SCHEMA_VERSION`. זורק:
  - `non-null object` נדרש.
  - `schemaVersion` חייב להיות `Integer ≥ 1`.
  - גרסה גדולה מ-`CURRENT` (קוד ישן מנסה לפתוח קובץ חדש) → שגיאה ברורה.
  - שלב חסר ב-registry → שגיאה.

הוספת גרסה חדשה: bump `CURRENT_SCHEMA_VERSION`, הוסף entry ב-`migrations[oldVersion]` שמחזיר את האובייקט במבנה החדש.

### Boundary-free design

`serialize.ts` מתעסק רק ב-`Project ↔ JSON`. הוא **לא** מטפל בהמרת Map↔Object של state ה-runtime ב-`useCabinet` (שיש בו `partitionsById`, `plinthGableOverrides`, `boardOverridesByStableId` כ-Maps). ה-bridge הזה ייבנה בנפרד כשנחבר לפיצ'ר שמירה אמיתי — ראה DECISIONS_LOG 2026-05-29.

## עקרונות ארכיטקטוניים

1. **הפרדה מלאה**: `core/` לא יודע מ-React. components לא מחשבים.
2. **Single source of truth**: `useCabinet` הוא המקור היחיד. אין state כפול.
3. **Derived state**: חישוב on-the-fly, לא אחסון תוצאות ביניים.
4. **זהות יציבה**: `Box.id` מתאפס בכל `calculate()`. `boxStableKey(box)` = `"level:position"` משמש לשימור interior/doors/partitions בין חישובים.
5. **JSON-driven catalog**: חומרים ופרזולים ב-JSON. שינוי מחיר/עובי — ערוך JSON בלבד.

## תלויות חיצוניות

אין. הפרויקט לא תלוי בספריות צד שלישי מעבר ל-React ו-Vite.
