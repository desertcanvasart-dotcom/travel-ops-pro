// ============================================
// CONCIERGE WEBHOOK — HMAC-SHA256 SIGNATURE VERIFICATION
// ============================================
// Verifies inbound briefs from the Travel2Egypt AI Concierge.
//
// Scheme (see docs/concierge-autoura-webhook-spec.md §2):
//   - Signature header:  X-Autoura-Signature: t=<unix>,v1=<hexdigest>
//   - Companion header:  X-Autoura-Timestamp: <unix>   (must equal t)
//   - Signed content:    `${t}.${rawBody}`   (timestamp + "." + raw bytes)
//   - Algorithm:         HMAC-SHA256, lowercase hex
//   - Replay window:     |now - t| <= 300s
//   - Per-company:       CONCIERGE_WEBHOOK_SECRETS, JSON keyed by
//                        organizations.slug — {"ats":"<secret>",
//                        "travel2egypt":"<secret>"}. A value may be a list,
//                        current first, to rotate: {"ats":["<new>","<old>"]}.
//                        The secret that matched NAMES THE COMPANY the brief
//                        belongs to (result.orgSlug).
//   - Legacy single:     CONCIERGE_WEBHOOK_SECRET (current) and
//                        CONCIERGE_WEBHOOK_SECRET_PREVIOUS (rotation overlap)
//                        — still accepted; they name no company
//                        (orgSlug null), and the route files those briefs
//                        under the default organisation, as before.
//   A request is valid if it matches ANY configured secret. A per-company
//   secret wins over the legacy one if both are the same string; the same
//   secret under two companies is a misconfiguration and is refused
//   ('ambiguous_secret'), as is unparseable CONCIERGE_WEBHOOK_SECRETS
//   ('secret_config_invalid') — the brief must never land in a guessed
//   company.
// ============================================

import { createHmac, timingSafeEqual } from 'crypto'

export const SIGNATURE_HEADER = 'x-autoura-signature'
export const TIMESTAMP_HEADER = 'x-autoura-timestamp'
export const REQUEST_ID_HEADER = 'x-request-id'
export const DRY_RUN_HEADER = 'x-autoura-dry-run'

export const DEFAULT_TOLERANCE_SECONDS = 300

export type VerifyFailureCode =
  | 'missing_signature'
  | 'malformed_signature'
  | 'timestamp_mismatch'   // X-Autoura-Timestamp present but != t
  | 'timestamp_expired'    // outside tolerance window (replay protection)
  | 'no_secret_configured'
  | 'secret_config_invalid' // CONCIERGE_WEBHOOK_SECRETS is not the JSON documented above
  | 'ambiguous_secret'      // the signing secret is configured for two companies
  | 'signature_mismatch'

/**
 * One accepted secret. `orgSlug` is the company it belongs to
 * (organizations.slug), or null for the legacy single secret (→ the default
 * organisation). `label` is for logs and the dry-run answer — never the
 * secret itself.
 */
export interface ConciergeSecret {
  label: string
  secret: string
  orgSlug?: string | null
}

export type VerifyResult =
  | { ok: true; secretUsed: string; orgSlug: string | null; timestamp: number }
  | { ok: false; code: VerifyFailureCode; message: string }

/**
 * Compute the lowercase hex HMAC-SHA256 of `${timestamp}.${rawBody}`.
 * Exported so the dry-run tooling and the GET test-vector endpoint can
 * produce signatures the concierge can reproduce.
 */
export function signConciergePayload(
  secret: string,
  timestamp: number | string,
  rawBody: string
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
}

/** Build the full `t=<unix>,v1=<hex>` signature header value. */
export function buildSignatureHeader(
  secret: string,
  timestamp: number,
  rawBody: string
): string {
  return `t=${timestamp},v1=${signConciergePayload(secret, timestamp, rawBody)}`
}

/** Parse `t=...,v1=...` (tolerant of extra/future schemes like `v0=`). */
export function parseSignatureHeader(
  header: string | null | undefined
): { t?: string; v1?: string } | null {
  if (!header) return null
  const out: { t?: string; v1?: string } = {}
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') out.t = value
    else if (key === 'v1') out.v1 = value
  }
  if (out.t === undefined && out.v1 === undefined) return null
  return out
}

/** Constant-time hex comparison that never throws on length mismatch. */
function safeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Parse CONCIERGE_WEBHOOK_SECRETS: {"<org slug>": "<secret>" | ["<current>", "<previous>", …]}.
 * Returns an error (and no secrets) for anything else, so a typo fails closed
 * instead of silently dropping a company.
 */
