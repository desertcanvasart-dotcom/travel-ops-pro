// Typed surface over migrate-core.mjs.
//
// The implementation stays plain JS because scripts/migrate.mjs runs under bare
// node during an install or an upgrade — there is no build step at that moment,
// and a runner that needs one is a runner that cannot fix a broken deploy.
// This file is what lets the vitest suite type-check against it.

/** A client is anything that speaks Postgres: pg.Client, or PGlite in tests. */
export interface MigrationClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

export interface MigrationFile {
  name: string
  sql: string
}

export interface RunResult {
  applied: string[]
  pending: string[]
  failed?: { name: string; error: Error }
}

export interface RunOptions {
  dryRun?: boolean
  baseline?: boolean
  log?: (line: string) => void
}

export type DatabaseVerdict = 'ours' | 'sibling' | 'empty'

export interface DatabaseIdentity {
  verdict: DatabaseVerdict
  detail: string
}

export function normalizeName(name: string): string

/** Throws if any file lacks a `YYYYMMDD_` prefix, naming every offender. */
export function assertOrderable(fileNames: string[]): void

export function computePending(fileNames: string[], appliedNames: string[]): string[]

export const TRACKER_BOOTSTRAP: string

/** `create: false` never creates the tracker; returns null when there is none. */
export function loadApplied(
  client: MigrationClient,
  options?: { create?: boolean },
): Promise<string[] | null>

export function checkTarget(
  identity: DatabaseIdentity,
  options?: { baseline?: boolean },
): { ok: true } | { ok: false; reason: string }

export function identifyDatabase(client: MigrationClient): Promise<DatabaseIdentity>

export function runPending(
  client: MigrationClient,
  files: MigrationFile[],
  options?: RunOptions,
): Promise<RunResult>
