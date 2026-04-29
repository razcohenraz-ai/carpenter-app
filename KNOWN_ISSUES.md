# בעיות ידועות — carpenter-app

כל הבעיות מתועדות גם בקוד עצמו בתגיות `// TODO(bug):` ו-`// TODO(review):`.
**לא תוקן עדיין** — יש לדון בכל שינוי לפני ביצוע.

---

## ✅ RESOLVED

### ISSUE-001: ערבוב יחידות ס"מ ומ"מ בחישוב הגוף הפנימי *(תוקן)*

**תוקן ב:** `src/core/doors/doorCalc.ts`, `src/core/cuts/cuttingList.ts`

**הפתרון שנבחר:** כל המידות בקוד הן ס"מ, כולל עובי לוחות.
- ברירת מחדל שונתה: `tShell = 1.8`, `tBody = 1.8` (ס"מ)
- נוסחאות שיחשבו ממדי גוף פנימי: `W - tShell * 2` — נכון כעת (יחידות עקביות)
- נוסחאות מ"מ בפלט: `cm(X - tBody * 2)` = `(X - tBody * 2) * 10` — נכון
- 7 טסטים חדשים נוספו לכיסוי מצב `hasShell=true`

---

## 🔴 HIGH — בעיות שמשפיעות על נכונות החישוב

*(כרגע ריק — ISSUE-001 תוקן)*

---

---

## 🟡 LOW — בעיות לוגיקה קלות

### ✅ ISSUE-002: מעבר 0 כ-`lowerH` נחשב כ"לא הוגדר" *(תוקן 2026-04-27)*

**תוקן ב:**
- `src/core/doors/doorCalc.ts` שורה 72
- `src/core/geometry/boxDecomposition.ts` שורה 103

**הפתרון:** `lowerH !== undefined ? lowerH : Math.round(...)` בשני הקבצים.

**טסטים שנוספו:** 4 (2 בכל קובץ — `lowerH=0` מכבד אפס, `undefined` מחזיר ברירת מחדל)

---

### ✅ ISSUE-003: regex סינון גבי דקים רחב מדי *(תוקן 2026-04-27)*

**תוקן ב:** `src/core/cuts/sheetCalculator.ts` — שתי פונקציות (`sheetsNeeded`, `sheetsNeededByGroup`)

**הפתרון:** הוחלף `/(4mm|גב)/.test(c.note ?? "")` ב-`c.group === "back"`.

**טסטים שנוספו:** 2 (קובץ טסט חדש `sheetCalculator.test.ts` — group="back" לא נספר, "גב" ב-note עם group אחר כן נספר)

---

### ✅ ISSUE-004: if רציף (לא else-if) בכפלי כמויות חומרה *(תוקן 2026-04-27)*

**תוקן ב:** `src/core/hardware/hardwareCalc.ts` שורות 29–31

**הפתרון:** `if` → `else if` לשלושת המכפילים. בנוסף תוקנו הנתונים ב-`src/catalog/hardware/presets.json` — נוספה שורת `byDrawer: 1` לידית בסוג `cabinet` כך שמגירות מקבלות ידיות.

**טסטים שנוספו:** 3 (שני כללים נפרדים עם אותו specId נספרים בנפרד, סה"כ ידיות = דלתות + מגירות, else if לא מצרף מכפילים בתוך כלל אחד)

---

### ✅ ISSUE-005: שארית floating-point בפיצול רוחב גדול *(תוקן 2026-04-27)*

**תוקן ב:** `src/core/geometry/boxDecomposition.ts` שורות 59–63 + `src/core/utils/round.ts` (קובץ חדש)

**הפתרון:**
- נוצר `src/core/utils/round.ts` עם קבועי דיוק (`INTERNAL_PRECISION_MM=0.01`, `OUTPUT_PRECISION_MM=0.1`, `INPUT_PRECISION_MM=0.1`) ופונקציות `roundInternal` / `roundOutput`
- הוסר חישוב `remainder` — הקופסה האחרונה מחושבת כ-`roundInternal(W - baseW*(n-1))`, מה שמבטיח סכום = W
- כל `Math.round(x*10)/10` הוחלף ב-`roundInternal` ב-3 קבצים: `boxDecomposition.ts`, `doorCalc.ts`, `cuttingList.ts`

**טסטים שנוספו:** 8 (קובץ חדש `round.test.ts` עם 6 טסטים, + 2 ב-`boxDecomposition.test.ts` לבדיקת W=200 ו-W=250)

---

### ✅ ISSUE-006: פריטי מגירה ב-`calcCuts` ללא `group` *(תוקן 2026-04-27)*

**תוקן ב:** `src/core/cuts/cuttingList.ts` — 8 שורות (4 חלקי מגירה × 2 מיקומים: `cabinet` + `drawer_unit`)

**הפתרון:** נוסף `group: "drawer"` לכל 4 חלקי המגירה בשני המיקומים.

**טסטים שנוספו:** 3 (כל חלקי המגירה עם group נכון, sheetsNeededByGroup("drawer") > 0, drawer_unit גם כן)

---

## 🔵 FUTURE DESIGN — תכנון לשלב ה-UI

### DrawerSpec — תמיכה במפרטי פרזולים שונים (Blum / Hettich / GTV)

**המוטיבציה:**
כיום מידות חלקי המגירה (עובי צד, מרווח מסילה, קיום צד עץ) מקובעים כקבועים ב-`cuttingList.ts`.
בפועל, כל יצרן מגירה מכתיב ערכים שונים — ולעתים מבטל חלקי עץ לחלוטין (Blum Tandembox = צדי פלדה, אין עץ).

**הצעת `DrawerSpec`** — טיפוס שיוזרק ל-`calcCuts` / `calcDrawerCuts`:

```typescript
interface DrawerSpec {
  hasSidePanels: boolean;       // false = צדי פלדה (Blum Tandembox) — אין לוחות צד עץ
  sidePanelThickness: number;   // mm — 12 (סטנדרט) או 18 (ארגז כבד)
  bottomThickness: number;      // mm — 6 (סטנדרט) או 16 (Legrabox)
  sideDepthReduction: number;   // mm — מרווח עומק למסילה (Blum=40, GTV=50, Hettich=45)
  sideHeightReduction: number;  // mm — פינוי לתחתית ולמסילה
  backWidthReduction: number;   // mm — שקע לצדדים
}
```

**מה יצטרך להשתנות:**

| קובץ | שינוי |
|------|-------|
| `src/types/cuts.ts` | הוספת `thickness?: number` ו-`optional?: boolean` ל-`CutItem` |
| `src/core/cuts/cuttingList.ts` | החלפת קבועים `DRAWER_*` בערכים מ-`DrawerSpec` |
| `src/catalog/hardware/` | הוספת `drawerSpec` לכל `HardwareSpec` מסוג `slide` |
| `src/core/cuts/sheetCalculator.ts` | חישוב לוחות לפי `thickness` (לוחות 12mm ו-6mm בנפרד) |

**ספריית presets מומלצת:**
```
drawer-specs/blum-tandembox.json   → hasSidePanels: false, bottomThickness: 16
drawer-specs/blum-metabox.json     → hasSidePanels: true,  sidePanelThickness: 12
drawer-specs/hettich-innotech.json → hasSidePanels: true,  sidePanelThickness: 18
drawer-specs/gtv-standard.json     → hasSidePanels: true,  sideDepthReduction: 50
```

**עדיפות:** לממש כשמתחילים לבנות UI ומוסיפים בחירת פרזול.
