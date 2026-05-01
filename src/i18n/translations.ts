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
    material: string;
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
    material: 'חומר',
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
    material: 'Material',
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
