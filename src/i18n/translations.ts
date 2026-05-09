export type Language = 'he' | 'en';

export interface Translations {
  appTitle: string;
  appSubtitle: string;
  langToggle: string;

  sketch: {
    preview: string;
    invalidDimensions: string;
  };

  form: {
    title: string;
    width: string;
    height: string;
    depth: string;
    hasShell: string;
    bodyMaterial: string;
    frontMaterial: string;
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
    heightFromFloor: string;
    drawerHeight: string;
    editBody: string;
    back: string;
    noItems: string;
    warnOutOfBounds: string;
    warnDrawerOverlap: string;
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
}

const he: Translations = {
  appTitle: 'תכנון ארונות',
  appSubtitle: 'חישוב חיתוכים, דלתות ופרזולים',
  langToggle: 'English',

  sketch: {
    preview: 'תצוגה מקדימה',
    invalidDimensions: 'הזן מידות תקינות לתצוגה',
  },

  form: {
    title: 'מידות הארון',
    width: 'רוחב (ס"מ)',
    height: 'גובה (ס"מ)',
    depth: 'עומק (ס"מ)',
    hasShell: 'מעטפת חיצונית',
    bodyMaterial:  'חומר גופים',
    frontMaterial: 'חומר חזיתות',
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
    heightFromFloor: 'גובה מרצפה (ס"מ)',
    drawerHeight: 'גובה מגירה (ס"מ)',
    editBody: 'עריכת פנים גוף',
    back: 'חזרה',
    noItems: 'אין פריטים פנימיים',
    warnOutOfBounds: 'חורג מגבולות הגוף',
    warnDrawerOverlap: 'מגירות חופפות',
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
};

const en: Translations = {
  appTitle: 'Cabinet Planner',
  appSubtitle: 'Cuts, doors & hardware calculator',
  langToggle: 'עברית',

  sketch: {
    preview: 'Preview',
    invalidDimensions: 'Enter valid dimensions to preview',
  },

  form: {
    title: 'Cabinet Dimensions',
    width: 'Width (cm)',
    height: 'Height (cm)',
    depth: 'Depth (cm)',
    hasShell: 'Outer shell',
    bodyMaterial:  'Body Material',
    frontMaterial: 'Front Material',
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
    heightFromFloor: 'Height from floor (cm)',
    drawerHeight: 'Drawer height (cm)',
    editBody: 'Edit Body Interior',
    back: 'Back',
    noItems: 'No interior items',
    warnOutOfBounds: 'Exceeds body bounds',
    warnDrawerOverlap: 'Overlapping drawers',
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
};

export const translations: Record<Language, Translations> = { he, en };
export const defaultLanguage: Language = 'he';
