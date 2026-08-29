// ============================================
// The support bundle — typed surface
// ============================================
// T4 of docs/plans/self-hosting.md. Re-exports lib/support/bundle-core.mjs,
// which is plain JS so scripts/doctor.mjs (a bare node script that cannot
// import .ts) and the Next app can share one implementation of the redaction.
// Two copies of a redaction rule is how one of them stops matching.

export {
  KNOWN_ENV_KEYS,
  REQUIRED_ENV_KEYS,
  REDACTION_NOTICE,
  STALE_AFTER_HOURS,
  buildBundle,
  bundleFindings,
  isReleaseVersion,
  redactErrorLines,
  redactKnownSecrets,
  redactText,
  reportEnv,
} from './bundle-core.mjs'

export interface SupportBundle {
  generatedAt: string
  app: { version: string; sha: string; node: string; uptimeSeconds: number | null }
  database: {
    reachable: boolean
    latencyMs: number | null
    migrationsApplied: number | null
    /** Null means "not measured here" — the app has no migration files in a
     *  built image. scripts/doctor.mjs measures it; findings skip it rather
     *  than guessing. */
    migrationsPending: string[] | null
    error?: string
  }
  env: { set: string[]; missing: string[]; missingRequired: string[] }
  integrations: Record<string, 'ok' | 'failed' | 'configured' | 'unconfigured'>
  crons: Array<{
    name: string
    lastRun: string | null
    lastOutcome: string | null
    scheduledInProcess: boolean
  }>
  counts: Record<string, number>
  recentErrors: string[]
  redaction: readonly string[]
}
