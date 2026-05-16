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
│   ├── interior.ts     InteriorItem, ShelfItem, DrawerItem, RodItem
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
│   │   └── interiorUtils.ts      init/preserve/validate פריטים פנימיים
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
    │   ├── useCabinet.ts     ה-hook המרכזי — כל state הארון
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
// DrawerItem גם: { drawerHeight }
```

## עקרונות ארכיטקטוניים

1. **הפרדה מלאה**: `core/` לא יודע מ-React. components לא מחשבים.
2. **Single source of truth**: `useCabinet` הוא המקור היחיד. אין state כפול.
3. **Derived state**: חישוב on-the-fly, לא אחסון תוצאות ביניים.
4. **זהות יציבה**: `Box.id` מתאפס בכל `calculate()`. `boxStableKey(box)` = `"level:position"` משמש לשימור interior/doors/partitions בין חישובים.
5. **JSON-driven catalog**: חומרים ופרזולים ב-JSON. שינוי מחיר/עובי — ערוך JSON בלבד.

## תלויות חיצוניות

אין. הפרויקט לא תלוי בספריות צד שלישי מעבר ל-React ו-Vite.
