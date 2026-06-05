# שינויים באפליקציית הנגר

כל השינויים המשמעותיים מתועדים כאן.
הפורמט מבוסס על [Keep a Changelog](https://keepachangelog.com/he/1.1.0/).

---

## [Unreleased]

### שונה — תצוגת המטבח: bodies + fronts באותו layout (overlay במקום מבנה כפול)

ב-`KitchenOverview`, מצבי 'גופים' ו-'חזיתות' היו מבנים נפרדים (BodiesView flex + SVG גדול). תוצאה: גודל וקואורדינטות שונים. **אחוד מלא:**
- `BodiesView` → `UnitsView` (תומך גם `viewMode='fronts'`).
- כש-`fronts`: `<UnitFrontPanelsStandalone>` כ-SVG overlay על `sketchHolder` (אותו viewBox כמו `CabinetSketch embedded`). מעבר חלק — רק "מוסיפים" חזיתות על השרטוט הקיים.
- ה-svg הגדול הישן הוסר (dead code עוטף ב-`{false && ...}`, לפינוי בעתיד).

### שונה — תצוגת drawer box במצב גופים + equalize אוטומטי

- ב-`CabinetSketch` במצב bodies, external drawers מצוירים כעת כ-**drawer box** (קופסת המגירה הפנימית), לא כחזית: רוחב = `innerW − 2.5` ס"מ, גובה = `drawerHeight − 5` ס"מ (2 תחתון + 3 עליון). חזית עצמה מוצגת ב-overlay של fronts בלבד.
- **`equalizeExternalDrawersIfOverflow`** חדש ב-`core/interior/interiorUtils.ts`: כשמוסיפים drawer חיצוני שגורם ל-`totalStackH > bodyH`, כל ה-drawers ב-stack מקבלים גובה אחיד `(bodyH − (n−1)·gap) / n`. אם ה-stack מתאים — אין שינוי.

### שונה — labels בסקיצה משקפים effective dimensions

`wLabel.text` / `hLabel.text` ב-`CabinetSketch.utils.ts` הציגו את `W`/`H` המקוריים מ-input. **תוקן:** מציגים effective — סכום bottom row + envelope לרוחב, סכום `levelHeightMap.values()` + plinth + envelope-top לגובה. ב-embedded mode (KitchenOverview) ה-labels מוסתרים — המידות מוצגות מעל ה-unit בלבד (no duplicate display).

### שונה — `widthForScale` ב-CabinetSketch.utils

ה-scale נמדד עכשיו לפי `effectiveCabW` בלבד (לא `Math.max(W, effectiveCabW)`). תיקון בעיה שבה override של W ל-70 + מעטפת ימין הצמיח את ה-cabinet ל-71.8 אך scale הלך לפי 60, וקטן את הגובה.

### שונה — הסר מוט תליה מעורך גוף מטבח

`BoxInteriorEditor` קיבל prop `hideRodOption?: boolean`. כשטרו — שני כפתורי "+ מוט תליה" (בגוף הראשי ובתאים של מחיצה) מוסתרים. `CabinetForm` מעביר `hideRodOption=true` כש-`hideMainDimensions=true` (kitchen mode בלבד).

### שונה — UI מצומצם בעורך גוף מטבח + מעטפת לכל צד בנפרד

**במטבח בלבד** (ארון רגיל ללא שינוי):
- **תוקן באג labels:** ה-`wLabel`/`hLabel` ב-`CabinetSketch` הציגו את ה-`W`/`H` המקוריים מ-input. כעת מציגים effective dimensions לפי boxes (אחרי overrides) — סכום bottom row + envelope לרוחב, סכום level heights + plinth + envelope-top לגובה.
- **הסר** שדה "דלתות לגובה" (`doorsPerColumn`) — נשאר 'auto' default.
- **הסר** שדה "מעטפת תקרה" (`hasEnvelopeTop`).
- **פירוק** "מעטפת חיצונית" לשני checkboxes נפרדים — **מעטפת שמאל** + **מעטפת ימין** — בגוף קצה במטבח שצמוד לקיר בצד אחד אפשר לבטל את המעטפת באותו צד.

**שינויי core** (backward compatible):
- `CabinetInput` קיבל `hasShellLeft?` ו-`hasShellRight?` אופציונליים. כשundefined → fallback ל-`hasShell`.
- helper חדש `getShellSides(input)` ב-`src/types/cabinet.ts` — single source of truth.
- `computeInnerWidth` ו-`deriveEnvelopeFlags` מקבלים `boolean | { left, right }` — overload מבטיח backward compat ל-callers ישנים.
- `CabinetSketch.utils.computeSketchGeometry` קיבל `shellSides` param אופציונלי. envelopePanels מציירים לפי הצד שמופעל בלבד; boxes/split lines/internal shelves מותאמים ל-insets אקסmmetric.
- `KITCHEN_DEFAULTS` מכיל `hasShellLeft: false, hasShellRight: false`.

### שונה — הסרת כפילות W/H/D בעורך גוף מטבח

בגוף מטבח (kitchen unit) יש רק box אחד (`single:single`) — אין הבדל בין "W של הקבינט" ל-"W של ה-box". לכן שדות W/H/D ב-`CabinetForm` היו כפילות עם עקיפת המידות ב-`BoxInteriorEditor`, וגרמו לחוסר סנכרון (עקיפה ב-BoxInteriorEditor לא התעדכנה בשדות הראשיים).

**תיקון:**
- הוסף prop `hideMainDimensions?: boolean` ל-`CabinetForm`. כשהוא true, שדות W/H/D מוסתרים.
- `App.tsx` מעביר `hideMainDimensions` ל-Level 3 (kitchen unit editor) בלבד. ה-source of truth של המידות בגוף מטבח הוא `boxDimensionOverrides` דרך `BoxInteriorEditor`.
- ה-defaults של W/H/D מ-`kitchenModuleInput()` ממשיכים לזרום ל-form state ול-`calculate()` — אין UI לעדכן אותם ישירות.
- **בארון רגיל (single product) — ללא שינוי.** השדות מוצגים כרגיל.

### תוקן — סנכרון חומרים בין dropdown לרשימת חיתוכים

**שלושה באגים תוקנו:**

1. **שינוי dropdown לא מעדכן את החישוב** — בעת שינוי `bodyMaterialId`/`frontMaterialId` ב-`CabinetForm`, ה-`onChange` רק עדכן את ה-form state, בלי לקרוא ל-`calculate()`. כתוצאה: ה-dropdown הציג חומר חדש אבל `result.cuts` (וה-saved input ב-project) השתמשו עדיין בחומר הישן. **תיקון:** ה-`onChange` מבצע recalculate מיידי עם הקלט המעודכן (live update, ללא צורך ללחוץ "חשב").

2. **`CabinetSketch` לא הכיר custom materials** — קרא ל-`getEffectiveMaterial(materialId)` שמסתכל רק על קטלוג. כש-`bodyMaterialId` הוא `custom_xyz`, הפונקציה החזירה fallback לחומר ראשון בקטלוג, וה-board model צויר עם עובי שגוי. **תיקון:** הוסף prop `customMaterials?` ל-`CabinetSketch` ושימוש ב-`getMaterialWithCustom`. `CabinetForm` ו-`KitchenOverview/BodiesView` מעבירים את הרשימה.

3. **useEffect דורס את החומר השמור** — useEffect שמסנכרן `form.bodyMaterialId` בדק מול `bodyEnabledMaterialIds`. אם החומר השמור לא היה checked ב-settings (למשל המשתמש הסיר checkbox אחרי שנשמר), ה-effect דרס אותו ל-first available. **תיקון:** ה-effect בודק מול `allMaterials` (קטלוג + custom) במקום מול ה-enabled list — דריסה רק אם החומר נמחק לחלוטין. בנוסף, ה-dropdown תמיד כולל את החומר הנוכחי גם אם הוא לא checked.

### נוסף — תצוגת המטבח: ציור גופים מלא + טאבים לחיתוכים ופרזולים מאוחדים

**שינוי גדול בקומפוננטה `KitchenOverview`:**
- **4 טאבים במקום 2**: גופים | חזיתות | חיתוכים | פרזולים
- **טאב "גופים"** — כל unit מצוייר ב-`CabinetSketch` (embedded mode) במקום rectangle פשוט. רואים boards עם עובי חומר, מדפים כ-boards, partitions, envelope, ו-sink basin.
- **טאב "חיתוכים"** — `CutsList` עם cuts מכל ה-units יחד (מקובץ לפי חומר), שם unit כ-prefix בכל פריט.
- **טאב "פרזולים"** — `HardwareList` עם hardware מצטבר מכל ה-units (items עם specId זהה מסוכמים).
- **טאב "חזיתות"** — נשמר כפי שהיה (SVG קיים עם FrontPanels).

**ארכיטקטורה:**
- **`src/core/cabinetCompute.ts`** (חדש) — `computeUnitCutsAndHardware(input, savedState, customMaterials)` pure function שמחשבת cuts + hardware של unit בודד בלי React/refs. משכפלת את הלוגיקה מ-`useCabinet.calculate()` — מאפשרת חישוב באצווה על מספר units.
- **`CabinetSketch`** קיבל props חדשים: `embedded?`, `topVariant?`, `sinkTraverseWidthCm?`. ב-embedded mode מחזיר רק `<svg>` (ללא wrapper div ו-title). תומך בציור sink basin אם `topVariant === 'sink-open'`.
- **`KitchenEditor` ו-`App.tsx`** — מעבירים `settings` עד ל-`KitchenOverview` כדי לאפשר custom materials במחיר/עובי.

### שונה — דף חומרים בהגדרות: רשימה אחידה עם checkboxes

**ארכיטקטורה חדשה (שינוי מהותי):**
- **AppSettings** — עבר ל-v2 (localStorage key `carpenter-settings-v2`). הוסרו `bodyCustomMaterials`, `frontCustomMaterials` ושדות ה-nameOverrides/thicknessOverrides. במקומם:
  - `customMaterials: CustomMaterial[]` — רשימה משותפת לכל הקטגוריות
  - `bodyEnabledMaterialIds: string[]` — אילו חומרים (קטלוג + custom) מופיעים ב-dropdown גוף
  - `frontEnabledMaterialIds: string[]` — אילו מופיעים ב-dropdown חזית
- **SettingsPage** — עיצוב מחדש מלא: שני טאבים (גוף/חזית), כל טאב מציג **רשימה אחת אחידה** של כל החומרים (קטלוג + custom) עם checkbox ליד כל שורה. checkbox מסומן = מופיע ב-dropdown הרלוונטי.
  - קטלוג: שם ועובי read-only, מחיר עריך
  - custom: כל השדות עריכים + כפתור הסר
  - חומר custom חדש: מתווסף unchecked (הנגר בוחר מתי להפעיל)
- **CabinetForm** — לוגיקת `availableBodyMaterials`/`availableFrontMaterials` חדשה: מסנן `allMaterials` לפי enabled IDs
- **useCabinet** — מקבל `customMaterials` (במקום `bodyCustomMaterials` + `frontCustomMaterials`)

### תוקן — בעיות בחירת חומרים מותאמים

**תיקונים:**
- **CabinetForm** — כשאין עדיין custom materials, dropdown החומרים מציג fallback לקטלוג כדי לא להשאיר dropdown ריק
- **CabinetForm** — הוסף `useEffect` שמריץ `calculate` מחדש כשsettings משתנו (למשל כשמוסיפים custom material בהגדרות)
- **useCabinet** — קיבל `settings` כפרמטר כדי לתמוך בcustom materials. משתמש ב-`getMaterialWithCustom` כדי לחפש תכונות חומר (thickness) גם בcustom materials
- **CutsList** — `groupByMaterial` מוסיף עכשיו custom material groups לפלט (לא רק catalog + `__none__`)
- **CutsList** — משתמש ב-`getMaterialWithCustom` כדי להביא שמות custom materials, לא רק catalog materials
- **CabinetForm** — הוסף `useEffect` שמאפס `bodyMaterialId`/`frontMaterialId` לסלקציה הראשונה הזמינה כשhavailable materials משתנות (מונע מצב שbodyMaterialId=`mdf18` בזמן dropdown מציג custom material)
- **BoardModel** — `buildBoardModel` ו-`buildPlinthBoardModel` תומכות עכשיו בCustomMaterial union types
- **CutItem interface** — `materialId` יכול להיות `MaterialId | string` כדי לתמוך בcustom material ids
- **Board interface** — `materialId` יכול להיות `MaterialId | string` כדי לתמוך בcustom material ids

### נוסף — מודולי מטבח: גופים מוכנים ויחידת כיור

**תשתית ליבה:**
- **`topVariant?: 'standard' | 'sink-open'`** + **`sinkTraverseWidthCm?`** ב-`CabinetInput` — מגדיר שיחידת כיור אין לה תקרה אלא שתי קורות רוחב (traverses) בחלק הקדמי והאחורי.
- **roles חדשים** ב-`BoardRole`: `'sink-traverse-front'`, `'sink-traverse-back'` — מחליפים את `'top'` כשהדגל פעיל.
- **`buildBoardModel`** — כשה-`topVariant === 'sink-open'`: ב-rabbet מוציא `(W-2t) × tw` ×2; ב-butt מוציא `W × tw` ×2. Edging pattern: `'front'` (כמו top).
- **`PairLabels.sinkTraverses`** + זוג חדש ב-`mergeCutItems` — שתי קורות הרוחב מתמזגות לשורה אחת "קורת רוחב קדמית / אחורית".
- **`kitchenModules.ts`** — `kitchenModuleInput(type, W?)` + `kitchenModuleState(type)` לשלושה מודולים: `drawers` (3 מגירות חיצוניות 32/32/16), `shelves` (2 מדפים), `sink` (כיור, topVariant='sink-open').

**ארכיטקטורת מוצר מטבח:**
- **`KitchenUnit`** חדש ב-`types/project.ts` — גוף יחיד בתוך מטבח עם `moduleType`, `cabinet`.
- **`ProductUnit.kitchenUnits?: KitchenUnit[]`** — רשימת גופים עבור מוצרי מטבח.
- **`useProject`** — נוספו `addKitchenUnit`, `removeKitchenUnit`, `updateKitchenUnit`, `renameKitchenUnit`.
- **`KitchenEditor.tsx`** — מסך ניהול גופי המטבח: רשימה ממוספרת, כפתורי עריכה/מחיקה, טופס הוספת גוף עם בחירת סוג + רוחב.
- **`App.tsx`** — ניתוב 3 רמות: פרויקט → עורך מטבח → עורך גוף בודד.

### נוסף — שמירה ושחזור state מלא של מוצר בפרויקט
- **`getSnapshot(): SavedCabinetState`** ב-`useCabinet` — בונה את ה-state הנוכחי מה-refs (interior, cellInterior, partitions, doors, overrides) עם rekey מ-box.id ל-boxStableKey. קריאה סינכרונית — בטוחה מיד אחרי `calculate()`.
- **`restoreState(state): void`** ב-`useCabinet` — מאפסת refs, מאכלסת `pendingRestoreRef`, ומריצה `calculate()` מחדש. ב-`calculate()` נוסף בלוק שצורך את `pendingRestoreRef` ומאכלס את ה-stable maps (interior, cells, partitions, doors) מה-state השמור.
- **`boxDimensionOverrides?`** נוסף ל-`SavedCabinetState` — שומר override מידות גוף יחד עם שאר ה-state.
- **`CabinetForm`** — קיבל `initialState?: SavedCabinetState` (קורא ל-`restoreState` ב-mount) ו-`onCabinetChange(input, state)` (מעביר snapshot מלא אחרי כל calculate).
- **`App.tsx`** — `onCabinetChange` שומר עכשיו `{ input, state }` מלא לפרויקט; `initialState` מועבר לעורך בפתיחת מוצר. מחיקת `emptyCabinetState` מה-bridge.

### נוסף — ניהול פרויקטים + סוגי מוצרים
- **`ProductType`** חדש (`'wardrobe'|'bookcase'|'sideboard'|'kitchen'|'free-build'`) + **`ProductUnit`** ב-`types/project.ts`. `Project` עבר מ-`cabinet: Cabinet` ל-`products: ProductUnit[]`.
- **Migration v1→v2** ב-`migrations.ts` — `CURRENT_SCHEMA_VERSION=2`; cabinet יחיד נעטף ב-`ProductUnit` מסוג `'wardrobe'`.
- **`productDefaults.ts`** — `defaultInputForType` + `emptyCabinetState` לאיתחול מוצר חדש.
- **`useProject` hook** — ניהול פרויקט פעיל: `addProduct`, `removeProduct`, `updateProductCabinet`, `renameProject/Product`, `newProject`; auto-save ל-`localStorage`; `exportProject` (download JSON) + `importProject` (FileReader → deserialize).
- **`ProjectView`** — מסך פרויקט: כותרת הניתנת לעריכה, כרטיסי מוצרים (שם+סוג+מידות), כפתורי שמור/פתח/חדש.
- **`AddProductDialog`** — בחירת סוג מוצר (5 אפשרויות) + שם → `addProduct`.
- **`App.tsx`** — view switch: מסך פרויקט ↔ עורך מוצר; כפתור "חזרה לפרויקט" ב-header.
- **`CabinetForm`** — קיבל `initialInput?` (טעינת מוצר קיים) + `onCabinetChange?` (auto-save input אחרי כל calculate).
- טסטי serialize עודכנו למבנה החדש; נוספו: round-trip ריבוי מוצרים, migration v1→v2, validation productType. 597/597 עוברים.

### נוסף — עקיפת מידות גוף (Box Dimension Override)
- **`boxDimensionOverrides`** ב-`useCabinet` — Map<boxStableKey, {W?, H?, D?}>; דפוס זהה ל-`bodyEdgingOverrides`.
- **`setBoxDimension(slotId, axis, value | undefined)`** + **`resetBoxDimensions(slotId)`** — setters; כל שינוי מפעיל `calculate()` מחדש.
- **`CabinetResult.derivedBoxDims`** — Map המכיל את מידות `decomposeBoxes` לפני ה-override; מוצג כ-placeholder אפור בשדות הUI.
- **UI ב-`BoxInteriorEditor`** — סקשן "עקיפת מידות גוף" עם שלושה inputs (W/H/D); שדה שלא שונה מציג את הנגזר כ-placeholder; שדה שונה גבול כחול; כפתור "אפס מידות" מופיע כשיש override כלשהו.
- Override משפיע על ה-**boards של הגוף בלבד** — לא משנה את חלוקת הגופים הכללית; הנגר אחראי לקוהרנטיות.

### נוסף — רשימת פרזולים (HardwareList)
- **`calcHardware(doorsById, interiorById, cellInteriorById)`** חדש ב-`core/hardware/calcHardware.ts` — סופר דלתות (`hasDoor`), מגירות, ומדפים מכל הגופים (כולל תאי מחיצה) וקורא ל-`buildHW('cabinet', ...)` הקיים.
- **`CabinetResult.hardwareItems`** חדש — מחושב בכל `calculate()` ב-`useCabinet`.
- **`HardwareList.tsx`** — קומפוננטה חדשה: טבלת פרזולים עם שם, כמות, יחידה, מחיר יחידה, סה"כ, ושורת סיכום עלות כוללת.
- **טאב "פרזולים" / "Hardware"** ב-`CabinetForm` — מוצג אחרי טאב "חיתוכים"; הסקיצה נשארת בתצוגה (כמו טאב חיתוכים).
- תרגומים חדשים `hardwareList.*` (HE/EN) ב-`translations.ts`.

### תוקן — תצוגת מידות ב-CutsList + רזולוציית עיגול ב-boardsToCutItems
- **Bug 1 — ספרות עשרוניות**: `CutsList` הציג מידות עם `toFixed(1)` (ספרה אחת) אחרי שנוסף `format2`. תוקן: `format2(lengthCm)` / `format2(widthCm)` לאורך/רוחב; `c.qty` ו-`totalPieces` נשארים שלמים (לא format2) כדי למנוע "1.00" בשדה כמות.
- **Bug 2 — override edging בלתי גלוי ברשימה**: `boardsToCutItems` עיגל `w`/`h` ל-mm שלם (`Math.round(... * 10)`). הפרש 0.7mm בין edging 0.6mm ל-1.3mm נבלע בעיגול → שתי השורות קיבלו `mergeKey` זהה ואוחדו. תוקן: רזולוציה 0.01mm (`Math.round(... * 1000) / 100`) מונעת אובדן ההפרש; `format2` ב-UI מציג 2 ספרות נכון.
- **טסט רגרסיה**: נוסף ב-`boardModel.test.ts` — case עם D=60cm שבו הנוסחה הישנה מסכה את ה-override; 595/595 עוברים.

### נוסף — Project wrapper לתשתית cloud-readiness (schemaVersion + migrations + serialize)
- **`Project`** חדש (`types/project.ts`) — עטיפת ארון שמור עם `schemaVersion`, `projectName?`, `createdAt?`, `updatedAt?`, ו-`cabinet: Cabinet`. מיועד ל-cloud save עתידי; אין UI חדש בשלב הזה.
- **`Cabinet = { input: CabinetInput, state: SavedCabinetState }`** — `CabinetInput` הוצא ל-`types/cabinet.ts` (היה ב-`ui/hooks/useCabinet.ts`) כדי שטיפוסים יהיו ב-`types/` בלבד. `useCabinet.ts` עדיין מייצא אותו לתאימות לאחור.
- **`SavedCabinetState`** — שש מפות `Record<string, ...>` לבחירות משתמש: `interior`, `cellInterior`, `partitions`, `doors`, `plinthGableOverrides`, `boardOverrides`. כולן ממופתחות לפי stable identifier (`BoxSlotId` או `Board.stableId`).
- **`SavedDoor` / `SavedHinge` / `SavedBoardOverride`** — תת-קבוצות של הטיפוסים ה-runtime, שומרות רק שדות בחירת משתמש. שדות נגזרים (`height`, `width`, `coversSkirt`, `gapMm`, `id` של hinge) משוחזרים ב-`calculate()`. `Hinge.id` ב-runtime יוקצה מחדש בעת deserialize דרך `newItemId()`.
- **`BoxSlotId` / `DoorSlotKey`** — type aliases חדשים. `BoxSlotId` הוא `string` ב-placeholder; ריפקטור ל-id יציב הוא משימה עתידית — ראה `DECISIONS_LOG.md` 2026-05-29.
- **`core/project/migrations.ts`** — `CURRENT_SCHEMA_VERSION = 1`, `Migration` type, registry ריק `migrations`, ופונקציית `migrate(data): Project`. זורקת על non-object, schemaVersion חסר/לא תקין, גרסה עתידית, או שלב migration חסר.
- **`core/project/serialize.ts`** — `serializeProject(project): string` (`updatedAt` תמיד נקבע ל-now, `createdAt` נקבע אם חסר) ו-`deserializeProject(json): Project` (`JSON.parse → migrate → validateProject`). ולידציה רדודה: schemaVersion, `cabinet` object, כל מפתחות `REQUIRED_INPUT_KEYS` ב-`input` עם types נכונים, `doorsPerColumn ∈ {'auto',1,2,3}`, כל ששת השדות ב-`state` כ-plain objects. `lowerDoorH`/`middleDoorH` excluded מ-`REQUIRED_INPUT_KEYS` כי `JSON.stringify` מפיל `undefined` (טיפוס `number | undefined`).
- **`APP_DEFAULTS`** נשמר (עדיין בשימוש ב-`sheetCalculator.ts` ו-`doorCalc.ts`). `CabinetUnit` ו-`PriceSummary` הוסרו כקוד מת — לא היו בשימוש בשום מקום והם דמיינו עולם רב-ארונות שלא קיים.
- **30 טסטים חדשים** ב-`src/core/project/serialize.test.ts`: 8 round-trip לארונות מייצגים (בסיסי, צוקל, נסוג+מעטפת, dim override, material override, גיבלים נגררים, W>80, שילוב הכל), 1 round-trip מפורש ל-`lowerDoorH=undefined`, 4 timestamps (updatedAt/createdAt/immutability), 6 migration (גרסה נוכחית/עתידית/חסרה/0/string/non-object), 11 validation (JSON פגום, cabinet/input/state חסרים, שדה חסר, type שגוי, doorsPerColumn מחוץ לטווח, boolean שגוי, interior כ-array, state חסר שדה, round-trip מלא). סה"כ 563/563 עוברים.
- **Boundary-free design**: `serialize.ts` לא מטפל בהמרת Map↔Object של state ה-runtime ב-`useCabinet` (`partitionsById`, `plinthGableOverrides`, `boardOverridesByStableId` הם Maps). ה-bridge ייבנה במשימה נפרדת כשנחבר לפיצ'ר שמירה אמיתי — ראה `DECISIONS_LOG.md` 2026-05-29.
- **תיעוד**: `ARCHITECTURE.md` קיבל סעיף "Project schema & migrations"; `DECISIONS_LOG.md` קיבל שתי החלטות (boundary-free + BoxSlotId זמני); `GLOSSARY.md` קיבל סעיף "Project / שמירה" עם 11 מונחים חדשים.

### שונה — BoardModel כמקור-אמת יחיד למידות לוחות + שכבת override פר-לוח
- **`Board.stableId: string`** חדש (חובה). יציב בין `calculate()` rebuilds; מפתח לאחסון overrides. `Board.id` ה-ad-hoc נשמר אך משמש רק כ-React key.
- **שכבת override**: `useCabinet` חושף `boardOverridesByStableId: Map<stableId, { dimensions?, materialId? }>` + 5 setters (`setBoardDimensionOverride`/`reset`, `setBoardMaterialOverride`/`reset`, `resetAllBoardOverrides`). דפוס זהה ל-`userPositionX` של גיבלי הצוקל: `override ?? derived`.
- **`getDimension(board, key, overrides)`** ו-**`getMaterial(board, overrides)`** ב-`core/boards/boardModel.ts` — נקודת קריאה אחידה לערכים אפקטיביים. `boardsToCutItems` קיבל פרמטר `overrides` (ברירת מחדל Map ריק → תאימות לאחור).
- **`computeCarcassDepth`** ו-**`computeInnerWidth`** חדשים ב-core — מבטלים את ה-3 כפילויות של נוסחאות `carcassD`/`innerW` שהיו ב-`CabinetSketch.tsx`, `CabinetSketch.utils.ts`, ו-`CabinetForm.tsx`. `useCabinet` חושף `carcassD` ו-`innerW` על `CabinetResult` כדי שצרכני UI יקראו, לא יחשבו.
- **`CabinetCutSketch`** קיבל `overrides` prop ומסמן effective material דרך `data-material` ו-`data-material-overridden` ב-`<rect>`. ה-rect הוויזואלי עצמו נשאר ב-`xFrom..yTo` נגזרים.
- **`PlinthEditor`** קיבל `boardOverrides` prop. תווית הרוחב נגזרת מ-`getDimension('length')` של `plinth-back`; תווית העומק = `back.yTo − frontMost.yFrom` (קואורדינטות המודל) — אין יותר חישוב `cabinetD − recess` בקומפוננטה.
- **`CabinetResult`** הורחב ב-`carcassD: number, innerW: number`.
- **23 בדיקות חדשות** ב-`boardModel.test.ts`: `boardStableId` × 3, `computeCarcassDepth`/`InnerWidth` × 2, `getDimension`/`getMaterial` × 5, override semantics (set + reset על length / materialId / thickness) × 3, ו-consistency lock ב-9 תרחישים מייצגים (גוף, מדפים, צוקל בסיסי, צוקל נסוג, צוקל עם חיפוי, חיפוי + נסיגה, גוף > 80, override מעורב, BoardDimensionKey compile-time check). 533 בסך הכל עוברים.
- **תיעוד**: `DESIGN_PRINCIPLES.md` קיבל עיקרון שביעי ("BoardModel כמקור-אמת יחיד"); `ARCHITECTURE.md` עודכן עם זרימת ה-override; `DECISIONS_LOG.md` 2026-05-29 מתעד את ההחלטה ואת הטריידאוף לעומת `userLength?` ישירות על `Board`.

### נוסף — חיפוי קדמי לצוקל + אופציית "צוקל נסוג"
- **חיפוי צוקל** (role חדש `'plinth-front-cladding'`) — לוח קדמי **נוסף** של הצוקל, מחומר החזיתות (`frontMaterial`), שיושב לפני ה-`plinth-front` של חומר הגוף. מידות זהות ל-`plinth-front` (אורך = cabinetW, גובה = `plinthH − LEVELER_GAP_CM`), עובי = `tFront`. ה-`plinth-front` הקיים נסוג ב-`tFront` ועומק החיתוך של הגיבלים מתקצר ב-`tFront`. מופיע ברשימת החיתוכים כ-"חיפוי צוקל" תחת קבוצת חומר החזיתות.
- **צוקל נסוג (recessed plinth)** — `CabinetInput.plinthRecess: number` (ברירת מחדל 0). כשהערך > 0, כל הקצה הקדמי של הצוקל זז אחורה ב-`recess` ס"מ; הקצה האחורי לא זז; אורך הגיבלים מתקצר באותה כמות. הקרקס המלא של הארון לא משתנה — הנסיגה היא חלל ריק בתוך ה-footprint.
- **`BuildPlinthBoardModelArgs`** קיבל שני שדות אופציונליים: `frontMaterial?: Material` (כשמסופק → cladding) ו-`recessCm?: number` (ברירת מחדל 0). שניהם backward-compatible — בדיקות יחידה ישנות שלא מעבירות אותם ממשיכות לפעול ללא שינוי.
- **`useCabinet`** מעביר `frontMaterial` תמיד ל-`buildPlinthBoardModel` (production), ואת `plinthRecess` מ-`CabinetInput`.
- **PlinthEditor**: ב-header נוסף checkbox "צוקל נסוג" + שדה מספרי "נסיגה (ס"מ)" שמופיע רק כשה-checkbox דלוק. כיבוי שולח 0 למודל אך שומר את הערך המקומי כדי שהפעלה חוזרת תשחזר אותו. בתצוגת על — לוח החיפוי מצויר ב-`--color-fronts` (כתום) כדי להבחין מהקדמי של הגוף.
- **`CabinetForm.applyPlinthUpdate({ plinth?, plinthRecess? })`** — helper משותף חדש שמחליף את `handlePlinthHeightChange` הישן. שני handlers (גובה + נסיגה) משתמשים בו, מבטל כפילות לוגיקה.
- **תרגומים חדשים** ב-`cutsList`: `plinthRecessedLabel`, `plinthRecessLabel` (HE/EN).
- **12 בדיקות חדשות** ב-`boardModel.test.ts`: 6 לחיפוי (without/with frontMaterial, shift של plinth-front, קיצור גיבל, plinth-back ללא השפעה, materialId נכון ב-cut list) + 6 לנסיגה (recess=0 → identical, shift של plinth-front, קיצור גיבל בדיוק ב-recess, recess+cladding משולב, cabinet outline נשמר, recess שלילי clamped ל-0). 510/510 עוברים.
- **תיעוד**: `CARPENTRY_RULES.md` קיבל סעיפי "חיפוי צוקל" ו-"צוקל נסוג"; `GLOSSARY.md` הוסיף שני המונחים.

