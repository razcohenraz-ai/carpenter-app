import { describe, it, expect } from 'vitest';
import type {
  CabinetInput,
  Project,
  ProductUnit,
  SavedBoardOverride,
  SavedCabinetState,
  SavedDoor,
} from '../../types';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';
import { deserializeProject, serializeProject } from './serialize';

// ── Test helpers ──────────────────────────────────────────────────────────────

function basicInput(): CabinetInput {
  return {
    W: 60, H: 220, D: 60,
    backThickness: 0.6,
    hasShell: false, hasEnvelopeTop: false,
    bodyMaterialId: 'mdf18', frontMaterialId: 'oak18',
    plinth: 0, plinthRecess: 0,
    doorCoversPlinth: false,
    lowerDoorH: undefined, middleDoorH: undefined,
    doorsPerColumn: 'auto',
    doorGapMm: 3, maxDoorWidth: 60,
  };
}

function emptyState(): SavedCabinetState {
  return {
    interior: {}, cellInterior: {}, partitions: {}, doors: {},
    plinthGableOverrides: {}, boardOverrides: {},
  };
}

function mkProduct(overrides: Partial<ProductUnit> = {}): ProductUnit {
  return {
    id: 'test-id-1',
    name: 'ארון',
    productType: 'wardrobe',
    cabinet: { input: basicInput(), state: emptyState() },
    ...overrides,
  };
}

function mkProject(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectName: 'פרויקט בדיקה',
    products: [mkProduct()],
    ...overrides,
  };
}

/** Round-trip helper — returns deserialized project for further assertions. */
function roundTrip(project: Project): Project {
  const json = serializeProject(project);
  expect(typeof json).toBe('string');
  const back = deserializeProject(json);
  expect(back.schemaVersion).toBe(project.schemaVersion);
  expect(back.projectName).toEqual(project.projectName);
  expect(back.products).toEqual(project.products);
  return back;
}

// ── Round-trip: representative cabinets ───────────────────────────────────────

describe('round-trip — representative cabinets', () => {
  it('ארון בסיסי (60×220×60, ללא מעטפת, ללא צוקל)', () => {
    roundTrip(mkProject());
  });

  it('ארון עם צוקל', () => {
    const p = mkProject();
    p.products[0]!.cabinet.input.plinth = 10;
    roundTrip(p);
  });

  it('ארון עם צוקל נסוג + מעטפת', () => {
    const p = mkProject();
    const inp = p.products[0]!.cabinet.input;
    inp.plinth = 10; inp.plinthRecess = 2;
    inp.hasShell = true; inp.hasEnvelopeTop = true; inp.doorCoversPlinth = true;
    roundTrip(p);
  });

  it('ארון עם override של מידת לוח', () => {
    const p = mkProject();
    const dimOverride: SavedBoardOverride = { dimensions: { length: 215, width: 58 } };
    p.products[0]!.cabinet.state.boardOverrides = { 'side-left@bottom:left': dimOverride };
    const back = roundTrip(p);
    expect(back.products[0]!.cabinet.state.boardOverrides['side-left@bottom:left']).toEqual(dimOverride);
  });

  it('ארון עם override של חומר לוח', () => {
    const p = mkProject();
    p.products[0]!.cabinet.state.boardOverrides = { 'top@bottom:left': { materialId: 'melamine18' } };
    const back = roundTrip(p);
    expect(back.products[0]!.cabinet.state.boardOverrides['top@bottom:left']).toEqual({ materialId: 'melamine18' });
  });

  it('ארון עם גיבלי צוקל נגררים', () => {
    const p = mkProject();
    p.products[0]!.cabinet.input.plinth = 10;
    p.products[0]!.cabinet.state.plinthGableOverrides = { 'edge-left': 5.5, 'joint:0': 42.0 };
    const back = roundTrip(p);
    expect(back.products[0]!.cabinet.state.plinthGableOverrides).toEqual({ 'edge-left': 5.5, 'joint:0': 42.0 });
  });

  it('ארון רחב W=120', () => {
    const p = mkProject();
    p.products[0]!.cabinet.input.W = 120;
    roundTrip(p);
  });

  it('פרויקט עם מספר מוצרים', () => {
    const p = mkProject({
      products: [
        mkProduct({ id: 'p1', name: 'ארון שינה', productType: 'wardrobe' }),
        mkProduct({ id: 'p2', name: 'ספריה', productType: 'bookcase' }),
        mkProduct({ id: 'p3', name: 'מזנון', productType: 'sideboard' }),
      ],
    });
    const back = roundTrip(p);
    expect(back.products).toHaveLength(3);
    expect(back.products[1]!.productType).toBe('bookcase');
  });

  it('lowerDoorH/middleDoorH=undefined שורדים round-trip', () => {
    const p = mkProject();
    expect(p.products[0]!.cabinet.input.lowerDoorH).toBeUndefined();
    const json = serializeProject(p);
    expect(json).not.toContain('lowerDoorH');
    const back = deserializeProject(json);
    expect(back.products[0]!.cabinet.input.lowerDoorH).toBeUndefined();
  });

  it('שילוב הכל — overrides + interior + דלתות + מחיצות', () => {
    const savedDoor: SavedDoor = {
      hingeSide: 'right', hingeCount: 4,
      hinges: [{ positionFromBottom: 10, isManual: true }, { positionFromBottom: 180, isManual: false }],
      hasDoor: true, thicknessOverride: 'melamine18',
    };
    const p = mkProject({ projectName: 'ארון אמבטיה - לקוח כהן' });
    const inp = p.products[0]!.cabinet.input;
    inp.W = 180; inp.plinth = 10; inp.hasShell = true; inp.lowerDoorH = 90; inp.doorsPerColumn = 2;
    const st = p.products[0]!.cabinet.state;
    st.interior = { 'bottom:left': [{ id: 'i1', type: 'shelf', heightFromFloor: 40 }] };
    st.doors = { 'bottom:left:0': savedDoor };
    st.boardOverrides = { 'side-left@bottom:left': { dimensions: { length: 218 } } };
    const back = roundTrip(p);
    expect(back.projectName).toBe('ארון אמבטיה - לקוח כהן');
    expect(back.products[0]!.cabinet.state.doors['bottom:left:0']).toEqual(savedDoor);
  });
});

