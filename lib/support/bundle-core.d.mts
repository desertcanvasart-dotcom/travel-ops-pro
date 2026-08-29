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