### נוסף — עורך צוקל: גובה ניתן לעריכה + גרירת גיבלים חופשית
- **שדה גובה צוקל** ב-header של `PlinthEditor` — input מספרי בס"מ עם min 3, step 0.5, commit ב-blur/Enter. שינוי הערך מפעיל `calculate()` מלא דרך `CabinetForm.handlePlinthHeightChange`, כך שכל ה-board models והגב מתעדכנים live.
- **גרירה חופשית של גיבלים** — `mousedown` על לוח א' של כל גיבל מתחיל drag (cursor `ew-resize`). `mousemove` מעדכן live עם snap 0.5 ס"מ ו-clamp ל-gaps תקפים (gap-analysis: חוסם חפיפה עם גיבל אחר במרחק `≥ tBody`). `mouseup` שומר את ה-override; `Esc` משחזר למיקום שלפני הגרירה.
- **כפתור "אפס מיקומי גיבלים"** ב-header — מנקה את כל ה-overrides ומחזיר את הגיבלים ל-defaults (flush/centered/mid-body).
- **`PlinthGable.id` + `userPositionX?`**: כל גיבל קיבל id יציב (`edge-left`, `joint:0`, `mid-body:1`, `edge-right`) שמשמש כמפתח במפת ה-overrides. ה-`direction` נשמר — כיוון לוח ב' לא משתנה בעקבות גרירה.
- **`buildPlinthBoardModel` קיבל `gableOverrides?: ReadonlyMap<string, number>`** — דורס את ה-left edge של לוח א'. גיבל ללא override → ברירת המחדל הקיימת (flush/centered).
- **`useCabinet` חושף**: `plinthGableOverrides`, `setPlinthGableOverride(id, x | undefined)`, `resetPlinthGableOverrides()`. כל שינוי מפעיל re-calculate כך שרשימת החיתוכים תקבל את לוחות הגיבל החדשים.
- **helpers חדשים** ב-`boardModel.ts` (יוצאים לשימוש חיצוני): `defaultPlinthGableLeftX`, `effectivePlinthGableLeftX`, `snapPlinthGableX` (קבוע `PLINTH_GABLE_SNAP_CM = 0.5`), `clampPlinthGableX` (gap analysis עם bounds + overlap).
- **תרגומים חדשים** ב-`cutsList`: `plinthHeightLabel`, `plinthResetGables`, `plinthResetGablesTooltip` (HE/EN).
- **19 בדיקות חדשות** ב-`boardModel.test.ts`: `snapPlinthGableX` × 1, `defaultPlinthGableLeftX` × 3, `effectivePlinthGableLeftX` × 2, `clampPlinthGableX` × 6 (bounds, overlap, override, no-slot, valid gap left of override), `buildPlinthBoardModel — overrides` × 5 (edge-left, flush-right direction, joint, absent → identical, snapshot), stable-ids × 1, ועוד.
- **`docs/DECISIONS_LOG.md` 2026-05-28** — "גיבלי צוקל: גרירה חופשית, כללי flush/centered = defaults" עם הסבר על מודל ה-ID והטריידאוף לעומת alternative IDs.

