import type { Project } from '../../types';

/** The `schemaVersion` that the current code emits and expects. Bump when
 *  the {@link Project} shape changes in an incompatible way, and add a
 *  corresponding migration to {@link migrations} that converts the previous
 *  version to the new one. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Migration from version `n` to `n + 1`. Input is typed `unknown` because
 *  by definition it is in the OLD shape; each migration is responsible for
 *  validating just enough of its input to perform its single-step
 *  transformation. Multi-version upgrades are composed by running
 *  migrations in order. */
export type Migration = (data: unknown) => unknown;

/** Registry of upgrade migrations. Keyed by SOURCE version (the version of
 *  the data passed in). Add an entry here when bumping
 *  {@link CURRENT_SCHEMA_VERSION}. Currently empty because we are at the
 *  baseline (version 1). */
export const migrations: Readonly<Record<number, Migration>> = {};

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
