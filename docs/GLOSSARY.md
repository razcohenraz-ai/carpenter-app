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
מדף, מגירה, או מוט תליה בתוך גוף. כל פריט מוגדר לפי `heightFromFloor` (ס"מ מרצפת הגוף).

### Partition / מחיצה פנימית
לוח אנכי בתוך גוף, בין שתי חזיתות סמוכות. חלק מהקורפוס. מחומר bodyMaterial. position=0.5 (אמצע) בשלב 1.

### BoxCell / תא
חלל עצמאי בתוך גוף שיש בו מחיצה. כל תא מקבל פריטים פנימיים (מדפים, מגירות, מוטות) משלו. מידות התא: W_cell = (box.W - tBody) / 2, H_cell = box.H, D_cell = box.D. תא 0 = ימני, תא 1 = שמאלי.

### Plinth / צוקל / סוקל
בסיס מבני מתחת לארון. גוף `level='plinth'` — ללא דלתות ופרזולים.

### Shell / מעטפת
לוחות עיטוף חיצוניים מחומר החזיתות: שני לוחות צד (envelope outer) ואופציונלית לוח תקרה (envelope top).

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

## מונחים נגריים כלליים

| מונח | הסבר |
|------|-------|
| **reveal** / חשיפה | המרחק בין קצה הדלת לקצה הגוף שנראה לעין |
| **overlay** | דלת מכסה חלק מהגוף (הרגיל בארון מודרני) |
| **inset** | דלת בתוך פתח הגוף (נדיר, לארונות כפריים) |
| **cam-lock / קונפירמט** | חיבור ייחודי לנגרות פלטה |
| **edge band / מסגרת ABS** | פס המכסה את חתך הלוח |
