export type Language = 'he' | 'en';

export interface Translations {
  appTitle: string;
  appSubtitle: string;
  langToggle: string;

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
    errorInvalid: string;
    errorMustBeLessThanH: string;
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
    lowerDoorHeight: 'גובה דלת תחתונה (ס"מ)',
    lowerDoorHeightMulti: 'גובה דלת תחתונה — כל מפלס (ס"מ)',
    errorInvalid: 'יש להזין מספר חיובי',
    errorMustBeLessThanH: 'חייב להיות קטן מגובה הארון',
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
    lowerDoorHeight: 'Lower Door Height (cm)',
    lowerDoorHeightMulti: 'Lower Door Height — per level (cm)',
    errorInvalid: 'Must be a positive number',
    errorMustBeLessThanH: 'Must be less than cabinet height',
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
