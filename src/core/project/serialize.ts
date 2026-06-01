import type { Cabinet, CabinetInput, ProductUnit, Project, SavedCabinetState } from '../../types';
import type { ProductType } from '../../types/project';
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations';

// ── Required field manifests ─────────────────────────────────────────────────

/** Keys that must be present on `cabinet.input`. `lowerDoorH` and
 *  `middleDoorH` are excluded because they are typed `number | undefined`
 *  and `JSON.stringify` drops undefined-valued properties — round-tripping
 *  through JSON would otherwise lose them. Their type is enforced
 *  separately as "number or undefined" in {@link validateInput}. */
const REQUIRED_INPUT_KEYS: ReadonlyArray<keyof CabinetInput> = [
  'W',
  'H',
  'D',
  'backThickness',
  'hasShell',
  'hasEnvelopeTop',
  'bodyMaterialId',
  'frontMaterialId',
  'plinth',
  'plinthRecess',
  'doorCoversPlinth',
  'doorsPerColumn',
  'doorGapMm',
  'maxDoorWidth',
];

const REQUIRED_STATE_KEYS: ReadonlyArray<keyof SavedCabinetState> = [
  'interior',
  'cellInterior',
  'partitions',
  'doors',
  'plinthGableOverrides',
  'boardOverrides',
];

const VALID_PRODUCT_TYPES = new Set<ProductType>([
  'wardrobe', 'bookcase', 'sideboard', 'kitchen', 'free-build',
]);

// ── Serialize ────────────────────────────────────────────────────────────────

/** Serializes a project to a JSON string. Always refreshes `updatedAt` to
 *  the current moment; on the FIRST save (when `createdAt` is missing),
 *  assigns it to the same moment. `schemaVersion` is preserved if present
 *  and defaulted to `CURRENT_SCHEMA_VERSION` otherwise. Pure — does not
 *  mutate the input project. */
export function serializeProject(project: Project): string {
  const now = new Date().toISOString();
  const stamped: Project = {
    ...project,
    schemaVersion: project.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    createdAt: project.createdAt ?? now,
    updatedAt: now,
  };
  return JSON.stringify(stamped);
}

// ── Deserialize ──────────────────────────────────────────────────────────────

/** Parses a project from a JSON string, runs migrations to bring it up to
 *  {@link CURRENT_SCHEMA_VERSION}, and validates the structure. Throws a
 *  descriptive `Error` if JSON is malformed, the schema is missing/invalid,
 *  or any required field is missing or of the wrong type.
 *
 *  Note: hinge `id` values are NOT round-tripped (they aren't saved). Any
 *  consumer that materializes saved doors back into runtime `Door` objects
 *  must assign fresh hinge ids via `newItemId()`. */
export function deserializeProject(json: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`deserializeProject: invalid JSON — ${detail}`);
  }
  const migrated = migrate(parsed);
  validateProject(migrated);
  return migrated;
}

// ── Validation helpers ───────────────────────────────────────────────────────

