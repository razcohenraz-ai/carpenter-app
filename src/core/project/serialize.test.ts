import { describe, it, expect } from 'vitest';
import type {
  CabinetInput,
  Project,
  SavedBoardOverride,
  SavedCabinetState,
  SavedDoor,
} from '../../types';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';
import { deserializeProject, serializeProject } from './serialize';

// ── Test helpers ──────────────────────────────────────────────────────────────

function basicInput(): CabinetInput {
  return {
    W: 60,
    H: 220,
    D: 60,
    backThickness: 0.6,
    hasShell: false,
    hasEnvelopeTop: false,
    bodyMaterialId: 'mdf18',
    frontMaterialId: 'oak18',
    plinth: 0,
    plinthRecess: 0,
    doorCoversPlinth: false,
    lowerDoorH: undefined,
    middleDoorH: undefined,
    doorsPerColumn: 'auto',
    doorGapMm: 3,
    maxDoorWidth: 60,
  };
}

function emptyState(): SavedCabinetState {
  return {
    interior: {},
    cellInterior: {},
    partitions: {},
    doors: {},
    plinthGableOverrides: {},
    boardOverrides: {},
  };
}

function mkProject(overrides: Partial<Project> = {}): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    cabinet: { input: basicInput(), state: emptyState() },
    ...overrides,
  };
}

/** Round-trip and compare every field except `updatedAt` (which is always
 *  refreshed by serializeProject) — returns the deserialized project so
 *  callers can run extra assertions specific to the scenario. */
function roundTrip(project: Project): Project {
  const json = serializeProject(project);
  expect(typeof json).toBe('string');
  const back = deserializeProject(json);
  // Compare structural fields. updatedAt is always refreshed.
  expect(back.schemaVersion).toBe(project.schemaVersion);
  expect(back.projectName).toEqual(project.projectName);
  expect(back.cabinet).toEqual(project.cabinet);
  return back;
}

// ── Round-trip: representative cabinets ───────────────────────────────────────

