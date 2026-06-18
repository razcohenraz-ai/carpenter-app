---
name: add-module
description: >
  Use when adding a new product MODULE — a preset cabinet-body type that appears
  in a product's module picker (e.g. kitchen's drawers/shelves/sink/dishwasher/oven,
  or future modules for wardrobe/bookcase/sideboard/free-build). Guides the full
  cross-product recipe: module-type registration, input + state factories, editor
  UI wiring, i18n, tests, and docs. Product-agnostic — works on any product type,
  not just kitchen. Trigger phrases: "מודול חדש", "להוסיף מודול", "add a module",
  "גוף חדש למטבח/לארון".
---

# הוספת מודול מוצר (product-agnostic)

מודול = **preset של גוף** (`CabinetInput` + `SavedCabinetState`) שמופיע ב-picker של
עורך המוצר. הנגר בוחר אותו, מקבל גוף מוכן, וממשיך לערוך. הסקיל הזה מקודד את
התבנית המלאה — זהה לכל המוצרים, רק המיקומים והאילוצים משתנים.

> **עיקרון מנחה (DESIGN_PRINCIPLES):** single source of truth, חישוב on-the-fly,
> הפרדת core/ui, והחופש בידי הנגר — כל ברירת מחדל ניתנת ל-override.

---

## שלב 0 — אוריינטציה (חובה לפני קוד)

1. קרא `docs/PROJECT_CONTEXT.md` (Quick orientation) + `docs/DESIGN_PRINCIPLES.md`.
2. קרא `docs/CARPENTRY_RULES.md` — סעיף הכללים של סוג המודול (boards / fronts /
   drawers / shelves / shell / plinth / appliance bays).
3. אם המודול משנה `CabinetInput`/`SavedCabinetState` — קרא `docs/ARCHITECTURE.md`.

