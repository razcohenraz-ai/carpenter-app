# מילון מונחים — Carpenter App

---

## ישויות עיקריות

### Box / גוף / קופסה
היחידה הקונסטרוקטיבית הפיזית של הארון. מבנה עץ עם שני צדדים, עליון, תחתון — הקורפוס. לכל Box יש W, H, D, position ו-level. Box.id מתאפס בכל `calculate()`.

### Door / חזית / דלת / Front
לוח קדמי אחד שמכסה חלק מגוף. שייכת ל-Box, אבל גוף יכול לכלול כמה חזיתות (`frontIndex 0...numFronts-1`). "דלת" ו"חזית" משמשים לסירוגין באפליקציה — הכוונה לאותו דבר.

### Hinge / ציר
פרזול חיבור בין החזית לגוף. כל חזית מקבלת 1–4 צירים. מיקום מחושב אוטומטית, ניתן לדריסה ידנית.

### InteriorItem / פריט פנימי
מדף, מגירה, או מוט תליה בתוך גוף. כל פריט מוגדר לפי `heightFromFloor`.

### heightFromFloor
ס"מ מרצפת הגוף ל**תחתית** הפריט. אחיד לכל סוגי הפריטים — `ShelfItem` (תחתית המדף), `RodItem` (מרכז המוט — קווי, תחתית = מרכז), `DrawerItem` פנימית **וגם** חיצונית (תחתית המגירה). מגירות חיצוניות מוערמות מהרצפה כלפי מעלה: הראשונה ב-`heightFromFloor=0`, השנייה ב-`heightFromFloor = drawerHeight_1 + gap`, וכו'.

### Partition / מחיצה פנימית
לוח אנכי בתוך גוף, בין שתי חזיתות סמוכות. חלק מהקורפוס. מחומר bodyMaterial. position=0.5 (אמצע) בשלב 1.

### BoxCell / תא
חלל עצמאי בתוך גוף שיש בו מחיצה. כל תא מקבל פריטים פנימיים (מדפים, מגירות, מוטות) משלו. מידות התא: W_cell = (box.W - tBody) / 2, H_cell = box.H, D_cell = box.D. תא 0 = ימני, תא 1 = שמאלי.

### Plinth / צוקל / סוקל
בסיס מבני מתחת לארון. גוף `level='plinth'` — ללא דלתות ופרזולים.

### חיפוי צוקל (Plinth front cladding)
לוח קדמי **נוסף** של הצוקל, מחומר החזיתות (`frontMaterial`), שיושב לפני ה-`plinth-front` של חומר הגוף. role `'plinth-front-cladding'` ב-`BoardRole`; ברשימת החיתוכים מופיע בשם "חיפוי צוקל" תחת קבוצת חומר החזיתות. מידות: זהות ל-`plinth-front` (אורך = cabinetW, גובה = `plinthH − 0.6`), עובי = `tFront`. הפעלה: הגדרת `frontMaterial` ב-`BuildPlinthBoardModelArgs` (תמיד מסופק על-ידי `useCabinet`; בדיקות יכולות לדלג).

### צוקל נסוג (Recessed plinth)
מבנה הצוקל זז אחורה מקצה הארון הקדמי באופן מבוקר, כך שנשאר חלל ריק בקדמת ה-footprint של הארון (לדריכת רגליים במטבחים, או לאסתטיקה). פרמטר: `plinthRecess` (ס"מ) על `CabinetInput`, ו-`recessCm` על `BuildPlinthBoardModelArgs`. ברירת מחדל 0. הקצה הקדמי של הצוקל (חיפוי + plinth-front) זז ב-`recess` ס"מ אחורה; ה-`plinth-back` לא זז (נשאר ב-`y = cabinetD − tBody`); אורך הגיבלים מתקצר באותה כמות. ב-UI: checkbox "צוקל נסוג" + שדה "נסיגה (ס"מ)".

### Shell / מעטפת
לוחות עיטוף חיצוניים מחומר החזיתות: שני לוחות צד (envelope outer) ואופציונלית לוח תקרה (envelope top).