describe('round-trip — representative cabinets', () => {
  it('ארון בסיסי (60×220×60, ללא מעטפת, ללא צוקל)', () => {
    const project = mkProject();
    roundTrip(project);
  });

  it('ארון עם צוקל', () => {
    const project = mkProject();
    project.cabinet.input.plinth = 10;
    roundTrip(project);
  });

  it('ארון עם צוקל נסוג + מעטפת', () => {
    const project = mkProject();
    project.cabinet.input.plinth = 10;
    project.cabinet.input.plinthRecess = 2;
    project.cabinet.input.hasShell = true;
    project.cabinet.input.hasEnvelopeTop = true;
    project.cabinet.input.doorCoversPlinth = true;
    roundTrip(project);
  });

  it('ארון עם override של מידת לוח', () => {
    const project = mkProject();
    const dimensionOverride: SavedBoardOverride = {
      dimensions: { length: 215, width: 58 },
    };
    project.cabinet.state.boardOverrides = {
      'side-left@bottom:left': dimensionOverride,
    };
    const back = roundTrip(project);
    expect(back.cabinet.state.boardOverrides['side-left@bottom:left']).toEqual(
      dimensionOverride,
    );
  });

  it('ארון עם override של חומר לוח', () => {
    const project = mkProject();
    project.cabinet.state.boardOverrides = {
      'top@bottom:left': { materialId: 'melamine18' },
    };
    const back = roundTrip(project);
    expect(back.cabinet.state.boardOverrides['top@bottom:left']).toEqual({
      materialId: 'melamine18',
    });
  });

  it('ארון עם גיבלי צוקל נגררים', () => {
    const project = mkProject();
    project.cabinet.input.plinth = 10;
    project.cabinet.state.plinthGableOverrides = {
      'edge-left': 5.5,
      'joint:0': 42.0,
      'edge-right': 88.7,
    };
    const back = roundTrip(project);
    expect(back.cabinet.state.plinthGableOverrides).toEqual({
      'edge-left': 5.5,
      'joint:0': 42.0,
      'edge-right': 88.7,
    });
  });

  it('ארון רחב W=120 (>80, decomposition יוצרת יחידות)', () => {
    const project = mkProject();
    project.cabinet.input.W = 120;
    roundTrip(project);
  });

  it('lowerDoorH/middleDoorH=undefined שורדים round-trip (JSON.stringify מפיל אותם)', () => {
    const project = mkProject();
    // `basicInput()` already sets both fields to `undefined`. Assert explicitly
    // that deserialization does NOT throw "missing required field" — this
    // pins the fix that excludes them from REQUIRED_INPUT_KEYS.
    expect(project.cabinet.input.lowerDoorH).toBeUndefined();
    expect(project.cabinet.input.middleDoorH).toBeUndefined();
    const json = serializeProject(project);
    // The keys are absent from the JSON after stringify.
    expect(json).not.toContain('lowerDoorH');
    expect(json).not.toContain('middleDoorH');
    const back = deserializeProject(json);
    expect(back.cabinet.input.lowerDoorH).toBeUndefined();
    expect(back.cabinet.input.middleDoorH).toBeUndefined();
  });

  it('שילוב הכל — overrides + גיבלים + interior + מחיצות + דלתות', () => {
    const project = mkProject({ projectName: 'ארון אמבטיה - לקוח כהן' });
    const input = project.cabinet.input;
    input.W = 180;
    input.H = 220;
    input.D = 60;
    input.plinth = 10;
    input.plinthRecess = 2;
    input.hasShell = true;
    input.hasEnvelopeTop = true;
    input.doorCoversPlinth = true;
    input.lowerDoorH = 90;
    input.doorsPerColumn = 2;

    const state = project.cabinet.state;
    state.interior = {
      'bottom:left': [
        {
          id: 'item-1',
          type: 'shelf',
          heightFromFloor: 40,
          isManuallyPositioned: true,
        },
        {
          id: 'item-2',
          type: 'drawer',
          heightFromFloor: 0,
          drawerHeight: 18,
          mount: 'external',
          frontThicknessOverride: 'oak18',
        },
      ],
      'top:right': [{ id: 'item-3', type: 'rod', heightFromFloor: 30 }],
    };
    state.cellInterior = {
      'bottom:unit_1': [
        [{ id: 'cell-a', type: 'shelf', heightFromFloor: 35 }],
        [{ id: 'cell-b', type: 'shelf', heightFromFloor: 35 }],
      ],
    };
    state.partitions = { 'bottom:unit_1': true, 'top:left': false };
    const savedDoor: SavedDoor = {
      hingeSide: 'right',
      hingeCount: 4,
      hinges: [
        { positionFromBottom: 10, isManual: true },
        { positionFromBottom: 60, isManual: false },
        { positionFromBottom: 120, isManual: false },
        { positionFromBottom: 180, isManual: true },
      ],
      hasDoor: true,
      thicknessOverride: 'melamine18',
    };
    state.doors = {
      'bottom:left:0': savedDoor,
      'top:right:1': {
        hingeSide: 'left',
        hingeCount: 'auto',
        hinges: [],
        hasDoor: false,
      },
    };
    state.plinthGableOverrides = { 'edge-left': 4, 'joint:0': 60, 'joint:1': 120 };
    state.boardOverrides = {
      'side-left@bottom:left': { dimensions: { length: 218 } },
      'plinth-gable-a@joint:0': { materialId: 'plywood18' },
      'fixed-shelf@top:right': {
        dimensions: { length: 56, thickness: 18 },
        materialId: 'mdf18',
      },
    };

    const back = roundTrip(project);
    expect(back.projectName).toBe('ארון אמבטיה - לקוח כהן');
    expect(back.cabinet.state.interior['bottom:left']).toHaveLength(2);
    expect(back.cabinet.state.doors['bottom:left:0']).toEqual(savedDoor);
    expect(Object.keys(back.cabinet.state.boardOverrides)).toHaveLength(3);
  });
});

// ── Timestamp behavior ───────────────────────────────────────────────────────