**גודל המשימה:** מודול שמשתמש בדגלים קיימים = משימה בינונית (נכנס אוטומטית לכל
התצוגות — כולל תצוגת ה-3D של החדר — דרך אותו single source). מודול שדורש שדה
חדש ב-`CabinetInput` או דגל חדש ב-`buildBoardModel` = משימה גדולה: גע ב-core +
טסטים + ARCHITECTURE, ו**הַשְׁחֵל את הדגל בכל שלושת אתרי בניית-הלוחות** (ראה
Gotcha #8) — `useCabinet` (חיתוכים), `CabinetSketch` (2D), `cabinetBoards3D` (3D).

---

## שלב 1 — אבחון: לאיזה מוצר, ויש לו בכלל מערכת מודולים?

### מפת מוצר → מערכת מודולים

| מוצר | registry (type union + factories) | עורך UI | מפת רוחב | i18n |
|------|-----------------------------------|---------|----------|------|
| **kitchen** | `src/core/product/kitchenModules.ts` | `src/ui/components/KitchenEditor.tsx` | `KITCHEN_DEFAULT_W` | `t.project.kitchenModules` |
| wardrobe / bookcase / sideboard / free-build | *(עדיין אין — ראה "Bootstrap")* | — | — | — |

- **למוצר שכבר יש מערכת** (כיום: רק kitchen) → לך ישר לשלב 2.
- **למוצר ללא מערכת** → קודם בצע את ה-**Bootstrap** למטה, ואז שלב 2.

> כשנוסיף מודולים למוצר שני — **עדכן את הטבלה הזו** (שורה חדשה). אם מתחיל להיות
> שכפול אמיתי בין `<product>Modules.ts` קבצים, זה הטריגר לרפקטר ל-`ProductModule`
> registry גנרי (תועד ב-`docs/DECISIONS_LOG.md` 2026-06-10). עד אז — YAGNI.

### Bootstrap (רק למוצר חדש ללא מערכת מודולים)

1. צור `src/core/product/<product>Modules.ts` במבנה של `kitchenModules.ts`:
   `<Product>ModuleType` union, `<PRODUCT>_DEFAULTS`, `<product>ModuleInput(type, w?)`,
   `<product>ModuleState(type)`.
2. הוסף ל-`useProject.ts` פונקציות `add<Product>Unit / remove / update / reorder`
   (במקביל ל-`addKitchenUnit` ...), ושמור `units` תחת המוצר.
3. צור עורך `<Product>Editor.tsx` (במקביל ל-`KitchenEditor.tsx`) + חבר ב-`App.tsx`
   ברמת הניווט המתאימה.
4. הוסף `t.project.<product>Modules` ב-he ו-en.
5. עדכן `docs/ARCHITECTURE.md` (קובץ registry חדש) + `docs/PROJECT_CONTEXT.md`.

זו משימה גדולה — אם המשתמש לא ביקש במפורש מערכת חדשה, **עצור ושאל** לפני Bootstrap.

---

## שלב 2 — המתכון האוניברסלי (7 נקודות עריכה)

> דוגמאות הקוד מתייחסות ל-kitchen; החלף `kitchen`/`KITCHEN` בשם המוצר בפועל.

### 2.1 — רישום ה-type
`<product>Modules.ts` — הוסף ל-union:
```ts
export type KitchenModuleType = 'drawers' | 'shelves' | 'sink' | 'dishwasher' | 'oven' | 'NEW';
```

### 2.2 — factory ל-input (`<product>ModuleInput`)
החזר `CabinetInput`. התחל מ-`{ ...DEFAULTS, W }` והוסף רק את מה ששונה:
```ts
const defaultW = type === 'sink' ? 80 : type === 'dishwasher' ? 64 : 60;
const base: CabinetInput = { ...KITCHEN_DEFAULTS, W: w ?? defaultW };
if (type === 'NEW') return { ...base, /* רק השדות החריגים */ };
```
- רוחב ברירת מחדל **ניתן ל-override** דרך הפרמטר `w` (החופש בידי הנגר).
- אל תכפיל ערכים שכבר ב-DEFAULTS.

### 2.3 — factory ל-state (`<product>ModuleState`)
החזר `SavedCabinetState`. ה-slot key לגוף יחיד = `'single:single'` (= `boxStableKey`).
```ts
if (type === 'NEW') return {
  ...emptyBase,
  interior: { 'single:single': [ /* ShelfItem / DrawerItem ... */ ] },
};
```
מודול ריק (כיור/אפליאנס) → החזר `emptyBase`.

### 2.4 — רישום ב-UI
`<Product>Editor.tsx`:
```ts
const KITCHEN_MODULES: KitchenModuleType[] = [..., 'NEW'];
const KITCHEN_DEFAULT_W: Record<KitchenModuleType, number> = { ..., NEW: 60 };
```

### 2.5 — i18n
`src/i18n/translations.ts` — **גם he וגם en** (אחרת המפתח יוצג כ-fallback גולמי):
```ts
// he (~שורה 295):  kitchenModules: { ..., NEW: 'שם בעברית' }
// en (~שורה 555):  kitchenModules: { ..., NEW: 'English name' }
```

### 2.6 — טסטים
`src/core/product/<product>Modules.test.ts` — הוסף `describe` בתבנית הקיימת:
- `Input`: W ברירת מחדל, override של W, השדות החריגים, ירושה מ-DEFAULTS.
- `State`: צורת ה-interior (כמה items, מאיזה סוג), או interior ריק.
- אם המודול משפיע על צוקל/קיבוץ → הוסף תרחיש ל-`kitchenPlinth.test.ts`.

### 2.7 — docs
ראה שלב 5.

---

## שלב 3 — בנק אבני בניין (דפוסים מוכחים בפרויקט)

שלוף מכאן במקום להמציא מחדש. כל הקבועים/דגלים כבר קיימים.

### דגלי "תא אפליאנס" — `src/types/cabinet.ts`
| דגל | ברירת מחדל | `false` עושה |
|-----|-----------|--------------|
| `hasFronts?` | `true` | אין חזיתות/דלתות: מסנן `group:'door'`/`'front'`, `hasDoor:false`. **מגירות חיצוניות לא מושפעות** (ראה gotcha). |
| `hasBack?` | `true` | אין לוח גב. `backThickness` עדיין נכנס לנוסחת carcassD (הדפנות שומרות עומק). |
| `hasBottom?` | `true` | אין תחתון; הדפנות מתארכות עד הרצפה פחות `LEVELER_GAP_CM`. |

### צוקל
- `plinth: 0` → היחידה **מקטעת** את ריצת הצוקל של המטבח אוטומטית
  (`plinthKeyOf` מחזיר `null` ב-`kitchenPlinth.ts`). אין צורך בקוד נוסף.
- `LEVELER_GAP_CM = 0.6` (`boardModel.ts`) — קיצור על bond-רגל פלסטיק. מוחל
  אוטומטית כש-`hasBottom=false` ולצוקל. אל תחשב ידנית.

### מדף קבוע מעל מגירות חיצוניות
`isFixedAboveExternals: true` על `ShelfItem`. הגובה מסונכרן ב-`syncFixedShelf` /
`calcFixedShelfHeight` (`core/interior/fixedShelfUtils.ts`).

### הסתרת כפתורי עריכה פנימיים
מודול אפליאנס (גוף שהנגר לא אמור למלא ידנית) → ב-`CabinetForm.tsx` התנאי
`initialInput?.hasFronts === false` מעביר `hideInteriorControls` ל-`BoxInteriorEditor`
(מעלים "+ מדף / + מגירה / + מחיצה").

### top variant
`topVariant: 'sink-open'` → ללא לוח עליון, שני traverse boards (כיור). אל תשנה
top אלא אם המודול דורש זאת.

---

## שלב 4 — גזירת גאומטריה (שיטה, לא לנחש)

`bodyH = H − plinth`, `t = עובי גוף (מ"מ/10)`, `gap = doorGapMm/10`.

**כשהמשתמש נותן חלל יעד** (כמו "59 ס"מ לתנור"), גזור לאחור:
```
bottom of top board = bodyH − t
top of (drawer stack | shelf) = cavity מהקצה התחתון
drawerHeight = (bodyH − t) − cavity            // לתנור: 80 − 1.8 − 59 = 19.2
shelf.hff (תחתית מדף) = roundCm(topOfStack − t) // 19.2 − 1.8 = 17.4
```
תמיד **כתוב את הוכחת המספרים בהערה** ליד ה-state (כמו ב-oven ב-`kitchenModules.ts`),
כדי שהבא יבין מאיפה הגיעו 19.2/17.4.

---

## שלב 5 — תיעוד (לפני commit)

| קובץ | מתי לעדכן |
|------|-----------|
| `CHANGELOG.md` `[Unreleased]` | תמיד — קטגוריית **נוסף** |
| `docs/CARPENTRY_RULES.md` | מידות/כללים נגריים של המודול |
| `docs/GLOSSARY.md` | מונח חדש (שם המודול, דגל חדש) |
| `docs/PROJECT_CONTEXT.md` | רשימת המודולים הפעילים של המוצר |
| `docs/ARCHITECTURE.md` | רק אם נוסף שדה ל-`CabinetInput` / קובץ registry |
| `docs/DECISIONS_LOG.md` | רק אם הייתה החלטה ארכיטקטונית |

---

## שלב 6 — אימות

```bash
npx tsc --noEmit
npx vitest run
```
**אל תדווח הצלחה לפני ששניהם נקיים.**

**רשת ה-parity (`src/core/renderParity.test.ts`)** משווה את מפקד-הלוחות-לפי-תפקיד
(role census) של **שלושת** מסלולי בניית-הלוחות מול רשימת החיתוך (מקור האמת) — בדיוק
מחלקת ה-drift של Gotcha #8: 3D (`cabinetBoardBoxes`), 2D גוף
(`cabinetSketchBoards` — אותה פונקציה ש-`CabinetSketch.tsx` מרנדר), ורשימת החיתוך.
**הוסף את המודול החדש למטריצת ה-`CASES`** שם (input + state), כך שכל לוח שמסלול
רינדור מפיל/מכפיל/מתייג-לא-נכון נתפס אוטומטית בכל שלושת המסלולים.

לא לאמת בדפדפן עצמאית. בסיום, בקש מהמשתמש לבדוק (לפי `feedback_no_browser_verify`):
1. המודול מופיע ב-picker עם השם והרוחב הנכונים.
2. תצוגת גוף + תצוגת מטבח ראשית + רשימת חיתוכים תואמים זה לזה.
3. **תצוגת החדר (3D)**: המוצר מרונדר עם אותם לוחות/פנים כמו ה-2D (זהה דרך single
   source). אם הוספת דגל גאומטריה חדש — ודא שהוא משתקף גם כאן (ראה Gotcha #8).
4. אם אפליאנס: אין חזיתות/גב/תחתון מיותרים; צוקל מקוטע נכון.

**commit + push רק אחרי אישור מפורש של המשתמש.** סיים את הודעת ה-commit ב:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## ⚠️ Gotchas (באגים אמיתיים שנתקלנו בהם — אל תחזור עליהם)

1. **חזית מגירה חיצונית נעלמת כש-`hasFronts=false`** (תנור): מגירות חיצוניות
   מגיעות מ-`calcExternalDrawerFrontCuts` (עצמאי מ-`hasFronts`). ב-`KitchenOverview`,
   `UnitFrontPanelsStandalone` חייב **לא** לעשות early-return כש-`noFronts` אם
   `extDrawers.length > 0`. early-return רק כששניהם ריקים.

2. **`CabinetForm` מאבד דגלים** כשהוא בונה מחדש `CabinetInput` מה-form: שדות
   שאין להם field בטופס (`topVariant`, `hasFronts/hasBack/hasBottom`,
   `sinkTraverseWidthCm`) חייבים spread מ-`initialInput` ב**כל** קריאת `calculate()`
   (יש כמה). אחרת הם נמחקים בשמירה.

3. **קווי פיצול צוקל "לפי גודל הגוף"**: ב-`CabinetSketch`, קווי split מפירוק
   ה-box הפנימי מוצגים רק כש-`!unifiedPlinth` (גוף עצמאי). במצב מטבח עמדות
   הגיבלים מגיעות מ-`buildKitchenPlinthBoxes(group.totalW)`, לא מהיחידה.

4. **`KitchenModuleType` הוא `string` ב-`KitchenUnit.moduleType`** — בעת יצירת
   unit ידנית בטסט, ודא `moduleType` תואם ל-type שהעברת ל-factory.

5. **מגירות לא מפיקות חלקי תיבת-חיתוך בנתיב המטבח** (מזווה): `buildBoardModel`
   מתעלם ממגירות, `calcCuts` נקרא עם `drawers=0`, ורק חזית **חיצונית** נפלטת
   (`calcExternalDrawerFrontCuts`). לכן מגירה **פנימית** → פרזול (מסילה) + סקיצה
   בלבד, **אפס** ברשימת החיתוכים (תיבות נרכשות, לא נחתכות). אם מודול חדש אמור
   להציג חלקי מגירה ברשימת החיתוכים — זו תשתית חדשה ב-core, לא קונפיג של מודול.
   בדוק את ההנחה הזו מול המשתמש **לפני** שאתה גוזר גבהי מגירות.

6. **גובה גוף ≠ split אוטומטי**: `decomposeBoxes` מפצל לגובה רק כש-`H > MAX_BOX_H`
   (=200) ב-`auto`. גוף עד 200 ס"מ נשאר box יחיד (`key='single:single'`) —
   ה-interior state חייב להשתמש במפתח הזה. מעל 200, או `doorsPerColumn≥2`, המפתח
   משתנה ל-`bottom`/`top` והפריטים לא יתחברו.

7. **מגירה פנימית שממלאת את הגוף מסתירה את הלוח העליון/תחתון** (מזווה): מלבן
   המגירה הפנימית מקוצץ אופקית בין הדפנות אבל היה ללא קיצוץ אנכי — פס אטום מ-
   `hff` עד `hff+drawerHeight` שמכסה את הלוחות בקצוות. הפתרון: לצייר מגירה פנימית
   כ**תיבה מוקטנת** דרך `internalDrawerBoxBoundsCm` + `DRAWER_BOX_*_GAP_CM`
   (`CabinetSketch.utils.ts`), בדיוק כמו תיבת המגירה החיצונית. חל ב-2 אתרי 2D:
   `CabinetSketch` (גוף מלא + תא) ו-`BoxBodySketch` (וב-3D דרך `cabinetBoards3D`,
   ראה Gotcha #8). מודול חדש שממלא את הגוף במגירות פנימיות — ודא שהלוחות עדיין
   נראים בכל התצוגות, 2D ו-3D.

8. **דגל גאומטריה חדש חייב להגיע לכל שלושת אתרי בניית-הלוחות** — הם נגזרים
   במקביל ויכולים להיסחף. `buildBoardModel` נקרא **עצמאית** מ-3 מקומות:
   `useCabinet.ts`/`cabinetCompute.ts` (רשימת חיתוך — **מקור האמת**),
   `CabinetSketch.tsx` (סקיצת 2D מפורטת), ו-`cabinetBoards3D.ts` (תצוגת 3D בחדר).
   מודול שמשתמש בדגלים קיימים מרונדר בכל השלושה אוטומטית (single source). אבל
   דגל **חדש** שמשנה decompose/envelope/board חייב להיות מושחל לכל השלושה — ואם
   זה דגל מעטפת, גם לפליטת המעטפת **ברמת-הארון** ב-`cabinetBoards3D` (`hasAnyShell
   || wallEnv`, עם `envelope-top`/`envelope-bottom`). באג אמיתי: `hasWallEnvelope`
   (מכסי עליון+תחתון של קלפה) טופל ב-`useCabinet` אך **נשמט** ב-2D (קריאת
   `buildBoardModel` לא העבירה `hasEnvelopeBottom`) וב-3D (ללא `envelopeBottomH`
   ובלי מכסה תחתון) — המכסים הופיעו בצבע גוף ב-2D ונעלמו לגמרי ב-3D עד שהושחל
   בשלושתם. שים לב גם ל-Gotcha #2 (`CabinetForm` עלול לאבד את הדגל החדש בבנייה
   מחדש מהטופס).
