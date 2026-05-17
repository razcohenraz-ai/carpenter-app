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
│   ├── doors.ts        Door, Hinge, DoorById
│   ├── interior.ts     InteriorItem, ShelfItem (+ isManuallyPositioned), DrawerItem, RodItem, CellInteriorById
│   ├── cuts.ts         CutItem, CutGroup, SheetUsage
│   ├── materials.ts    Material, MaterialId
│   ├── hardware.ts     HardwareSpec, HardwareLineItem, FurnitureType
│   ├── project.ts      Project, CabinetUnit (לעתיד)
│   └── index.ts        re-exports מרכזי
│
├── core/               לוגיקה טהורה — ללא React, ניתנת לבדיקה
│   ├── geometry/
│   │   └── boxDecomposition.ts   פיצול ארון לגופים פיזיים
│   ├── doors/
│   │   ├── doorCalc.ts           חישוב מספר דלתות ושורות
│   │   └── doorUtils.ts          צירים, כיוון, coversSkirt, getDoorWidth/Height
│   ├── cuts/
│   │   ├── cuttingList.ts        חישוב רשימת חיתוכים (calcCuts)
│   │   └── sheetCalculator.ts    ספירת לוחות (sheetsNeeded)
│   ├── interior/
│   │   └── interiorUtils.ts      init/preserve/validate; redistributeShelves; addShelfRedistributed
│   ├── pricing/
│   │   └── laborCalc.ts          אומדן שעות עבודה (לא מחובר לUI עדיין)
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
        ├── BoxThumbnail.tsx        מיניאטורת גוף
        ├── CabinetSketch.tsx       סקיצת ארון חיה
        ├── CabinetFrontsSketch.tsx סקיצת חזיתות
        ├── DoorEditor.tsx          עורך חזית (צירים)
        ├── DoorsList.tsx           רשימת חזיתות
        ├── DoorThumbnail.tsx       מיניאטורת חזית
        └── [*.module.css]          סגנונות מבודדים
```

## זרימת נתונים

```
CabinetForm (input) 
    → useCabinet.calculate(input)
        → decomposeBoxes()     → boxes: Box[]
        → calcCuts()           → cuts: CutItem[]
        → calcDoors()          → doors: DoorCalcResult
        → door preservation    → doorsById: DoorById
        → interior preservation → interiorById: InteriorById
        → cell interior preservation → cellInteriorById: CellInteriorById
        → partition preservation → partitionsById: Map<string,boolean>
    → setState → תצוגה מתעדכנת
```

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
- קבועים: `MIN_COMFORTABLE_MAIN_DOOR_H_CM=10`.

### External drawer cuts — `core/cuts/externalDrawerCuts.ts`
- `calcExternalDrawerFrontCuts(items, frontWidthCm, gapMm, plinthCm, mainDoorCoversSkirt, frontThicknessMm, perDrawerThicknessMm?)` → `CutItem[]`
- מייצר `CutItem` אחד לכל external drawer, בקבוצה `'front'`, עם `note` עובי ב-mm.
- המגירה הנמוכה ביותר מקבלת קיצור חזית עם `coversSkirt` (אם הדלת המקורית הייתה skirt-cover).
- **שלב 1**: הפונקציה זמינה אך עדיין לא קרואה מ-`useCabinet`.

## עקרונות ארכיטקטוניים

1. **הפרדה מלאה**: `core/` לא יודע מ-React. components לא מחשבים.
2. **Single source of truth**: `useCabinet` הוא המקור היחיד. אין state כפול.
3. **Derived state**: חישוב on-the-fly, לא אחסון תוצאות ביניים.
4. **זהות יציבה**: `Box.id` מתאפס בכל `calculate()`. `boxStableKey(box)` = `"level:position"` משמש לשימור interior/doors/partitions בין חישובים.
5. **JSON-driven catalog**: חומרים ופרזולים ב-JSON. שינוי מחיר/עובי — ערוך JSON בלבד.

## תלויות חיצוניות

אין. הפרויקט לא תלוי בספריות צד שלישי מעבר ל-React ו-Vite.
