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
├── types/              הגדרות TypeScript (ממשקים, סוגים)
│   ├── geometry.ts     Box, Dimensions, BoxPosition, BoxLevel
│   ├── doors.ts        Door, Hinge, DoorById, DrawerFront, DrawerFrontById
│   ├── interior.ts     InteriorItem, ShelfItem (+ isManuallyPositioned), DrawerItem, RodItem, CellInteriorById
│   ├── cuts.ts         CutItem, CutGroup, SheetUsage
│   ├── materials.ts    Material, MaterialId
│   ├── hardware.ts     HardwareSpec, HardwareLineItem, FurnitureType
│   ├── cabinet.ts      CabinetInput (16 form values שמזינים את calculate)
│   ├── project.ts      Project, Cabinet, SavedCabinetState, SavedDoor, SavedHinge, SavedBoardOverride, BoxSlotId, DoorSlotKey, APP_DEFAULTS
│   └── index.ts        re-exports מרכזי
│
├── core/               לוגיקה טהורה — ללא React, ניתנת לבדיקה
│   ├── geometry/
│   │   ├── boxDecomposition.ts   פיצול ארון לגופים פיזיים
│   │   └── frontGeometry.ts      מקור יחיד לחישוב x ו-width של כל החזיתות (ברמת הארון)
│   ├── boards/
│   │   └── boardModel.ts         מודל פיזי של לוחות הגוף; buildBoardModel, buildPlinthBoardModel, boardsToCutItems, deriveEnvelopeFlags, getDimension, getMaterial, boardStableId, computeCarcassDepth, computeInnerWidth
│   ├── doors/
│   │   ├── doorCalc.ts           חישוב מספר דלתות ושורות
│   │   ├── doorUtils.ts          צירים, כיוון, coversSkirt, getDoorHeight, derivation helpers
│   │   └── drawerFrontsCalc.ts   deriveDrawerFronts — בונה DrawerFront מ-frontGeometry layout
│   ├── cuts/
│   │   ├── cuttingList.ts        חישוב רשימת חיתוכים (calcCuts) — משתמש ב-frontGeometry
│   │   ├── externalDrawerCuts.ts חיתוכי חזיתות מגירות חיצוניות
│   │   └── sheetCalculator.ts    ספירת לוחות (sheetsNeeded)
│   ├── interior/
│   │   └── interiorUtils.ts      init/preserve/validate; redistributeShelves; addShelfRedistributed
│   ├── pricing/
│   │   └── laborCalc.ts          אומדן שעות עבודה (לא מחובר לUI עדיין)
│   ├── project/
│   │   ├── migrations.ts         CURRENT_SCHEMA_VERSION, migrate(), Migration registry
│   │   ├── serialize.ts          serializeProject + deserializeProject + validation
│   │   └── serialize.test.ts     round-trip + migration + validation tests
│   └── index.ts                  re-exports מ-core
│
├── catalog/            נתוני חומרים ופרזולים (JSON-driven)
│   ├── materials.ts    getMaterial(), MATERIALS
│   ├── materials.json  נתוני חומרי גלם (5 סוגים)
│   └── hardware/       קטלוג פרזולים + presets.json
│
├── i18n/
│   └── translations.ts עברית + אנגלית; ממשק Translations מוקלד
│
├── styles/
│   └── theme.css       משתני CSS גלובליים (צבעים, ריווח, פונטים)
│
└── ui/
    ├── hooks/
    │   ├── useCabinet.ts     ה-hook המרכזי — כל state הארון (כולל cellInteriorById, addPartition/removePartition/setCellItems)
    │   └── useTranslation.ts גישה לתרגומים
    └── components/
        ├── CabinetForm.tsx         טופס קלט + תיאום ראשי
        ├── BoxesList.tsx           רשימת פיצול לקופסאות
        ├── BoxInteriorEditor.tsx   עורך פנים גוף
        ├── BoxBodySketch.tsx       סקיצת SVG לפנים גוף
        ├── CabinetSketch.tsx       סקיצת ארון חיה (תצוגת חתך: boards per body)
        ├── CabinetCutSketch.tsx    רנדור per-body של boards (לוחות פיזיים) דרך SVG
        ├── CabinetFrontsSketch.tsx סקיצת חזיתות
        ├── DoorEditor.tsx          עורך חזית (צירים)
        ├── DoorsList.tsx           רשימת חזיתות (כולל drawer fronts עם תיוג "(מגירה)")
        ├── ExternalDrawerEditor.tsx מודאל עריכת מגירה חיצונית (גובה, override, מחיקה)
        └── [*.module.css]          סגנונות מבודדים
```

## זרימת נתונים

```
CabinetForm (input) 
    → useCabinet.calculate(input)
        → decomposeBoxes()     → boxes: Box[]
        → calcCuts()           → cuts: CutItem[] (doors + drawer-box)
        → calcDoors()          → doors: DoorCalcResult
        → buildBoardModel()    → Board[] per body (every board carries stableId)
        → buildPlinthBoardModel() → Board[] (cabinet-level plinth)
        → boardsToCutItems(_, _, boardOverridesByStableId)
                               → cuts: CutItem[] (carcass + plinth, effective values)
        → door preservation    → doorsById: DoorById
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
  input: CabinetInput;          // 16 ערכי הטופס שמזינים את calculate
  state: SavedCabinetState;     // בחירות משתמש לאחסון יציב
}

interface SavedCabinetState {
  interior:               Record<BoxSlotId, InteriorItem[]>;
  cellInterior:           Record<BoxSlotId, InteriorItem[][]>;
  partitions:             Record<BoxSlotId, boolean>;
  doors:                  Record<DoorSlotKey, SavedDoor>;
  plinthGableOverrides:   Record<string, number>;          // by PlinthGable.id
  boardOverrides:         Record<string, SavedBoardOverride>; // by Board.stableId
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
