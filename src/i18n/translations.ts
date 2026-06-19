export type Language = 'he' | 'en';

export interface Translations {
  appTitle: string;
  appSubtitle: string;
  langToggle: string;

  project: {
    unnamed: string;
    newProject: string;
    newProjectPlaceholder: string;
    addProduct: string;
    noProducts: string;
    export: string;
    import: string;
    importError: string;
    deleteConfirm: string;
    backToProject: string;
    productTypes: Record<string, string>;
    kitchenAddUnit: string;
    kitchenModuleTitle: string;
    kitchenModuleWidth: string;
    kitchenModules: Record<string, string>;
    kitchenNoUnits: string;
    kitchenEditUnit: string;
  };

  room: {
    title: string;
    rooms: string;
    addRoom: string;
    noRooms: string;
    roomName: string;
    width: string;
    depth: string;
    height: string;
    topView: string;
    elevation: string;
    view3d: string;
    heightOffFloor: string;
    placeProduct: string;
    selectProduct: string;
    wall: string;
    walls: Record<string, string>;
    offsetFromCorner: string;
    rotation: string;
    removeFromRoom: string;
    unplacedProducts: string;
    openProduct: string;
    allPlaced: string;
    products: string;
    productTooTall: (ph: number, rh: number) => string;
    productDoesNotFit: (pw: number, pd: number, rw: number, rd: number) => string;
  };

  sketch: {
    preview: string;
    invalidDimensions: string;
  };

  bodyView: {
    title: string;
    hint: string;
    inherit: string;
    back: string;
    reset: string;
    editInterior: string;
  };

  form: {
    title: string;
    width: string;
    height: string;
    depth: string;
    hasShell: string;
    hasShellLeft: string;
    hasShellRight: string;
    bodyMaterial: string;
    frontMaterial: string;
    backThickness: string;
    calculate: string;
    unitCm: string;
    plinthHeight: string;
    doorCoversPlinth: string;
    doorsPerColumn: string;
    auto: string;
    lowerDoorHeight: string;
    lowerDoorHeightMulti: string;
    middleDoorHeight: string;
    errorInvalid: string;
    errorMustBeLessThanH: string;
    errorSumTooLarge: string;
    shellWidthWarning: (cm: number) => string;
    doorGap: string;
    doorGapWarn: string;
    hasEnvelopeTop: string;
    envelopeTopWarn: (cm: number) => string;
    hasWallEnvelope: string;
    maxDoorWidth: string;
    cornerDoorSide: string;
    cornerSideLeft: string;
    cornerSideRight: string;
    cornerDoorWidth: string;
    cornerReturn: string;
  };

  results: {
    cuts: string;
    doors: string;
    hardware: string;
    sketch: string;
    noResults: string;
    summary: (boxes: number, cuts: number) => string;
  };

  boxes: {
    title: string;
    plinth: string;
    posLeft: string;
    posRight: string;
    posSingle: string;
    posUnit: string;
    levelTop: string;
    levelMiddle: string;
    levelBottom: string;
    levelSingle: string;
  };

  interior: {
    shelf: string;
    drawer: string;
    rod: string;
    addShelf: string;
    addDrawer: string;
    addRod: string;
    addPartitions: string;
    removePartitions: string;
    addPartition: string;
    removePartition: string;
    cellRight: string;
    cellLeft: string;
    partitionWarnAdd: (shelves: number, drawers: number, rods: number) => string;
    partitionWarnRemove: (a: number, b: number) => string;
    partitionConfirmAdd: string;
    partitionConfirmRemove: string;
    cancel: string;
    heightFromFloor: string;
    drawerHeight: string;
    editBody: string;
    back: string;
    noItems: string;
    warnOutOfBounds: string;
    warnDrawerOverlap: string;
    warnShelfSmallZone: string;
    warnRodLow: string;
    warnRodDrawerClose: string;
    dismissWarning: string;
    drawerTypeDialogTitle: string;
    drawerInternal: string;
    drawerExternal: string;
    drawerInternalDesc: string;
    drawerExternalDesc: string;
    drawerFrontLabel: string;
    editExternalDrawerTitle: string;
    drawerHeightLabel: string;
    drawerFrontThicknessLabel: string;
    defaultMaterial: string;
    deleteDrawer: string;
    fixedShelfLabel: string;
    fixedShelfTooltip: string;
    dimOverrideTitle: string;
    dimOverrideW: string;
    dimOverrideH: string;
    dimOverrideD: string;
    dimOverrideReset: string;
    warnHeightMismatch: string;
    warnWidthMismatch: string;
    warnVerticalGap: string;
  };

