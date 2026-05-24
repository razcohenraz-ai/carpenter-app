# שינויים באפליקציית הנגר

כל השינויים המשמעותיים מתועדים כאן.
הפורמט מבוסס על [Keep a Changelog](https://keepachangelog.com/he/1.1.0/).

---

## [Unreleased]

### שונה — תצוגת הארון מתפרסה על כל רוחב האזור המרכזי
- ה-grid ב-`CabinetForm.module.css` שונה מ-`minmax(260px, 1fr) | minmax(0, 2fr)` (טופס ~33% / סקיצה ~67%) ל-`minmax(260px, 320px) | minmax(0, 1fr)` — הטופס מקבל רוחב טבעי 260-320px, והסקיצה תופסת את **כל** המרחב הנותר.
- `.sketchStack` מקבל `align-items: stretch + width: 100%` כדי שה-SVG ימלא את הרוחב. `modeToggle` ממשיך להיות ממורכז דרך ה-`align-self: center` שלו.
- ה-SVG ב-`CabinetSketch.module.css` משתמש כעת ב-`aspect-ratio: 600 / 500` (תואם ל-viewBox) + `max-height: 75vh`. במסכים רחבים השרטוט גדל באופן יחסי; במסכים גבוהים מוגבל ל-75% מגובה החלון כדי לא להידחק מתחת ל-fold. `preserveAspectRatio` (ברירת מחדל = `xMidYMid meet`) שומר על יחס הארון — לא מרוח ולא דחוס.
- שיפור משמעותי בקריאות הסקיצה במסכי שולחן עבודה (1100px+ רוחב לסקיצה במקום ~900px קודם).

### תוקן — BoxBodySketch
- **פריטים פנימיים מוגבלים לרוחב הפנימי**: מדפים, מגירות פנימיות, מוטות תליה ומגירות חיצוניות מצוירים בין לוחות הצד (`xFrom = bX + tBody·scale, width = bW − 2·tBody·scale`) במקום ברוחב המלא של הגוף. עד היום הם חרגו מעבר ללוחות הצד וגלשו על הקורפוס.
- **מעטפת לא מוצגת בעורך גוף**: `buildBoardModel` נקרא תמיד עם `hasEnvelopeLeft/Right/Top = false`, ללא תלות ב-props. המעטפת שייכת לתצוגת הארון, לא לעורך הגוף הבודד. ה-props הקיימים (`hasOuterShell`, `hasEnvelopeTop`) נשארים על Props ל-API symmetry עם `CabinetSketch` אבל לא משפיעים על הציור.

### שונה — BoxBodySketch מציג לוחות קורפוס כרקע
- `BoxBodySketch` קורא ל-`buildBoardModel` על Box סינתטי (מ-`bodyW`/`bodyH`/`bodyD`) ומרנדר את הלוחות כשכבת רקע דרך `CabinetCutSketch`. הפנים הקיים (מדפים, מגירות, מוטות, מדף קבוע) מצויר מעל הלוחות כפי שהיה.
- 4 props חדשים: `bodyMaterialId`, `frontMaterialId`, `hasOuterShell?`, `hasEnvelopeTop?` (אופציונליים — אם `bodyMaterialId` חסר, אין רנדור לוחות, תאימות לאחור).
- בעורך גוף בודד: לוחות הקורפוס המלא + מעטפת (אם יש מעטפת חיצונית).
- בעורך תאים של גוף עם מחיצה: כל תא מציג את הלוחות שלו בלבד (sides + top + bottom של התא). `hasOuterShell={false}` בעורך תא — המעטפת שייכת לגוף, לא לתא.
- `BoxInteriorEditor` מעביר 4 props חדשים ל-BoxBodySketch (`bodyMaterialId`, `frontMaterialId`, `hasOuterShell`, `hasEnvelopeTop`). `CabinetForm` מעביר את המקור.

### נוסף — BoardModel + תצוגת חתך
- **`src/core/boards/boardModel.ts`** (חדש) — מודל פיזי של לוחות הגוף. exports: `Board`, `BoardRole` (`'side-left' | 'side-right' | 'top' | 'bottom' | 'shelf' | 'partition' | 'fixed-shelf' | 'internal-shelf' | 'envelope-left' | 'envelope-right' | 'envelope-top'`), `JointMethod` (`'rabbet' | 'butt'`), `resolveJointMethod(box)`, `buildBoardModel(args)`.
- שתי שיטות חיבור: **rabbet** (W ≤ 2·H) — צדדים בגובה מלא, תקרה/רצפה בין הצדדים; **butt** (W > 2·H) — תקרה/רצפה ברוחב מלא, צדדים קצרים.
- 18 בדיקות חדשות ב-`boardModel.test.ts` מכסות: rabbet, butt, מדפים מ-items, מחיצה + מדפי תאים, מעטפת (left/right/top), fixed-shelf, internal-shelves מ-`box.internalShelves[]`, sanity של שטח פנים, plinth=[].
- **`src/ui/components/CabinetCutSketch.tsx`** (חדש) — רנדור per-body של ה-boards כ-SVG `<rect>` עם styling לפי role (carcass, partition, fixed-shelf, internal-shelf, envelope).
- **`CabinetSketch.tsx`**: post-calc (interiorById + materials מוגדרים) מציג boards דרך CabinetCutSketch. envelopePanels + envelopeTopPanel + shelf lines + partition line מוסתרים post-calc (הם כעת boards). pre-calc נשאר עם הרינדור הישן. props חדשים: `bodyMaterialId`, `frontMaterialId`. הקליק על body (`onBoxClick`) ממשיך לעבוד דרך ה-`<rect>` השקוף הקיים (boards מצוירים אחריו עם `pointer-events` default — לא מפריעים לקליק על rect השקוף ב-z נמוך — אבל גם דרך bubbling של ה-`<g>` של ה-body).
- **גישה ב'**: BoardModel **לא** מחובר ל-`calcCuts` בשלב זה. החיבור יבוא בשלב הבא (BoardModel → CutItem). `cuttingList.ts` ממשיך לעבוד כפי שהיה.

### הוסר — מיניאטורות של גופים וחזיתות
- ה-thumbnail rows הוסרו מ-`CabinetForm`: שורת `BoxThumbnail` במצב bodies, ושורת `DoorThumbnail` במצב fronts.
- הניווט מעתה דרך לחיצה ישירה בתצוגת הארון (שלב 1).
- קבצים שנמחקו: `BoxThumbnail.tsx`, `BoxThumbnail.module.css`, `DoorThumbnail.tsx`, `DoorThumbnail.module.css` (לא היו בשימוש בשום מקום אחר).
- ניקוי ב-`CabinetForm`: imports, `MAX_THUMB_W`/`H`/`MIN_THUMB_PX`/`DEFAULT_THUMB_W`/`H`, `computeThumbSizes`, וייבוא `Box`/`makeDoorId` שלא היו נדרשים יותר.
- CSS class `.thumbRow` הוסר מ-`CabinetForm.module.css`.
- Bundle: 74→70 modules; CSS 30.25→28.83 KB; JS 292.52→289.47 KB.

### שונה — לחיצה ישירה בתצוגת הארון פותחת את העורך המתאים
- לחיצה על אזור גוף ב-`CabinetSketch` או ב-`CabinetFrontsSketch` → `BoxInteriorEditor`.
- לחיצה על דלת ב-`CabinetFrontsSketch` → `DoorEditor`.
- לחיצה על חזית מגירה חיצונית (בשתי התצוגות) → `ExternalDrawerEditor`.
- `cursor: pointer` + hover ייעודי על אזור גוף.
- ה-state ב-`CabinetForm` אוחד ל-`editing: { type, id }` (במקום `view` + 3 `editing*` נפרדים). רק עורך אחד פתוח בכל רגע. סגירה דרך `closeEditor`.
- ה-thumbnails הקיימים (`BoxThumbnail`, `DoorThumbnail`) ממשיכים לעבוד — מעבר ל-handlers החדשים (`handleBoxClick`, `handleDoorClick`). הסרתם תבוצע בשלב נפרד.
- `stopPropagation` בכל onClick של חזית (דלת, מגירה) — מונע double-trigger כש-front מצויר כילד של group אחר.

### שונה — קונבנציית `heightFromFloor` למגירה חיצונית
- היה: מרכז המגירה (`stackTop + drawerHeight / 2`).
- כעת: תחתית המגירה (`stackTop`), בעקבות אחידות עם כל שאר הפריטים הפנימיים (`ShelfItem`, `RodItem`, `DrawerItem` פנימית) ועם תיעוד ה-type `// cm from body bottom to bottom of drawer`.
- שינוי קוד: שורה אחת ב-`interiorUtils.ts:205` (`defaultDrawerPlacement` במצב external).
- אין שינוי ב-renderers ו-cuts: `BoxBodySketch` / `CabinetSketch` מציירים externals דרך `cumulative` offset (לא משתמשים ב-`heightFromFloor`); `calcExternalStackHeight`, `calcFixedShelfHeight`, `getExternalDrawers` משתמשים ב-`drawerHeight` ו-sort בלבד — כולם עובדים בלי שינוי.

### תוקן — מדף חדש שנוסף לאחר מגירה חיצונית + מוט תליה נחת בתוך המגירה
- שורש: הקונבנציה הישנה ל-external (`heightFromFloor = center`) גרמה לבדיקת hanger-shelf בלוגיקת `redistributeShelves` (`drawer.heightFromFloor / 2`) למקם מדף ב-5 ס"מ (= 10/2) **בתוך המגירה** שתופסת 0..20.
- התיקון בקונבנציה פותר את הבאג ללא שינוי לוגיקה: לאחר השינוי, מגירה חיצונית עם `heightFromFloor=0` נכנסת לתנאי `drawer.heightFromFloor > 0` כ-FALSE, ו-hanger-shelf לא מוצב במיקום שגוי. החלוקה ב-round-robin של חזיתות חופשיות פועלת כרגיל ומציבה את המדף בחלל מעל המגירה.
- נוסף 1 בדיקת רגרסיה (`redistributeShelves — regression: rod + external drawer + new shelf`).

### תוקן — מדף קבוע מעל מגירה חיצונית
- **לא הוצג מיד תוך כדי עריכת גוף** עד שהמשתמש יצא מהעורך. שורש הבאג: `BoxInteriorEditor` החזיק `localItems`/`localCellItems` אופטימיים שלא הריצו `syncFixedShelf` בעצמם; ה-shelf נוצר רק ב-state של הפרנט, אבל ה-local copy של העורך (שמשמש את `BoxBodySketch` הפנימי) לא הכיל אותו עד remount.
- **בערימה של 2+ מגירות בתא של גוף עם מחיצה — לא הוצג או במיקום שגוי**. אותו root cause: כש-`localCellItems[ci]` היה ללא ה-fixed shelf, הוספת מגירה שנייה שלחה ל-`syncFixedShelf` items בלי הקיים, וההיוריסטיקה פירשה את זה כ"המשתמש מחק ידנית" → לא נוצר מחדש.
- **תיקון**: `BoxInteriorEditor.update` ו-`updateCell` מריצים `syncFixedShelf` על העותק המקומי לפני `setLocalItems`/`setLocalCellItems`. ה-shelf מופיע מיד ב-`BoxBodySketch` הפנימי. הפרנט (`useCabinet`) ממשיך להריץ את אותו sync על snapshot שלו — אידמפוטנטי. נוסף prop חדש `doorGapMm` ל-`BoxInteriorEditor`.

### תוקן — מיניאטורת גוף הציגה כפילות פריטים בגוף עם מחיצה
- `BoxThumbnail` עשה `cellItems.flat()` ושלח את כל ה-items לתוך `BoxBodySketch` אחד שלא יודע על תאים. תוצאה: external drawers מ-2 תאים נצברו יחד ב-stack אחד בתחתית, מתעלמים ממיקום התא.
- **תיקון**: ב-partition body, המיניאטורה מרנדרת 2 `BoxBodySketch` נפרדים זה לצד זה (left=cell 1, right=cell 0), כל אחד עם `bodyW = (box.W − tBody) / 2` ו-items של התא שלו. ה-CSS class החדש `cellsRow` מציב אותם side-by-side. נוסף prop חדש `tBody` ל-`BoxThumbnail` (ברירת מחדל 1.8).

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