### נוסף — BoardModel לצוקל + עורך צוקל (PlinthEditor) ממבט על
- **`buildPlinthBoardModel(args)`** חדש ב-`core/boards/boardModel.ts`. הצוקל מיוצר עכשיו ברמת הארון (לא per-body): קדמי, אחורי, וגיבלים דינמיים. נקרא מ-`useCabinet` עם רק גופי השורה התחתונה (`level === 'bottom' | 'single'`).
- **גיבל = L-shape** (לוח א' עומד כקיר + לוח ב' שוכב כמכסה עליון). שני הלוחות באותו חיתוך: `(D − 2·tBody) × (plinthH − LEVELER_GAP_CM)`. בתצוגת על: footprint = `(tBody + plinthH − 0.6) × (D − 2·tBody)`.
- **`calcPlinthGables(cabinetW, boxes, tBody)`** חדש — לוגיקת מיקום:
  - גיבל שמאל: flush ב-`x=[0, tBody]`, לוח ב' נמשך ימינה.
  - גיבל ימין: flush ב-`x=[cabinetW − tBody, cabinetW]`, לוח ב' נמשך שמאלה.
  - חיבור בין גופים סמוכים: גיבל ממורכז על `xJoint`, לוח ב' ימינה.
  - גוף רוחב > 80 ס"מ: גיבל נוסף ב-`box.x + W/2`, לוח ב' ימינה.
