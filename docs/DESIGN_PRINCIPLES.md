# עקרונות תכנון — Carpenter App

## עיקרון ראשון: החופש בידי הנגר

הנגר מכיר את צרכי הלקוח. התוכנה מציעה, לא כופה.

**כלל ברזל**: כל ערך שמחושב אוטומטית — חייב לאפשר override ידני. גם אם Override יוצר מצב לא אופטימלי, הנגר מחליט. התוכנה מזהירה, לא חוסמת.

**דוגמאות**:
- מיקום ציר מחושב אוטומטית ← הנגר יכול לגרור לכל מיקום
- מספר חזיתות לפי maxDoorWidth ← הנגר יכול לשנות את maxDoorWidth
- צד צירים לפי "סגנון סלון" ← הנגר יכול להפוך לכל חזית
- אזהרה על רווח בין צירים < 25 ס"מ ← אזהרה בלבד, לא מניעה

**כשבאה שאלה**: "האם נקבע את זה אוטומטית?" → כן. "האם נאפשר שינוי?" → תמיד כן.

---

## עיקרון שני: Single Source of Truth

אם ניתן לחשב ערך מנתון אחר — לא מאחסנים אותו.

**דוגמאות**:
- `displayNumber` של חזית מחושב מ-boxes + numFrontsPerBox. לא נשמר על Door.
- גובה ויזואלי של דלת מכסה צוקל מחושב on-the-fly. לא נשמר על Door.
- מספר הצירים הנוכחי לפי `hingeCount` (יכול להיות 'auto') + `doorHeight` → לא מאחסנים N בנפרד.

**מה כן מאחסנים**: רק בחירות שהמשתמש קיבל בעצמו ושלא ניתן לגזור.

---

## עיקרון שלישי: זהות לוגית קבועה

כל ישות (Box, Door) מקבלת `id` קבוע לכל "חיי" הסשן הנוכחי.

**הבעיה שפותרת**: המשתמש מגדיר פנים גוף לגוף "מספר 3". אחר כך מוסיף עמודה — הגוף הופך ל"מספר 5". הפנים צריכים להישמר.

**הפתרון**:
- `Box.id` = `"box_0"`, `"box_1"` וכו' — מתאפס בכל `calculate()`.
- `boxStableKey(box)` = `"level:position"` — יציב בין חישובים. משמש לשימור interior, doors, ו-partitions.
- תוויות תצוגה (`displayNumber`) דינמיות ומחושבות בכל פעם.

---

## עיקרון רביעי: אזהרות לא חוסמות

כשמשהו לא אופטימלי אבל פיזית אפשרי — מציגים אזהרה צהובה, לא שגיאה אדומה.

**מקרים שמקבלים אזהרה בלבד**:
- רווח בין דלתות > 4 מ"מ
- מרחק בין צירים < 25 ס"מ
- עובי חזית מחוץ לטווח 1.5–2.5 ס"מ
- קומה עליונה נמוכה מ-20 ס"מ (עם מעטפת תקרה)

**מה שכן חוסם**: שגיאות בקלט שלא ניתן לחשב מהן (שדה ריק, ערך שלילי, סכום קומות גדול מגובה הארון).

---

## עיקרון חמישי: הפרדת לוגיקה מתצוגה

`core/` = לוגיקה טהורה. לא יודע מ-React, לא יודע מ-DOM.
`ui/components/` = תצוגה בלבד. לא מחשבת, רק מציגה ומעבירה אירועים.
`ui/hooks/` = חיבור. מחזיק state, מקשר core ל-UI.

**למה**: בדיקות ל-core/ רצות ב-Node.js בלי צורך בדפדפן. ניתן לשנות את כל הממשק מבלי לגעת בלוגיקה.

---

## עיקרון שישי: JSON-driven catalog

נתוני חומרים ופרזולים חיים ב-JSON, לא בקוד.
לשינוי מחיר, עובי או הוספת חומר חדש — ערוך `catalog/materials.json` בלבד. אין צורך לנגוע בקוד TypeScript.

---

## עיקרון שביעי: BoardModel כמקור-אמת יחיד למידות לוחות

כל מידה של לוח (length / width / thickness / materialId) מגיעה מ-`buildBoardModel` או מ-`buildPlinthBoardModel`. רכיבי UI **לא מחשבים מידות** — הם קוראים את הערך ה-effective דרך `getDimension(board, key, overrides)` ו-`getMaterial(board, overrides)`.

**שכבת override**: ל-`useCabinet` יש מפה `boardOverridesByStableId: Map<stableId, BoardOverrides>` שדורסת ערכים נגזרים. הדפוס זהה ל-`userPositionX` של גיבלי הצוקל — `override ?? derived`. ה-setters (`setBoardDimensionOverride`, `setBoardMaterialOverride`) מפעילים recalculate; ה-reset מחזיר ל-derived ללא בנייה מחדש של הלוחות.

**stableId**: כל לוח מקבל `stableId` יציב שורד `calculate()` rebuilds (לדוגמה `side-left@bottom:left`, `plinth-gable-a@joint:0`). `Board.id` ה-ad-hoc משמש רק כ-React key לרינדור — לא לאחסון.

**helpers מרכזיים** (יוצאים מ-`core/boards/boardModel.ts`):
- `computeCarcassDepth(D, backThickness, hingeGap, tFront)` — חישוב אחד למידה המופיעה בכל מקום (useCabinet + סקיצות + טופס).
- `computeInnerWidth(W, hasShell, tFront)` — אותו עיקרון.
- `getDimension`, `getMaterial`, `boardStableId`, `BoardOverrides`, `BoardDimensionKey` — ה-API של שכבת ה-override.

**אסור**:
- חישוב inline של carcassD/innerW בקומפוננטות UI.
- קריאה ישירה ל-`board.length` במצבים שבהם override רלוונטי (תמיד דרך `getDimension`).
- אחסון מידות מחושבות (single source of truth — חוזרים ל-עיקרון 2).