### Wall envelope / מעטפת קלפה (עליון+תחתון)
לקלפה (`mount === 'wall'`) — שני לוחות חזית, **עליון ותחתון**, **בלי תלות ב-shell הצדדי**. דגל יחיד `hasWallEnvelope?: boolean` ב-`CabinetInput` (ברירת מחדל false). מודל גובה זהה ל-`hasEnvelopeTop`: המכסים בתוך ה-H (הגוף הפנימי מתכווץ ב-2×עובי חזית; H חיצוני נשמר). ברמת ה-cuts: BoardRole חדש `'envelope-bottom'` (mirror של `envelope-top`); ROLE_GROUP = `'shell'`; ROLE_LABEL = "מעטפת תחתית". ב-`deriveEnvelopeFlags` מסלול נפרד שעוקף את שער ה-`!sides`. ראה גם DECISIONS_LOG 2026-06-14.

---

## מונחי גיאומטריה בקוד

### BoxPosition
`"single"` | `"left"` | `"right"` | `"unit_N"` — מיקום אופקי של הגוף בשורה.

### BoxLevel
`"single"` | `"bottom"` | `"middle"` | `"top"` | `"plinth"` — מיקום אנכי של הגוף בעמודה.

### boxStableKey
`"level:position"` — מזהה יציב בין חישובים המשמש לשימור interior, doors ו-partitions.

### numFronts
מספר החזיתות האופקיות של גוף אחד. `= ceil(box.W / maxDoorWidth)`.

### maxDoorWidth
רוחב דלת מקסימלי מומלץ. ברירת מחדל 60 ס"מ.

### doorsPerColumn
מספר דלתות לגובה בעמודה אחת (1, 2 או 3). "אוטומטי" = לפי גובה.

---

## מונחי חישוב

### structuralHeight (גובה מבני)
גובה הגוף כפי שמחושב בפיצול (`box.H`). זה הגובה הפיזי של לוחות הצד.

### visualHeight (גובה ויזואלי)
הגובה שהמשתמש **רואה** — רלוונטי לדלת מכסה צוקל:
`visualHeight = box.H + plinthHeight - 1 ס"מ - gap_עליון`

### coversSkirt
`boolean` על Door — האם הדלת מתארכת לכיסוי הצוקל.

### hasInternalPartitions
`boolean` על Box — האם הגוף מכיל מחיצות אנכיות פנימיות (שהמשתמש הוסיף).

### CellInteriorById
`Record<string, InteriorItem[][]>` — מפה מ-Box.id לפריטים פנימיים של תאים. הערך הוא מערך של שני מערכים: `[rightCellItems, leftCellItems]`. מקביל ל-`InteriorById` אך לגופים עם מחיצה.

### isManuallyPositioned
שדה `boolean?` על `ShelfItem`. `true` לאחר שהמשתמש גרר את המדף או שינה את גובהו בשדה. מדף כזה נשאר במקומו כשמדפים אחרים מתחלקים מחדש עקב הוספה/מחיקה.

### isFixedAboveExternals
שדה `boolean?` על `ShelfItem`. `true` למדף שנוצר אוטומטית מעל ערימת external drawers. נגזר ע"י `syncFixedShelf` (`core/interior/fixedShelfUtils.ts`); לא משתתף ב-`redistributeShelves`; לא ניתן לגרירה ב-`BoxBodySketch`; שדה הגובה ב-`BoxInteriorEditor` הוא `readOnly`. הסרה ידנית כן אפשרית, ואחרי הסרה ידנית — לא נוצר מחדש.

### redistributeShelves
פונקציה ב-`interiorUtils.ts` שמחלקת מחדש את המדפים עם `isManuallyPositioned !== true` **וגם** `isFixedAboveExternals !== true` (שני סוגי frozen מסוננים יחד). הלוגיקה: hanger logic (מדף ראשון מתחת למוט/מגירה) → round-robin בין כל האזורים החופשיים ≥25 ס"מ. מחזירה `{ items, warnings }`. מדפים ידניים, מדפים קבועים ופריטים שאינם מדפים לא נגעים.

### syncFixedShelf
פונקציה ב-`core/interior/fixedShelfUtils.ts` שמסנכרנת את המדף הקבוע מעל external drawers בעת שינוי פריטים. signature: `(oldItems, newItems, gapMm, shelfThickness) → items`. decision table: `newCount=0` → הסר אם קיים; `existing` → עדכן heightFromFloor; `first external` → צור חדש; אחרת → השאר ללא שינוי (כיבוד הסרה ידנית). נקרא מ-`useCabinet.setBoxInterior` ו-`setCellItems`.