  doors: {
    bodies: string;
    fronts: string;
    editFront: string;
    noFront: string;
    hasDoor: string;
    hingeSide: string;
    hingeRight: string;
    hingeLeft: string;
    hingeCount: string;
    hingeCountAuto: string;
    hingePos: string;
    hingeManualBadge: string;
    resetAuto: string;
    hingeWarnNoPos: string;
    hingeWarnTooClose: (gap: number) => string;
    hingeWarnSmallDoor: (h: number) => string;
    preview: string;
    thickness: string;
    thicknessOverride: string;
    clearThickness: string;
    warnThicknessLow: (cm: number) => string;
    warnThicknessHigh: (cm: number) => string;
    listTitle: string;
    front: string;
    envelopeSideRight: string;
    envelopeSideLeft: string;
    envelopeTop: string;
  };

  groups: {
    shell: string;
    body: string;
    back: string;
    door: string;
    drawer: string;
  };


  columns: {
    part: string;
    qty: string;
    width: string;
    length: string;
    thickness: string;
    note: string;
  };

  hardwareList: {
    tab: string;
    item: string;
    qty: string;
    unit: string;
    unitPrice: string;
    total: string;
    grandTotal: string;
  };

  cutsList: {
    tab: string;
    materialGroup: string;
    description: string;
    dimensions: string;
    quantity: string;
    area: string;
    totalPieces: string;
    totalArea: string;
    exportPdf: string;
    /** Fallback section header for cuts that don't map to a catalog material
     *  (e.g. drawer-box sides/back/bottom at fixed 12mm/6mm). */
    noMaterial: string;
    /** Combined-row labels for known carpentry pairs in mergeCutItems. */
    pairTopBottom: string;
    pairSides: string;
    pairEnvelopeSides: string;
    pairPlinthGables: string;
    pairSinkTraverses: string;
    /** Title for the plinth top-view editor (opened by clicking the
     *  plinth rect in the main cabinet sketch). */
    plinthEditorTitle: string;
    /** Label for the plinth-height input in the editor header. */
    plinthHeightLabel: string;
    /** Reset button — clears every gable override. */
    plinthResetGables: string;
    plinthResetGablesTooltip: string;
    /** Recess (קונסולי / נסוג) — checkbox + input. */
    plinthRecessedLabel: string;
    plinthRecessLabel: string;
    /** Panel count footer row. */
    sheetsNeeded: string;
    /** Wood cost footer row. */
    woodCost: string;
  };

  kitchen: {
    /** Warning shown when units in a kitchen have different heights. */
    mixedHeightsWarning: string;
    /** Title of the kitchen-wide (global) material selectors. */
    materialsTitle: string;
    /** Selector value shown when units have different materials. */
    mixed: string;
  };

  settings: {
    title: string;
    materialsTab: string;
    materialName: string;
    materialThickness: string;
    materialPrice: string;
    sheetDimensions: string;
    resetPrice: string;
    addMaterial: string;
    removeMaterial: string;
    close: string;
    catalogMaterials: string;
    customMaterials: string;
    noCustomMaterials: string;
    newMaterialName: string;
    newMaterialThickness: string;
    newMaterialPrice: string;
    addMaterialBtn: string;
  };

  edging: {
    /** Cabinet-form: thickness select label ("Edging Thickness (mm)"). */
    thickness: string;
    /** Cabinet-form: finish (band color) select label. */
    finish: string;
    /** Cabinet-form: first option of `finish` — `undefined` finishMaterialId
     *  resolves to the panel's own material at cut time. */
    finishAuto: string;
    /** Body-editor override section header. */
    overrideLabel: string;
    /** Body-editor radio: inherit the cabinet-wide edging (delete override). */
    inherit: string;
    /** Body-editor radio: use a per-body edging override. */
    custom: string;
    /** Body-editor: short form of `thickness` (header already says "קנט"). */
    thicknessShort: string;
    /** Body-editor: short form of `finish`. */
    finishShort: string;
  };
}

