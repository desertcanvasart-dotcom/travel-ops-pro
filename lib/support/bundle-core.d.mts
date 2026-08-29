// Typed surface over bundle-core.mjs, mirroring scripts/migrate-core.d.mts.
// The implementation stays plain JS because scripts/doctor.mjs runs under bare
// node during an incident and cannot import .ts.

export const KNOWN_ENV_KEYS: readonly string[]
export const REQUIRED_ENV_KEYS: readonly string[]
export const STALE_AFTER_HOURS: number
export const REDACTION_NOTICE: readonly string[]

export interface EnvReport {
  set: string[]
  missing: string[]
  missingRequired: string[]
}

/** Which known variables are set. Never their values. */
export function reportEnv(env: Record<string, string | undefined>): EnvReport

/** Make one line of text safe to send. Errs toward over-redacting. */
export function redactText(input: unknown): string

/** The most recent lines, scrubbed, each capped in length. */
export function redactErrorLines(lines: readonly string[], limit?: number): string[]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildBundle(parts: any): any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bundleFindings(bundle: any): string[]

/** Redact values we hold, by value — shape-based rules cannot catch everything. */
export function redactKnownSecrets(input: unknown, env?: Record<string, string | undefined>): string

/** Is this version a release (YYYY.MM.DD), or just whatever main was? */
export function isReleaseVersion(v: unknown): boolean
