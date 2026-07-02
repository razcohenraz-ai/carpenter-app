# הוראות תפעוליות — Carpenter App

## תחילת כל סשן — קריאת מסמכים

### א. חובה לכל שיחה (לפני כתיבת קוד או החלטה)
1. **`docs/PROJECT_CONTEXT.md`** — **התחל ב-"Quick orientation"** בראש (state hooks, navigation flow, compute pathways, single source of truth). אחר כך שאר הקובץ: פיצ'רים פעילים + חובות טכניים.
2. **`docs/DESIGN_PRINCIPLES.md`** — 7 עקרונות שקובעים איך להחליט (החופש בידי הנגר, single source of truth, JSON-driven, BoardModel וכו').

### ב. קריאה לפי הקשר (רק כשרלוונטי לפיצ'ר)
3. **`docs/ARCHITECTURE.md`** — לפני **שינוי מבני**: הוספת קובץ ב-types/core/ui, שינוי זרימת נתונים, הוספה ל-CabinetInput/SavedCabinetState.
4. **`docs/CARPENTRY_RULES.md`** — לפני **שינוי לוגיקת חישוב**: boards, fronts, doors, drawers, shell, plinth, kitchen modules, shelves.
5. **`docs/GLOSSARY.md`** — כשנתקל **במונח לא מוכר** בקוד או בשיחה.
6. **`CHANGELOG.md`** סקציית `[Unreleased]` — כשהמשתמש **מתייחס לשינוי אחרון** ("הבאג שתיקנו"), או לפני commit כדי לעדכן.
7. **`docs/DECISIONS_LOG.md`** — כשנתקל **בהחלטה לא ברורה** או לפני שינוי שעלול לסתור החלטה קיימת.

**הכלל**: למשימה קטנה (תיקון UI, טקסט) — די בקריאת קטגוריה א'. למשימה גדולה (פיצ'ר חדש שמשנה types) — קרא גם את הקבצים הרלוונטיים בקטגוריה ב'.

---

## עקרונות עבודה

### 1. החופש בידי הנגר
אל תקבע אילוצים נוקשים. כל ערך אוטומטי — חייב לאפשר override ידני.
**כשיש ספק**: תמיד לכיוון של "לאפשר שינוי + להזהיר אם צריך".

### 2. Single source of truth
אל תאחסן מה שניתן לחשב. חישוב on-the-fly > שמירת state כפול.
לפני הוספת שדה חדש ל-type: שאל "האם זה נגזר ממשהו אחר?"

### 3. הפרדה: core vs ui
- `core/` — TS טהור, ללא React, ניתן לבדיקה
- `ui/components/` — תצוגה בלבד, לא מחשבת
- `ui/hooks/` — מחזיק state, מקשר core ל-UI

### 4. אבחון לפני תיקון
אל תקפוץ לתיקון. קרא, חקור, הבן למה קורה מה שקורה — ואז תקן.

### 5. בדיקות תמיד
אחרי כל שינוי:
```bash
npx tsc --noEmit
npx vitest run
```
**לא דווח על הצלחה לפני שהבדיקות עברו.**

---

## תחזוקת התיעוד

### לפני כל commit — עדכן CHANGELOG.md תחת [Unreleased]

| סוג שינוי | קטגוריה |
|-----------|----------|
| פיצ'ר חדש | **נוסף** |
| תיקון באג | **תוקן** |
| שינוי התנהגות קיימת | **שונה** |
| הסרת פיצ'ר | **הוסר** |

כשפיצ'ר מלא הושלם: העבר מ-[Unreleased] לסקציה חדשה עם תאריך ושם.

### אחרי החלטה ארכיטקטונית — עדכן docs/DECISIONS_LOG.md
פורמט: תאריך, ההחלטה, הנימוק.

### אחרי שינוי מבנה הקוד — עדכן docs/ARCHITECTURE.md

### אחרי מונח חדש — עדכן docs/GLOSSARY.md

### אחרי שינוי כלל נגרי — עדכן docs/CARPENTRY_RULES.md

### אחרי פיצ'ר שמשנה מה האפליקציה עושה — עדכן docs/PROJECT_CONTEXT.md

---

## מוסכמות קוד

- **יחידות**: מידות ארון ב-ס"מ. עובי חומרים ב-מ"מ. CutItem ב-מ"מ.
- **Box.id**: לא לסמוך על קביעות בין חישובים. השתמש ב-`boxStableKey(box)` לשימור.
- **חישוב on-the-fly**: לא לאחסן displayNumber, visualHeight, skirtExtension.
- **catalog JSON**: לשינוי מחיר/עובי — ערוך JSON בלבד, לא TypeScript.
- **אזהרות**: warning אינפורמטיבי, לא חסימה (ראה DESIGN_PRINCIPLES).