- **`PlinthEditor`** (חדש, `ui/components/PlinthEditor.tsx` + `.module.css`) — תצוגת על SVG: outline של הארון, קדמי/אחורי כפסים, כל גיבל כ-L-shape מובחן בצבעים (לוח א' כהה, לוח ב' בהיר). קווי חיבור מקווקווים בין גופים. תוויות מימדים בצבעי width/depth.
- **טאב "צוקל" / "Plinth"** רביעי ב-`CabinetForm`, מוצג רק כש-`plinthHeight > 0`. `sketchMode` הורחב ל-`'bodies' | 'fronts' | 'cuts' | 'plinth'`.
- **roles חדשים ב-`BoardRole`**: `'plinth-gable-a'`, `'plinth-gable-b'`. `ROLE_NAME_HE` ו-`ROLE_GROUP` עודכנו (group = `'plinth'`).
- **mergeCutItems**: זוג חדש `[plinth-gable-a, plinth-gable-b]` → "גיבל צוקל" qty=2N (שני לוחות לכל גיבל, מאוחדים לשורה אחת).
- **`PairLabels.plinthGables`** חדש; `t.cutsList.pairPlinthGables` ב-translations (HE: "גיבל צוקל", EN: "Plinth Gable").
- **`Board.yFrom/yTo`**: סמנטיקה כפולה — לוחות קרקס: y אנכי בתצוגת חזית; לוחות צוקל: y = עומק בתצוגת על. תועד מפורשות ב-interface.
- **boardsToCutItems**: לוחות צוקל וגב מקבלים שם ללא tag של גוף (כמו בגב — הם cabinet-level), כך שלוחות זהים מאחדים ב-mergeCutItems.

