# הקשר הפרויקט — Carpenter App

## מה זה

אפליקציית ווב לתכנון רהיטים מותאמים אישית לנגרים. הנגר מזין מידות ובחירות; המערכת מחשבת אוטומטית פיצול לגופים, רשימות חיתוכים, חזיתות וצירים, פנים גוף, ופרזולים.

## למי

נגרים מקצועיים. הנגר יודע את אומנותו — התוכנה משרתת, לא מכתיבה (ראה DESIGN_PRINCIPLES — עיקרון "החופש בידי הנגר").

---

## Quick orientation (לסשן חדש)

**State hooks (כל אחד עומד בפני עצמו):**
- `useCabinet` — state של cabinet יחיד פעיל: `calculate()`, interior, doors, overrides (board / boxDimension / bodyEdging).
- `useProject` — Project כולל `products: ProductUnit[]`, kitchen units, **`rooms: Room[]`** (floor plan — CRUD לחדרים + placements), שמירה ב-localStorage.
- `useSettings` — AppSettings: `customMaterials[]`, `bodyEnabledMaterialIds[]`, `frontEnabledMaterialIds[]`, price overrides — localStorage key `'carpenter-settings-v2'`.

**Navigation ב-`App.tsx`** — Project + 2 רמות מקבילות:
1. **Project** → `ProjectView` (אזור חדרים + אזור products + ⚙️ → SettingsPage).
2a. **Product** → `CabinetForm` (single product) או `KitchenEditor` (kitchen).
2b. **Room** → `RoomView` (floor plan: toggle מבט-על / חזית). פתיחת מוצר מתוכו → רמת Product.
3. **Kitchen unit** → `CabinetForm` עם kitchen flags (`hideMainDimensions`, `hideDoorsPerColumn`, `hideEnvelopeTop`, `splitShellSides`).

