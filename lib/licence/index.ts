// ============================================
// The licence — typed surface + the boot singleton
// ============================================
// T6 (P1) of docs/plans/self-hosting.md. Re-exports lib/licence/verify-core.mjs
// (plain JS, shared with scripts/doctor.mjs and scripts/mint-licence.mjs) and
// holds the ONE verification the running app does: LICENSE_KEY is read and
// verified once at boot (instrumentation.ts), cached for the life of the
// process, and every surface — the Settings card, /api/licence, later the
// banner and the heartbeat — reads that cached result.
//
// Nothing here can stop the app from serving. A missing or bad licence is a
// status, shown; enforcement is by degradation and by what Autoura's own
// services refuse to serve (updates, P4).

export {
  LICENCE_FORMAT,
  LICENCE_STATUSES,
  PAYLOAD_FIELDS,
  licenceSummary,
  mintLicence,
  parseLicence,
  payloadProblem,
  verifyLicence,
} from './verify-core.mjs'
export type { LicencePayload, LicenceResult, LicenceStatus } from './verify-core.mjs'

import { licenceSummary as summary, verifyLicence as verify, type LicenceResult } from './verify-core.mjs'

let cached: LicenceResult | null = null

/** The install's licence, verified once per process from LICENSE_KEY. */
export function getLicence(): LicenceResult {
  if (!cached) cached = verify(process.env.LICENSE_KEY)
  return cached
}

/** Forget the cached result — tests, and a future "re-read the key" action. */
export function resetLicenceCache(): void {
  cached = null
}

/** One log line at server start. Runs whether or not the scheduler is
 *  armed: an install always knows what it is licensed as. */
export function logLicenceAtBoot(): LicenceResult {
  const result = getLicence()
  console.log(`[licence] ${summary(result)}`)
  return result
}

/** Whether the licence is one operations may rely on without a warning:
 *  valid, or inside grace. */
export function licenceIsCurrent(result: LicenceResult = getLicence()): boolean {
  return result.status === 'valid' || result.status === 'grace'
}
