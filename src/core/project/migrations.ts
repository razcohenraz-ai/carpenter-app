import type { Project } from '../../types';

/** The `schemaVersion` that the current code emits and expects. Bump when
 *  the {@link Project} shape changes in an incompatible way, and add a
 *  corresponding migration to {@link migrations} that converts the previous
 *  version to the new one. */
export const CURRENT_SCHEMA_VERSION = 2;

/** Migration from version `n` to `n + 1`. Input is typed `unknown` because
 *  by definition it is in the OLD shape; each migration is responsible for
 *  validating just enough of its input to perform its single-step
 *  transformation. Multi-version upgrades are composed by running
 *  migrations in order. */
export type Migration = (data: unknown) => unknown;

/** v1 → v2: Project changed from a single `cabinet` to a `products` array.
 *  Wraps the lone cabinet in a ProductUnit with type 'wardrobe'. */
const migrateV1toV2: Migration = (data: unknown): unknown => {
  const d = data as {
    schemaVersion: number;
    projectName?: string;
    createdAt?: string;
    updatedAt?: string;
    cabinet: unknown;
  };
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 11);
  return {
    schemaVersion: 2,
    projectName: d.projectName ?? 'פרויקט',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    products: [
      {
        id,
        name: d.projectName ?? 'ארון',
        productType: 'wardrobe',
        cabinet: d.cabinet,
      },
    ],
  };
};

/** Registry of upgrade migrations. Keyed by SOURCE version (the version of
 *  the data passed in). Add an entry here when bumping
 *  {@link CURRENT_SCHEMA_VERSION}. */
export const migrations: Readonly<Record<number, Migration>> = {
  1: migrateV1toV2,
};

/** Upgrades `data` (with a numeric `schemaVersion` field) to
 *  {@link CURRENT_SCHEMA_VERSION} by running each registered migration in
 *  order. Throws if the data is from a FUTURE version (the running code is
 *  older than the file) or if a migration step is missing. The returned
 *  value is cast to {@link Project}; structural validation belongs to the
 *  deserialization layer. */
export function migrate(data: unknown): Project {
  if (data === null || typeof data !== 'object') {
    throw new Error('migrate: input must be a non-null object');
  }
  const version = (data as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error(
      `migrate: invalid schemaVersion ${String(version)} — expected a positive integer`,
    );
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `migrate: project's schemaVersion ${version} is newer than ` +
        `CURRENT_SCHEMA_VERSION ${CURRENT_SCHEMA_VERSION}. Update the app to a ` +
        `newer version, or open this project in the version that created it.`,
    );
  }
  let current: unknown = data;
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v];
    if (!step) {
      throw new Error(`migrate: missing migration from version ${v} to ${v + 1}`);
    }
    current = step(current);
  }
  return current as Project;
}
