# שינויים באפליקציית הנגר

כל השינויים המשמעותיים מתועדים כאן.
הפורמט מבוסס על [Keep a Changelog](https://keepachangelog.com/he/1.1.0/).

---

## [Unreleased]

### תוקן — רפקטור חזיתות הסתמך על totalFrontsInCabinet, כעת per-row
- **שורש הבאג**: הרפקטור הראשון של frontGeometry סופר את **כל** החזיתות בכל הקומות יחד (`totalFrontsInCabinet`). תוצאה: בארון עם 2 קומות, frontWidth קטן בחצי, וכל קומה תפסה רק חצי מהרוחב — קומה עליונה נדחפה שמאלה, תחתונה ימינה.
- **תיקון**: לוגיקת חישוב הופכת ל-per-row. כל `Box.level` (`'bottom' | 'middle' | 'top' | 'single'`) הוא יחידה אופקית עצמאית: כל row מתפזרת על כל רוחב הארון בנפרד, עם ה-gaps שלה.
- **API חדש ב-`frontGeometry.ts`**: `computeRowFrontLayout` (החליף את `computeCabinetFrontLayout`), `RowFrontLayout` (החליף את `CabinetFrontLayout`), `getTotalFrontsInRow`, `groupBoxesByRow(boxes): Map<BoxLevel, Box[]>` (חדש; מדלג על `'plinth'`). `getBoxFirstGlobalFrontIndex` מקבל `rowBoxes` (לא `boxes` כולן) ומחזיר אינדקס בתוך ה-row. `computeFrontGeometry`/`computeFrontGeometryForSpan` משתמשים ב-`globalFrontIndexInRow`/`startGlobalIndexInRow`.
- **`useCabinet`**: מקבץ `bodyBoxes` ל-rows, מחשב `layoutByRow: Map<BoxLevel, RowFrontLayout>` (אחד לכל row), ומעביר ל-`deriveDrawerFronts` ול-renderers. החזירה הציבורית: `frontLayoutByRow` (החליפה את `cabinetFrontLayout`).
- **`drawerFrontsCalc`**: מקבל `layoutByRow` במקום `layout`. לכל גוף בוחר את ה-layout של ה-row שלו לפי `box.level`.
- **Renderers (`CabinetSketch`, `CabinetFrontsSketch`)**: מקבלים `frontLayoutByRow` ו-`numFrontsPerBox`. עבור כל גוף בוחרים את ה-layout של ה-row שלו, ומחשבים `boxFirstGlobalIndexInRow` בתוך ה-row.
- **`cuttingList.ts`**: מצב ה-cabinet ה"פשוט" הוא single-row; ההסבר תועד בהערה.
- **בדיקות**: 6 בדיקות חדשות ב-`frontGeometry.test.ts` (כולל regression נגד "ארון 80 ס"מ × 2 קומות → 4 חזיתות → 19.75 ס"מ" הבאג); `mkLayout` ב-`deriveDrawerFronts.test.ts` הוחלף ב-`mkLayoutByRow`. סה"כ 406 בדיקות עוברות (היה 401).
- **תאימות ל-`BoxBodySketch`**: עורך הגוף נשאר ב-body-relative בלי props חדשים (כפי שתוכנן). אין השפעה.

### שונה — איחוד לוגיקת רוחב ומיקום חזיתות לכלל אחיד ברמת הארון
- **כל החזיתות בארון** (דלתות וחזיתות מגירה) מחושבות כשורה אחת ארוכה ברמת הארון כולו: רווח 2 מ"מ בקצוות החיצוניים (פנימי למעטפת אם קיימת) + רווח 2 מ"מ בין כל זוג חזיתות סמוכות. גבולות בין גופים סמוכים ומחיצות פנימיות **אינם** משפיעים על רוחב/x של החזיתות.
- **נוסחה אחידה**: `frontWidth = (W_available − (N + 1) × gapCm) / N` כאשר `N = סך numFronts מכל הגופים`.
- **חזית מגירה body-wide** (גוף ללא מחיצה עם N עמודות): חזית אחת רחבה ש-`width = N × frontWidth + (N − 1) × gapCm`, ממוקמת ב-x של העמודה הראשונה של הגוף (`boxFirstGlobalFrontIndex`).
- **חזית מגירה בתא של גוף עם מחיצה**: רוחב = `frontWidth` (זהה לדלת באותה עמודה). המחיצה הפיזית מסתתרת מתחת לחזיתות (overlay).
- **תיעוד**: סקציה חדשה "כלל מיקום ורוחב חזיתות (אחיד)" ב-CARPENTRY_RULES; סקציית "רוחבים בין דלתות" עודכנה ל"תמיד 2 מ"מ" (במקום "עם מעטפת 2 מ"מ / בלי 0").