const he: Translations = {
  appTitle: 'תכנון ארונות',

  project: {
    unnamed: 'פרויקט ללא שם',
    newProject: 'פרויקט חדש',
    newProjectPlaceholder: 'שם הפרויקט',
    addProduct: '+ הוסף מוצר',
    noProducts: 'אין מוצרים עדיין. לחץ על "הוסף מוצר" כדי להתחיל.',
    export: 'שמור קובץ',
    import: 'פתח קובץ',
    importError: 'שגיאה בפתיחת הקובץ. ודא שמדובר בקובץ פרויקט תקין.',
    deleteConfirm: 'למחוק את המוצר?',
    backToProject: '← חזרה לפרויקט',
    kitchenAddUnit: '+ הוסף גוף',
    kitchenModuleTitle: 'סוג גוף',
    kitchenModuleWidth: 'רוחב (ס"מ)',
    kitchenModules: { drawers: 'מגירות', shelves: 'מדפים', sink: 'כיור', dishwasher: 'מדיח', oven: 'תנור', pantry: 'מזווה', wall: 'קלפה', 'pantry-top': 'עליון מזווה', corner: 'פינה' },
    kitchenNoUnits: 'אין גופים עדיין. לחץ על "הוסף גוף" כדי להתחיל.',
    kitchenEditUnit: 'עריכה →',
    productTypes: {
      wardrobe: 'ארון',
      bookcase: 'ספריה',
      sideboard: 'מזנון',
      kitchen: 'מטבח',
      'free-build': 'בנייה חופשית',
    },
  },
  room: {
    title: 'תצוגת חדר',
    rooms: 'חדרים',
    addRoom: '+ הוסף חדר',
    noRooms: 'אין חדרים עדיין.',
    roomName: 'שם החדר',
    width: 'רוחב (ס"מ)',
    depth: 'עומק (ס"מ)',
    height: 'גובה (ס"מ)',
    topView: 'מבט-על',
    elevation: 'חזית',
    view3d: 'תלת-ממד',
    heightOffFloor: 'גובה מהרצפה (ס"מ)',
    placeProduct: '+ הצב מוצר בחדר',
    selectProduct: 'בחר מוצר',
    wall: 'קיר',
    walls: { north: 'אחורי', south: 'קדמי', east: 'ימין', west: 'שמאל' },
    offsetFromCorner: 'מרחק מהפינה (ס"מ)',
    rotation: 'סיבוב (°)',
    removeFromRoom: 'הסר מהחדר',
    unplacedProducts: 'מוצרים שלא הוצבו',
    openProduct: 'פתח לעריכה',
    allPlaced: 'כל המוצרים הוצבו',
    products: 'מוצרים',
    productTooTall: (ph, rh) => `גובה המוצר (${ph} ס"מ) עולה על גובה החדר (${rh} ס"מ)`,
    productDoesNotFit: (pw, pd, rw, rd) => `מוצר ${pw}×${pd} ס"מ לא נכנס לחדר ${rw}×${rd} ס"מ בשום סיבוב`,
  },
  appSubtitle: 'חישוב חיתוכים, דלתות ופרזולים',
  langToggle: 'English',

  sketch: {
    preview: 'תצוגה מקדימה',
    invalidDimensions: 'הזן מידות תקינות לתצוגה',
  },

  bodyView: {
    title: 'גוף',
    hint: 'חומרים ועובי-גב לגוף זה בלבד. ריק = ברירת המחדל של הארון.',
    inherit: 'ברירת מחדל',
    back: '→ חזרה',
    reset: 'איפוס לחומרי הארון',
    editInterior: 'עריכת פנים הגוף →',
  },

  form: {
    title: 'מידות הארון',
    width: 'רוחב (ס"מ)',
    height: 'גובה (ס"מ)',
    depth: 'עומק (ס"מ)',
    hasShell: 'מעטפת חיצונית',
    hasShellLeft: 'מעטפת שמאל',
    hasShellRight: 'מעטפת ימין',
    bodyMaterial:  'חומר גופים',
    frontMaterial: 'חומר חזיתות',
    backThickness: 'עובי גב (מ"מ)',
    calculate: 'חשב',
    unitCm: 'ס"מ',
    plinthHeight: 'גובה צוקל (ס"מ)',
    doorCoversPlinth: 'דלת מכסה צוקל',
    doorsPerColumn: 'דלתות לגובה',
    auto: 'אוטומטי',
    lowerDoorHeight: 'גובה קומה תחתונה (ס"מ)',
    lowerDoorHeightMulti: 'גובה קומה תחתונה (ס"מ)',
    middleDoorHeight: 'גובה קומה אמצעית (ס"מ)',
    errorInvalid: 'יש להזין מספר חיובי',
    errorMustBeLessThanH: 'חייב להיות קטן מגובה הארון',
    errorSumTooLarge: 'סכום הקומות חייב להיות קטן מגובה הארון',
    shellWidthWarning: (cm: number) => `רוחב הגופים הפנימיים נמוך מאוד (${cm.toFixed(1)} ס"מ). שקול ארון רחב יותר או ביטול המעטפת.`,
    doorGap: 'רווח בין דלתות (מ"מ)',
    doorGapWarn: 'רווח גדול מ-4 מ"מ נחשב גדול מהמקובל. וודא שהצירים מתאימים.',
    hasEnvelopeTop: 'מעטפת תקרה',
    envelopeTopWarn: (cm: number) => `אזהרה: גובה קומה עליונה פנימית ${cm.toFixed(1)} ס"מ — מומלץ לפחות 20 ס"מ.`,
    hasWallEnvelope: 'מעטפת עליון+תחתון',
    maxDoorWidth: 'רוחב מקסימלי לחזית (ס"מ)',
    cornerDoorSide: 'צד הדלת (פינה)',
    cornerSideLeft: 'שמאל',
    cornerSideRight: 'ימין',
    cornerDoorWidth: 'רוחב דלת פינה (ס"מ)',
    cornerReturn: 'עומק זקף הציר (ס"מ)',
  },

  results: {
    cuts: 'רשימת חיתוכים',
    doors: 'דלתות',
    hardware: 'פרזולים',
    sketch: 'סקיצה',
    noResults: 'הזן מידות ולחץ "חשב"',
    summary: (boxes, cuts) => `פיצול ל-${boxes} קופסאות, סך הכל ${cuts} חיתוכים`,
  },

  boxes: {
    title: 'פיצול לקופסאות',
    plinth: 'צוקל',
    posLeft: 'שמאל',
    posRight: 'ימין',
    posSingle: 'קופסה יחידה',
    posUnit: 'קופסה',
    levelTop: 'עליונה',
    levelMiddle: 'אמצעית',
    levelBottom: 'תחתונה',
    levelSingle: 'גוף יחיד',
  },

  interior: {
    shelf: 'מדף',
    drawer: 'מגירה',
    rod: 'מוט תליה',
    addShelf: '+ מדף',
    addDrawer: '+ מגירה',
    addRod: '+ מוט תליה',
    addPartitions: '+ מחיצות',
    removePartitions: 'הסר מחיצות',
    addPartition: '+ הוסף מחיצה',
    removePartition: 'הסר מחיצה',
    cellRight: 'תא ימני',
    cellLeft: 'תא שמאלי',
    partitionWarnAdd: (s, d, r) => `הוספת מחיצה תמחק את כל הפריטים הקיימים (${s} מדפים, ${d} מגירות, ${r} מוטות). האם להמשיך?`,
    partitionWarnRemove: (a, b) => `הסרת המחיצה תמחק ${a} פריטים בתא ימני ו-${b} פריטים בתא שמאלי. האם להמשיך?`,
    partitionConfirmAdd: 'הוסף ומחק פריטים',
    partitionConfirmRemove: 'הסר ומחק',
    cancel: 'ביטול',
    heightFromFloor: 'גובה מרצפה (ס"מ)',
    drawerHeight: 'גובה מגירה (ס"מ)',
    editBody: 'עריכת פנים גוף',
    back: 'חזרה',
    noItems: 'אין פריטים פנימיים',
    warnOutOfBounds: 'חורג מגבולות הגוף',
    warnDrawerOverlap: 'מגירות חופפות',
    warnShelfSmallZone: 'חלל קטן — אין מדף',
    warnRodLow: 'מוט נמוך — מתחת ל-80',
    warnRodDrawerClose: 'מגירה קרובה למוט מדי',
    dismissWarning: 'הסתר',
    drawerTypeDialogTitle: 'סוג מגירה',
    drawerInternal: 'מגירה פנימית',
    drawerExternal: 'מגירה חיצונית',
    drawerInternalDesc: 'יושבת מאחורי הדלת',
    drawerExternalDesc: 'חזית פיזית משלה',
    drawerFrontLabel: '(מגירה)',
    editExternalDrawerTitle: 'עריכת מגירה חיצונית',
    drawerHeightLabel: 'גובה מגירה (ס"מ)',
    drawerFrontThicknessLabel: 'עובי חזית מגירה',
    defaultMaterial: 'ברירת מחדל',
    deleteDrawer: 'מחק מגירה',
    fixedShelfLabel: 'קבוע',
    fixedShelfTooltip: 'מדף קבוע מעל מגירה חיצונית — נוצר אוטומטית',
    dimOverrideTitle: 'עקיפת מידות גוף',
    dimOverrideW: 'רוחב (ס"מ)',
    dimOverrideH: 'גובה (ס"מ)',
    dimOverrideD: 'עומק (ס"מ)',
    dimOverrideReset: 'אפס מידות',
    warnHeightMismatch: 'שים לב: גופים צמודים עם גובה שונה — הפרש {diff} ס"מ',
    warnWidthMismatch: 'שים לב: קומות מוערמות עם רוחב שונה — הפרש {diff} ס"מ',
    warnVerticalGap: 'שים לב: חלל ריק בין הקומות — {diff} ס"מ ללא גוף',
  },

  doors: {
    bodies:           'גופים',
    fronts:           'חזיתות',
    editFront:        'עריכת חזית',
    noFront:          'ללא חזית',
    hasDoor:          'יש חזית',
    hingeSide:        'צד צירים',
    hingeRight:       'ימין',
    hingeLeft:        'שמאל',
    hingeCount:       'מספר צירים',
    hingeCountAuto:   'אוטומטי',
    hingePos:         'מיקום (ס"מ)',
    hingeManualBadge: 'ידני',
    resetAuto:        'אוטומטי',
    hingeWarnNoPos:   'לא נמצא מיקום אוטומטי לציר ללא התנגשות. ניתן להזיז ידנית.',
    hingeWarnTooClose: (gap: number) => `מרחק בין צירים ${gap} ס"מ — פחות מהמומלץ (25 ס"מ). עלול לגרום ללחץ יתר על הלוח. ניתן להזיז ידנית.`,
    hingeWarnSmallDoor: (h: number) => `חזית בגובה ${h} ס"מ — קטנה מהמינימום ל-2 צירים. הוצב ציר בודד במרכז. ניתן לשנות ידנית.`,
    preview:            'תצוגת חזיתות',
    thickness:          'עובי',
    thicknessOverride:  'עובי חזית (חומר)',
    clearThickness:     'איפוס לברירת מחדל',
    warnThicknessLow:   (cm: number) => `עובי ${cm} ס"מ — דק מהמינימום המומלץ (1.5 ס"מ)`,
    warnThicknessHigh:  (cm: number) => `עובי ${cm} ס"מ — עבה מהמקסימום המומלץ (2.5 ס"מ)`,
    listTitle:          'פיצול לחזיתות',
    front:              'חזית',
    envelopeSideRight:  'צד ימין',
    envelopeSideLeft:   'צד שמאל',
    envelopeTop:        'תקרה',
  },

  groups: {
    shell: 'מעטפת',
    body: 'גוף פנימי',
    back: 'גב',
    door: 'דלתות',
    drawer: 'מגירות',
  },

  columns: {
    part: 'חלק',
    qty: 'כמות',
    width: 'רוחב',
    length: 'אורך',
    thickness: 'עובי',
    note: 'הערה',
  },

  hardwareList: {
    tab: 'פרזולים',
    item: 'פריט',
    qty: 'כמות',
    unit: 'יחידה',
    unitPrice: 'מחיר יחידה',
    total: 'סה"כ',
    grandTotal: 'סה"כ עלות פרזולים',
  },

  cutsList: {
    tab: 'חיתוכים',
    materialGroup: 'חומר',
    description: 'תיאור',
    dimensions: 'מידות (ס"מ)',
    quantity: 'כמות',
    area: 'שטח (מ"ר)',
    totalPieces: 'סה"כ לוחות',
    totalArea: 'סה"כ שטח',
    exportPdf: 'ייצוא PDF',
    noMaterial: 'אביזרי מגירה / אחר',
    pairTopBottom: 'עליון / תחתון',
    pairSides: 'צד ימין / צד שמאל',
    pairEnvelopeSides: 'מעטפת ימין / מעטפת שמאל',
    pairPlinthGables: 'גיבל צוקל',
    pairSinkTraverses: 'קורת רוחב קדמית / אחורית',
    plinthEditorTitle: 'תצוגת על — צוקל',
    plinthHeightLabel: 'גובה צוקל (ס"מ)',
    plinthResetGables: 'אפס מיקומי גיבלים',
    plinthResetGablesTooltip: 'החזר את הגיבלים למיקומים האוטומטיים (קצוות וחיבורי גופים)',
    plinthRecessedLabel: 'צוקל נסוג',
    plinthRecessLabel: 'נסיגה (ס"מ)',
    sheetsNeeded: 'פלטות נדרשות',
    woodCost: 'עלות עץ',
  },

  kitchen: {
    mixedHeightsWarning: 'גופים בגבהים שונים — בדוק יישור לפני ייצור',
    materialsTitle: 'חומרים — כל המטבח',
    mixed: 'מעורב',
  },

  settings: {
    title: 'הגדרות',
    materialsTab: 'חומרים',
    materialName: 'שם חומר',
    materialThickness: 'עובי (מ"מ)',
    materialPrice: 'מחיר לפלטה (₪)',
    sheetDimensions: 'מידת פלטה (ס"מ)',
    resetPrice: 'אפס',
    addMaterial: 'הוסף חומר',
    removeMaterial: 'הסר',
    close: 'סגור',
    catalogMaterials: 'חומרי קטלוג',
    customMaterials: 'חומרים מותאמים',
    noCustomMaterials: 'לא נוספו חומרים מותאמים עדיין.',
    newMaterialName: 'שם',
    newMaterialThickness: 'עובי (מ"מ)',
    newMaterialPrice: 'מחיר (₪)',
    addMaterialBtn: 'הוסף',
  },

  edging: {
    thickness: 'עובי קנט (מ"מ)',
    finish: 'גמר קנט',
    finishAuto: '— אוטומטי (כמו הלוח) —',
    overrideLabel: 'קנט',
    inherit: 'כמו ארון',
    custom: 'מותאם',
    thicknessShort: 'עובי (מ"מ)',
    finishShort: 'גמר',
  },
};

