# הוראות תפעוליות — Carpenter App

## תהליך העבודה (Development Workflow)

כל משימה עוברת בשרשרת הזו — אל תדלג שלבים (היקף כל שלב לפי גודל המשימה):

**הבן → קרא מסמכים רלוונטיים → זהה את תת-המערכת המושפעת → תכנן → מַמֵּש → עדכן תיעוד אם צריך → הרץ את ה-QA הנדרש → אמת invariants הנדסיים → סיים.**

---

## קריאת מסמכים — רק מה שרלוונטי למשימה

עיקרון-על: **קרא את המינימום** הדרוש למשימה הנוכחית. אל תקרא הכל.

### א. חובה לכל שיחה (לפני קוד/החלטה)
1. **`docs/PROJECT_CONTEXT.md`** — התחל ב-"Quick orientation" (state hooks, navigation, compute pathways, SSOT). אחריו: פיצ'רים פעילים + חובות טכניים.
2. **`docs/DESIGN_PRINCIPLES.md`** — 7 עקרונות ההחלטה (החופש בידי הנגר, SSOT, JSON-driven, BoardModel וכו').

### ב. לפי הקשר (רק כשרלוונטי לפיצ'ר)
3. **`docs/ARCHITECTURE.md`** — לפני **שינוי מבני** (קובץ ב-types/core/ui, זרימת נתונים, CabinetInput/SavedCabinetState).
4. **`docs/CARPENTRY_RULES.md`** — לפני **שינוי לוגיקת חישוב נגרית** (boards/fronts/doors/drawers/shell/plinth/kitchen/shelves).
5. **`docs/GLOSSARY.md`** — מונח לא מוכר. · **`CHANGELOG.md` `[Unreleased]`** — התייחסות לשינוי אחרון. · **`docs/DECISIONS_LOG.md`** — החלטה לא ברורה או שינוי שעלול לסתור החלטה.

### ג. Engineering Intelligence (לפני שינוי לוגיקה הנדסית — קרא את הרלוונטי בלבד)
6. **`docs/DEPENDENCY_GRAPH.md`** — תת-מערכות (S1–S16), reverse-dependency ("אם משנים X מה נשבר"), invariants (INV-1…22).
7. **`docs/IMPACT_ANALYSIS.md`** — path→subsystem + מפת impact: אילו renderers/exports/בדיקות מושפעים משינוי.
8. **`docs/SSOT_MAP.md`** — לפני הוספת חישוב/שדה נגזר: מי כבר מחזיק את האמת? (מנע כפילות).
9. **`docs/PIPELINES.md`** — ה-recipe מקצה-לקצה + שני ה-orchestrators. · **`docs/QA_STRATEGY.md`** — בתכנון בדיקות. · **`docs/QA_REGRESSION.md`** — לפני נגיעה באזור עם באגים קודמים.

**הכלל**: משימה קטנה (UI/טקסט) — קטגוריה א' בלבד. שינוי לוגיקה הנדסית — הוסף את ב'+ג' הרלוונטיים.

---

## עקרונות עבודה

### 1. החופש בידי הנגר
אל תקבע אילוצים נוקשים; כבד את הידע המקצועי של הנגר. כל ערך אוטומטי — override ידני. בספק: "לאפשר שינוי + להזהיר".

### 2. Single source of truth
אל תאחסן מה שניתן לחשב; on-the-fly > state כפול. לפני שדה חדש: "נגזר ממשהו?". לפני חישוב חדש: בדוק ב-`SSOT_MAP.md` אם כבר קיים owner.

### 3. שפר קיים, אל תשכפל
העדף שיפור הארכיטקטורה הקיימת על יצירת לוגיקה מקבילה. renderer הוא adapter — לא מחשב; חישוב חדש מנותב דרך ה-core הקיים.

### 4. הפרדה core vs ui
`core/` — TS טהור, ללא React, בדיק. · `ui/components/` — תצוגה בלבד. · `ui/hooks/` — state, מקשר core ל-UI.

### 5. אבחון לפני תיקון
אל תקפוץ לתיקון. הקוד הקיים הוא **עדות, לא הוכחה** — קרא, חקור, הבן *למה* קורה מה שקורה, ואז תקן.

---

## Impact thinking — לפני שינוי לוגיקה הנדסית

קבע מראש (עזר: `DEPENDENCY_GRAPH.md` + `IMPACT_ANALYSIS.md`):
- **צרכנים downstream** — מי משתמש בפלט.
- **renderers מושפעים** — 2D / 3D / cut-list / room.
- **exports מושפעים** — אילו סמלים/חוזים משתנים.
- **invariants מושפעים** — אילו INV חייבים אימות מחדש.

---

## QA — פילוסופיה

- **בדיקות עוברות אינן מוכיחות נכונות** — תנאי הכרחי, לא מספיק.
- **invariants הנדסיים קודמים** לבדיקות ספציפיות — אמת אותם (`DEPENDENCY_GRAPH.md` §6).
- שינוי שנוגע בחישוב הנדסי → אמת **עקביות renderers** (2D/3D תואמים ל-cut list — `renderParity`) **ועקביות export** (cut list / הדפסה / DXF עתידי).
- **עדכן `docs/QA_REGRESSION.md`** אחרי כל באג אמיתי משמעותי: root cause + ההנחה שנשברה + הבדיקה השומרת.

---

## לפני שמסמנים משימה כהושלמה

1. הבדיקות עוברות — **לא לדווח הצלחה לפני כן**:
   ```bash
   npx tsc --noEmit
   npx vitest run
   ```
2. invariants הנדסיים אומתו; עקביות renderers/export נבדקה כשרלוונטי (ראה QA).
3. **התיעוד סונכרן** — עדכן את המושפע בלבד:
   - **`CHANGELOG.md` `[Unreleased]`**: נוסף / תוקן / שונה / הוסר. פיצ'ר שהושלם → סקציה חדשה עם תאריך.
   - **`DECISIONS_LOG.md`** — החלטה ארכיטקטונית (תאריך, החלטה, נימוק).
   - **`ARCHITECTURE.md`** מבנה קוד · **`GLOSSARY.md`** מונח · **`CARPENTRY_RULES.md`** כלל נגרי · **`PROJECT_CONTEXT.md`** שינוי במה שהאפליקציה עושה · **`QA_REGRESSION.md`** באג משמעותי.

---

## מוסכמות קוד

- **יחידות**: מידות ארון ס"מ; עובי חומרים מ"מ; CutItem מ"מ.
- **זהות**: `Box.id` לא קבוע בין חישובים — `boxStableKey(box)` לשימור. `Board.stableId` יציב; `Board.id` ל-React בלבד.
- **on-the-fly**: לא לאחסן displayNumber / visualHeight / skirtExtension.
- **catalog JSON**: שינוי מחיר/עובי — JSON בלבד, לא TypeScript.
- **אזהרות**: אינפורמטיבי, לא חוסם (החופש בידי הנגר).
