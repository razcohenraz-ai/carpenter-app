import type { RunnerCatalog, RunnerSpec } from '../types/runners';
import rawRunners from './runners.json';

// Drawer-runner systems loaded from runners.json.
// To add a system or adjust a spec — edit the JSON only, not this file.
export const RUNNERS: RunnerCatalog = rawRunners as RunnerCatalog;

export function getRunner(id: string): RunnerSpec | undefined {
  return RUNNERS[id];
}

/** All runner ids in catalog order — for the Settings curation list + picker. */
export function runnerIds(): string[] {
  return Object.keys(RUNNERS);
}