const en: Translations = {
  appTitle: 'Cabinet Planner',

  project: {
    unnamed: 'Unnamed Project',
    newProject: 'New Project',
    newProjectPlaceholder: 'Project name',
    addProduct: '+ Add Product',
    noProducts: 'No products yet. Click "Add Product" to start.',
    export: 'Save File',
    import: 'Open File',
    importError: 'Failed to open file. Make sure it is a valid project file.',
    deleteConfirm: 'Delete this product?',
    backToProject: '← Back to Project',
    kitchenAddUnit: '+ Add Unit',
    kitchenModuleTitle: 'Unit type',
    kitchenModuleWidth: 'Width (cm)',
    kitchenModules: { drawers: 'Drawers', shelves: 'Shelves', sink: 'Sink', dishwasher: 'Dishwasher', oven: 'Oven', pantry: 'Pantry', wall: 'Wall cabinet', 'pantry-top': 'Pantry top', corner: 'Corner' },
    kitchenNoUnits: 'No units yet. Click "Add Unit" to start.',
    kitchenEditUnit: 'Edit →',
    productTypes: {
      wardrobe: 'Wardrobe',
      bookcase: 'Bookcase',
      sideboard: 'Sideboard',
      kitchen: 'Kitchen',
      'free-build': 'Free Build',
    },
  },
  room: {
    title: 'Room View',
    rooms: 'Rooms',
    addRoom: '+ Add Room',
    noRooms: 'No rooms yet.',
    roomName: 'Room name',
    width: 'Width (cm)',
    depth: 'Depth (cm)',
    height: 'Height (cm)',
    topView: 'Top view',
    elevation: 'Elevation',
    view3d: '3D',
    heightOffFloor: 'Height off floor (cm)',
    placeProduct: '+ Place product in room',
    selectProduct: 'Select product',
    wall: 'Wall',
    walls: { north: 'Back', south: 'Front', east: 'Right', west: 'Left' },
    offsetFromCorner: 'Offset from corner (cm)',
    rotation: 'Rotation (°)',
    removeFromRoom: 'Remove from room',
    unplacedProducts: 'Unplaced products',
    openProduct: 'Open for editing',
    allPlaced: 'All products placed',
    products: 'Products',
    productTooTall: (ph, rh) => `Product height (${ph} cm) exceeds room height (${rh} cm)`,
    productDoesNotFit: (pw, pd, rw, rd) => `Product ${pw}×${pd} cm does not fit in room ${rw}×${rd} cm in any orientation`,
  },
  appSubtitle: 'Cuts, doors & hardware calculator',
  langToggle: 'עברית',

  sketch: {
    preview: 'Preview',
    invalidDimensions: 'Enter valid dimensions to preview',
  },

  bodyView: {
    title: 'Body',
    hint: 'Materials and back thickness for this body only. Empty = the cabinet default.',
    inherit: 'Default',
    back: '→ Back',
    reset: 'Reset to cabinet materials',
    editInterior: 'Edit interior →',
  },

  form: {
    title: 'Cabinet Dimensions',
    width: 'Width (cm)',
    height: 'Height (cm)',
    depth: 'Depth (cm)',
    hasShell: 'Outer shell',
    hasShellLeft: 'Shell left',
    hasShellRight: 'Shell right',
    bodyMaterial:  'Body Material',
    frontMaterial: 'Front Material',
    backThickness: 'Back Thickness (mm)',
    calculate: 'Calculate',
    unitCm: 'cm',
    plinthHeight: 'Plinth Height (cm)',
    doorCoversPlinth: 'Door Covers Plinth',
    doorsPerColumn: 'Doors Per Column',
    auto: 'Auto',
    lowerDoorHeight: 'Lower Section Height (cm)',
    lowerDoorHeightMulti: 'Lower Section Height (cm)',
    middleDoorHeight: 'Middle Section Height (cm)',
    errorInvalid: 'Must be a positive number',
    errorMustBeLessThanH: 'Must be less than cabinet height',
    errorSumTooLarge: 'Sections sum must be less than cabinet height',
    shellWidthWarning: (cm: number) => `Inner body width is very low (${cm.toFixed(1)} cm). Consider a wider cabinet or removing the envelope.`,
    doorGap: 'Door Gap (mm)',
    doorGapWarn: 'Gap over 4 mm is larger than standard. Ensure hinges are suitable.',
    hasEnvelopeTop: 'Ceiling Panel',
    envelopeTopWarn: (cm: number) => `Warning: top section inner height is ${cm.toFixed(1)} cm — recommended minimum is 20 cm.`,
    hasWallEnvelope: 'Top+bottom envelope',
    maxDoorWidth: 'Max Front Width (cm)',
    cornerDoorSide: 'Door side (corner)',
    cornerSideLeft: 'Left',
    cornerSideRight: 'Right',
    cornerDoorWidth: 'Corner door width (cm)',
    cornerReturn: 'Hinge-post depth (cm)',
  },

  results: {
    cuts: 'Cutting List',
    doors: 'Doors',
    hardware: 'Hardware',
    sketch: 'Sketch',
    noResults: 'Enter dimensions and click "Calculate"',
    summary: (boxes, cuts) => `Split into ${boxes} boxes, total ${cuts} pieces`,
  },

  boxes: {
    title: 'Box Breakdown',
    plinth: 'Plinth',
    posLeft: 'Left',
    posRight: 'Right',
    posSingle: 'Single Box',
    posUnit: 'Box',
    levelTop: 'Upper',
    levelMiddle: 'Middle',
    levelBottom: 'Lower',
    levelSingle: 'Single Body',
  },

  interior: {
    shelf: 'Shelf',
    drawer: 'Drawer',
    rod: 'Hanging Rod',
    addShelf: '+ Shelf',
    addDrawer: '+ Drawer',
    addRod: '+ Hanging Rod',
    addPartitions: '+ Partitions',
    removePartitions: 'Remove Partitions',
    addPartition: '+ Add Partition',
    removePartition: 'Remove Partition',
    cellRight: 'Right cell',
    cellLeft: 'Left cell',
    partitionWarnAdd: (s, d, r) => `Adding a partition will delete all existing items (${s} shelves, ${d} drawers, ${r} rods). Continue?`,
    partitionWarnRemove: (a, b) => `Removing the partition will delete ${a} items in the right cell and ${b} in the left cell. Continue?`,
    partitionConfirmAdd: 'Add & Delete Items',
    partitionConfirmRemove: 'Remove & Delete',
    cancel: 'Cancel',
    heightFromFloor: 'Height from floor (cm)',
    drawerHeight: 'Drawer height (cm)',
    editBody: 'Edit Body Interior',
    back: 'Back',
    noItems: 'No interior items',
    warnOutOfBounds: 'Exceeds body bounds',
    warnDrawerOverlap: 'Overlapping drawers',
    warnShelfSmallZone: 'Zone too small',
    warnRodLow: 'Rod too low — < 80 cm',
    warnRodDrawerClose: 'Drawer too close to rod',
    dismissWarning: 'Dismiss',
    drawerTypeDialogTitle: 'Drawer type',
    drawerInternal: 'Internal drawer',
    drawerExternal: 'External drawer',
    drawerInternalDesc: 'Sits behind the door',
    drawerExternalDesc: 'Has its own physical front',
    drawerFrontLabel: '(drawer)',
    editExternalDrawerTitle: 'Edit external drawer',
    drawerHeightLabel: 'Drawer height (cm)',
    drawerFrontThicknessLabel: 'Drawer front thickness',
    defaultMaterial: 'Default',
    deleteDrawer: 'Delete drawer',
    fixedShelfLabel: 'Fixed',
    fixedShelfTooltip: 'Fixed shelf above external drawer — auto-generated',
    dimOverrideTitle: 'Body dimension override',
    dimOverrideW: 'Width (cm)',
    dimOverrideH: 'Height (cm)',
    dimOverrideD: 'Depth (cm)',
    dimOverrideReset: 'Reset dimensions',
    warnHeightMismatch: 'Note: adjacent bodies have different heights — difference {diff} cm',
    warnWidthMismatch: 'Note: stacked levels have different total widths — difference {diff} cm',
    warnVerticalGap: 'Note: empty gap between levels — {diff} cm without a body',
  },

  doors: {
    bodies:           'Bodies',
    fronts:           'Fronts',
    editFront:        'Edit Front',
    noFront:          'No Front',
    hasDoor:          'Has Front',
    hingeSide:        'Hinge Side',
    hingeRight:       'Right',
    hingeLeft:        'Left',
    hingeCount:       'Hinge Count',
    hingeCountAuto:   'Auto',
    hingePos:         'Position (cm)',
    hingeManualBadge: 'Manual',
    resetAuto:        'Auto',
    hingeWarnNoPos:   'No auto position found without conflict. Move manually.',
    hingeWarnTooClose: (gap: number) => `Hinge gap ${gap} cm — less than recommended (25 cm). May cause excess stress on the panel. Can be adjusted manually.`,
    hingeWarnSmallDoor: (h: number) => `Door height ${h} cm — below minimum for 2 hinges. Single hinge placed at center. Can be adjusted manually.`,
    preview:            'Fronts Preview',
    thickness:          'Thickness',
    thicknessOverride:  'Front Thickness (Material)',
    clearThickness:     'Reset to Default',
    warnThicknessLow:   (cm: number) => `Thickness ${cm} cm — below recommended minimum (1.5 cm)`,
    warnThicknessHigh:  (cm: number) => `Thickness ${cm} cm — above recommended maximum (2.5 cm)`,
    listTitle:          'Fronts Breakdown',
    front:              'Front',
    envelopeSideRight:  'Right Side',
    envelopeSideLeft:   'Left Side',
    envelopeTop:        'Ceiling',
  },

  groups: {
    shell: 'Shell',
    body: 'Interior',
    back: 'Back',
    door: 'Doors',
    drawer: 'Drawers',
  },

  columns: {
    part: 'Part',
    qty: 'Qty',
    width: 'Width',
    length: 'Length',
    thickness: 'Thickness',
    note: 'Note',
  },

  hardwareList: {
    tab: 'Hardware',
    item: 'Item',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit price',
    total: 'Total',
    grandTotal: 'Total hardware cost',
  },

  cutsList: {
    tab: 'Cuts',
    materialGroup: 'Material',
    description: 'Description',
    dimensions: 'Dimensions (cm)',
    quantity: 'Qty',
    area: 'Area (m²)',
    totalPieces: 'Total pieces',
    totalArea: 'Total area',
    exportPdf: 'Export PDF',
    noMaterial: 'Drawer parts / Other',
    pairTopBottom: 'Top / Bottom',
    pairSides: 'Right / Left Side',
    pairEnvelopeSides: 'Right / Left Envelope',
    pairPlinthGables: 'Plinth Gable',
    pairSinkTraverses: 'Front / Back Traverse',
    plinthEditorTitle: 'Top view — Plinth',
    plinthHeightLabel: 'Plinth height (cm)',
    plinthResetGables: 'Reset gable positions',
    plinthResetGablesTooltip: 'Restore gables to their automatic positions (edges and body joints)',
    plinthRecessedLabel: 'Recessed plinth',
    plinthRecessLabel: 'Recess (cm)',
    sheetsNeeded: 'Sheets needed',
    woodCost: 'Wood cost',
  },

  kitchen: {
    mixedHeightsWarning: 'Units with different heights — verify alignment before manufacturing',
    materialsTitle: 'Materials — whole kitchen',
    mixed: 'Mixed',
  },

  settings: {
    title: 'Settings',
    materialsTab: 'Materials',
    materialName: 'Material name',
    materialThickness: 'Thickness (mm)',
    materialPrice: 'Price per sheet (₪)',
    sheetDimensions: 'Sheet size (cm)',
    resetPrice: 'Reset',
    addMaterial: 'Add material',
    removeMaterial: 'Remove',
    close: 'Close',
    catalogMaterials: 'Catalog materials',
    customMaterials: 'Custom materials',
    noCustomMaterials: 'No custom materials yet.',
    newMaterialName: 'Name',
    newMaterialThickness: 'Thickness (mm)',
    newMaterialPrice: 'Price (₪)',
    addMaterialBtn: 'Add',
  },

  edging: {
    thickness: 'Edging Thickness (mm)',
    finish: 'Edging Finish',
    finishAuto: '— Auto (matches panel) —',
    overrideLabel: 'Edging',
    inherit: 'Like cabinet',
    custom: 'Custom',
    thicknessShort: 'Thickness (mm)',
    finishShort: 'Finish',
  },
};

export const translations: Record<Language, Translations> = { he, en };
export const defaultLanguage: Language = 'he';