### נוסף — `src/core/geometry/frontGeometry.ts`
- מקור יחיד לאמת לחישוב x ו-width של חזיתות. exports: `CabinetFrontLayout`, `computeCabinetFrontLayout`, `computeFrontGeometry`, `computeFrontGeometryForSpan`, `getBoxFirstGlobalFrontIndex`, `getTotalFrontsInCabinet`.
- `src/core/geometry/frontGeometry.test.ts`: 20 בדיקות חדשות לכל הפונקציות (W=80 בלי מעטפת, W=240 עם 3/6 חזיתות, עם וללא מעטפת, span, אינדקס גלובלי, סגירת הסכום).
- `src/core/doors/drawerFrontsCalc.ts` (חדש): `deriveDrawerFronts` הועבר מ-`doorUtils.ts` לקובץ עצמאי, וכתב מחדש לפי `frontGeometry`. הקלט החדש: `layout: CabinetFrontLayout` במקום `tBody`.

### הוסר
- `getDoorWidth`, `getPartitionDoorWidth` ו-`DRAWER_FRONT_SIDE_GAP_CM` מ-`doorUtils.ts`. כל הקוראים (`useCabinet`, `cuttingList`, `deriveDrawerFronts`) משתמשים ב-`frontGeometry` בלבד.
- ה-prop `partitionsById` ב-`CabinetFrontsSketch` כבר לא משפיע על חישוב `panelX` (נשאר כ-prop אופציונלי לתאימות, אבל לא משמש לחישוב מיקום).
- בדיקות ל-`getDoorWidth`/`getPartitionDoorWidth` ב-`doorUtils.test.ts` ו-`externalDrawerWiring.test.ts` הוסרו (מוחלפות ב-`frontGeometry.test.ts`).

### השלכות על שיתוף בין סקיצות
- `CabinetSketch`, `CabinetFrontsSketch` מקבלים `cabinetFrontLayout` + `numFrontsPerBox` ומחשבים את ה-x של כל חזית דרך `computeFrontGeometry` / `computeFrontGeometryForSpan`. תוצאה: חזית מגירה בתצוגה הראשית של הארון ממוקמת ישירות מתחת לדלת (אותו x, אותו width).
- `BoxBodySketch` (עורך גוף בודד) נשאר עם ציור body-relative — קירוב ויזואלי בלבד, אין לו context של הארון. תועד מפורשות כהחלטה.
- `cuttingList.ts` (מצב פשוט) משתמש ב-`computeCabinetFrontLayout` במקום `getDoorWidth`.

### נוסף — מדף קבוע אוטומטי מעל ערימת מגירות חיצוניות
- **`ShelfItem.isFixedAboveExternals?: boolean`** — שדה חדש אופציונלי שמסמן מדף שנוצר אוטומטית מעל ערימת external drawers. ShelfItem רגיל לא מקבל את הדגל.
- **`core/interior/fixedShelfUtils.ts`** (חדש): `calcFixedShelfHeight(externals, gapMm, shelfThickness)` מחזיר את `heightFromFloor` (= תחתית המדף = `top of highest drawer − shelfThickness`); `hasFixedShelf(items)`; `findFixedShelf(items)`; `syncFixedShelf(oldItems, newItems, gapMm, shelfThickness)` שמיישם את ה-decision table: יצירה אוטומטית רק בהוספת המגירה הראשונה (`newCount=1 ∧ oldCount=0`); עדכון `heightFromFloor` כשערימת המגירות משתנה; מחיקה כשהאחרונה הוסרה; כיבוד הסרה ידנית (לא יוצר מחדש).
- **`redistributeShelves`**: סינון משותף ל-`isManuallyPositioned === true` ול-`isFixedAboveExternals === true` — שניהם נחשבים "frozen" ולא משתתפים בחלוקה. המשתנה `manual` ב-helper שונה ל-`frozen` (אותה התנהגות, שם מדויק יותר).
- **`useCabinet`**: `setBoxInterior` ו-`setCellItems` קוראים ל-`syncFixedShelf` לפני שמירת ה-items, עם `gapMm` מ-`lastInputRef` ו-`shelfThickness` מ-`tBodyRef`.
- **`BoxBodySketch`**: מדף קבוע מצויר עם `stroke-dasharray: 6 2` ועובי 2 (class חדש `.fixedShelfLine`). לא ניתן לגרירה. ה-label מציג את התרגום "קבוע" במקום הגובה המספרי.
- **`BoxInteriorEditor`**: שדה הגובה של מדף קבוע מסומן `readOnly`; קריאות `updateHeight`/`updateCellHeight` על מדף קבוע מתעלמות בשקט (גובה נגזר). תווית "קבוע" מתווספת לטיפוס בעמודת הפריט.
- 2 מפתחות תרגום חדשים: `fixedShelfLabel` ("קבוע" / "Fixed") ו-`fixedShelfTooltip` (טקסט מלא של ההסבר).
- 17 בדיקות חדשות ב-`fixedShelfUtils.test.ts` מכסות את כל ה-decision table ו-edge cases (drawer height change, internal drawers, coexistence with manual shelves).