describe('serializeProject — timestamps', () => {
  it('updatedAt מתעדכן ל-now בכל קריאה', async () => {
    const project = mkProject({ updatedAt: '2020-01-01T00:00:00.000Z' });
    const before = Date.now();
    const json = serializeProject(project);
    const after = Date.now();
    const parsed = JSON.parse(json) as Project;
    const updated = new Date(parsed.updatedAt!).getTime();
    expect(updated).toBeGreaterThanOrEqual(before);
    expect(updated).toBeLessThanOrEqual(after);
    expect(parsed.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('createdAt נשמר אם קיים', () => {
    const original = '2024-03-15T12:00:00.000Z';
    const project = mkProject({ createdAt: original });
    const json = serializeProject(project);
    const parsed = JSON.parse(json) as Project;
    expect(parsed.createdAt).toBe(original);
  });

  it('createdAt נוצר אם חסר (שמירה ראשונה)', () => {
    const project = mkProject();
    delete project.createdAt;
    const before = Date.now();
    const json = serializeProject(project);
    const after = Date.now();
    const parsed = JSON.parse(json) as Project;
    expect(parsed.createdAt).toBeDefined();
    const created = new Date(parsed.createdAt!).getTime();
    expect(created).toBeGreaterThanOrEqual(before);
    expect(created).toBeLessThanOrEqual(after);
  });

  it('serializeProject לא משנה את ה-input', () => {
    const project = mkProject({ updatedAt: '2020-01-01T00:00:00.000Z' });
    const before = JSON.stringify(project);
    serializeProject(project);
    expect(JSON.stringify(project)).toBe(before);
  });
});

// ── Migration behavior ───────────────────────────────────────────────────────

describe('migrate — schema version handling', () => {
  it('גרסה נוכחית עוברת ללא שינוי', () => {
    const project = mkProject({ projectName: 'בדיקה' });
    const result = migrate(project);
    expect(result).toEqual(project);
  });

  it('זורק שגיאה ברורה לגרסה עתידית (newer than current)', () => {
    const future = { ...mkProject(), schemaVersion: CURRENT_SCHEMA_VERSION + 5 };
    expect(() => migrate(future)).toThrow(/newer than/);
  });

  it('זורק שגיאה אם schemaVersion חסר', () => {
    const project = mkProject();
    const broken = { ...project } as Partial<Project>;
    delete broken.schemaVersion;
    expect(() => migrate(broken)).toThrow(/schemaVersion/);
  });

  it('זורק שגיאה אם schemaVersion הוא 0 או שלילי', () => {
    expect(() => migrate({ ...mkProject(), schemaVersion: 0 })).toThrow(/schemaVersion/);
    expect(() => migrate({ ...mkProject(), schemaVersion: -1 })).toThrow(/schemaVersion/);
  });

  it('זורק שגיאה אם schemaVersion לא מספר', () => {
    expect(() => migrate({ ...mkProject(), schemaVersion: 'foo' })).toThrow(/schemaVersion/);
  });

  it('זורק שגיאה על input שאינו אובייקט', () => {
    expect(() => migrate(null)).toThrow(/object/);
    expect(() => migrate('not json' as unknown)).toThrow(/object/);
    expect(() => migrate(42 as unknown)).toThrow(/object/);
  });
});

// ── Validation behavior ──────────────────────────────────────────────────────

describe('deserializeProject — validation', () => {
  it('זורק שגיאה ברורה על JSON פגום', () => {
    expect(() => deserializeProject('{ not valid }')).toThrow(/invalid JSON/);
    expect(() => deserializeProject('')).toThrow(/invalid JSON/);
  });

  it('זורק שגיאה אם cabinet חסר', () => {
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION });
    expect(() => deserializeProject(json)).toThrow(/cabinet/);
  });

  it('זורק שגיאה אם cabinet.input חסר', () => {
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cabinet: { state: emptyState() },
    });
    expect(() => deserializeProject(json)).toThrow(/input/);
  });

  it('זורק שגיאה אם cabinet.state חסר', () => {
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cabinet: { input: basicInput() },
    });
    expect(() => deserializeProject(json)).toThrow(/state/);
  });

  it('זורק שגיאה אם שדה ב-input חסר', () => {
    const input = basicInput() as Partial<CabinetInput>;
    delete input.W;
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cabinet: { input, state: emptyState() },
    });
    expect(() => deserializeProject(json)).toThrow(/W/);
  });

  it('זורק שגיאה אם type שגוי ב-input', () => {
    const input = { ...basicInput(), W: 'wide' as unknown as number };
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cabinet: { input, state: emptyState() },
    });
    expect(() => deserializeProject(json)).toThrow(/W.*number/);
  });

  it('זורק שגיאה אם doorsPerColumn מחוץ לטווח', () => {
    const input = { ...basicInput(), doorsPerColumn: 7 as unknown as 'auto' };
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cabinet: { input, state: emptyState() },
    });
    expect(() => deserializeProject(json)).toThrow(/doorsPerColumn/);
  });

  it('זורק שגיאה אם boolean שגוי ב-input', () => {
    const input = { ...basicInput(), hasShell: 'yes' as unknown as boolean };
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cabinet: { input, state: emptyState() },
    });
    expect(() => deserializeProject(json)).toThrow(/hasShell.*boolean/);
  });

  it('זורק שגיאה אם state.interior הוא array ולא object', () => {
    const state = { ...emptyState(), interior: [] as unknown as Record<string, never> };
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cabinet: { input: basicInput(), state },
    });
    expect(() => deserializeProject(json)).toThrow(/interior.*plain object/);
  });

  it('זורק שגיאה אם state חסר שדה', () => {
    const state = emptyState() as Partial<SavedCabinetState>;
    delete state.partitions;
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      cabinet: { input: basicInput(), state },
    });
    expect(() => deserializeProject(json)).toThrow(/partitions/);
  });

  it('עובר ב-deserialize של פרויקט תקין מלא', () => {
    const project = mkProject({
      projectName: 'בדיקה',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    const json = serializeProject(project);
    const back = deserializeProject(json);
    expect(back.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(back.projectName).toBe('בדיקה');
    expect(back.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });
});