### הוסר — `plinthHeight` מ-`BuildBoardModelArgs`
- ה-`buildBoardModel` הקיים לא פולט יותר `plinth-front`/`plinth-back`. הצוקל הוא source נפרד דרך `buildPlinthBoardModel`. אין שכפול ברשימת החיתוכים; אין `plinth-front` per-body שיוצר מראה מחולק בסקיצה. `useCabinet` ו-`CabinetSketch` כבר לא מעבירים את הפרמטר.

### תוקן — שיטת חיבור לוחות (rabbet/butt) נקבעת ברמת הארון, לא ברמת הגוף
- **שורש הבאג**: `resolveJointMethod(box)` נקרא בתוך `buildBoardModel` עם הקופסה הספציפית של כל גוף. בארון 2-קומות שגובה הגוף התחתון נופל מתחת ל-W/2 (למשל W=200, H=130, plinth=10 → top H=71.5 → rabbet, bottom H=48.5 → butt), שיטת החיבור התהפכה בין הקומות. תוצאה: תקרה/רצפה של העליון באורך `W − 2·tBody = 94.6 ס"מ` ושל התחתון באורך `W = 98.2 ס"מ` — פער של 3.6 ס"מ למרות שרוחב הארון זהה.
- **התיקון**: נוסף helper חדש `resolveCabinetJointMethod(cabinetW, cabinetH)` ב-`core/boards/boardModel.ts` שמקבל את המידות החיצוניות של הארון. `useCabinet.calculate()` ו-`CabinetSketch` מחשבים את הערך **פעם אחת** לפני לולאת הגופים ומעבירים אותו כ-`joint` ל-`buildBoardModel` של כל גוף.
- **API חדש ב-`BuildBoardModelArgs`**: `joint?: JointMethod` — override אופציונלי. כשלא מסופק, `buildBoardModel` חוזר ל-`resolveJointMethod(box)` (תאימות לאחור עם בדיקות היחידה). הקריאות מ-`useCabinet` ומ-`CabinetSketch` מספקות תמיד `joint` כדי לכפות עקביות בין רמות.
- **תוצאה**: בארון מרובה קומות, כל הגופים מקבלים אותה שיטת חיבור ואותה נוסחת אורך לתקרה/רצפה. גוף בודד שגובהו דק במיוחד לא משפיע על הקומות האחרות.
- **בדיקות חדשות** ב-`boardModel.test.ts`: (א) override joint מצליח לכפות `butt` על גוף שהיה rabbet ברירת מחדל; (ב) override `rabbet` על גוף שהיה butt; (ג) `resolveCabinetJointMethod` נכון עבור `200×130 → rabbet` ועבור `240×80 → butt`; (ד) regression — תרחיש המקור (שני גופים W=98.2 בגבהים שונים) מפיק תקרה/רצפה זהים אחרי החלטה ברמת הארון.
- **docs/CARPENTRY_RULES.md**: סקציית "שיטת חיבור לוחות" עודכנה — הכלל הוא ברמת הארון, עם הסבר מפורש למה לא ברמת הגוף.

