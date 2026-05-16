# Carpenter App — אפליקציית תכנון ארונות

אפליקציית ווב לתכנון ארונות נגרות מותאמים אישית. הנגר מזין מידות ארון, המערכת מחשבת אוטומטית רשימת חיתוכים, חזיתות, צירים ופרזולים.

---

## תכונות עיקריות

- **פיצול לגופים**: ארון מחולק אוטומטית לקופסאות לפי רוחב (עד 100 ס"מ) וגובה (עד 200 ס"מ)
- **1/2/3 דלתות לגובה**: doorsPerColumn עם איחוד גופים קטנים מ-60 ס"מ
- **חזיתות מרובות לרוחב**: גוף יכול לכלול כמה חזיתות בהתאם ל-maxDoorWidth
- **מעטפת חיצונית**: צדדים ותקרה מחומר החזיתות
- **שני חומרים**: bodyMaterial לקורפוס, frontMaterial לחזיתות
- **עורך פנים גוף**: מדפים, מגירות, מוטות תליה — עם גרירה
- **מחיצות פנימיות**: הוספה/הסרה בין חזיתות סמוכות
- **עורך חזיתות**: צד צירים, מספר צירים, מיקום ידני, coversSkirt
- **תצוגה מקדימה**: סקיצה חיה ומיניאטורות פרופורציונליות
- **דו-לשוני**: עברית ואנגלית

---

## טכנולוגיות

- React 19 + TypeScript
- Vite (dev server + build)
- Vitest (בדיקות יחידה)
- CSS Modules (אין תלויות CSS חיצוניות)

---

## איך להריץ

```bash
npm install
npm run dev
```

האפליקציה תפתח בכתובת: http://localhost:5173

---

## בדיקות

```bash
npm test
# או
npx vitest run
```

---

## מבנה הפרויקט

```
src/
├── types/       הגדרות TypeScript
├── core/        לוגיקה טהורה (ללא React)
├── catalog/     חומרים ופרזולים (JSON)
├── i18n/        תרגומים
└── ui/          ממשק משתמש (hooks + components)
```

---

## תיעוד

| קובץ | תוכן |
|------|------|
| [PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) | מצב נוכחי, פיצ'רים, חובות טכניים |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | מבנה קוד וזרימת נתונים |
| [DESIGN_PRINCIPLES.md](docs/DESIGN_PRINCIPLES.md) | עקרונות תכנון |
| [CARPENTRY_RULES.md](docs/CARPENTRY_RULES.md) | כללים נגריים שמיושמים |
| [GLOSSARY.md](docs/GLOSSARY.md) | מילון מונחים |
| [DECISIONS_LOG.md](docs/DECISIONS_LOG.md) | יומן החלטות עם נימוקים |
| [CHANGELOG.md](CHANGELOG.md) | היסטוריית שינויים |