### round-robin (חלוקת מדפים)
אלגוריתם החלוקה: ממיין את האזורים החופשיים התקפים (≥25 ס"מ) לפי גודל יורד. למדף i מקצה אזור `i % numZones`. בתוך כל אזור, חלוקה שווה. תוצאה: מדפים מתפזרים על פני כל הגוף, לא מצטופפים באזור אחד.

### hanger zone / אזור תליית בגדים
מרחק 80 ס"מ מתחת למוט תליה, מיועד לתליית בגדים על קולבים. הקבוע `HANGER_DROP = 80` קובע את המרחק המומלץ. המדף "המבני" הראשון בגוף עם מוט מוצב בתחתית האזור הזה.

### HANGER_MIN_GAP
קבוע 70 ס"מ — המרחק המינימלי בין ראש מגירה לבסיס מוט שעדיין נחשב יעיל לתלייה. פחות מזה → אזהרת `rod_drawer_close`.

### MIN_AUTO_SHELF_ZONE
קבוע 25 ס"מ — אזור חופשי קטן מזה לא מקבל מדפים אוטומטיים, וכל זוג פריטים סמוכים עם פער קטן מזה מפעיל אזהרת `small_zone`.

### roundCm
פונקצית עזר ב-`interiorUtils.ts` שמעגלת ערך גובה ל-1 ספרה עשרונית (`Math.round(h*10)/10`). מיושמת על פלט של כל פונקציות placement כדי למנוע floats ארוכים בשדות קלט.

### physicalZone / hasSmallGap
helpers ב-`interiorUtils.ts`. `physicalZone(item)` מחזיר את ה-bounding box האנכי של פריט (מדף=1.8 ס"מ עובי, מגירה=גובה המגירה, מוט=±1.5 ס"מ). `hasSmallGap(items)` סורק את כל הפריטים הסמוכים אחרי מיון ומחזיר True אם יש פער 0<gap<25 ס"מ. בסיס לאזהרת `small_zone`.

### ShelfWarning
טיפוס discriminated union ב-`types/interior.ts`. שלושה kinds:
- `small_zone` — אין שדות נוספים. פער <25 ס"מ בין פריטים סמוכים.
- `rod_low` — `{ rodHeight, rodId }`. מוט תליה <80 ס"מ.
- `rod_drawer_close` — `{ gap, rodId, drawerId }`. מגירה < 70 ס"מ מתחת למוט.

הטקסטים סטטיים ב-translations (≤25 תווים) — השדות לא מוצגים, רק זמינים לעיבוד עתידי.

### DrawerMount / internal / external
שדה `mount: 'internal' | 'external'` ב-`DrawerItem`.
- **internal**: מגירה רגילה בתוך הגוף, מאחורי הדלת. הדלת לא מושפעת. ברירת המחדל של `defaultDrawerPlacement`.
- **external**: מגירה עם **חזית עצמאית** שמשולבת בקדמת הארון (כמו מטבח עם מגירות עליונות). הדלת מעליה מתקצרת, וחזית המגירה היא לוח חדש ב-cutting list מקבוצת `'front'`.

### calcExternalStackHeight
פונקציה ב-`core/doors/doorUtils.ts` שמחזירה את ה-offset מקרקעית אזור החזיתות לבסיס הדלת הראשית. כולל את גובה החזיתות + רווח מעל כל אחת. עבור N מגירות חיצוניות: `sum(drawerHeights) + N × gapCm`. אם אין external — 0.

### calcMainDoorHeight
פונקציה ב-`core/doors/doorUtils.ts` שמחזירה את גובה הדלת הראשית אחרי קיצור עקב external drawers. ללא external = `getDoorHeight(box.H, gap, hasBottomGap, hasTopGap)`. עם external = הנ"ל - `calcExternalStackHeight`. יכול להחזיר ≤0 (אז `validateMainDoorHeight` יחזיר `main_door_absent`).

### MainDoorWarning
טיפוס `'main_door_absent' | 'main_door_too_short'`. מוחזר מ-`validateMainDoorHeight`:
- `main_door_absent` — `mainDoorH ≤ 0`. אין מקום לדלת ראשית (שידת מגירות מלאה). שלב 2 ידלג על יצירת `Door` עבור frontIndex זה.
- `main_door_too_short` — `0 < mainDoorH < 10` ס"מ. הדלת תיווצר אבל לא נוחה לאחיזה.

### front (CutGroup)
קבוצת חיתוכים חדשה ב-`CutGroup` (`shell | body | door | front | drawer | back | plinth`). יועדה ל-**חזיתות external drawers בלבד**. דלתות רגילות נשארות ב-`door`. רכיבי מגירה פנימיים (צד, גב, תחתית) נשארים ב-`drawer`.

### frontThicknessOverride
שדה אופציונלי על `DrawerItem` (רלוונטי רק ל-`mount === 'external'`). דריסה ידנית של עובי חזית המגירה — באותו דפוס כמו `Door.thicknessOverride`. internal drawers מתעלמים ממנו.

### cellIndexToFrontIndex
מיפוי בין index של תא ב-`CellInteriorById` לבין frontIndex של הדלת המתאימה:
- `cellIndex 0` (תא ימני) → `frontIndex = numFronts - 1` (החזית הימנית ביותר)
- `cellIndex 1` (תא שמאלי) → `frontIndex = 0` (החזית השמאלית ביותר)

מבטיח שמגירה חיצונית בתא מקצרת רק את החזית המתאימה לתא שלה.

### thicknessOverride
דריסה ידנית של MaterialId לחזית בודדת, עוקפת את frontMaterial הגלובלי.

### internalShelves
מערך גבהים מוחלטים (ס"מ מרצפת הארון) של מדפים **מבניים** — נוצרים כשגופים מאוחדים ב-doorsPerColumn=3.

---

## ממשק ב-useCabinet

### calculate(input)
פונקציה ראשית שמחשבת מחדש הכל: boxes, cuts, doors, interior preservation, partition preservation.

### setBoxInterior(boxId, items)
עדכון פריטים פנימיים לגוף. מעדכן גם עמדות צירים.

### setBoxPartitions(boxId, value)
toggle מחיצות פנימיות לגוף. מעדכן cuts מיד.

### boxStableKey
משמש ל-Map בין חישובים — שומר שה-interior של "גוף שמאל-תחתון" יישאר על "גוף שמאל-תחתון" גם אם ה-id השתנה.

---

## מונחי תצוגה

### displayNumber
תווית מספרית דינמית ("חזית 1", "חזית 2"...) המחושבת מ-boxes + numFrontsPerBox. לא נשמרת על Door.

### CabinetSketch
סקיצת SVG של הארון מלמעלה-קדימה, מציגה פיצול לגופים וחזיתות.

### BoxBodySketch
סקיצת SVG של פנים גוף בודד — מציגה מדפים, מגירות, מוטות תליה, ומחיצות אנכיות.

---

## Project / שמירה (Cloud-readiness infrastructure)

### Project
העטיפה החיצונית של ארון שמור — `{ schemaVersion, projectName?, createdAt?, updatedAt?, cabinet }`. כל שמירה/טעינה עוברת דרך `serializeProject` / `deserializeProject`. הוא ה-יחידה הניתנת לשליחה לענן או לאחסון מקומי.

### schemaVersion
מספר שלם חיובי שמתעד את גרסת המבנה של ה-`Project`. נקבע ל-`CURRENT_SCHEMA_VERSION` (כרגע 1) ע"י `serializeProject`. כאשר מבנה Project משתנה ב-incompatible way, יש לקדם את הקבוע ולהוסיף migration ב-`migrations.ts`.

### serializeProject
פונקציה ב-`core/project/serialize.ts` שמקבלת `Project` ומחזירה `string` (JSON). מעדכנת `updatedAt` ל-`now`, ומוסיפה `createdAt` אם חסר (שמירה ראשונה). טהורה — לא mutate את ה-input.

### deserializeProject
פונקציה ב-`core/project/serialize.ts` שמקבלת `string` ומחזירה `Project`. הזרימה: `JSON.parse` → `migrate(parsed)` → `validateProject` → החזרה. זורקת שגיאה ברורה ב-JSON פגום, schema חסר/לא תקין, או שדה נדרש חסר/type שגוי.

### migration
פונקציה `(data: unknown) => unknown` שממירה `Project` מגרסה `n` לגרסה `n+1`. נרשמת ב-`migrations[n]`. `migrate()` מריץ אותן ב-order מ-`data.schemaVersion` עד `CURRENT_SCHEMA_VERSION`. כרגע ה-registry ריק (גרסה 1 היא ה-baseline).

### CabinetInput
ערכי הטופס שמזינים את `calculate()` — `W, H, D, backThickness, hasShell, hasShellLeft?, hasShellRight?, hasEnvelopeTop, hasWallEnvelope?, bodyMaterialId, frontMaterialId, plinth, plinthRecess, doorCoversPlinth, lowerDoorH?, middleDoorH?, doorsPerColumn, doorGapMm, maxDoorWidth, edging?, topVariant?, sinkTraverseWidthCm?, mount?`. מוגדר ב-`types/cabinet.ts`. Single source of truth להגדרה החיצונית של הארון.

### SavedCabinetState
מבנה ה-state השמור של הארון — מפות `Record<string, ...>` לבחירות משתמש ששורדות `calculate()` rebuilds: `interior`, `cellInterior`, `partitions`, `doors`, `plinthGableOverrides`, `boardOverrides`, ואופציונליים `bodyEdgingOverrides?`, `doorEdgingOverrides?`, `boxDimensionOverrides?`. כל אחת ממופתחת לפי identifier יציב (`BoxSlotId` / `DoorSlotKey` / `Board.stableId`).

### BoxSlotId
טיפוס יציב לזיהוי "slot" של גוף בארון — מפתח שורד `calculate()` rebuilds, ולא ייקשר ליחידה הלא נכונה כש-decomposition משתנה. כרגע alias של `string` (placeholder); ריפקטור ל-id יציב הוא משימה נפרדת בהמשך — ראה DECISIONS_LOG 2026-05-29.

### DoorSlotKey
מפתח לדלת בודדת ב-`SavedCabinetState.doors` — בפורמט `${BoxSlotId}:${frontIndex}`. ה-`frontIndex` הוא ה-RTL-ordered index של החזית בגוף (זהה ל-`Door.frontIndex`).

### SavedDoor
מבנה דלת שמור — `{ hingeSide, hingeCount, hinges: SavedHinge[], hasDoor, thicknessOverride? }`. רק הבחירות של המשתמש. `height`, `width`, `coversSkirt`, `gapMm` נגזרים ב-`calculate()` ולא נשמרים.

### SavedHinge
מבנה ציר שמור — `{ positionFromBottom, isManual }`. ה-`id` של `Hinge` ה-runtime לא נשמר; deserialize מקצה ids חדשים דרך `newItemId()` כי זהות ציר רלוונטית רק בתוך הדלת שלו.

### SavedBoardOverride
מבנה override שמור ללוח — `{ dimensions?: { length?, width?, thickness? }, materialId? }`. מקביל מבנית ל-`BoardOverrides` ב-`core/boards/boardModel.ts` (מוכפל כדי לשמור על `types/` ללא תלות ב-`core/`). אם `BoardOverrides` משתנה — bump ל-`schemaVersion` ו-migration.

### CURRENT_SCHEMA_VERSION
קבוע מספרי ב-`core/project/migrations.ts`. כרגע `1`. מתעד את הגרסה ש-`serializeProject` כותב, וש-`deserializeProject` מצפה לאחרי migration. bump ל-incompatible changes בלבד.

---

## מונחים נגריים כלליים

| מונח | הסבר |
|------|-------|
| **reveal** / חשיפה | המרחק בין קצה הדלת לקצה הגוף שנראה לעין |
| **overlay** | דלת מכסה חלק מהגוף (הרגיל בארון מודרני) |
| **inset** | דלת בתוך פתח הגוף (נדיר, לארונות כפריים) |
| **cam-lock / קונפירמט** | חיבור ייחודי לנגרות פלטה |
| **edge band / מסגרת ABS** | פס המכסה את חתך הלוח |

---

## פרויקטים, מטבחים והגדרות (Multi-product, Kitchen, Settings)

### Project
מבנה העטיפה ב-`types/project.ts`. שדות: `schemaVersion, projectName?, createdAt?, updatedAt?, products: ProductUnit[]`. **לא** ארון יחיד — מכיל רשימת products. נשמר ב-localStorage דרך `useProject`.

### ProductUnit
פריט אחד בפרויקט: `id, name, productType, cabinet, kitchenUnits?`. `productType ∈ 'wardrobe' | 'bookcase' | 'sideboard' | 'kitchen' | 'free-build'`. עבור kitchen — `kitchenUnits` רלוונטי (לא `cabinet`).

### KitchenUnit
גוף יחיד במטבח. שדות: `id, name, moduleType, cabinet`. נוצר דרך `kitchenModuleInput(type, W?)` ו-`kitchenModuleState(type)` ב-`core/product/kitchenModules.ts`.

### kitchenModuleType
`'drawers' | 'shelves' | 'sink'`. מגדיר defaults: drawers=3 external (32/32/16), shelves=2 פנימיים (25/50), sink=`topVariant: 'sink-open'`. W default 60 ל-drawers/shelves, 80 ל-sink.

### topVariant
שדה אופציונלי ב-`CabinetInput`: `'standard' | 'sink-open'`. כש-`'sink-open'` — `buildBoardModel` מחליף את ה-top board בשני **traverse boards** (front+back).

### sinkTraverseWidthCm
רוחב traverse בס"מ. ברירת מחדל **8**. רלוונטי רק כש-`topVariant === 'sink-open'`.

### sink-traverse-front / sink-traverse-back
שני roles חדשים ב-`BoardRole` שמחליפים את `'top'` במצב `sink-open`. ב-`mergeCutItems` הם מתמזגים לזוג "קורת רוחב קדמית / אחורית".

### hasShellLeft / hasShellRight
שדות אופציונליים ב-`CabinetInput`. כש-`undefined` — fallback ל-`hasShell` (התנהגות סימטרית legacy). מאפשרים asymmetric shell ביחידת מטבח שצמודה לקיר בצד אחד.

### getShellSides(input)
פונקציה ב-`types/cabinet.ts`. מחזירה `{ left, right }` — single source לפיצול per-side. כל caller שצריך לדעת אם יש shell לצד מסוים קורא דרכה ומעביר ל-`computeInnerWidth` או `deriveEnvelopeFlags` (שניהם תומכים `boolean | { left, right }`).

### AppSettings (v2)
מבנה הגדרות גלובלי ב-`useSettings`. שדות: `customMaterials: CustomMaterial[]`, `bodyEnabledMaterialIds: string[]`, `frontEnabledMaterialIds: string[]`, `bodyMaterialPriceOverrides`, `frontMaterialPriceOverrides`. נשמר ב-localStorage תחת `'carpenter-settings-v2'`.

### CustomMaterial
חומר מותאם אישית שמשתמש הוסיף דרך `SettingsPage`. שדות: `id: string` (`'custom_xyz'`), `name, thickness, pricePerSheet, sheetW, sheetH`. מוגדר ב-`types/materials.ts`.

### getMaterialWithCustom(id, customMaterials)
פונקציה ב-`catalog/materialCombiner.ts`. חיפוש חומר ע"י id ברשימת קטלוג + custom. אם לא נמצא — fallback לחומר ראשון בקטלוג. משמש בכל מקום שצריך thickness/price של חומר לפי id (כולל ids של custom).

### computeUnitCutsAndHardware
פונקציה pure ב-`core/cabinetCompute.ts`. חתימה: `(input, savedState, customMaterials?) → { cuts, hardwareItems }`. משכפלת את לוגיקת `useCabinet.calculate()` ללא React/refs. משמשת ב-`KitchenOverview` לחישוב מאוגד של cuts/hardware על מספר units.

### bodyEdgingOverrides / doorEdgingOverrides / boxDimensionOverrides
שלוש מפות אופציונליות ב-`SavedCabinetState`. `bodyEdgingOverrides: Record<BoxSlotId, Edging>` — עקיפת קנט פר-body. `doorEdgingOverrides: Record<DoorSlotKey, Edging>` — פר-door (אינה חשופה ב-UI עדיין; type infrastructure). `boxDimensionOverrides: Record<BoxSlotId, { W?, H?, D? }>` — עקיפת מידות פר-body דרך `BoxInteriorEditor`.

### UnitFrontPanelsStandalone
קומפוננטה ב-`KitchenOverview.tsx`. SVG overlay של חזיתות per-unit, viewBox במידות cm (`0 0 outerCabW effH`), `position: absolute` על ה-`sketchHolder`. מציירת חזיתות בלי לצייר shell panels (אלה מצוירים ע"י `CabinetSketch` שמתחת).

### embedded mode (CabinetSketch)
prop `embedded?: boolean` ב-`CabinetSketch`. כש-true: ה-`<svg>` מוחזר בלי `<div>` wrapper, בלי title, בלי `wLabel`/`hLabel`. ה-viewBox מצומצם ל-cabinet rect בלבד. משמש ב-`KitchenOverview` להצגת אותה סקיצה בכל unit.

### equalizeExternalDrawersIfOverflow
פונקציה ב-`core/interior/interiorUtils.ts`. אם ה-stack של external drawers חורג מ-`bodyH`, מחלקת את כולם שווה — `drawerHeight = (bodyH − (n−1)·gap) / n`, ועדכון `heightFromFloor` סדרתי. אחרת — מחזירה את ה-items ללא שינוי. נקראת בעת הוספת drawer ב-`BoxInteriorEditor`.

### hideMainDimensions / hideDoorsPerColumn / hideEnvelopeTop / splitShellSides / hideRodOption
Props אופציונליים ב-`CabinetForm` (`hideRodOption` ב-`BoxInteriorEditor`). מועברים מ-`App.tsx` ל-Level 3 (kitchen unit editor) בלבד. מסתירים שדות שלא רלוונטיים למטבח: שדות W/H/D ראשיים, doorsPerColumn select, hasEnvelopeTop checkbox, מאחדים את "מעטפת חיצונית" לשני checkboxes (שמאל/ימין), מסתירים את "+ מוט תליה".

### UnitsView (KitchenOverview)
קומפוננטה ב-`KitchenOverview.tsx`. flex של unit-wrappers — כל אחד `<CabinetSketch embedded>` + overlay של חזיתות כש-`viewMode === 'fronts'`. הוחלפה את ה-svg הגדול הישן — `bodies` ו-`fronts` משתמשים באותו layout בדיוק, רק החזיתות מתווספות.

### Appliance bay / תא אפליאנס
גוף מטבח שמארח מכשיר חשמלי (מדיח, תנור). מאופיין ב-`hasFronts: false` ב-`CabinetInput`. ראה גם: **dishwasher module**, **oven module**.

### dishwasher module / מודול מדיח
`KitchenModuleType = 'dishwasher'`. תא ריק לחלוטין: `plinth=0, hasFronts=false, hasBack=false, hasBottom=false`. 3 לוחות בלבד (2 דפנות + עליון). יושב ישירות על רצפה על רגלי בונד (`LEVELER_GAP_CM = 0.6`). קוטע את צוקל המטבח. רוחב ברירת מחדל: 64 ס"מ.

### oven module / מודול תנור
`KitchenModuleType = 'oven'`. גוף סטנדרטי (plinth=10, גב, תחתון) עם `hasFronts=false`. מגירה חיצונית (h=19.2) + מדף קבוע (hff=17.4) בתחתית; חלל 59 ס"מ לתנור מעל. רוחב ברירת מחדל: 60 ס"מ.

### pantry module / מודול מזווה
`KitchenModuleType = 'pantry'`. גוף גבוה (larder) עם חזיתות (`hasFronts` ברירת מחדל). מידות שונות משאר הגופים: H=180 (גבוה מהשיש), W=60, D=60, plinth=10. פנים = 6 מגירות **פנימיות** מאחורי הדלת: תחתונה 30 + 5×28, ממלאות bodyH=170 עד התקרה. מגירות פנימיות → פרזול + סקיצה בלבד, **לא** חלקי חיתוך (תיבות נרכשות). רוחב ברירת מחדל: 60 ס"מ.

### wall module / מודול קלפה
`KitchenModuleType = 'wall'`. ארון קיר עליון התלוי מעל השיש. W=100, H=50, D=35, `plinth=0`, חזית בודדת (`maxDoorWidth=120`), 2 מדפים ברירת מחדל. `mount:'wall'` מניע את תצוגת ה-elevation (שורה עליונה בגובה 152 ס"מ) ואת עורך ה-shelf-only. רוחב ברירת מחדל: 100 ס"מ.

### mount
שדה ב-`CabinetInput` (`'base' | 'wall'`, ברירת מחדל `base`). `'wall'` = ארון קיר (קלפה) התלוי מעל השיש. מטא-דאטה ל-UI/מיקום בלבד — מניע את ה-elevation ב-`KitchenOverview` ואת ה-`shelfOnly` ב-`BoxInteriorEditor`; **לא** משפיע על חישוב לוחות/חיתוכים.

### elevation / תצוגת חזית מטבח
פריסת `UnitsView` ב-`KitchenOverview`: גופי רצפה בשורה תחתונה + גופי קיר (`mount:'wall'`) בשורה עליונה (תחתיתם 152 ס"מ מהרצפה), עם פס שיש ביניהם. מיקום אבסולוטי לפי `right`/`bottom` (RTL, רצפה למטה).

### hasFronts / hasBack / hasBottom
שדות אופציונליים ב-`CabinetInput` (ברירת מחדל `true`):
- `hasFronts=false`: מעמיד `hasDoor:false` לכל הדלתות → `buildDoorCutItems` מדלג עליהן (אין cut מקבוצת 'door'), מחביא כפתורי עריכה פנימית ב-`BoxInteriorEditor`. חזיתות מגירות חיצוניות **לא מושפעות** (מגיעות מ-`calcExternalDrawerFrontCuts`).
- `hasBack=false`: לא נפלט לוח גב. `backThickness` עדיין משמש בנוסחת `carcassD`.
- `hasBottom=false`: לא נפלט לוח תחתון. הדפנות מתארכות ל-`H − t − LEVELER_GAP_CM` (רגלי בונד). ב-`CabinetForm` גם מחביא כפתורי עריכה פנימית.

---

## מונחי חדר (floor plan)

### Room / חדר
`Project.rooms?: Room[]` (schema v3). מלבן: `{ id, name, width, depth, height, placements }` בס"מ. **כמה חדרים לפרויקט**. מערכת קואורדינטות 3D-native (three.js, Y-up): origin בפינה השמאלית-אחורית על הרצפה; X=width (קיר אחורי), Y=height, Z=depth. כל תצוגה (top/front/3D) היא היטל.

### ProductPlacement
מיקום מוצר בחדר: `{ productId, position:{x,z,y?}, rotationDeg, anchorWall? }`. `position` = **מרכז** ה-footprint (סיבוב סביב הציר האנכי). `productId` מפנה ל-`Project.products[]` (flat — placement לא מזיז את המוצר). `anchorWall` = רמז snap ל-UI (north/south/east/west); מקור-האמת הוא position+rotation.

### productBounds / productSubBoxes (`core/room/productBounds.ts`)
`productBounds(product) → { width, height, depth }` — bounding box תלת-ממדי בס"מ (מטבח: `kitchenFootprint`; אחר: `input.W×H×D`). משמש את מבט-העל + ה-snap.
`productSubBoxes(product) → ProductSubBox[]` — פירוק לתיבות מקומיות 3D (`x0..x1, y0..y1, z0..z1`): ארון = תיבה אחת מלאה; מטבח = תיבה ליחידה (בסיס על הרצפה, קלפה צפה ב-`WALL_BOTTOM_CM`, הרווח אמיתי). המקור היחיד למבט-החזית ול-3D. parity: union(width,depth) = `productBounds`.

### roomGeometry (`core/room/roomGeometry.ts`)
core טהור: `snapToWall(room, bounds, wall, offset)` → position+rotation צמוד לקיר; `placementRectTopView` → spec לציור מבט-על; `placementAABB` → footprint axis-aligned (מתחלף W↔D בסיבוב 90/270); `clampCentreToRoom` → השארת המוצר בתוך החדר בזמן גרירה; `placementElevationRects(placement, subBoxes, bounds, viewWall, room)` → היטל החזית: local-box→room-AABB (סיבוב סביב Y)→מישור הקיר (north/south ציר X · east/west ציר Z · south/east במראה) + `depth` למיון occlusion.

### kitchenFootprint / kitchenElevationLayout (`core/product/kitchenFootprint.ts`)
חולץ מ-`KitchenOverview` (single source): `WALL_BOTTOM_CM=152` וקבועי elevation, `effectiveUnitDims`, `unitOuterW`, `isWallUnit`, `kitchenFootprint(units)`. `kitchenElevationLayout(units) → KitchenUnitBox[]` — מיקום הפר-יחידתי בחזית (בסיס נצבר משמאל + קלפות בשורה עליונה עם blocker-scan; `>` מחמיר → מזווה 152 לא חוסם). נצרך ע"י `KitchenOverview` (positions) וע"י `productSubBoxes`.