**מערכת קואורדינטות חדר** (3D-native, three.js-compatible, Y-up, ס"מ): origin בפינה השמאלית-אחורית על הרצפה; X=רוחב, Y=גובה, Z=עומק. כל תצוגה (top/front/3D) = היטל. `core/room/{productBounds,roomGeometry}.ts` — bounds תלת-ממדי + snap/projection (core טהור). ראה DECISIONS_LOG 2026-06-15.

**Compute pathways:**
- `useCabinet.calculate(input)` — cabinet יחיד פעיל; מעדכן refs ו-result.
- `core/cabinetCompute.ts → computeUnitCutsAndHardware(input, savedState, customMaterials)` — pure compute (ללא React), משמש ב-`KitchenOverview` ל-loop על kitchen units והצגת cuts/hardware מאוגדים.

**Single source of truth של חישובים:**
- `core/boards/boardModel.ts` — `buildBoardModel`, `computeInnerWidth` (תומך `{ left, right }`), `getMaterial`, `getDimension`.
- `core/geometry/frontGeometry.ts` — `computeRowFrontLayout`, `computeFrontGeometry`.
- `types/cabinet.ts → getShellSides(input)` — single source לפיצול per-side shell.

---

## פיצ'רים פעילים

- **מחשבון חיתוכים** — קורפוס, מדפים, מגירות, דלתות, מעטפת, צוקל, חיפוי, צוקל נסוג.
- **פיצול לגופים** — אוטומטי לפי `MAX_BOX_W=100`; doorsPerColumn 1/2/3; איחוד גופים קטנים <60 ס"מ.
- **שני חומרים נפרדים** — body + front; עובי חזית פר-דלת ופר-drawer חיצוני.
- **עורך חזיתות + עורך פנים גוף** — צירים, מדפים, מגירות (internal/external), מוט תליה (לא ב-kitchen), מחיצות פנימיות.
- **חלוקת מדפים חכמה** — round-robin בין אזורים ≥25 ס"מ, hanger logic, אזהרות `small_zone` / `rod_low` / `rod_drawer_close`.
- **מגירות חיצוניות** — חזיתות עצמאיות, `coversSkirt` עובר לתחתונה, מדף קבוע (`syncFixedShelf`), drawer-box visualization (צר ב-2.5, נמוך ב-5), `equalizeExternalDrawersIfOverflow` כשהstack חורג.
- **מעטפת** — `hasShell` (סימטרי) או `hasShellLeft`/`hasShellRight` (kitchen — `splitShellSides`); `getShellSides` מאחד.
- **ניהול פרויקטים** — `useProject` שומר ב-localStorage; ייצוא/יבוא קבצים; ריבוי products במקביל; **ריבוי חדרים** (`rooms[]`).
- **תצוגת חדר (floor plan) — שלבים 1-2** — `RoomView`: חדר מלבני + מיקום מוצרים. **מבט-על** (הצמדה-לקיר מספרית + גרירה) ו**מבט-חזית** (בחירת קיר, מוצרים מוקרנים בגובה הנכון, מטבח=בסיס+קלפה נפרדים, שדה גובה-מהרצפה). data model 3D-native (`Room`/`ProductPlacement`, schema v3); `productSubBoxes`+`placementElevationRects` (core). 3D = שלב 3.
- **מטבחים** — מודולי `drawers`/`shelves`/`sink`/`dishwasher`/`oven`/`pantry` (`core/product/kitchenModules.ts`); `KitchenOverview` עם 4 טאבים (גופים/חזיתות/חיתוכים/פרזולים); תצוגה מאוחדת UnitsView (bodies + fronts overlay על אותו layout).
- **חומר גלובלי למטבח** — `KitchenEditor` חושף בורר חומר גוף + חזיתות שחל על כל הגופים. נגזר מהגופים (חומר משותף / "מעורב"), כותב לכולם דרך `onUpdateUnit`; גוף חדש יורש את החומר המשותף. עקיפה פר-גוף דרך עורך הגוף.
- **sink module** — `topVariant='sink-open'`: אין top board, שני traverse boards (front+back), sink basin overlay בסקיצה.
- **dishwasher module** — `plinth=0, hasFronts=false, hasBack=false, hasBottom=false`: תא ריק, W=64, יושב ישירות על הרצפה (LEVELER_GAP_CM), קוטע צוקל. 3 לוחות בלבד: 2 דפנות + עליון.
- **oven module** — `hasFronts=false`: גוף סטנדרטי (W=60, plinth=10) עם מגירה חיצונית (h=19.2) + מדף קבוע (hff=17.4) בתחתית, וחלל פתוח של 59 ס"מ לתנור. אין דלת לחלל התנור.
- **pantry module** — גוף גבוה (larder), H=180 (שונה משאר הגופים), W=60, plinth=10, עם חזיתות. פנים = 6 מגירות פנימיות (תחתונה 30 + 5×28) הממלאות bodyH=170. מגירות פנימיות → פרזול + סקיצה בלבד, לא חלקי חיתוך.
- **wall module (קלפה)** — `mount:'wall'`: ארון קיר עליון, W=100/H=50/D=35, plinth=0, חזית בודדת, 2 מדפים, עורך shelf-only. תצוגת המטבח עברה ל-**elevation** (`UnitsView` אבסולוטי): גופי קיר בשורה עליונה בגובה 152 ס"מ, מיושרים מעל הגוף התחתון שקדם להם, עם פס שיש מצויר. מסוננים מקיבוץ הצוקל. **`hasWallEnvelope?`**: checkbox "מעטפת עליון+תחתון" מוסיף שני לוחות חזית (BoardRole `envelope-bottom` חדש, mirror של `envelope-top`), בלי תלות ב-shell צדדי; הגוף הפנימי מתכווץ ב-2×עובי חזית והגובה החיצוני נשמר.
- **חומרים מותאמים אישית** — `SettingsPage`: לכל חומר checkbox (כלול ב-dropdown), מחיר עריך, custom materials עם id מותאם.
- **box dimension overrides** — עקיפת W/H/D פר-body דרך `BoxInteriorEditor`; effective dims מוחל בסקיצה ובחיתוכים.
- **דו-לשוני** — עברית + אנגלית.

---

## חובות טכניים ידועים

### External drawers — edge cases
- `validateMainDoorHeight` (אזהרות `main_door_absent` / `main_door_too_short`) קיימת אבל לא מחוברת ל-UI.
- בגוף עם `numFronts > 2` ומחיצה — ה-frontIndex האמצעי לא מקבל cell, ולא ניתן להוסיף שם external drawer.

### עומק גופים פנימיים
הגופים מקבלים את עומק הארון המלא. בפועל ה-עומק הנגיש קטן יותר עקב דלת (~2 ס"מ) + צירים (~1.5) + גב (~0.6). חישוב carcassD ב-`computeCarcassDepth` כבר מורידם — אבל הצגת ה-D במקומות מסוימים עדיין מציגה את ה-input. ידויק בהמשך.

### Pricing — חיבור ל-UI
`core/pricing/laborCalc.ts` ו-`core/hardware/calcHardware.ts` קיימים. `HardwareList` מציג פרזולים. אומדן עלויות-עבודה לא מחובר ל-UI עדיין.

### box dimension override — מסלול אחיד לכל התצוגות
עקיפת מידות גוף (`boxDimensionOverrides`) משנה את הסקיצה, רוחב/גובה החזית המצוירת (`door.width`/`door.height`), חיתוכי הקורפוס, חיתוכי המגירות החיצוניות **וחיתוך הדלת**. חיתוך הדלת נגזר מ-`doorsById` דרך `buildDoorCutItems` (`core/cuts/doorCuts.ts`) — מקור אמת יחיד שמשקף את העקיפה — ולא מ-`calcCuts` (שמחשב מ-`input.W`). `calcCuts` נותר אחראי רק על חלקי קופסת המגירה.

---

## כיוון עתידי

- **ייצוא** — PDF של רשימת חיתוכים (קיים בסיסי דרך window.print), CSV, DXF.
- **תלת ממד** — תצוגת 3D בסיסית.
- **הצעת מחיר ללקוח** — חישוב עלויות כולל (חומרים + פרזולים + עבודה) + תבנית PDF.
