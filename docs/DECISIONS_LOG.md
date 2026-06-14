# יומן החלטות — Carpenter App

החלטות ארכיטקטוניות ועיצוביות משמעותיות עם נימוקן.

---

## 2026-06-14 — מעטפת עליון+תחתון לקלפה (envelope-bottom) — סגירת החוב מ-2026-06-11

**ההחלטה**: ה-`envelope-bottom` מומש. השדה `CabinetInput.hasWallEnvelope?: boolean` (מטא-דאטה, ברירת מחדל false, מגודר ע"י `mount === 'wall'`) מפעיל **שני** לוחות מעטפת — עליון ותחתון — מחומר חזית, **בלי תלות ב-shell הצדדי**. ה-checkbox מופיע ב-`CabinetForm` רק לקלפות, מחליף את "מעטפת תקרה" הקיים (`hideEnvelopeTop` כבר מסתיר אותו לקלפות).

**מודל הגובה**: המכסים **בתוך** ה-H (הגוף הפנימי מתכווץ ב-2×עובי חזית; H=50 חיצוני נשמר), עקבי עם `hasEnvelopeTop` הקיים — לא עם תוספת חיצונית.

**איך נסגרו שני החסמים שתועדו ב-2026-06-11**:
1. **חסם הגאומטריה (`computeSketchGeometry`)** — נפתר ב-2026-06-13 כשהוספנו את `effectiveH` (סכום גבהי הגופים אחרי עקיפה + צוקל + מעטפת). הוא משמש גם ל-scale וגם למתאר. עכשיו פשוט מוסיפים `wallEnvAdded = 2·tFront` ל-`effectiveH`, ה-boxes מתחילים אחרי ה-cap העליון, וה-`envelopeBottomPanel` יושב צמוד לתחתית. **המכסים לא נחתכים יותר** ב-viewBox החתוך של תצוגת המטבח.
2. **חסם ה-shell (`deriveEnvelopeFlags`)** — נפתר עם פרמטר חדש `hasWallEnvelope = false`. כש-true → מחזיר `{ left:false, right:false, top:isTopRow, bottom:isBottomRow }` **עוקף** את שער ה-`!sides` המוקדם. ה-EnvelopeFlags interface קיבל `hasEnvelopeBottom: boolean` (חובה בחתימה הפנימית; אופציונלי ב-`BuildBoardModelArgs` עם ברירת מחדל false → אפס תאימות לאחור).

**גזירה ל-cuts + sketch (תבנית `envelope-top`)**:
- `boxDecomposition` קיבל פרמטר חמישי `envelopeBottomH = 0` — מקטין `bottom/single` ב-cm נתון (mirror של `envelopeTopH`).
- `BoardRole` קיבל `'envelope-bottom'`; `getEdgingPattern`/`ROLE_LABELS`/`ROLE_GROUP` הם switch/Record ממצים → tsc אילץ ה-case החדש.
- `buildBoardModel` פולט board ב-`yFrom:H, yTo:H+tF`, חומר חזית, `length:W, width:envD`.
- `computeSketchGeometry` קיבל `wallEnvelopeCm = 0` (פרמטר אחרון). הוא מעביר את הערך כ-`envelopeTopH=envelopeBottomH` ל-`decomposeBoxes` (כך ה-`box.H` בסקיצה תואם ל-cuts), ובונה `envelopeTopPanel` + `envelopeBottomPanel` מלאי-רוחב.
- `CabinetSketch` ו-`CabinetFrontsSketch` מרנדרים את הפאנלים pre-calc; post-calc הם מגיעים אוטומטית כ-board.

**טריידאוף**:
- שינוי התנהגות מכוון לקלפה עם הדגל: `H` הפנימי הזמין לתכולה (`box.H`) מצטמצם ב-2×tFront (לדוגמה 3.6 ס"מ ב-MDF 18). הגובה ש"רואים" בחוץ נשמר.
- `EnvelopeFlags.hasEnvelopeBottom` נוסף כשדה **חובה** בחתימה הפנימית של `deriveEnvelopeFlags`, אבל **אופציונלי** ב-`BuildBoardModelArgs` (ברירת מחדל false) — אפס שינוי לכל קורא קיים שמעביר רק 3 דגלים.
- `wallEnvelopeCm` כפרמטר אופציונלי 12-th ב-`computeSketchGeometry`. סדר ה-args נשמר; חתימה גודלת, אך אין breaking change.

**אלטרנטיבה שנדחתה — להפעיל את `hasEnvelopeTop` לקלפה (במקום שדה חדש)**: נדחה כי `hasEnvelopeTop` הקיים מגודר ב-3 מקומות שונים ע"י `hasShellLeft||hasShellRight` (form payload בכל קריאת `calculate()`, `useCabinet` ב-`envelopeTopH`, `KitchenOverview`). שינוי הגדרה אומר רגרסיה לארונות בסיס. שדה מבודד נקי יותר.

**יישום**:
- `src/types/cabinet.ts` — `hasWallEnvelope?: boolean`.
- `src/core/geometry/boxDecomposition.ts` — פרמטר `envelopeBottomH = 0`.
- `src/core/boards/boardModel.ts` — BoardRole חדש, label, group, getEdgingPattern, EnvelopeFlags, BuildBoardModelArgs (אופציונלי), deriveEnvelopeFlags (פרמטר wallEnv), emission.
- `src/ui/hooks/useCabinet.ts` + `src/core/cabinetCompute.ts` — `wallEnv` נגזר, מעביר ל-decompose + deriveEnvelopeFlags + buildBoardModel.
- `src/ui/components/CabinetSketch.utils.ts` — `wallEnvelopeCm` arg, `effectiveH += 2·wallEnv`, `levelYOffset` מתחיל אחרי cap עליון, panels חדשים.
- `src/ui/components/CabinetSketch.tsx` + `CabinetFrontsSketch.tsx` — `wallEnvelopeCm` prop, מעבירים לגאומטריה, מרנדרים `envelopeBottomPanel`.
- `src/ui/components/CabinetForm.tsx` — FormState field, init + 3 payloads + reset, checkbox מגודר ע"י `initialInput?.mount === 'wall'`, מעביר `wallEnvelopeCm = frontThicknessCm` כשמסומן.
- `src/ui/components/KitchenOverview.tsx` — מעביר `wallEnvelopeCm = tFront` ל-CabinetSketch המוטמע.
- `src/i18n/translations.ts` — `t.form.hasWallEnvelope` (HE: "מעטפת עליון+תחתון", EN: "Top+bottom envelope").
- בדיקות: +2 ל-`boardModel.test.ts` (wall envelope flags + emission), +4 ל-`boxDecomposition.test.ts` (envelopeBottomH), +4 ל-`CabinetSketch.utils.test.ts` (wall envelope caps). 669 עוברים.

---

## 2026-06-13 — חיתוכי הדלת נגזרים מ-doorsById (סגירת החוב מ-2026-05-25)

**ההחלטה**: חיתוכי הדלת ב-CutsList נגזרים מ-`doorsById` דרך `buildDoorCutItems` (`core/cuts/doorCuts.ts`), לא מ-`calcCuts`. ה-helper פולט `CutItem` אחד לכל דלת (`qty=1`, `group:'door'`) עם `w = cm(door.width) − perimMm`, `h = cm(door.height) − perimMm`; `mergeCutItems` מקבץ זהות במורד הזרם. `useCabinet` ו-`cabinetCompute` חדלו לקרוא ל-`calcCuts` עבור דלתות. `calcCuts` עצמו **לא** שונה (נשאר אחראי על חלקי קופסת מגירה ועדיין מכוסה ב-21 בדיקות `cuttingList.test`).

**הנימוק**:
- **סגירת חוב מתועד**: החלטה 2026-05-25 השאירה דלתות ב-`calcCuts` "עד ש-BoardModel יטפל בהן". בפועל הדלתות כבר מחושבות נכון ב-`doorsById` (מקור אמת לתצוגה ולסקיצה) — `calcCuts` רק שכפל את החישוב מ-`input.W`/`input.H` והתעלם מ-box override. גזירה מ-`doorsById` מאחדת את המקור (עיקרון 2 + 2026-05-20).
- **לא דרך BoardModel**: הדלת היא חזית (front) עם state עשיר (צירים, כיסוי צוקל, גובה תלוי-interior) שחי ב-`Door`, לא "לוח קורפוס". העברתה ל-BoardModel הייתה refactor גדול בלי תועלת — `doorsById` הוא ה-equivalent הנכון של "מקור אמת" עבורה.
- **דיוק נלווה**: `door.height` (מ-`calcMainDoorHeight`) כבר מתחשב במגירות חיצוניות שמקצרות את הדלת וב-`envelopeTopH`; `calcCuts` (getDoorHeight) התעלם משניהם. הגזירה מתקנת זאת.

**טריידאוף**:
- שינוי התנהגות מכוון: חיתוך הדלת בארונות עם מגירות חיצוניות / מעטפת תקרה יקצר בהתאם (נכון יותר). אין טסט קיים שהסתמך על הערך הישן.
- `calcCuts` נותר עם קוד דלתות שאינו נקרא ממסלולי ה-compute (משמש רק בבדיקותיו הישירות + `carpenter-app.jsx` legacy). לא הוסר כדי לא לגעת בכיסוי הבדיקות; מועמד לניקוי עתידי כש-drawer-box parts גם יעברו ל-BoardModel.

**אלטרנטיבה שנדחתה — לתקן את `calcCuts` שיקבל box dimensions**: נדחתה כי `calcCuts` הוא single-row שמחשב decomposition בעצמו מ-`W`; הזרקת effective dims הייתה משכפלת את לוגיקת ה-row layout במקום לצרוך אותה. גזירה מ-`doorsById` צורכת את המקור הקיים.

---

## 2026-06-11 — קלפה: "מעטפת עליון/תחתון" (envelope-bottom) נדחתה

**ההחלטה**: מודול הקלפה נבנה (מידות, חזית בודדת, shelf-only editor, elevation, פרזול מנגנון קלפה). הבקשה להוסיף checkbox "מעטפת עליון תחתון" (לוח front-material נוסף מעל העליון ומתחת לתחתון) **נדחתה** לעת עתה — לא מומשה.

**הנימוק (שני חסמים ב-core שהתגלו בחקירה)**:
1. **המעטפת מגודרת ע"י ה-shell הצדדי**: `deriveEnvelopeFlags` (`boardModel.ts`) מחזיר את כל דגלי המעטפת `false` כשאין מעטפת שמאל/ימין. checkbox עליון/תחתון **עצמאי** דורש ניתוק — שינוי חתימה שמשפיע על כל הארונות.
2. **גאומטריית הסקיצה לא שומרת מקום למכסים**: `computeSketchGeometry` מחשב `cabH = H·scale` ללא תוספת מעטפת. המכסים נפלטים מחוץ לגבול (`y<0`, `y>H`) ולכן **נחתכים** ב-viewBox החתוך של תצוגת המטבח (embedded). תיקון = לגעת בגאומטריה משותפת לכל ארון — סיכון רגרסיה.

**טריידאוף / מתי לחזור לזה**: רשימת החיתוכים + העלות יהיו נכונים בקלות (boardModel פולט את הלוחות), והמכסים **כן** יראו בתצוגת הגוף של היחידה (`CabinetForm` לא-embedded, ב-padding) — רק תצוגת המטבח הראשית חותכת. כשנחזור: להוסיף `envelope-bottom` (role + arg + emission, mirror של envelope-top), לנתק עליון/תחתון מה-shell ב-`deriveEnvelopeFlags`, ולהרחיב את `computeSketchGeometry` לשמור מקום למכסים (cabH += tF לכל צד מעוטף) — בזהירות, עם בדיקת רגרסיה לארונות קיימים עם `hasEnvelopeTop`.

---

## 2026-06-10 — מודולים: סקיל `add-module` עכשיו, רפקטר ל-registry גנרי כשיהיו 2 מוצרים

**ההחלטה**: ליצור סקיל פרודקט-אגנוסטי `.claude/skills/add-module/SKILL.md` שמקודד את
מתכון הוספת המודול (type → input factory → state factory → UI → i18n → tests → docs),
**בלי** לרפקטר את הקוד ל-`ProductModule` registry גנרי. הסקיל מחזיק "מפת מוצר→מערכת
מודולים" שכרגע ממפה רק `kitchen` (`kitchenModules.ts`). מוצר חדש עם מודולים → מוסיפים
שורה למפה (+ Bootstrap של `<product>Modules.ts` בתבנית kitchen).

**הנימוק**:
- **YAGNI / הפשטה מדוגמה יחידה**: כיום רק `kitchen` יש לו מודולים. עיצוב registry גנרי
  מדוגמה אחת מסכן להטמיע הנחות מטבח-ספציפיות (קיטוע צוקל ב-`plinth=0`, `LEVELER_GAP_CM`,
  קיבוץ צוקל ב-`groupKitchenUnitsForPlinth`) שלא בהכרח יתאימו לארון/ספרייה.
- **הסקיל זול לעדכן**: פרוצדורה + ידע, לא קוד. מתעדכן בשורה אחת כשנדע יותר.
- **תיעוד ה-gotchas**: הסקיל משמר באגים אמיתיים שנתקלנו בהם (חזית מגירה חיצונית
  כש-`hasFronts=false`, אובדן דגלים ב-`CabinetForm`, קווי צוקל "לפי גודל גוף") —
  ערך מיידי גם בלי רפקטר.

**טריגר לרפקטר (גישה B)**: כשמוצר **שני** יקבל מודול ראשון. אז יהיו שתי דוגמאות
אמיתיות, ואם יש שכפול ממשי בין `kitchenModules.ts` ל-`<product2>Modules.ts` — לחלץ
`interface ProductModule { id; productTypes[]; defaultW; buildInput(); buildState(); labelKey }`
+ registry יחיד, והעורכים יסננו לפי `productType`. עד אז המפה בסקיל מספיקה.

**אלטרנטיבה שנדחתה — רפקטר עכשיו**: לחלץ `ProductModule` גנרי לפני שיש מוצר שני.
נדחה כי אין דוגמה שנייה שתאמת את ההפשטה, והסיכון הוא abstraction מוקדם שמקבע
kitchen-isms.

---

## 2026-06-02 — Custom Materials: Support בכל ה-stack מ-form עד cuts list

**ההחלטה**: Custom materials (יוצרים ידי משתמש שמוגדרים בהגדרות) יידרשו לתמיכה בחישובי מטריאלים בעומק ה-core. זה דורש:
1. `useCabinet` קיבל `settings` כפרמטר כדי לחפש מטריאלים בcustom list בזמן calculating thickness
2. `Board.materialId` ו-`CutItem.materialId` תומכים ב-`string` בנוסף ל-`MaterialId` (catalog)
3. `CutsList` משתמש ב-`getMaterialWithCustom` כדי להביא שמות וצפיפות
4. כשsettings משתנו (משתמש הוסיף custom material בהגדרות), `CabinetForm` מריץ `calculate()` מחדש עם הקלט הקודם כדי לעדכן את ה-results

**הנימוק**:
- **End-to-End flow**: ככל שמטריאל מעבור מhazzy form → calculate core → cuts list, זה צריך לשמור את ה-id שלו בלי fallback לקטלוג
- **Type flexibility**: MaterialId היא literal union (catalog keys). Custom ids הם strings. הקוד צריך לעזוב ל-union, לא מטיל כל custom→catalog
- **Settings injection**: ה-hook צריך גישה לcustom materials כדי לחפש properties (thickness להשבחה מידות, pricePerSheet ל-CutsList). Prop passing כל הדרך מקל על testing
- **Re-calculate on settings change**: כשמשתמש משנה הגדרות (מוסיף/מוחק custom material), ה-results צריכים להתעדכן כדי לשקף את ה-definitions החדשות

**טריידאוף**:
- הניחה שהמשתמש תמיד בוחר מthropdown המכיל custom materials אם הם קיימים, או fallback לקטלוג. אם dropdown ריק ואין custom materials עדיין, הניחה הכנסנו fallback לקטלוג ב-CabinetForm
- סיכום: הזרימה עבדה, אבל רק כשהsettings העבורו כנכון וthe dropdown האוכלוס כראוי

**יישום**:
- `useCabinet(settings?)` — קיבל settings עם `bodyCustomMaterials` ו-`frontCustomMaterials`
- `calculate()` משתמש `getMaterialWithCustom(materialId, allCustomMaterials)` כדי לחפש thickness
- `CabinetForm` מעביר settings ל-`useCabinet(settings)`
- `CabinetForm` הוספה `useEffect` שקורא ל-`calculate(getLastInput())` כשsettings משתנו
- `CutsList.tsx` משתמש `getMaterialWithCustom` בעת הצגת שמות ומחירים
- Fallback: כשאין custom materials, `CabinetForm` מציג catalog materials בdropdown

---

## 2026-05-31 — Edging: רק cabinet default + per-body override; אין per-door

**ההחלטה**: שכבת ה-edging חושפת ב-UI שתי רמות בלבד — ברירת מחדל ארון (ב-`CabinetForm`) ו-override פר-גוף (radio "כמו ארון / מותאם" ב-`BoxInteriorEditor`). **אין UI ל-override פר-דלת**, ו-`calcCuts` לא מקבל overrides פר-דלת. השדה `SavedCabinetState.doorEdgingOverrides?` ו-ה-validation שלו ב-`serialize.ts` נשמרים כתשתית טהורה — תמיד `Map` ריק, ללא תקורה, ללא setter בשום מקום.

**הנימוק**:
- **תרחיש נדיר**: דלת בודדת בקנט שונה משאר הארון היא בקשת נישה מאוד בעבודת הנגרות הסטנדרטית. בדרך כלל הקנט הוא החלטת-ארון או לכל היותר החלטת-גוף (כשמעטפת מפרידה גופים מבחומרים שונים).
- **עלות מימוש גבוהה**: ב-`calcCuts` הדלתות נפלטות מצטברות כ-`{ name: "דלת", qty: frontsPerRow }` ולא per-door. תמיכה ב-per-door override דורשת ריפקטור: pivot ל-emission door-by-door, התאמה ב-`mergeCutItems` (שיפעיל merge חוזר), ושינוי ב-grouping של "דלת תחתונה / עליונה / אמצעית". scope גדול מעבר לתועלת.
- **עקרון "אין tech debt על תכונה לא מומשת"**: לא מתעדים "פיצ'ר שלא נבנה". פה רושמים את ההכרעה כדי שלא נחזור ונשאל "למה ה-radio הזה לא קיים ב-`DoorEditor`?".

**טריידאוף**:
- אם בעתיד יתעורר צורך — נצטרך לשנות את `calcCuts` ל-emission door-by-door (`qty=1` פר CutItem), להוסיף setter ב-`useCabinet` (`setDoorEdgingOverride(doorSlotKey, edging)`), ולחבר UI ב-`DoorEditor`. ה-types וה-validation כבר במקום, אז ההרחבה אינה דורשת bump של schemaVersion.
- ה-`SavedCabinetState.doorEdgingOverrides?` הוא "dead weight" קטן ב-types — עלות מינימלית, רווח עתידי ברור (חוזה עתידי כתוב כבר עכשיו).

**אלטרנטיבה שנדחתה — לדחות גם את התשתית**: להסיר `doorEdgingOverrides?` מ-`SavedCabinetState` ומ-`serialize.ts`. נדחה כי השדה האופציונלי לא משפיע על שום JSON שמור בפועל (תמיד `undefined`), והשארתו עוקפת עתידי `schemaVersion` bump כשנחבר את הפיצ'ר.

**יישום**:
- `CabinetForm.tsx` — שני `<select>` חדשים (thickness 0.6/1.3, finish אוטומטי/חומר) אחרי `frontMaterial`; `buildCabinetEdging(form)` מועבר ל-`calculate({ ..., edging })`.
- `BoxInteriorEditor.tsx` — סעיף עליון "קנט: ( ) כמו ארון ( ) מותאם" עם 2 dropdowns מותנים. setter דרך prop, שמופנה ל-`setBodyEdgingOverride(boxStableKey(box), edging | undefined)` ב-`CabinetForm`.
- `useCabinet.ts` — `bodyEdgingOverrides: ReadonlyMap<BoxSlotId, Edging>` (state + ref) + `setBodyEdgingOverride`; מועבר ל-`edgingCtx.bodyOverrides` ב-`calculate()`.
- `translations.ts` — slice חדש `edging.*` (9 keys, HE + EN).
- `DoorEditor.tsx` — **ללא שינוי**.

---

## 2026-05-29 — serialize.ts הוא boundary-free (Option B)

**ההחלטה**: `core/project/serialize.ts` עובד אך ורק עם `Project` (כל ה-maps כ-`Record<string, ...>`). הוא **לא** מטפל בהמרת Map↔Object של state ה-runtime ב-`useCabinet` (`partitionsById`, `plinthGableOverrides`, `boardOverridesByStableId` שהם `Map`-ים). ה-bridge בין השכבות ייבנה בקובץ נפרד כשנגיע לחבר את `useCabinet` לפיצ'ר שמירה אמיתי.

**הנימוק**:
- **טוהר ארכיטקטוני**: `serialize.ts` הוא `Project ↔ JSON` בלבד — אין לו תלות בצורת ה-runtime של `useCabinet`. ניתן לטסט אותו עם `Project` סינתטי בלי לבנות `useCabinet` שלם.
- **הפרדת אחריות**: ההחלטה איך לבנות `Project` מ-state חי (איזה Map ממיר מתי, איך לטפל ב-Box.id המתחלף) שייכת ל-`useCabinet`, לא ל-serialize. הרבה היגיון runtime-תלוי שצריך לקחת בחשבון בהמרה.
- **שלב סינכרון**: הפיצ'ר הזה (cloud-readiness) הוא תשתית. ה-bridge ייבנה רק כשיהיה צד שכנגד (ענן או localStorage UI). אין צורך לבנות גשר ש-no caller ישתמש בו בינתיים.

**טריידאוף**:
- ההוראה המקורית של המשתמש דרשה שה-serialize יכלול את ההמרה. נדחתה לאחר דיון — `serializeProject(project: Project)` נקי יותר מאשר `serializeProject(useCabinetState)`. החלטה מקובלת בהתכתבות ב-2026-05-29.
- חוב מתעד: בעת בניית ה-bridge, חשוב לזכור שה-key-mapping מ-`boxId` ad-hoc ל-`BoxSlotId` יציב הוא לא טריוויאלי (דורש מפת `boxStableKey → BoxSlotId` חיה ב-`useCabinet`).

**אלטרנטיבה שנדחתה — Option A**: הוספת helpers `projectFromUseCabinet`/`applyProjectToUseCabinet` ל-`serialize.ts` שיעשו Map↔Record. נדחה כי `serialize.ts` היה מאבד את הנייטרליות שלו לטובת התאמה ל-shape ספציפי של `useCabinet`, ועדכון עתידי ל-`useCabinet` היה דורש עדכון מקביל ל-`serialize.ts`.

**יישום**:
- `Project.cabinet.state` משתמש ב-`Record<string, ...>` בכל המפות.
- `serializeProject(project)` ו-`deserializeProject(json)` עובדים על הצורה הזו בלבד.
- כל הטסטים ב-`serialize.test.ts` מייצרים `Project` סינתטי דרך `mkProject()` — לא דרך `useCabinet`.

---

## 2026-05-29 — BoxSlotId כ-alias של string (זמני)

**ההחלטה**: `BoxSlotId` כרגע מוגדר כ-`type BoxSlotId = string`. הכוונה: בעתיד יוחלף ב-id יציב מבוסס-הגדרה, שמוקצה ליחידה בעת יצירתה הראשונה ושורד שינויי decomposition (כמו `Board.stableId` ללוחות). הריפקטור הזה הוא **משימה נפרדת** שתבוצע לפני השקה לציבור — לא חלק מהפיצ'ר הנוכחי.

**הנימוק**:
- **הפרדת scope**: cloud-readiness עוסק במבנה המסמך השמור (`schemaVersion`, migrations, serialize/deserialize). שינוי מודל הזהות של גופי הארון הוא ריפקטור צולב-מערכת שדורש שינוי ב-`useCabinet`, `boxStableKey`, וכל ה-`*ById` המפות. עירוב המשימות היה מסכן את שתיהן.
- **תאימות עתידית מובטחת**: כל המפות שמושפעות (`interior`, `cellInterior`, `partitions`, `doors`) כבר משתמשות בטיפוס `BoxSlotId` בחתימה. החלפת ה-alias ל-branded type / nominal type בעתיד תשפיע על call sites בלי לדרוש שינוי ב-schema.
- **migration path ברור**: כשיוחלף ל-id יציב, ה-`schemaVersion` יקודם ל-2 וה-migration 1→2 ימפה `boxStableKey`-based keys ל-stable id-based keys. ההכנה הזו כבר נמצאת ב-`migrations.ts`.

**טריידאוף**:
- כרגע, מפתחות `interior[BoxSlotId]` הם בפועל `boxStableKey` ("level:position") כשה-bridge ב-`useCabinet` ייכתב. שינוי decomposition עתידי (למשל פיצול גוף ל-3 יחידות) **יאבד** את הוֹ-overrides השייכים לאותו "slot" — אותו דפוס כמו `boxStableKey` היום. ה-id היציב יפתור את זה אבל זה מחיר ידוע עד אז.

**אלטרנטיבה שנדחתה — ריפקטור מלא עכשיו**: לבצע את שינוי ה-id היציב בו-זמנית עם cloud-readiness. נדחה כי scope גדל פי 3 והסיכון לרגרסיה ב-`useCabinet` היה מצמיח את הפיצ'ר.

**יישום**:
- `BoxSlotId = string` ב-`types/project.ts` עם JSDoc שמתאר את הכוונה.
- כל ה-Records ב-`SavedCabinetState` שמשתמשים ב-`BoxSlotId` יישארו אותם משפטים אחרי הריפקטור — רק ההגדרה תשתנה.
- ראה רשימת משימות עתידיות (לא ב-DECISIONS_LOG; משימה פתוחה).

---

## 2026-05-29 — שכבת override ללוחות + stableId יציב

**ההחלטה**: כל לוח שמיוצר ע"י `buildBoardModel` או `buildPlinthBoardModel` מקבל `stableId` יציב הבנוי כ-`{role}@{containerStableKey}` (או `{role}` ל-cabinet-level singletons). `useCabinet` מחזיק מפת overrides נפרדת `boardOverridesByStableId: Map<stableId, { dimensions?, materialId? }>` שדורסת ערכים נגזרים בקריאה דרך `getDimension(board, key, overrides)` ו-`getMaterial(board, overrides)`. הערכים הנגזרים נשארים פנימית ב-build functions ולא משתנים — ה-override שכבה מעליהם.

**הנימוק**:
- העתיד: עורך פר-לוח שיאפשר לנגר לדרוס מידה (length/width/thickness/חומר) של לוח ספציפי, בלי לגעת בכללים הכלליים. הדפוס זהה ל-`userPositionX` של גיבלי הצוקל — שכבת override שמשוחזרת ל-derived ב-reset.
- מקור-אמת יחיד: `boardsToCutItems` קוראת את הערך האפקטיבי דרך `getDimension` → CutsList, CabinetCutSketch ו-PlinthEditor רואים את אותה התוצאה. אם override נשמר נכון, כל הצרכנים מתאחדים אוטומטית.
- יציבות: ה-`Board.id` ה-ad-hoc משתנה בכל `calculate()`. לא ניתן לתלות עליו override. ה-`stableId` שורד שינויי מבנה כל עוד הגוף + ה-role נשארים — אם המבנה משתנה כך שהלוח לא קיים יותר, ה-override "מתייתם" בשקט (אותו דפוס כמו `partitionsById`/`plinthGableOverrides`).

**טריידאוף**:
- ה-rect הוויזואלי ב-`CabinetCutSketch` מצויר עדיין בקואורדינטות `xFrom..yTo` הנגזרות. override על length משפיע על רשימת החיתוכים בלבד, לא על המיקום בסקיצה. במידת הצורך נוסיף שכבת sync של xFrom/xTo בעתיד (כשעורך הלוח-הבודד יתחבר).
- ה-override Map דורש `calculate()` חוזר על כל set/reset (כדי שרשימת החיתוכים תתחדש). זה זול כי `buildBoardModel` עצמו לא משתנה — הפעלה חוזרת של הצנרת שטוחה.

**אלטרנטיבה שנדחתה**: הוספת `userLength?`, `userWidth?` וכו' ישירות על `Board`. נדחה כי `Board` נבנה מחדש בכל `calculate()`; השכבה החיצונית מאפשרת לאפס ע"י מחיקת כניסה ב-Map, בלי בנייה מחדש.

**יישום**:
- `Board.stableId: string` (חובה). `boardStableId(role, subKey?)` כ-builder.
- `BoardOverrides = { dimensions?: Partial<Record<BoardDimensionKey, number>>; materialId?: MaterialId }`.
- `getDimension(board, key, overrides): number` ו-`getMaterial(board, overrides): MaterialId`.
- `useCabinet`: state חדש + setters (`setBoardDimensionOverride`/`reset`, `setBoardMaterialOverride`/`reset`, `resetAllBoardOverrides`).
- `boardsToCutItems` קיבל פרמטר `overrides` (ברירת מחדל Map ריק לתאימות לאחור).
- `CabinetCutSketch` ו-`PlinthEditor` קיבלו `overrides` prop וקוראים דרך ה-helpers.
- חישובי `carcassD`/`innerW` ב-UI עברו ל-helpers (`computeCarcassDepth`/`computeInnerWidth`); הערכים נחשפים על `CabinetResult` כדי שטופס + עורך הצוקל יקראו פעם אחת.
- בדיקת consistency (`assertConsistency`) מוודאת ש-`CutItem.w/h/note/materialId` תואמים ל-`getDimension`/`getMaterial` עבור כל לוח ב-7 תרחישים מייצגים.

---

## 2026-05-28 — גיבלי צוקל: גרירה חופשית, כללי flush/centered = defaults

**ההחלטה**: בעורך הצוקל כל גיבל ניתן לגרירה ב-X לכל מיקום בתוך הצוקל. הכללים הקיימים (flush בקצוות, ממורכז על חיבור גופים, אמצע גוף כש-W > 80) הם **defaults בלבד** — נקודת המוצא של הגיבל כשאין override מהמשתמש. ה-`userPositionX` (אופציונלי, ב-`PlinthGable`) דורס את הברירה ומועבר ל-`buildPlinthBoardModel` דרך `gableOverrides: Map<id, x>`.

**הנימוק**:
- הנגר מכיר את הריצוף, צנרת, שקעים — מציאות שהאלגוריתם לא יכול לדעת עליה מראש. גרירה מלאה מאפשרת התאמה ידנית במקומות שצריך, בלי לחייב reset של הקבועים בקוד.
- ה-defaults עדיין מספקים תוצאה נכונה למקרה הסטנדרטי (95% מהארונות) — המשתמש לא נדרש להזיז שום גיבל אלא אם הוא רוצה.
- ID יציב לכל גיבל (`edge-left`, `joint:0`, `mid-body:1`, ...) שורד שינויים שלא מוסיפים/מסירים גיבלים מאותו סוג; overrides יתומים נופלים בשקט כשהדקומפוזיציה משתנה.

**מודל המיקום**: `userPositionX` דורס את הקצה השמאלי של לוח א'. ה-`direction` נשאר קבוע — הוא קובע רק לאיזה צד לוח ב' נמשך. גיבל `flush-left` שנגרר למרכז עדיין מציב את לוח ב' מימינו; `flush-right` עדיין משמאל. זה משמר את הצורה הפיזית של ה-L וקושר את האסתטיקה ל-`kind` שנבחר בהתחלה.

**ולידציה**: `clampPlinthGableX` עושה gap-analysis — חותך מ-`[0, cabinetW − tBody]` את ה"אזורים האסורים" `[ox − tBody, ox + tBody]` של כל גיבל אחר, ובוחר את המיקום הקרוב ביותר ל-proposed. נכשל בשקט (מחזיר את ה-clamped בלבד) רק אם אין מקום בכלל — תרחיש קצה של ארון צר מדי שצריך resize כדי לפתור.

**טריידאוף**: ה-ID מבוסס על `kind + index` נמחק כשהדקומפוזיציה משתנה (למשל מעבר מ-2 ל-3 גופים זז את `joint:1`). הצענו ID מבוסס xAnchor — נדחה כי הוא משתנה עם רוחב הארון, מה שהיה גורם לאיבוד override גם בשינוי לא מבני. ה-trade-off הנוכחי: שינויים מבניים מאפסים את ה-overrides; שינויי גובה צוקל/חומר/עומק לא נוגעים בהם.

**יישום**:
- `boardModel.ts`: `PlinthGable` קיבל `id` ו-`userPositionX?`. הוספו `defaultPlinthGableLeftX`, `effectivePlinthGableLeftX`, `snapPlinthGableX` (0.5 ס"מ), `clampPlinthGableX` (gap analysis), קבוע `PLINTH_GABLE_SNAP_CM = 0.5`.
- `buildPlinthBoardModel`: פרמטר חדש `gableOverrides?: ReadonlyMap<string, number>`. דורס את לוח-A's left edge; כיוון לוח B (`right` או `left`) נגזר מ-`direction` ושומר את צורת ה-L.
- `useCabinet`: state חדש `plinthGableOverrides` + `setPlinthGableOverride(id, x | undefined)` + `resetPlinthGableOverrides()`. כל קריאה משייכת re-calculate כדי שרשימת החיתוכים תתרענן.
- `PlinthEditor`: שדה גובה צוקל ב-header (min 3 ס"מ, commit ב-blur/Enter), כפתור "אפס מיקומי גיבלים", drag handlers על hit-areas שקופים מעל כל לוח A עם cursor `ew-resize`. ESC במהלך drag משחזר את ה-override המקורי.

---

## 2026-05-27 — מבנה גיבל צוקל: L-shape ממורכז על חיבור גופים

**ההחלטה**: גיבל בצוקל מיוצר מ-2 לוחות זהים במידות `(D − 2·tBody) × (plinthH − 0.6)` המוטמעים כ-L: לוח א' עומד אנכית כקיר, לוח ב' שוכב שטוח על גבו כמכסה עליון. גיבלים פנימיים (בין גופים סמוכים) ממורכזים **בדיוק על xJoint** — לא צמודים לאחד הגופים.

**הנימוק**:
- L-shape (קיר + מכסה) נותן לארון משטח יישוב יציב למעלה ויציבות אופקית מלמטה. שני לוחות עם מימד חיתוך זהה = יעילות חיתוך.
- מרכז על xJoint מאפשר להבריג לכל אחד משני הגופים השכנים באותו שטח. גיבל שצמוד רק לגוף אחד מסכן את היציבות של השני ויוצר חיבור א-סימטרי.
- גוף רוחב > 80 ס"מ מקבל גיבל אמצעי נוסף — תמיכה במרכז מקטינה את ה-deflection של לוח קדמי/אחורי בארונות רחבים.

**טריידאוף**: גיבל ממורכז על חיבור גופים תופס שטח רוחב של `tBody + (plinthH − 0.6)` המגיע עד `tBody/2 + (plinthH − 0.6)` בתוך הגוף השכן הימני (לוח ב' פונה ימינה). זה "מתפזר" לתוך אזור הגוף השכן בתוך הצוקל — לא מורגש כי הצוקל סגור מתחת לקדמי/אחורי. אם הצוקל גבוה במיוחד (>15 ס"מ), הגיבל מתחיל לתפוס יותר רוחב; אזהרה עתידית אופציונלית.

**אלטרנטיבה שנדחתה**: גיבל T-shape (לוח א' ממורכז על xJoint עם לוח ב' לכל צד) — סימטרי אבל דורש שני לוחות ב' לכל גיבל, כפול חומר. גם — שני הלוחות ב' היו מתפזרים לתוך שני הגופים, מה שמסבך את ה-tooling אם משחררים חיבורים.

**יישום**:
- `buildPlinthBoardModel`, `calcPlinthGables` ב-`core/boards/boardModel.ts`.
- 4 roles חדשים ב-`BoardRole` (`plinth-front`, `plinth-back` כבר היו; הוספנו `plinth-gable-a` ו-`plinth-gable-b`).
- ה-`buildBoardModel` הקיים לא פולט עוד צוקל per-body — `plinthHeight` הוסר מ-`BuildBoardModelArgs`.
- `PlinthEditor` (תצוגת על SVG) כטאב רביעי ב-`CabinetForm`.

---

## 2026-05-25 — החלפת calcCuts לקורפוס ב-BoardModel (שלב B)

**ההחלטה**: לוחות הקורפוס (sides + top + bottom + back + plinth + shelves + envelope) מיוצרים כעת מ-`buildBoardModel` per body, ומתורגמים ל-CutItems דרך `boardsToCutItems`. `calcCuts` מייצר רק את החזיתות שאינן boards: דלתות + חלקי קופסת מגירה (front/sides/back/bottom של drawer-box).

**הנימוק**: `calcCuts` חישב את הקרקס כאילו הוא קופסה אחת ברמת הארון, גם כשהארון מפוצל ל-6 גופים (2 שורות × 3 עמודות). זה ייצר מידות שגויות (לוח אחד ארוך במקום 6 לוחות פר-גוף). BoardModel מסתמך על המבנה הפיזי האמיתי שמיוצר ע"י `decomposeBoxes` ומפיק לוח לכל גוף בנפרד עם המידות הנכונות.

**טריידאוף**: רשימת חיתוכים גדולה יותר (28 לוחות במקום 16 ב-cabinet 240×220 לדוגמה, כי הקרקס מפוצל). זה היה הביצוע הנכון מההתחלה — calcCuts פשוט הסתיר את זה. עכשיו המסור מקבל מידות תואמות לרהיט שמיוצר בפועל.

**יישום**:
- Board.visible (חדש) — לוחות נסתרים (גב + צוקל-אחורי) נכנסים לרשימת חיתוכים אבל לא לסקיצה.
- 4 BoardRoles חדשים: `back`, `plinth-front`, `plinth-back`, וגם `internal-shelf` קיים נשמר.
- `deriveEnvelopeFlags(box, hasShell, hasEnvelopeTop)` — helper משותף ל-CabinetSketch (רינדור) ול-useCabinet (חיתוכים). תיקן באג שגופי `unit_*` לא קיבלו envelope.
- `useCabinet` עבר ל-board-cuts loop אחרי בניית ה-interior state.
- `cuttingList.test.ts` הוסר 11 בדיקות שציפו ללוחות קורפוס מ-calcCuts. הכיסוי המקביל ב-`boardModel.test.ts` (39 בדיקות).

**אלטרנטיבה שנדחתה**: לעדכן את calcCuts להפיק לוח לכל גוף. זה היה ייצור של אותה לוגיקה ב-2 מקומות (BoardModel + calcCuts), עם הצורך להחזיק עקביות. הגישה הנוכחית: מקור יחיד לאמת (BoardModel), calcCuts רק עבור מה ש-BoardModel עדיין לא מטפל בו.

---

## 2026-05-24 — BoardModel + תצוגת חתך (גישה ב')

**ההחלטה**: בנייה של מודל פיזי של לוחות הגוף (`core/boards/boardModel.ts`) ויצירת תצוגה ויזואלית (`CabinetCutSketch`) **לפני** חיבור לרשימת חיתוכים (`calcCuts`). תצוגת "גופים" הוחלפה בתצוגת "חתך" שמציגה כל לוח פיזי בעובי ובמיקום האמיתיים.

**הנימוק**: גישה ב' (ויזואל קודם, cuts אחר כך) מאפשרת לאמת את נכונות המודל ויזואלית — כולל את כל תרחישי הקצה (rabbet/butt, מחיצה, מעטפת, מדפים פנימיים, מדף קבוע, internal shelves) — לפני שמסירים את הלוגיקה הקיימת של `calcCuts`. אם המודל שגוי, השגיאה מובנת מיד ומוצמדת לאלמנט ספציפי בסקיצה. חיבור `BoardModel → CutItem` יבוצע בשלב הבא.

**טריידאוף**: כיום `calcCuts` ו-`buildBoardModel` קיימים במקביל ומחשבים מידות אותם לוחות. כפילות לתקופה קצרה. ההצדקה: סיכון רגרסיה נמוך — שינוי `calcCuts` בלי אימות מודל הוא הרבה יותר מסוכן.

**יישום**: 
- `Board` עם `xFrom/xTo/yFrom/yTo` בקואורדינטות גוף-לוקאליות (x=0 קצה שמאלי, x=W קצה ימני, y=0 קצה עליון, y=H קצה תחתון). מעטפות ב-x<0 או x>W.
- שתי שיטות חיבור (`rabbet`, `butt`) דרך `resolveJointMethod(box)` לפי `W > 2·H`.
- 11 BoardRoles: side-left/right, top, bottom, shelf, partition, fixed-shelf, internal-shelf, envelope-left/right/top.
- 18 בדיקות יחידה.
- אינטגרציה ב-`CabinetSketch`: post-calc (interiorById + materials מוגדרים) רנדור boards דרך `CabinetCutSketch`. envelopePanels + shelfLines + partitionLine מוסתרים post-calc.

---

## 2026-05-21 — אחידות בקונבנציית `heightFromFloor`

**ההחלטה**: `heightFromFloor` של כל פריט פנימי הוא **תחתית** הפריט (cm מרצפת הגוף לקצה התחתון). חל אחיד על `ShelfItem`, `RodItem`, `DrawerItem` פנימית, ו-`DrawerItem` חיצונית.

**הנימוק**: עד היום, מגירה חיצונית הייתה היחידה ששמרה `heightFromFloor` כ**מרכז** (`stackTop + drawerHeight/2`). שאר הקוד והתיעוד ב-`types/interior.ts` (`// cm from body bottom to bottom of drawer`) הניחו תחתית. חוסר העקביות גרם לבאגים שונים כשמשולבים סוגי פריטים — לדוגמה, `redistributeShelves` הציב מדף hanger ב-`drawer.heightFromFloor / 2` (מתחת ל"מרכז" של המגירה) — בתוך המגירה בפועל. אחידות מבטלת מקור באגים שיטתי.

**טריידאוף**: שדה ה-`heightFromFloor` הוצג למשתמש בעורך פריטים — מי שלא הסתכל היטב יראה ש-"מגירה חיצונית ראשונה" עכשיו מציגה 0 במקום 10. אין השפעה ויזואלית (renderers לא משתמשים ב-`heightFromFloor` של externals — הם מציירים cumulative).

**יישום**: שינוי בודד ב-`interiorUtils.ts:205` (`defaultDrawerPlacement` במצב external). כל שאר הקוד כבר היה עקבי עם הקונבנציה החדשה.

---

## 2026-05-20 — איחוד לוגיקת חזיתות ברמת הארון

**ההחלטה**: רוחב ו-x של כל חזיתות הארון (דלתות + חזיתות מגירה) מחושבים ברמת הארון כולו, לא ברמת הגוף הבודד. גבולות בין גופים סמוכים ומחיצות פנימיות אינם משפיעים על החישוב. הנוסחה: `frontWidth = (W_available − (N + 1) × gap) / N` כאשר `N = סך numFronts מכל הגופים`, ו-`W_available = innerW` (עם מעטפת) או `W_cabinet` (בלי).

**הנימוק**: לוגיקה מפוזרת ברמת הגוף גרמה לאסימטריות (גופים אמצעיים שונים מקיצוניים), לבאגים חוזרים סביב מצב מחיצה (`getPartitionDoorWidth` נדרש כדי לאזן את הרווחים), ולפיצול חישוב בין `useCabinet`, `deriveDrawerFronts` ו-`cuttingList`. ראייה ברמת הארון נותנת אחידות מלאה — כל החזיתות בארון באותו רוחב כל עוד הגופים שווים בגודל ו-numFronts, והרווחים בין הגופים מתנהגים בדיוק כמו רווחים פנימיים בגוף.

**טריידאוף**: מחיצה פנימית "מסתתרת" מתחת לחזיתות (overlay) — חזית של 39.7 ס"מ מעל תא שרוחבו 39.1 ס"מ "עוטפת" 0.3 ס"מ של אזור המחיצה מכל צד. זו התנהגות overlay טיפוסית במטבחים מודרניים ותועדה מפורשות ב-CARPENTRY_RULES.

**יישום**: מקור יחיד לאמת — `src/core/geometry/frontGeometry.ts`. הוסרו: `getDoorWidth`, `getPartitionDoorWidth`, `DRAWER_FRONT_SIDE_GAP_CM`. הקובץ `deriveDrawerFronts` הועבר ל-`src/core/doors/drawerFrontsCalc.ts` ומקבל `layout` כקלט. `useCabinet` מחשב את ה-layout פעם אחת ב-`calculate()` ומעביר אותו ל-derive, לחיתוכים ולציורים.

**אלטרנטיבה שנדחתה**: לשמור wrappers דקים סביב הפונקציות הישנות — אבל זה בדיוק מה שגרם לבאגים הקיימים (חישוב מקומי שזולג מהמודל הגלובלי). מחיקה מלאה מחייבת כל קורא להשתמש ב-API החדש.

---

## 2026-05-18 — מדף קבוע אוטומטי מעל external drawers

**ההחלטה**: בעת הוספת המגירה החיצונית הראשונה בגוף/בתא, מערכת יוצרת אוטומטית `ShelfItem` עם `isFixedAboveExternals=true` שגובהו נגזר מ-`top of highest drawer − shelfThickness`. המדף זז אוטומטית כשערימת המגירות משתנה; נמחק כשהאחרונה מוסרת. אבל אם המשתמש הסיר את המדף ידנית (דרך כפתור המחיקה), הוא **לא** נוצר מחדש גם אם הוספת מגירות נמשכת.

**הנימוק**: מאזן בין נוחות (אוטומטי בפעם הראשונה — שורת הוספה אחת פותרת גם את המדף וגם את המגירה) לבין עיקרון "החופש בידי הנגר" (לא לכפות מדף אם המשתמש בחר להסיר אותו, גם אם הוסיף עוד מגירות אחר כך).

**אלטרנטיבה שנדחתה**: יצירה תמיד (כפויה) → הופרה את עיקרון החופש. גישה הפוכה (לא ליצור כלל אוטומטית) → סירבול UX מיותר, רוב הנגרים יוסיפו מדף בכל מקרה.

**יישום**: `syncFixedShelf` ב-`core/interior/fixedShelfUtils.ts` מקבל `(oldItems, newItems)` ומחזיר items מעודכן. ה-decision table: `newCount=0 → remove`; `existing → update height`; `first ext + no existing → create`; `else → unchanged`. נקרא מ-`useCabinet.setBoxInterior` ו-`setCellItems` (כל תא עצמאי).

---

## 2026-05-16 — מחיצות מוחקות פריטים קיימים

**ההחלטה**: הוספה/הסרה של מחיצה פנימית מוחקת את כל הפריטים הפנימיים בגוף (עם מודאל אישור).

**הנימוק**: פריט פנימי (מדף, מגירה, מוט) לא יכול להתפרס בין שני תאים — רוחב הפריט תלוי ב-W_cell ולא ב-box.W. שמירת פריטים ישנים לאחר שינוי המחיצה תיצור נתונים לא עקביים (פריטים ברוחב הגוף המלא בתא צר). לכן: ניקוי מלא + מודאל אישור.

**כיוון עתידי**: שלב 2 עשוי לאפשר המרה חלקית של פריטים (המדף מתכווץ לרוחב התא).

---

## 2026-04-29 — Box.role פוצל ל-position + level

**ההחלטה**: במקום `Box.role: string` אחד שמשלב מיקום אופקי ואנכי (כמו `"lower-left"`), פוצל לשני שדות נפרדים: `position` ו-`level`.

**הנימוק**: שדה אחד עם ערכים כמו `"lower-left"` יצר חזרות מרובות בתנאים ובתרגומים. ה-split מאפשר:
- תוויות עברית נגזרות מ-position+level (לא hardcoded)
- לוגיקת `shouldCoverSkirt(level)` נקייה
- הוספת level חדש (middle) הייתה פשוטה

---

## 2026-04-29 — i18n נגזרת מ-position+level

**ההחלטה**: תוויות הגופים נוצרות בזמן ריצה מ-position ו-level, לא מחרוזות hardcoded בקוד.

**הנימוק**: כל פעם שנוסף level חדש (כמו `middle`) היה צריך לעדכן מחרוזות בכמה מקומות. עם נגזרת — רק מוסיפים מפתח חדש ב-translations.ts.

---

## 2026-05-01 — MAX_BOX_W הורד מ-120 ל-100 ס"מ

**ההחלטה**: הרוחב המקסימלי לגוף בודד שונה מ-120 ס"מ ל-100 ס"מ.

**הנימוק**: גוף 120 ס"מ כבד מדי לנשיאה ולהרכבה של נגר בודד. 100 ס"מ הוא הגבול הנגרי המקובל לגוף שניתן לטפל בו לבד.

---

## 2026-05-01 — איחוד גופים קטנים (MIN_BODY_HEIGHT = 60)

**ההחלטה**: ב-doorsPerColumn=3, גוף שגובהו < 60 ס"מ מאוחד עם הגוף הסמוך מתחתיו. הגוף המאוחד מקבל `internalShelves` עם מיקומי המחיצות.

**הנימוק**: גוף קטן מ-60 ס"מ לא שימושי. נגר לא יבנה ארון עם קומה של 40 ס"מ. עדיף לאחד ולסמן מחיצה פנימית.

**מגבלה ידועה**: הסריקה היא מלמעלה למטה, מה שאומר שגוף תחתון קטן מטופל בנפרד (יש לוגיקת fallback). לא מושלם — ניתן לשיפור.

---

## 2026-05-02 — Interior מאוחסן לפי Box.id עם שימור יציב

**ההחלטה**: הפנים של כל גוף מאוחסן ב-`InteriorById: Record<Box.id, items[]>`. בכל `calculate()`, הפנים מועבר לפי `boxStableKey` (לא לפי id) כדי לשמר אותו.

**הנימוק**: Box.id מתאפס בכל חישוב (box_0, box_1...). אם שמרנו לפי id, כל שינוי מידות היה מוחק את הפנים. `boxStableKey = "level:position"` יציב — "גוף תחתון שמאל" תמיד "גוף תחתון שמאל" גם אם ה-id השתנה.

---

## 2026-05-09 — Single source of truth ל-coversSkirt

**ההחלטה**: נשמר רק `coversSkirt: boolean` על Door. הגובה הויזואלי מחושב on-the-fly בכל מקום שצריך אותו.

**הנימוק**: שמירת `skirtExtension: number` בנוסף לـ`coversSkirt` יצרה סיכון לחוסר עקביות. כשמשנים `plinthHeight`, צריך לזכור לעדכן גם את `skirtExtension`. חישוב on-the-fly מבטיח שה-source היחיד הוא `coversSkirt + plinthHeight`.

---

## 2026-05-09 — מיקום ציר יחסי לגוף, לא לדלת

**ההחלטה**: כל מיקומי הצירים (`positionFromBottom`) הם יחסית לתחתית הגוף (`box.H`), גם כשהדלת מתארכת עם `coversSkirt`.

**הנימוק**: הצירים מחוברים פיזית לקורפוס (לגוף). המיקום שהנגר מסמן בקורפוס הוא הגובה מתחתית הגוף — לא מתחתית הדלת (שיכולה לרדת עם coversSkirt).

---

## 2026-05-09 — displayNumber דינמי, לא נשמר

**ההחלטה**: מספרי החזיתות למשתמש ("חזית 1", "חזית 2"...) מחושבים מ-`assignDoorDisplayNumbers(boxes, numFrontsPerBox)` בכל פעם. לא נשמרים על Door.

**הנימוק**: אם הנגר מוסיף עמודה לארון, מספרי החזיתות משתנים. אם שמרנו אותם, היינו צריכים לעדכן את כולם. חישוב on-the-fly מבטיח שהמספרים תמיד נכונים.

---

## 2026-05-15 — מחיצות פנימיות כ-state נפרד מ-Box

**ההחלטה**: `hasInternalPartitions` מאוחסן ב-`partitionsById: Map<string, boolean>` ב-useCabinet, לא ישירות על Box (למרות שהשדה קיים ב-interface).

**הנימוק**: Box נוצר מחדש בכל `calculate()`. אם נשמר על Box, היה צריך להעביר את המידע בזמן החישוב. State נפרד עם שימור לפי `boxStableKey` (כמו interior) פשוט יותר ועקבי עם הדפוס הקיים.

**השפעה**: לחיצה על "הסר מחיצות" מעדכנת את ה-Map ומחשבת מחדש את cuts על-the-fly, ללא calculate() מחדש.

---

## 2026-05-16 — חלוקת מדפים שווה; מגירות ומוטות לא משתתפים

**ההחלטה**: הוספה/מחיקה של מדף מחלקת מחדש רק את המדפים האוטומטיים לפי `H × (i+1) / (N+1)`. מגירות ומוטות תליה נשארים במקומם ולא משתתפים בחלוקה.

**הנימוק**: מגירה ממוקמת לפי גובה הפריט שהיא אמורה לאחסן — זזה ידנית ובכוונה. מדף לעומתה הוא "מחיצה אופקית" סימטרית שנגר מצפה שתתחלק שווה. ערבוב הלוגיקות ייצור תוצאות לא צפויות.

**כיוון עתידי**: ניתן להוסיף "redistribution-aware" גם למגירות בעתיד, אם יהיה דרישה.

---

## 2026-05-16 — isManuallyPositioned מסמן מדפים שהמשתמש הזיז

**ההחלטה**: לכל `ShelfItem` יש שדה `isManuallyPositioned?: boolean`. ברגע שהמשתמש גורר מדף או משנה את גובהו בשדה, הוא מסומן `true` ולא יזזה בחלוקה אוטומטית עתידית.

**הנימוק**: "החופש בידי הנגר" — הנגר שמיקם מדף בכוונה לא רוצה שהמערכת תזיז אותו בכל הוספה. מצד שני, מדפים שלא נגעו בהם הם "פלייסהולדרים" שצריכים להתחלק שווה.

**הגדרת ברירת מחדל**: `undefined` מטופל כ-`false` (תאימות לאחור — מדפים שנוצרו לפני השדה הם אוטומטיים).

---

## 2026-05-17 — חלוקת מדפים round-robin בין כל האזורים החופשיים

**ההחלטה**: כשיש מספר אזורים חופשיים תקפים (≥25 ס"מ), מדפים אוטומטיים מתחלקים round-robin ביניהם לפי גודל יורד — לא נדחסים כולם לאזור הגדול ביותר.

**הנימוק**: המשתמש מצפה שמדפים יתפזרו על פני כל גוף הארון. מילוי אזור אחד והשארת אחרים ריקים נראה לא מאוזן. בנוסף, אזורים שאזור אחד גדול ב-10 ס"מ ממשנהו עדיין צריכים שניהם להתמלא לפני שהראשון מקבל מדף שני.

**אלגוריתם**: מיון אזורים תקפים לפי גודל יורד. לכל מדף i: `zone = sortedZones[i % zones.length]`. בתוך כל אזור, חלוקה שווה לפי `lo + (hi-lo)*(j+1)/(N+1)`.

---

## 2026-05-17 — לוגיקת hanger: מדף ראשון 80 ס"מ מתחת למוט תליה

**ההחלטה**: כשיש מוט תליה ≥80 ס"מ ואין מגירה מתחתיו, המדף הראשון האוטומטי מוצב ב-`rodH - 80`. כשיש מגירה מתחת למוט (בכל gap), המדף הראשון מוצב מתחת למגירה (`drawer.heightFromFloor / 2`).

**הנימוק**: 80 ס"מ הוא הגובה המומלץ לאזור תליית בגדים בארון בגדים. כשמוט קיים, המדף "המבני" הראשון מגדיר את רצפת אזור התלייה. כשיש מגירה — ראש המגירה משמש כרצפת התלייה (לא צריך מדף נוסף), והמדף הולך מתחת למגירה.

**מתי לא חל**: מוט נמוך מ-80 ס"מ → אזהרת `rod_low`, אין hanger shelf, כל המדפים מתחלקים round-robin.

---

## 2026-05-17 — מדף תמיד מתחת למגירה (עקבי ללא תלות בסדר הוספה)

**ההחלטה**: כשיש מגירה מתחת למוט (בכל gap), המדף הראשון תמיד מוצב מתחת למגירה. אין הבדל בין gap=80, gap=75 או gap=50.

**הנימוק** (תיקון באג): קודם הקוד הבחין בין `gap < 70` / `70-80` / `≥80`. במקרה של `gap ≥ 80`, המדף הוצב ב-`rodH-80`, מה שבמקרה של מגירה רוד-aware (drawer top בדיוק ב-rodH-80) נפל בדיוק על ראש המגירה. סדר ההוספה "מוט → מגירה → מדף" יצר את המקרה הזה, בעוד "מגירה → מוט → מדף" יצר מגירה מרכזית (gap=65) ועקב כך מדף מתחת למגירה. התוצאה: מיקום שונה לאותם פריטים בסדר שונה.

**הפתרון**: drawer top הוא תמיד רצפת התלייה. אזהרת `rod_drawer_close` נורת אם gap < 70 (אינדיקציה לבעיית יעילות, לא משנה את המיקום).

---

## 2026-05-17 — אזהרת small_zone לפי פערים אחרי placement (לא לפני)

**ההחלטה**: אזהרת `small_zone` מבוססת על בדיקת מרחקים בין פריטים סמוכים אחרי שכל הפריטים מוצבים — לא רק על free zones לפני placement.

**הנימוק** (תיקון באג): הקוד הקודם בדק את ה-zones לפני חלוקת המדפים. גוף 70 ס"מ עם 3 מדפים round-robin יצר מדפים ב-17.5/35/52.5, כשכל אחד 1.8 ס"מ עבה. הפער בין מדפים סמוכים: 15.7 ס"מ. אבל ה-zone המקורי [0, 70] גדול (70 ס"מ) — אז לא הופעלה אזהרה. תוצאה: המשתמש לא ידע שיש בעיה.

**הפתרון**: helpers `physicalZone(item)` ו-`hasSmallGap(items)` ממיינים את כל הפריטים לפי `heightFromFloor`, ובודקים את ה-physical gap בין כל זוג סמוך. אם gap > 0 ו-<25 ס"מ → אזהרת `small_zone` אחת (לא לכל פער).

**אזורים פיזיים**: מדף = [h, h+1.8], מגירה = [h, h+drawerHeight], מוט = [h-1.5, h+1.5].

---

## 2026-05-17 — הצבה אוטומטית "פריט חדש מתאים לקיימים" (לא להפך)

**ההחלטה**: כשמוסיפים מגירה/מוט לגוף שכבר יש בו פריטים, הפריט החדש מתאים את המיקום שלו לקיימים. הפריטים הקיימים לא זזים.

**הנימוק**: "החופש בידי הנגר" — אם הנגר מיקם מגירה ידנית במיקום מסוים, הוספת מוט לא צריכה להזיז את המגירה. הפריט החדש מקבל את המיקום הכי טוב לפי המיגבלות הקיימות, ואם אין מיקום אופטימלי — מקבל אזהרה.

**יישום**:
- `defaultDrawerPlacement` עם מוט קיים → ממקם מגירה ב-`rodH - 80 - drawerHeight` (gap=80 בדיוק).
- `defaultRodPlacement` עם מגירה קיימת → דוחף את המוט ל-`max(bodyH-10, highestTop + 80)`.
- אם אין מקום: הפריט החדש בדיפולט הרגיל + אזהרה.

---

## 2026-05-17 — עיגול ערכי גובה ל-1 ספרה עשרונית (roundCm)

**ההחלטה**: כל מיקומי הפריטים (heightFromFloor) שמחושבים אוטומטית מעוגלים ל-1 ספרה עשרונית באמצעות `roundCm(h) = Math.round(h*10)/10`.

**הנימוק** (תיקון באג): שדה הקלט בעורך הפנים (`<input type="number">` ברוחב 56px, מיושר למרכז, ב-RTL) מציג את הערך הגולמי. לערכים כמו `23.333333333333332` (17 תווים), השדה חתך את המספר באמצע ויצר תצוגה בלתי-קריאה. תוצאה: המשתמש ראה "-3332" וערכים משונים.

**הפתרון**: עיגול בליבה (לא בתצוגה בלבד) → ערכים נקיים בכל מקום: state, sketch, input field.

**דיוק נגרי**: 1 מ"מ — מתאים לעבודת נגרות.

---

## 2026-05-17 — תיקון מיפוי cellIndex↔frontIndex לזהות (היה הפוך בשלב 1)

**ההחלטה**: `cellIndexToFrontIndex(0, n) = 0` ו-`cellIndexToFrontIndex(1, n) = numFronts−1`. כלומר: cell 0 (ימני) → frontIndex 0 (דלת ימנית); cell 1 (שמאלי) → frontIndex numFronts−1 (הדלת השמאלית ביותר). זוהי מיפוי **זהות** עבור numFronts=2.

**הנימוק**: ה-spec של stage 1 הגדיר את המיפוי הפוך (`cellIndex 0 → frontIndex = numFronts-1`), אבל זה התנגש עם שלוש קונוונציות קיימות בקוד: (1) ההערה ב-`Door.frontIndex`: `0 = rightmost`; (2) `salonHingeSide(0, 2)` מציב צירים ימינה; (3) ב-`CabinetSketch` תא 0 מצויר בחצי הימני של הגוף ובעורך פנים-גוף תא 0 מתויג "תא ימני". ה-spec היה שגוי בכוונה לא נכונה, והבדיקה התואמת ב-stage 1 שיקפה את השגיאה.

**השפעה**: ב-2.1 חיווט `getItemsForFront` תלוי במיפוי הזה. אם היה נשאר הפוך, מגירה חיצונית בתא ימני הייתה מקצרת את הדלת השמאלית — נראה ויזואלית הפוך לחלוטין. הבדיקה ב-`externalDrawer.test.ts` עודכנה להציפיות החדשות.

---

## 2026-05-17 — דיאלוג בחירה internal/external בהוספת מגירה

**ההחלטה**: כפתור "+ מגירה" (גם בגוף הראשי וגם בכל תא במצב מחיצה) פותח דיאלוג קטן עם שני כפתורים גדולים — `internal` ו-`external` — כל אחד עם תווית ראשית ותיאור משני קצר. ביטול דרך כפתור נפרד.

**הנימוק**: שני כפתורים נפרדים בכפתורי "+ הוסף" היו מצריכים כפילות מקום בסרגל הכלים (4 כפתורים במקום 3 בתוסף מוט/מדף), והיו פוגעים בלכידות הוויזואלית. דיאלוג בוחר לרגע הקלידה את ה-decision והממשק נשאר נקי. התיאור המשני ("יושבת מאחורי הדלת" / "חזית פיזית משלה") הוא חיוני: רוב הנגרים לא יודעים מה זה "internal" בלי הסבר.

**אלטרנטיבה שנדחתה**: dropdown ב-`DrawerItem` עצמו אחרי יצירה. נדחה כי שינוי mount = שינוי מבני (מפעיל `calculate()` מלא), עדיף שתחילה יבחר המשתמש ואז יראה תוצאה.

---

## 2026-05-17 — מגירות חיצוניות (external drawers) — שלב 1

**ההחלטה**: הוספת תמיכה במגירות חיצוניות (חזית עצמאית בקדמת הארון) ב-3 רובדים:
1. **טיפוס**: `DrawerItem.mount: 'internal' | 'external'` (חובה) + `frontThicknessOverride?: MaterialId` (אופציונלי, רלוונטי רק ל-external).
2. **גובה דלת**: `calcMainDoorHeight(box.H, items, gap, ...)` מקצרת את הדלת הראשית לפי `calcExternalStackHeight`. אם `≤0`: אין דלת ראשית; אם `<10 ס"מ`: אזהרה (לא חוסם).
3. **חיתוך**: `calcExternalDrawerFrontCuts` מייצר חזית פר-מגירה ב-`CutGroup` חדש `'front'`. המגירה הנמוכה ביותר מקבלת `coversSkirt` (מחושב, לא מאוחסן).

**הנימוק**:
- שידות מטבח, ארונות עליונים, ארונות שמשלבים דלת ומגירות הם תרחישים נפוצים. אי-תמיכה דרשה work-arounds.
- הפרדה internal/external מאפשרת לקיים את שני התרחישים תחת אותו טיפוס.
- ניטרליות לסדר הוספה: גם אם הוסיפו מגירה לפני/אחרי דלת, התוצאה זהה (`mainDoorHeight` מחושב מ-items, לא מסדר).
- **שלב 1 = ליבה בלבד** — אין wiring ב-`useCabinet` או UI. מאפשר לוודא נכונות לוגית לפני אינטגרציה מורכבת.

**אינטראקציה עם מחיצות**: cellIndex 0 (תא ימני) → frontIndex = numFronts-1; cellIndex 1 → frontIndex = 0. נתמך ע"י `cellIndexToFrontIndex`.

**מקרי קצה**: 2 externals שממלאים גוף (אין דלת), 3 externals שמשאירים 3 ס"מ (אזהרה), 4 externals שעוברים את גוף (mainDoorHeight שלילי, אין דלת) — כולם מכוסים בבדיקות.

**שלב 2 (עתידי)**:
- `useCabinet.calculate()` יקרא `calcMainDoorHeight` במקום `getDoorHeight` ויעביר `coversSkirt` למגירה הנמוכה ביותר.
- `useCabinet.calculate()` יקרא `calcExternalDrawerFrontCuts` פר-גוף וימזג ל-`cuts`.
- UI: toggle `mount` בעורך מגירה; שדה `frontThicknessOverride` עם clear button (כמו ב-DoorEditor).
- אזהרות `main_door_*` יוצגו ב-UI (היכן בדיוק — נחליט).

---

## 2026-05-17 — אזהרות חלוקת מדפים: טקסט סטטי ≤25 תווים

**ההחלטה**: אזהרות `ShelfWarning` מוצגות עם טקסט סטטי קצר (≤25 תווים), ללא פרמטרים דינמיים.

**הנימוק**: באנר האזהרה בעורך הפנים מציג כמה אזהרות בו-זמנית. טקסט ארוך (כמו "המגירה הקיימת ב-75 ס"מ קרובה מדי למוט (65 במקום 80). שקול להזיז את המגירה") עומס על המשתמש ולא תמיד נכנס במסך. טקסט קצר ("⚠ מגירה קרובה למוט מדי") מבהיר את הבעיה — המשתמש כבר רואה את המיקומים בעורך עצמו.

**תוצאה**: `ShelfWarning.small_zone` מצומצם ל-`{ kind: 'small_zone' }` (השדה `zoneSize` הוסר). שאר ה-kinds שומרים שדות אבל לא מציגים אותם.