### תוקן — מדף נחתך בדיוק כמו תקרה/רצפה (ללא reveal)
- `SHELF_WIDTH_REVEAL_CM` ו-`SHELF_DEPTH_REVEAL_CM` ב-`core/boards/boardModel.ts` שונו מ-`0.1` ו-`2.0` ל-`0`. תוצאה: מדף רגיל, מדף קבוע ו-internal-shelf מקבלים `length = W − 2·tBody` ו-`width = D` — זהה לחלוטין ללוח התקרה/רצפה של אותו גוף. לא מתבצעת עוד הקטנה של 1 מ"מ לצדדים ולא הקטנה של 20 מ"מ מהעומק.
- הקבועים נשמרים כ-`export` ב-API לתאימות לאחור ולכך שניתן להחזיר reveal בעתיד בלי לשנות חתימות. הסכמה והערות עודכנו כדי לתעד שהערך הנוכחי הוא 0.
- בדיקות ב-`boardModel.test.ts` (sections "shelves from items", "shelf dimensions match top/bottom") עודכנו לבטא את המוסכמה החדשה: assertions משתמשים ב-`W − 2·t` ו-`D` ישירות, ובדיקה אחת מאמתת `shelf.length === top.length` כך שכל שינוי עתידי שיחזיר reveal ייתפס מיד.
- `docs/CARPENTRY_RULES.md`: סקציית "מדף — Reveal offsets" שונתה ל-"מדף — מידות זהות לתקרה/רצפה".