function validateProject(p: Project): void {
  if (p.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `deserializeProject: post-migration schemaVersion ${String(p.schemaVersion)} ≠ ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  if (typeof p.projectName !== 'string') {
    throw new Error('deserializeProject: projectName must be a string');
  }
  if (!Array.isArray(p.products)) {
    throw new Error('deserializeProject: products must be an array');
  }
  p.products.forEach((pu, i) => validateProductUnit(pu as ProductUnit, i));
  if (p.createdAt !== undefined && typeof p.createdAt !== 'string') {
    throw new Error('deserializeProject: createdAt must be an ISO 8601 string');
  }
  if (p.updatedAt !== undefined && typeof p.updatedAt !== 'string') {
    throw new Error('deserializeProject: updatedAt must be an ISO 8601 string');
  }
}

function validateProductUnit(pu: ProductUnit, index: number): void {
  const path = `products[${index}]`;
  if (typeof pu.id !== 'string' || pu.id === '') {
    throw new Error(`deserializeProject: ${path}.id must be a non-empty string`);
  }
  if (typeof pu.name !== 'string') {
    throw new Error(`deserializeProject: ${path}.name must be a string`);
  }
  if (!VALID_PRODUCT_TYPES.has(pu.productType)) {
    throw new Error(
      `deserializeProject: ${path}.productType must be one of ${[...VALID_PRODUCT_TYPES].join('|')}, got ${String(pu.productType)}`,
    );
  }
  if (pu.cabinet === null || typeof pu.cabinet !== 'object') {
    throw new Error(`deserializeProject: ${path}.cabinet missing or not an object`);
  }
  validateCabinet(pu.cabinet, path);
}

function validateCabinet(c: Cabinet, path: string): void {
  if (c.input === null || typeof c.input !== 'object') {
    throw new Error(`deserializeProject: ${path}.cabinet.input missing or not an object`);
  }
  validateInput(c.input, path);
  if (c.state === null || typeof c.state !== 'object') {
    throw new Error(`deserializeProject: ${path}.cabinet.state missing or not an object`);
  }
  validateState(c.state, path);
}

function validateInput(input: CabinetInput, path: string): void {
  for (const key of REQUIRED_INPUT_KEYS) {
    if (!(key in input)) {
      throw new Error(`deserializeProject: ${path}.cabinet.input missing required field "${key}"`);
    }
  }
  const inputRecord = input as unknown as Record<string, unknown>;
  const must = (key: keyof CabinetInput, type: 'number' | 'string' | 'boolean'): void => {
    const v = inputRecord[key as string];
    if (typeof v !== type) {
      throw new Error(`deserializeProject: ${path}.cabinet.input.${String(key)} must be ${type}`);
    }
  };
  must('W', 'number');
  must('H', 'number');
  must('D', 'number');
  must('backThickness', 'number');
  must('plinth', 'number');
  must('plinthRecess', 'number');
  must('doorGapMm', 'number');
  must('maxDoorWidth', 'number');
  must('hasShell', 'boolean');
  must('hasEnvelopeTop', 'boolean');
  must('doorCoversPlinth', 'boolean');
  must('bodyMaterialId', 'string');
  must('frontMaterialId', 'string');
  const dpc = input.doorsPerColumn;
  if (dpc !== 'auto' && dpc !== 1 && dpc !== 2 && dpc !== 3) {
    throw new Error(
      `deserializeProject: ${path}.cabinet.input.doorsPerColumn must be 'auto'|1|2|3, got ${String(dpc)}`,
    );
  }
  if (input.lowerDoorH !== undefined && typeof input.lowerDoorH !== 'number') {
    throw new Error(`deserializeProject: ${path}.cabinet.input.lowerDoorH must be number or undefined`);
  }
  if (input.middleDoorH !== undefined && typeof input.middleDoorH !== 'number') {
    throw new Error(`deserializeProject: ${path}.cabinet.input.middleDoorH must be number or undefined`);
  }
  if (input.edging !== undefined) {
    validateEdging(input.edging, `${path}.cabinet.input.edging`);
  }
}

function validateState(state: SavedCabinetState, path: string): void {
  const stateRecord = state as unknown as Record<string, unknown>;
  for (const key of REQUIRED_STATE_KEYS) {
    if (!(key in state)) {
      throw new Error(`deserializeProject: ${path}.cabinet.state missing required field "${key}"`);
    }
    const value = stateRecord[key as string];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(
        `deserializeProject: ${path}.cabinet.state.${String(key)} must be a plain object (Record)`,
      );
    }
  }
  if (state.bodyEdgingOverrides !== undefined) {
    if (
      state.bodyEdgingOverrides === null ||
      typeof state.bodyEdgingOverrides !== 'object' ||
      Array.isArray(state.bodyEdgingOverrides)
    ) {
      throw new Error(`deserializeProject: ${path}.cabinet.state.bodyEdgingOverrides must be a plain object (Record)`);
    }
    for (const [k, v] of Object.entries(state.bodyEdgingOverrides)) {
      validateEdging(v, `${path}.cabinet.state.bodyEdgingOverrides[${k}]`);
    }
  }
  if (state.doorEdgingOverrides !== undefined) {
    if (
      state.doorEdgingOverrides === null ||
      typeof state.doorEdgingOverrides !== 'object' ||
      Array.isArray(state.doorEdgingOverrides)
    ) {
      throw new Error(`deserializeProject: ${path}.cabinet.state.doorEdgingOverrides must be a plain object (Record)`);
    }
    for (const [k, v] of Object.entries(state.doorEdgingOverrides)) {
      validateEdging(v, `${path}.cabinet.state.doorEdgingOverrides[${k}]`);
    }
  }
}

/** Validates an {@link Edging} value carried by an optional field. */
function validateEdging(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`deserializeProject: ${path} must be a plain object`);
  }
  const thickness = (value as { thickness?: unknown }).thickness;
  if (thickness !== 0.6 && thickness !== 1.3) {
    throw new Error(`deserializeProject: ${path}.thickness must be 0.6 or 1.3, got ${String(thickness)}`);
  }
  const finish = (value as { finishMaterialId?: unknown }).finishMaterialId;
  if (finish !== undefined && typeof finish !== 'string') {
    throw new Error(`deserializeProject: ${path}.finishMaterialId must be a string or undefined`);
  }
}