// ── Timestamp behavior ───────────────────────────────────────────────────────

describe('serializeProject — timestamps', () => {
  it('updatedAt מתעדכן ל-now בכל קריאה', () => {
    const project = mkProject({ updatedAt: '2020-01-01T00:00:00.000Z' });
    const before = Date.now();
    const json = serializeProject(project);
    const after = Date.now();
    const parsed = JSON.parse(json) as Project;
    const updated = new Date(parsed.updatedAt!).getTime();
    expect(updated).toBeGreaterThanOrEqual(before);
    expect(updated).toBeLessThanOrEqual(after);
  });

  it('createdAt נשמר אם קיים', () => {
    const original = '2024-03-15T12:00:00.000Z';
    const json = serializeProject(mkProject({ createdAt: original }));
    expect((JSON.parse(json) as Project).createdAt).toBe(original);
  });

  it('createdAt נוצר אם חסר', () => {
    const p = mkProject();
    delete p.createdAt;
    const before = Date.now();
    const json = serializeProject(p);
    const after = Date.now();
    const created = new Date((JSON.parse(json) as Project).createdAt!).getTime();
    expect(created).toBeGreaterThanOrEqual(before);
    expect(created).toBeLessThanOrEqual(after);
  });

  it('serializeProject לא משנה את ה-input', () => {
    const p = mkProject({ updatedAt: '2020-01-01T00:00:00.000Z' });
    const before = JSON.stringify(p);
    serializeProject(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});

// ── Migration behavior ───────────────────────────────────────────────────────

describe('migrate — schema version handling', () => {
  it('גרסה נוכחית (v2) עוברת ללא שינוי', () => {
    const p = mkProject({ projectName: 'בדיקה' });
    expect(migrate(p)).toEqual(p);
  });

  it('v1 → v2: cabinet יחיד נהפך ל-products array עם wardrobe', () => {
    const v1 = {
      schemaVersion: 1,
      projectName: 'ישן',
      cabinet: { input: basicInput(), state: emptyState() },
    };
    const result = migrate(v1);
    expect(result.schemaVersion).toBe(2);
    expect(result.projectName).toBe('ישן');
    expect(Array.isArray(result.products)).toBe(true);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]!.productType).toBe('wardrobe');
    expect(result.products[0]!.cabinet).toEqual(v1.cabinet);
  });

  it('v1 ללא projectName: projectName מקבל ברירת מחדל', () => {
    const v1 = { schemaVersion: 1, cabinet: { input: basicInput(), state: emptyState() } };
    const result = migrate(v1);
    expect(typeof result.projectName).toBe('string');
  });

  it('זורק שגיאה לגרסה עתידית', () => {
    expect(() => migrate({ ...mkProject(), schemaVersion: CURRENT_SCHEMA_VERSION + 5 })).toThrow(/newer than/);
  });

  it('זורק שגיאה אם schemaVersion חסר', () => {
    const p: Partial<Project> = { ...mkProject() };
    delete p.schemaVersion;
    expect(() => migrate(p)).toThrow(/schemaVersion/);
  });

  it('זורק שגיאה אם schemaVersion הוא 0 או שלילי', () => {
    expect(() => migrate({ ...mkProject(), schemaVersion: 0 })).toThrow(/schemaVersion/);
  });

  it('זורק שגיאה על input שאינו אובייקט', () => {
    expect(() => migrate(null)).toThrow(/object/);
    expect(() => migrate('string' as unknown)).toThrow(/object/);
  });
});

// ── Validation behavior ──────────────────────────────────────────────────────

describe('deserializeProject — validation', () => {
  it('זורק שגיאה על JSON פגום', () => {
    expect(() => deserializeProject('{ not valid }')).toThrow(/invalid JSON/);
  });

  it('זורק שגיאה אם products חסר', () => {
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projectName: 'x' });
    expect(() => deserializeProject(json)).toThrow(/products/);
  });

  it('זורק שגיאה אם products אינו array', () => {
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projectName: 'x', products: {} });
    expect(() => deserializeProject(json)).toThrow(/products/);
  });

  it('זורק שגיאה אם productType לא תקין', () => {
    const p = mkProduct({ productType: 'spaceship' as never });
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projectName: 'x', products: [p] });
    expect(() => deserializeProject(json)).toThrow(/productType/);
  });

  it('זורק שגיאה אם שדה ב-input חסר', () => {
    const input = basicInput() as Partial<CabinetInput>;
    delete input.W;
    const pu = mkProduct({ cabinet: { input: input as CabinetInput, state: emptyState() } });
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projectName: 'x', products: [pu] });
    expect(() => deserializeProject(json)).toThrow(/W/);
  });

  it('זורק שגיאה אם type שגוי ב-input', () => {
    const input = { ...basicInput(), W: 'wide' as unknown as number };
    const pu = mkProduct({ cabinet: { input, state: emptyState() } });
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projectName: 'x', products: [pu] });
    expect(() => deserializeProject(json)).toThrow(/W.*number/);
  });

  it('זורק שגיאה אם doorsPerColumn מחוץ לטווח', () => {
    const input = { ...basicInput(), doorsPerColumn: 7 as unknown as 'auto' };
    const pu = mkProduct({ cabinet: { input, state: emptyState() } });
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projectName: 'x', products: [pu] });
    expect(() => deserializeProject(json)).toThrow(/doorsPerColumn/);
  });

  it('זורק שגיאה אם state חסר שדה', () => {
    const state = emptyState() as Partial<SavedCabinetState>;
    delete state.partitions;
    const pu = mkProduct({ cabinet: { input: basicInput(), state: state as SavedCabinetState } });
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, projectName: 'x', products: [pu] });
    expect(() => deserializeProject(json)).toThrow(/partitions/);
  });

  it('עובר על פרויקט תקין עם מספר מוצרים', () => {
    const p = mkProject({
      products: [
        mkProduct({ id: 'a', productType: 'wardrobe' }),
        mkProduct({ id: 'b', productType: 'kitchen' }),
        mkProduct({ id: 'c', productType: 'free-build' }),
      ],
    });
    const back = deserializeProject(serializeProject(p));
    expect(back.products).toHaveLength(3);
  });
});