### תוקן — 3 תיקונים נגריים ברשימת החיתוכים
- **מדפים לא הופיעו ברשימת החיתוכים**: `setBoxInterior` / `setCellItems` ב-`useCabinet` קראו ל-`calculate()` רק כש-`externalStackChanged` (שינוי בערימת מגירות חיצוניות). תוצאה: הוספת מדף דרך עורך הפנים עדכנה את ה-`interiorById` אבל לא הריצה את `buildBoardModel` מחדש, כך ש-`result.cuts` נשאר ללא המדף. תיקון: שני ה-callbacks מריצים `calculate(lastInputRef.current)` תמיד כשיש קלט שמור — הלוגיקה ה-inline של עדכון hinges הוסרה (calculate ממילא מחשב hinges דרך `recomputeDoorHinges` בלולאת הדלתות).
- **גב הארון: מידות חיצוניות מלאות**: עד היום הגב נחתך ב-`(W − 2·tBody) × (H − 2·tBody)` (נכנס בין הצדדים). תיקון: הגב נחתך כעת ב-`W × H` (רוחב מלא של הגוף כולל עובי שני הלוחות הצדדיים, גובה מלא ללא הקטנה). זה הסטנדרט הנגרי לארונות בטור — לוח הגב מורכב מאחור כ-overlay על הקצוות, לא בין הלוחות. `back.xFrom/yFrom = 0` ו-`xTo/yTo = W/H` (visual גם אם `visible: false`).
- **מעטפת צדדים: גובה = cabinetTotalH − 6 מ"מ**: `envelope-left` / `envelope-right` חתכו ב-`length: H` של הגוף הבודד. עכשיו `length = cabinetTotalH − LEVELER_GAP_CM`, כאשר `LEVELER_GAP_CM = 0.6` (קבוע חדש ב-`boardModel.ts`). הסיבה הנגרית: הגבהות פלסטיק של 6 מ"מ בתחתית הארון — הצדדים החיצוניים חייבים להיות קצרים ב-6 מ"מ כדי לשבת על ההגבהות. פרמטר חדש `cabinetTotalH?: number` ב-`BuildBoardModelArgs` (default = `box.H` לתאימות עם בדיקות יחידה). `useCabinet` מעביר `cabinetTotalH: H` (ה-H של קלט הטופס — כולל צוקל ומעטפת תקרה).

### נוסף — טאב "חיתוכים" עם רשימת לוחות מסודרת לפי חומר + ייצוא PDF
- **טאב שלישי** "חיתוכים" / "Cuts" ב-`CabinetForm`, ליד "גופים" ו"חזיתות". `sketchMode` הורחב ל-`'bodies' | 'fronts' | 'cuts'`. במצב חיתוכים מוצגת סקיצת הגופים כתצוגת ייחוס מעל הרשימה.
- **`CutsList`** (חדש, `src/ui/components/CutsList.tsx` + `.module.css`) — מקבץ את `result.cuts` לפי `materialId` (חומר מהקטלוג מופיע ראשון בסדר ה-`MATERIALS`; קבוצת "אחר" לחלקי קופסת מגירה בעובי קבוע מופיעה אחרונה). לכל קבוצה: כותרת עם שם החומר וטבלה עם עמודות **תיאור / מידות (ס"מ) / כמות / שטח (ס"מ²)**. footer מציג סך לוחות + סך שטח לקבוצה.
- **`CutItem.materialId?: MaterialId`** — שדה חדש על `src/types/cuts.ts`. אופציונלי כי חלקי קופסת מגירה (12מ"מ צד/גב, 6מ"מ תחתית) לא תואמים לחומר מהקטלוג.
- **`boardsToCutItems`** מעתיק את `board.materialId` ל-CutItem.
- **`useCabinet`** — פונקציית `enrich` חדשה ממפה `materialId` לפי `group` עבור חיתוכים מ-`calcCuts` / `computePartitionCuts` / `calcExternalDrawerFrontCuts`: `shell|door|front → frontMaterialId`, `body|back|plinth → bodyMaterialId`. `drawer` (חלקי קופסה) נשאר undefined ונכנס לקבוצת "אחר".
- **כפתור "ייצוא PDF" / "Export PDF"** מעל הרשימה. הלחיצה מפעילה `window.print()`. CSS print מותאם: `@media print` מסתיר את כל ה-`body` חוץ מ-`.printable`, אורז כל קבוצה כ-`page-break-inside: avoid`, ומעצב את הטבלה לקריאה על דף לבן.
- **תרגומים חדשים** ב-`translations.ts` תחת `cutsList`: `tab`, `materialGroup`, `description`, `dimensions`, `quantity`, `area`, `totalPieces`, `totalArea`, `exportPdf`, `noMaterial`.