### ידוע — לטיפול בעתיד
- אם מדף רגיל קיים בטווח 5 ס"מ ממיקום המדף הקבוע → אזהרת warning. דורש מנגנון אזהרות חדש או הרחבת קיים. דחוי לפיצ'ר נפרד.

### תוקן
- רוחב חזית דלת בגוף עם מחיצה אנכית — היה `(W − tBody) / 2` ללא התחשבות ב-gap; כעת `(W − tBody − 4×gap) / 2` לסימטריה ולעקביות עם רוחב הדלתות בגוף ללא מחיצה. החזיתות כעת ממורכזות עם gap שווה משני הצדדים ומסביב למחיצה (layout: `gap | door | gap | partition | gap | door | gap`). תוקן ב-3 מקומות: `useCabinet.ts` (חישוב frontW דרך helper חדש `getPartitionDoorWidth`), `CabinetFrontsSketch.tsx` (חישוב `panelX` עם branch ייעודי למצב מחיצה — כל דלת מעוגנת לשפת הגוף שלה), `CabinetForm.tsx` (העברת `partitionsById` ל-`CabinetFrontsSketch`). 4 בדיקות חדשות ב-`externalDrawerWiring.test.ts` מכסות: חישוב הרוחב, סגירת הסכום (`2·door + tBody + 4·gap = W`), המקרה הגבולי `gap=0`, וההפרש מ-`getDoorWidth` במצב לא-מחיצה.
- רוחב חזית מגירה חיצונית בתא של גוף עם מחיצה — היה `(W − tBody) / 2 − 4mm` (התעלם מ-gap); כעת `(W − tBody − 4×gap) / 2 − 4mm`, עקבית עם רוחב הדלת המתוקן. תוקן בשני המקומות (`deriveDrawerFronts` ב-`doorUtils.ts` + `calcExternalDrawerFrontCuts` loop ב-`useCabinet.ts`) דרך `getPartitionDoorWidth` המשותף. הקצוות של חזיתות המגירה והדלתות שמעליהן מתיישרות אנכית. בדוגמה (W=80, tBody=1.8, gap=2mm): חזית מגירה בתא = 38.3 ס"מ (היה 38.7), דלת בתא = 38.7 (היה 39.1). 2 בדיקות חדשות + 1 קיימת עודכנה ב-`deriveDrawerFronts.test.ts`.
- רוחב חזית מגירה חיצונית — הוקטן ב-4 מ"מ (2 מ"מ מכל צד) בכל המקרים, בלי קשר לקיום של מעטפת חיצונית. מקור: מסילות המגירה דורשות רווח טכני קבוע גם בלי `doorGapMm`. קבוע חדש `DRAWER_FRONT_SIDE_GAP_CM = 0.2` ב-`core/doors/doorUtils.ts`; מיושם ב-`deriveDrawerFronts` (גם body-wide גם cell) ובלולאת `calcExternalDrawerFrontCuts` ב-`useCabinet`. `CabinetFrontsSketch` מצייר את חזית המגירה ממורכזת בתוך אזור הדלת (cell) או הגוף (body-wide), עם `front.width` המעודכן.
- חזית מגירה חיצונית בגוף בלי מחיצה הייתה מפוצלת לפי `numFronts`; כעת חזית יחידה ברוחב הגוף. הבאג היה בשלושה מקומות והוצרך תיקון תלת-ראשי:
  - `deriveDrawerFronts` (core/doors/doorUtils.ts) קבע `width = getDoorWidth(box.W, numFronts, gap)` (~39.8 ס"מ עבור גוף 80 עם 2 חזיתות) → תוקן ל-`width = box.W`.
  - `useCabinet.calculate()` קרא ל-`calcExternalDrawerFrontCuts` בלולאת `for fi = 0..numFronts-1` עם אותם `bodyItems` ו-`frontW = doorW`, מה שהפיק N עותקי CutItem ברוחב דלת → תוקן ל-קריאה יחידה לגוף ללא מחיצה (`frontW = box.W`). למחיצה נשאר per-cell.
  - `CabinetFrontsSketch` עשה materialization שמוסיף כל body-wide DrawerFront לכל `(boxId, frontIndex)` ב-`drawerFrontsByBoxFi`, ואז צייר אותו פעם בכל איטרציה של דלת ברוחב `panelW` → תוקן: body-wide נצבר ב-`bodyFrontsByBox` ומצויר פעם אחת לגוף ברוחב `rect.w`; cell-bound נצבר ב-`cellFrontsByBoxFi` ומצויר behind ה-frontIndex המתאים. `stackTopForDoor(boxId, fi)` מצרף את שניהם לחישוב גובה הדלת.

### נוסף — שלב 2.2: תצוגה ויזואלית של מגירות חיצוניות
- **`DrawerFront` entity** נגזר ב-`deriveDrawerFronts` ב-`core/doors/doorUtils.ts`, נחשב מחדש בכל `calculate()`, ונשמר ב-`drawerFrontsById` כ-state נחשף מ-`useCabinet`.
- **BoxBodySketch**: external drawers מצוירות בתחתית הגוף, סדורות מלמטה למעלה לפי `heightFromFloor`, בצבע fronts (אופציונליות נפרדות מ-internal drawers הקיימות). תווית "מגירה" + גובה ב-cm. תמיכה ב-`onExternalDrawerClick` לפתיחת מודאל.
- **CabinetSketch + CabinetFrontsSketch**: external drawers מצוירות כפנלים נפרדים בצבע חזית. ב-CabinetFrontsSketch הדלת הראשית נדחפת למעלה לפי גובה ערימת המגירות, וחזיתות המגירה ממוקמות מתחתיה. המגירה הנמוכה עם `coversSkirt` מתארכת ויזואלית מטה (שימוש ב-`getDrawerFrontVisualHeight`).
- **DoorsList**: חזיתות מגירה מופיעות אחרי הדלתות של אותו גוף, ממוינות מלמעלה למטה. תווית "(מגירה)" מתווספת לכל שורה. ההוספה ניתנת ללחיצה ופותחת את ה-modal.
- **ExternalDrawerEditor (modal חדש)**: שדה גובה מגירה (input מספרי בס"מ עם commit ב-blur/Enter), בחירת `frontThicknessOverride` (dropdown של MaterialIds + אפשרות "ברירת מחדל"), כפתורי "מחק מגירה" וביטול.
- **useCabinet API חדש**: `setDrawerHeight(drawerId, h)`, `setDrawerFrontThickness(drawerId, materialId | undefined)`, `deleteDrawer(drawerId)`. כל אחת מאתרת את המגירה (interior או cell) ומחילה את העדכון; שינוי גובה מפעיל `calculate()` מלא דרך ה-detection הקיים ב-`externalStackChanged`.
- 11 מפתחות תרגום חדשים (HE/EN): `drawerFrontLabel`, `editExternalDrawerTitle`, `drawerHeightLabel`, `drawerFrontThicknessLabel`, `defaultMaterial`, `deleteDrawer`.
- 16 בדיקות חדשות (`deriveDrawerFronts.test.ts`): רשימה ריקה, body-wide, partition cells (מיפוי frontIndex), coversSkirt לוגיקה, thicknessOverride passthrough, mixed internals/externals, `getDrawerFrontVisualHeight`.

### ידוע (סטטוס מעודכן ל-2.2)
- חיווט מלא של תצוגה ויזואלית — ✅ נעשה ב-2.2.
- ExternalDrawerEditor (גובה + override + מחיקה) — ✅ נעשה ב-2.2.
- אזהרות `main_door_absent` / `main_door_too_short` — עדיין לא מוצגות (פתוח ל-2.3 או אחרי).
- חיתוכי הדלת הראשית מ-`calcCuts` עדיין לא משתקפים את הקיצור (חוב טכני שהוזכר ב-2.1; לא נגעו ב-2.2).
- מצב partition + numFronts > 2: ה-frontIndex האמצעי לא מקבל cell ולכן external drawers לא ניתנים להוספה שם — תועדה כמגבלה ב-CARPENTRY_RULES.

### נוסף — שלב 2.1: חיווט מגירות חיצוניות ל-state ול-UI
- `useCabinet.calculate()` משתמש ב-`calcMainDoorHeight` במקום `getDoorHeight` — הדלת מתקצרת אוטומטית כשיש external drawers בגוף (או בתא, במצב מחיצה).
- העברת `coversSkirt` אוטומטית מהדלת הראשית למגירה החיצונית הנמוכה ביותר. הדלת מאבדת את הדגל; ה-`drawerId` נשמר ב-`skirtCoveringDrawerIdsRef` ל-2.2 (תצוגה).
- חיתוכי חזיתות external מצורפים אוטומטית ל-cuts תחת `CutGroup` `'front'` — דרך `calcExternalDrawerFrontCuts` שנקרא פר-`(box, frontIndex)`.
- `setBoxInterior` / `setCellItems` / `setBoxPartitions` / `addPartition` / `removePartition` מפעילים `calculate()` במלואו כאשר שינוי מצב המגירות הוא "מבני" (mount toggle, drawerHeight, הוספה/הסרה של external) — דרך helper חדש `externalStackChanged`.
- **BoxInteriorEditor**: כפתור "+ מגירה" (גם בגוף הראשי וגם בכל תא במצב מחיצה) פותח דיאלוג בחירה internal/external עם תיאור משני קצר. הלחיצה על אחד הסוגים יוצרת `DrawerItem` עם `mount` המתאים.
- `defaultDrawerPlacement` קיבל פרמטר אופציונלי `mount?: DrawerMount` (default `'internal'`). עבור `mount='external'`: מיקום `heightFromFloor = calcExternalStackHeight + drawerHeight/2` (נערם מעל קיימים).
- helpers ב-`core/doors/doorUtils.ts`: `getItemsForFront`, `externalStackSignature`, `externalStackChanged`.
- 4 מפתחות תרגום חדשים (HE/EN): `drawerTypeDialogTitle`, `drawerInternal`, `drawerExternal`, `drawerInternalDesc`, `drawerExternalDesc`.
- 18 בדיקות חדשות (`externalDrawerWiring.test.ts`) מכסות את 5 התרחישים שצוינו ב-2.1.D + signature stability.

### תוקן (חוב משלב 1)
- `cellIndexToFrontIndex` היה הפוך: cell 0 (ימני) מיפה ל-frontIndex `numFronts-1` (השמאלי). תוקן ל-זהות: cell 0 → frontIndex 0, cell 1 → frontIndex numFronts−1. הבדיקה התואמת ב-stage 1 עודכנה בהתאמה. ראה `DECISIONS_LOG.md` 2026-05-17.

### ידוע (לא יעבוד עד שלב 2.2)
- `CabinetSketch`, `CabinetFrontsSketch`, `BoxBodySketch`, `DoorsList` לא מציגים external drawers כחזיתות נפרדות. הם רואים את המגירה כפריט פנימי בלבד (heightFromFloor + drawerHeight). הדלת בסקיצה מצוירת לפי `door.height` (ובמצב הקיים — היא תיראה מקוצרת, מה שיוצר רווח ריק במקום שבו המגירה תהיה).
- אין עדיין עורך מותאם לחזית מגירה (`frontThicknessOverride` עוד לא חשוף ב-UI).
- אזהרות `main_door_absent` / `main_door_too_short` עוד לא מוצגות.
- חיתוכי הדלת הראשית מ-`calcCuts` משקפים את הגוף המלא, **לא** את הדלת המקוצרת. החיתוך הסופי בקובץ עדיין יציג את הדלת כ-`box.H − 2×gap` ולא את `mainDoorHeight`. שלב הבא ידרוש refactor של `calcCuts` או יצירת חיתוכי דלת פר-`Door` ב-`useCabinet` (לא נעשה ב-2.1 כי ההוראה אמרה "מצורפת ל-cuts הסופי", לא "החלף").

### נוסף — שלב 1: ליבה בלבד
- **מגירות חיצוניות (external drawers) — שלב 1: ליבה בלבד.** `DrawerItem` קיבל שדה `mount: 'internal' | 'external'` (חובה) ו-`frontThicknessOverride?: MaterialId` (אופציונלי, רלוונטי רק ל-external). מגירה חיצונית היא מגירה עם חזית עצמאית שמשולבת בקדמת הארון.
- helpers ליבה חדשים ב-`core/doors/doorUtils.ts`:
  - `getExternalDrawers(items)` — מסנן ומיין external drawers (הנמוך ראשון)
  - `calcExternalStackHeight(items, gapMm)` — גובה ערימת חזיתות המגירות + רווח מעל כל אחת
  - `calcMainDoorHeight(boxH, items, gapMm, hasBottomGap, hasTopGap)` — גובה הדלת הראשית אחרי קיצור
  - `validateMainDoorHeight(h)` — `'main_door_absent'` (≤0), `'main_door_too_short'` (<10), או null
  - `cellIndexToFrontIndex(cellIndex, numFronts)` — מיפוי תא→frontIndex (0=ימני→numFronts-1, 1=שמאלי→0)
  - `getSkirtCoveringDrawer(items, mainDoorCoversSkirt)` — המגירה החיצונית הנמוכה ביותר (לקבלת coversSkirt)
  - `getDrawerFrontThicknessCm(drawer, globalId)` — עובי חזית מגירה (עם override אם external)
- קובץ חדש `core/cuts/externalDrawerCuts.ts`:
  - `calcExternalDrawerFrontCuts(items, frontWidthCm, gapMm, plinthCm, mainDoorCoversSkirt, frontThicknessMm, perDrawerThicknessMm?)` — מייצר `CutItem` לכל external drawer בקבוצה `'front'` (קבוצה חדשה ב-`CutGroup`)
- 30 בדיקות חדשות (`externalDrawer.test.ts`) מכסות: ערימה ריקה/יחיד/מרובה, mainDoorHeight חיובי/אפס/שלילי, אזהרות, coversSkirt transfer, override עובי, מיפוי תאים.

### ידוע (סטטוס מעודכן ל-2.1)
- חיווט `useCabinet` (החלפה ל-`calcMainDoorHeight`, `coversSkirt` transfer, חיתוכי `'front'`) — ✅ נעשה ב-2.1.
- UI להחלפת `mount` (דיאלוג internal/external) — ✅ נעשה ב-2.1.
- `frontThicknessOverride` — עדיין לא חשוף ב-UI (פתוח ל-2.2 או אחרי).
- אזהרות `main_door_absent` / `main_door_too_short` — עדיין לא מוצגות (פתוח).
- חיבור `ShelfWarning` ל-`MainDoorWarning` — עדיין שני מנגנונים נפרדים.

### תוקן
- מיקום מדף בלתי-עקבי לפי סדר ההוספה: "מוט → מגירה → מדף" יצר מדף בדיוק על ראש המגירה (gap=80 → hanger ב-rod-80 = drawerTop), בעוד "מגירה → מוט → מדף" יצר מדף מתחת למגירה. עכשיו: כשיש מגירה מתחת למוט (בכל gap), המדף הראשון תמיד מוצב מתחת למגירה (drawer top משמש כרצפת התלייה). תוצאה: התנהגות עקבית ללא תלות בסדר ההוספה
- אזהרת `small_zone` עכשיו מבוססת על בדיקת מרחקים אחרי placement (לא רק על חללים חופשיים בין blockers): בודקת את כל הפריטים הסמוכים אחרי המיון, ואם יש זוג עם מרחק <25 ס"מ (לפי האזורים הפיזיים: מדף=1.8 ס"מ, מגירה=גובה המגירה, מוט=±1.5 ס"מ) → אזהרה. תופסת מקרים כמו 3 מדפים בגוף 70 (gap ~15.7 בין מדפים)
- ערכי גובה ארוכים (`23.333333333333332`) שנחתכו בשדה הקלט (56px, מיושר למרכז ב-RTL) ויצרו תצוגה משונה: כל מיקומי המדפים, המגירות והמוטות מעוגלים ל-1 ספרה עשרונית (helper `roundCm`). תוצאה: גוף 70 עם 2 מדפים → ערכים נקיים `23.3` ו-`46.7`

### שונה
- אזהרות מדפים קוצרו ל-≤25 תווים (טקסט סטטי, ללא פרמטרים)
- הוסר העשרת `drawerHeightFromFloor` מ-`ShelfWarning.rod_drawer_close` (לא נחוץ עם הטקסט המקוצר)
- `ShelfWarning.small_zone` הוא עכשיו `{ kind: 'small_zone' }` בלבד (השדה `zoneSize` לא בשימוש מאז שהטקסט סטטי)

### נוסף
- חלוקת מדפים חכמה עם round-robin בין כל האזורים החופשיים (לא רק הגדול ביותר) — מדפים מתפזרים על פני כל הגוף במקום להצטופף באזור אחד
- לוגיקת מוט תליה: כשמוסיפים מדף בגוף עם מוט תליה ≥80 ס"מ, המדף הראשון מוצב 80 ס"מ מתחת למוט (אזור תליית בגדים)
- לוגיקת "מגירה בטווח 70-80 ס"מ מתחת למוט": המגירה משמשת כרצפת תליה, והמדף הראשון מוצב מתחת למגירה
- הצבה אוטומטית של מגירה ביחס למוט תליה קיים: `defaultDrawerPlacement` מציב את המגירה הראשונה ב-`rodH - 80 - drawerHeight` (gap=80 בדיוק). אם אין מקום — הצבה ברצפה ואזהרה
- הצבה אוטומטית של מוט תליה ביחס למגירה קיימת: `defaultRodPlacement` דוחף את המוט למעלה כדי לשמור על 80 ס"מ מעל ראש המגירה הגבוהה ביותר. אם אין מקום — הצבה ב-default (`bodyH - 10`) עם אזהרה הכוללת את מיקום המגירה
- מערכת אזהרות לחלוקת מדפים (ShelfWarning):
  - `rod_low` — מוט תליה נמוך מ-80 ס"מ
  - `rod_drawer_close` — מגירה פחות מ-70 ס"מ מתחת למוט (מוט לא יעיל). כשהמוט הוא הפריט החדש, האזהרה מציגה את מיקום המגירה הקיימת ומציעה להזיז אותה
  - `small_zone` — אזור חופשי קטן מ-25 ס"מ (לא נוסף שם מדף)
- באנר אזהרות מעל רשימת הפריטים בעורך פנים גוף, ניתן להסתרה ידנית

### שונה
- `redistributeShelves`, `addShelfRedistributed`, `defaultDrawerPlacement`, `defaultRodPlacement` מחזירות `{ items/drawer/rod, warnings }` במקום הפריט הגולמי
- אזורים חופשיים קטנים מ-25 ס"מ לא מקבלים מדפים אוטומטיים (filter במקום fallback)

### תוקן
- מדפים לא נכנסים יותר לתוך מגירות או מוטות תליה — האלגוריתם מחשב חללים חופשיים פיזיים (מגירות, מוטות, מדפים ידניים כחוסמים) ומציב מדפים אוטומטיים בחלל הגדול ביותר

---

## [2026-05-16] — מחיצות פנימיות + חלוקת מדפים

### נוסף
- כפתור "+ מחיצות" בעורך הגוף הפנימי לגופים עם יותר מחזית אחת (numFronts > 1)
- תצוגה ויזואלית של מחיצות אנכיות בסקיצת הגוף הפנימי
- מחיצות מופיעות ברשימת החיתוכים עם מידות נכונות (D × H × עובי חומר גוף)
- שימור מצב המחיצות בין חישובים מחדש
- תאים נפרדים בעורך גוף עם מחיצה — כל תא (ימני/שמאלי) מקבל פריטים פנימיים עצמאיים במידות מותאמות לרוחב התא, כולל סקיצת SVG עם גרירה
- אזהרה לפני מחיקת פריטים בהוספת/הסרת מחיצה (מודאל אישור עם פירוט כמות הפריטים)

### תוקן
- מדפים מחולקים שווה בשווה בגוף או בתא במקום להתערם באותו מיקום — כל הוספה/מחיקה של מדף מחדשת את החלוקה לפי `H × (i+1) / (N+1)`. מדף שנגרר או שונה ידנית מסומן `isManuallyPositioned=true` ונשאר במקומו בחלוקות עתידיות.
- עורך תאים עם מחיצה: כל תא מציג סקיצת SVG עם הפריטים שלו ואפשרות גרירה
- CabinetSketch ו-BoxThumbnail מציגים פריטים פנימיים של תאים בגוף עם מחיצה, כולל קו מחיצה אנכי
- מעטפת תקרה (hasEnvelopeTop) לא הקטינה את גובה הגוף העליון/היחיד — box.H נשאר ללא שינוי וגובה הדלת חושב בנפרד עם ניכוי. עכשיו decomposeBoxes מקבלת envelopeTopH ומחסירה ישירות מ-box.H, וה-effectiveBoxH הכפול הוסר מ-useCabinet
- רווח תחתון כפול בחזית תחתונה ב-doorsPerColumn>1: getDoorHeight תמיד ניכה "top gap" מהגוף התחתון/האמצעי, אבל ה-gap האמצעי כבר נוכה כ-"bottom gap" של הגוף שמעליו. נוסף פרמטר hasTopGap — false לגופים bottom/middle, true לגופים top/single

---

## [2026-05-09] — מערכת חזיתות מלאה + חומרים

### נוסף
- עורך חזיתות מלא: צד צירים, מספר צירים, מיקום ידני
- תמיכה ב-coversSkirt: דלת מכסה צוקל (מתארכת לכיסוי הבמה)
- מיניאטורות גופים פרופורציונליות עם סקייל גלובלי משותף
- חצי מידה W×H×D בעורך הגוף הפנימי
- חץ אלכסוני לייצוג עומק בעורך הגוף הפנימי
- רשימת פיצול לחזיתות בלשונית "דלתות"
- בחירת חומר גוף (**bodyMaterial**) וחומר חזית (**frontMaterial**) בנפרד

### שונה
- Override עובי חזית זמין לכל חזית בנפרד

---

## [2026-05-02] — מערכת פנים גוף

### נוסף
- עורך פנים גוף: מדפים, מגירות, מוט תליה לכל גוף בנפרד
- גרירה של פריטים בסקיצה לשינוי גובה
- אזהרות על חריגה מגבולות גוף והתנגשות מגירות
- State מחושב לפי Box.id (יציב בין חישובים מחדש)

---

## [2026-05-01] — פיצול גובה + תיקוני גיאומטריה

### נוסף
- תמיכה ב-doorsPerColumn: 1, 2, 3 דלתות לגובה, או "אוטומטי"
- גופים קטנים מ-60 ס"מ ב-3 קומות מאוחדים אוטומטית עם הסמוך
- קידוד צבע סמנטי לצירי מידה (צרדה=כחול, גובה=ירוק, עומק=כתום)

### שונה
- רוחב מקסימלי לגוף בודד: 100 ס"מ (היה 120 ס"מ)

### תוקן
- גוף ברוחב בדיוק 100 ס"מ מוצג כגוף יחיד, לא מפוצל

---

## [2026-04-30] — תצוגה מקדימה חיה

### נוסף
- סקיצת ארון חיה (CabinetSketch) — מתעדכנת בזמן אמת עם שינוי מידות
- פריסת 2 עמודות (טופס | סקיצה)
- סקיצה גדולה יותר (×2.5)

### תוקן
- קווי פיצול בסקיצה מסונכרנים עם חישוב decomposeBoxes (לא יחסים קשיחים)

---

## [2026-04-29] — מבנה גיאומטרי ראשוני

### נוסף
- פיצול ארון לגופים פיזיים (decomposeBoxes) לפי רוחב וגובה
- תמיכה בצוקל: גובה, פיצול לרכיבי צוקל, חיסור מגוף תחתון
- מבנה Box עם position (single / left / right / unit_N) ו-level (single / bottom / middle / top / plinth)

### שונה
- Box.role פוצל ל-position + level (refactor ארכיטקטוני)
- תוויות עברית של גופים נגזרות מ-position+level (לא hardcoded)