export function parsePerOrgSecrets(raw: string | undefined): { secrets: ConciergeSecret[]; error: string | null } {
  if (!raw || !raw.trim()) return { secrets: [], error: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { secrets: [], error: 'CONCIERGE_WEBHOOK_SECRETS is not valid JSON.' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { secrets: [], error: 'CONCIERGE_WEBHOOK_SECRETS must be a JSON object keyed by organisation slug.' }
  }
  const out: ConciergeSecret[] = []
  for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
    const list = Array.isArray(value) ? value : [value]
    if (!slug.trim() || list.length === 0 || !list.every(v => typeof v === 'string' && v.length > 0)) {
      return { secrets: [], error: `CONCIERGE_WEBHOOK_SECRETS["${slug}"] must be a non-empty string or a list of them.` }
    }
    list.forEach((secret, i) => {
      out.push({ label: i === 0 ? `org:${slug.trim()}` : `org:${slug.trim()}:previous`, secret: secret as string, orgSlug: slug.trim() })
    })
  }
  return { secrets: out, error: null }
}

/** Every configured secret — per-company first, then the legacy pair — and any config error. */
export function readConfiguredSecrets(): { secrets: ConciergeSecret[]; error: string | null } {
  const perOrg = parsePerOrgSecrets(process.env.CONCIERGE_WEBHOOK_SECRETS)
  const out: ConciergeSecret[] = [...perOrg.secrets]
  const current = process.env.CONCIERGE_WEBHOOK_SECRET
  const previous = process.env.CONCIERGE_WEBHOOK_SECRET_PREVIOUS
  if (current) out.push({ label: 'current', secret: current, orgSlug: null })
  if (previous) out.push({ label: 'previous', secret: previous, orgSlug: null })
  return { secrets: out, error: perOrg.error }
}

/** The configured secrets, per-company first, then current, then previous. Empty if none set. */
export function getConfiguredSecrets(): ConciergeSecret[] {
  return readConfiguredSecrets().secrets
}

export interface VerifyParams {
  rawBody: string
  signatureHeader: string | null | undefined
  timestampHeader?: string | null | undefined
  secrets?: ConciergeSecret[]
  toleranceSeconds?: number
  /** unix seconds; injectable for tests. Defaults to current time. */
  nowSeconds?: number
}

export function verifyConciergeSignature(params: VerifyParams): VerifyResult {
  const {
    rawBody,
    signatureHeader,
    timestampHeader,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  } = params

  let secrets = params.secrets
  if (!secrets) {
    const configured = readConfiguredSecrets()
    if (configured.error) {
      return { ok: false, code: 'secret_config_invalid', message: configured.error }
    }
    secrets = configured.secrets
  }
  if (secrets.length === 0) {
    return { ok: false, code: 'no_secret_configured', message: 'No CONCIERGE_WEBHOOK_SECRETS or CONCIERGE_WEBHOOK_SECRET configured on the server.' }
  }

  const parsed = parseSignatureHeader(signatureHeader)
  if (!parsed) {
    return { ok: false, code: 'missing_signature', message: `Missing or empty ${SIGNATURE_HEADER} header.` }
  }
  if (!parsed.t || !parsed.v1) {
    return { ok: false, code: 'malformed_signature', message: `${SIGNATURE_HEADER} must contain both t=<unix> and v1=<hex>.` }
  }

  const t = Number(parsed.t)
  if (!Number.isFinite(t) || !Number.isInteger(t)) {
    return { ok: false, code: 'malformed_signature', message: 'Signature timestamp (t) is not a valid unix integer.' }
  }

  // Companion header must agree with t if provided.
  if (timestampHeader != null && timestampHeader !== '' && timestampHeader !== parsed.t) {
    return { ok: false, code: 'timestamp_mismatch', message: `${TIMESTAMP_HEADER} does not match the t value inside ${SIGNATURE_HEADER}.` }
  }

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - t) > toleranceSeconds) {
    return { ok: false, code: 'timestamp_expired', message: `Timestamp outside the ${toleranceSeconds}s tolerance window (replay protection).` }
  }

  // Every secret is checked (not first-match): which company the brief is
  // decided by the secret, so two companies sharing one must be caught.
  const matched = secrets.filter(({ secret }) => safeHexEqual(signConciergePayload(secret, parsed.t!, rawBody), parsed.v1!))
  if (matched.length > 0) {
    const perOrg = matched.filter(m => m.orgSlug)
    const slugs = [...new Set(perOrg.map(m => m.orgSlug as string))]
    if (slugs.length > 1) {
      return { ok: false, code: 'ambiguous_secret', message: `The signing secret is configured for more than one organisation (${slugs.join(', ')}).` }
    }
    const used = perOrg[0] ?? matched[0]
    return { ok: true, secretUsed: used.label, orgSlug: used.orgSlug ?? null, timestamp: t }
  }

  return { ok: false, code: 'signature_mismatch', message: 'Signature does not match any configured secret.' }
}