### נוסף — שדה "עובי גב (מ"מ)" + חישוב עומק גוף פנימי (carcassD)
- **CabinetForm**: שדה קלט חדש "עובי גב (מ"מ)" ליד שדה חומר הגוף, ברירת מחדל 5מ"מ. הנגר מזין מ"מ; הקוד שומר כ-ס"מ (חלוקה ב-10). אם הקלט לא תקין → fallback ל-0.5 ס"מ.
- **`CabinetInput.backThickness`** (cm, חדש) — חלק מה-API של `useCabinet.calculate`. נשמר ב-`lastInputRef` כשאר ההגדרות.
- **`carcassD = max(0, D − backThickness − HINGE_GAP_CM − tFront)`** — עומק הקורפוס הפנימי (צדדים/תקרה/רצפה/מדפים/גב/צוקל) נקטן ביחס ל-`D` המלא של הארון: ה-`D` נשמר רק ללוחות המעטפת.
- **`decomposeBoxes`** מקבל `carcassD` כ-`box.D` — כל הצרכנים שקוראים `box.D` (boardModel, drawer-box, sketch interior) רואים את העומק הנכון של הקורפוס.
- **`buildBoardModel`** מקבל `envelopeDepth: D` (העומק המלא) + `backThicknessCm: backThickness` — לוחות המעטפת נשארים בגודל מלא; לוח הגב מקבל את העובי שהנגר ביקש (לא קבוע 6מ"מ).
- **`calcCuts` עם `'cabinet'`** מקבל `carcassD` במקום `D` — חלקי קופסת המגירה (drawer-box) יושבים בקורפוס ולכן עומקם נקבע לפי `carcassD`.
- **`BACK_THICKNESS_CM`** הוגדר מחדש ל-0.5 (היה 0.6) — ברירת מחדל תואמת ל-5מ"מ של הטופס. בדיקה תואמת ב-`boardModel.test.ts:473` עודכנה (`6mm → 5mm`).
- **`CabinetSketch`** מקבל `backThicknessCm` כ-prop ומחשב carcassD משלו לתצוגה (התואם ל-`useCabinet`), ומעביר `envelopeDepth: fullD` + `backThicknessCm` ל-`buildBoardModel` כך שהתצוגה הויזואלית תואמת את רשימת החיתוכים.

### שונה — תצוגת הארון מתפרסה על כל רוחב האזור המרכזי
- ה-grid ב-`CabinetForm.module.css` שונה מ-`minmax(260px, 1fr) | minmax(0, 2fr)` (טופס ~33% / סקיצה ~67%) ל-`minmax(260px, 320px) | minmax(0, 1fr)` — הטופס מקבל רוחב טבעי 260-320px, והסקיצה תופסת את **כל** המרחב הנותר.
- `.sketchStack` מקבל `align-items: stretch + width: 100%` כדי שה-SVG ימלא את הרוחב. `modeToggle` ממשיך להיות ממורכז דרך ה-`align-self: center` שלו.
- ה-SVG ב-`CabinetSketch.module.css` משתמש כעת ב-`aspect-ratio: 600 / 500` (תואם ל-viewBox) + `max-height: 75vh`. במסכים רחבים השרטוט גדל באופן יחסי; במסכים גבוהים מוגבל ל-75% מגובה החלון כדי לא להידחק מתחת ל-fold. `preserveAspectRatio` (ברירת מחדל = `xMidYMid meet`) שומר על יחס הארון — לא מרוח ולא דחוס.
- שיפור משמעותי בקריאות הסקיצה במסכי שולחן עבודה (1100px+ רוחב לסקיצה במקום ~900px קודם).

### תוקן — 3 בעיות תצוגה אחרי B
- **מדפים לא נראו בעורך הגוף**: ה-`<rect>` של ה-back (visible:false) שורטט ב-CabinetCutSketch ככל לוח אחר עם class `carcassBoard` (fill opaque), כיסה את כל הקרקס הפנימי כולל המדפים. תיקון: `CabinetCutSketch` מסנן עכשיו `boards.filter(b => b.visible)`.
- **מגירות/מוטות/מגירות חיצוניות חורגות מעובי הדופן ב-CabinetSketch**: עד היום הציור היה ב-`rect.x` עד `rect.x + rect.w` (כל הגוף). תיקון: כל הפריטים הפנימיים בתצוגה הראשית משתמשים ב-`innerX = rect.x + tBody·scale` ו-`innerW = rect.w − 2·tBody·scale` — כמו ב-BoxBodySketch. חל גם על תאי גוף עם מחיצה (`cellInnerX/W`).
- **envelope-top לא הוצג כ-board**: השורש לא היה בלוח עצמו אלא בלוגיקת ה-flags של CabinetSketch — חישבה envelope לפי `position === 'left' | 'right' | 'single'` בלבד, ולא טיפלה ב-`unit_N`. תיקון: עברה ל-`deriveEnvelopeFlags(box, hasShell, hasEnvelopeTop)` המשותף שמכיר ב-`unit_1` (left) ו-`unit_N` האחרון (right). גם הוספה `plinthHeight: isBottomRow ? plinth : 0` ו-`hasBack: true` בקריאה ל-`buildBoardModel` ב-CabinetSketch — כעת זהה לקריאה ב-useCabinet.

### נוסף — BoardModel: גב, צוקל, shelf reveal, envelope helper
- **גב הארון**: role `'back'`, `thickness: 0.6` ס"מ (=6מ"מ), `visible: false`. נכנס בין הצדדים בקואורדינטות `[t, W−t] × [t, H−t]`. **לא** מוצג בסקיצה הקדמית, **כן** ברשימת חיתוכים.
- **לוחות צוקל**: roles `'plinth-front'` ו-`'plinth-back'`. נוצרים כש-`plinthHeight > 0`. `plinth-front` visible=true (מצויר מתחת לגוף), `plinth-back` visible=false. `useCabinet` מעביר `plinthHeight = plinth` רק לגופים ב-bottom-row (`level === 'bottom' || 'single'`).
- **Shelf reveal offsets** כקבועים: `SHELF_WIDTH_REVEAL_CM = 0.1` (1מ"מ מכל צד), `SHELF_DEPTH_REVEAL_CM = 2.0` (20מ"מ פחות עומק). חל על roles: `shelf`, `fixed-shelf`, `internal-shelf`. אורך מדף = `(W − 2·tBody) − 2 × SHELF_WIDTH_REVEAL_CM`; עומק = `D − SHELF_DEPTH_REVEAL_CM`.
- **`deriveEnvelopeFlags(box, hasShell, hasEnvelopeTop)`** — helper משותף. מטפל ב-`position` `'left' | 'right' | 'single' | 'unit_N'` (תוקן הבאג שגופי `unit_*` לא קיבלו envelope). שורת ה-`unit_1` מקבלת envelope-left, ה-`unit_N` האחרונה מקבלת envelope-right.
- **`Board.visible: boolean`** — שדה חדש. true לכל הלוחות הנראים; false לגב ולצוקל-אחורי. `CabinetCutSketch` חייב לסנן visible=false (כן עושה היום אגב `pointer-events:none` — אבל גם פיזית לא מצויר).

### נוסף — `boardsToCutItems(boards, label): CutItem[]`
- מתרגם Board → CutItem עם שם עברי (`ROLE_NAME_HE`), קבוצת cut (`ROLE_GROUP`), `qty: 1`, `note` של עובי במ"מ. כל הלוחות נכללים (גם visible=false).
- בקריאה: `boardsToCutItems(boards, "תחתון יחידה 2")` יוצר שמות כמו "צד שמאל — תחתון יחידה 2".

### שונה — calcCuts מייצר רק דלתות + מגירות לארון
- הענף `type === 'cabinet'` ב-`calcCuts` הוסר הכל הקשור לקורפוס: shell, body, plinth, back, shelves. הסיגנטורה לא השתנתה (`shelves`, `hasBack`, `tShell`, `hasEnvelopeTop`, `tBody` נשארים כפרמטרים אך אינם משפיעים על הקורפוס).
- `useCabinet` קורא ל-`buildBoardModel` לכל body box, ול-`boardsToCutItems` להפקת CutItems. תוצאה ממוזגת עם `cuts` (דלתות + מגירות מ-calcCuts) + `partitionCuts` (computePartitionCuts המקורי) + `externalDrawerCuts`.
- ה-push הידני של "מעטפת — צד ימין/שמאל/תקרה" ב-useCabinet הוסר — boards מטפלים בזה דרך `envelope-left/right/top`.

### תוקן — BoxBodySketch — תצוגה כפולה של מדפים
- מדפים הוצגו פעמיים בעורך הגוף: פעם כלוח (BoardModel דרך CabinetCutSketch) ופעם כקו ירוק ישן (legacy `shelfLine`). דומה ל-fixed shelf (`fixedShelfLine` dashed). הוסרה תצוגת ה-legacy.
- שמירה על drag של מדפים: `<line>` שקוף ברוחב 10 כ-hit-area נשאר על מיקום המדף. הלוח (board) ב-`CabinetCutSketch` עם `pointer-events:none` בורר את התצוגה; ה-hit-area הקטן ממנו בלבד תופס את ה-pointer events.
- מדף קבוע (`isFixedAboveExternals`) — אינו נגרר כפי שהיה.
- מגירות פנימיות / מוטות / מגירות חיצוניות — נשארות עם רנדור legacy (עדיין אינן boards).

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
