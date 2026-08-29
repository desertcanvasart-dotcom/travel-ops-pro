// ============================================
// The support bundle — RUNTIME CORE
// ============================================
// T4 of docs/plans/self-hosting.md. Ported from autoura-saas
// lib/support/bundle-core.mjs. The REDACTION RULES BELOW ARE UNCHANGED from
// that file, deliberately: they are the load-bearing part, they have tests,
// and two products quietly diverging on what counts as a secret is how one of
// them starts leaking. Fix a rule in both or neither.
//
// Plain JavaScript on purpose, mirroring scripts/migrate-core.mjs: the same
// logic has to run inside the Next app (TypeScript) AND inside
// scripts/doctor.mjs, which is a bare node script that cannot import .ts.
//
// EVERYTHING HERE IS PURE, because a bundle that leaks is worse than no
// bundle. What a customer hands over must be decidable from these functions
// alone, and provable by tests.
//
// THREE RULES, and every field obeys them:
//
//   NAMES, NOT VALUES.   Environment variables are reported as set or missing.
//                        No value ever leaves the server, not even a prefix —
//                        "sk_live_51H..." is enough to identify an account.
//   COUNTS, NOT ROWS.    How many bookings, never whose. No client names, no
//                        emails, no passport anything.
//   SCRUBBED, NOT RAW.   Error lines go through redactText, which removes
//                        anything shaped like an address, a key or an id.
//
// And the allow-list is OURS. A customer's own environment variable — their
// internal API keys, their hostnames — is never reported at all, not even by
// name, because we did not ask them to have it and it is not ours to see.

/**
 * Environment variables this product knows about, by name.
 *
 * Kept in step with .env.example by __tests__/env-example-sync.test.ts, which
 * is the same list the install procedure hands a customer. Two allow-lists
 * would drift, and the one that drifts silently is this one.
 */
export const KNOWN_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'BUSINESS_EMAIL',
  'BUSINESS_NAME',
  'BUSINESS_WEBSITE',
  'BUSINESS_WHATSAPP',
  'CONCIERGE_WEBHOOK_SECRET',
  'CONCIERGE_WEBHOOK_SECRET_PREVIOUS',
  'CRON_IN_PROCESS',
  'CRON_SECRET',
  'DATABASE_URL',
  'DEFAULT_ORG_ID',
  'ENABLE_WHATSAPP_AUTO_SEND',
  'ENABLE_WHATSAPP_STATUS_UPDATES',
  'ENCRYPTION_KEY',
  'EXCHANGE_RATE_API_KEY',
  'GMAIL_USER',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'OAUTH_STATE_SECRET',
  'OPENAI_API_KEY',
  'PORT',
  'PORTAL_VERIFY_SECRET',
  'QUICKBOOKS_CLIENT_ID',
  'QUICKBOOKS_CLIENT_SECRET',
  'QUICKBOOKS_ENVIRONMENT',
  'QUICKBOOKS_REDIRECT_URI',
  'REVIEW_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY',
  'TWILIO_API_SECRET',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM',
  'TWILIO_WHATSAPP_NUMBER',
  'XERO_CLIENT_ID',
  'XERO_CLIENT_SECRET',
  'XERO_REDIRECT_URI',
]

/** The ones without which the app does not work at all. */
export const REQUIRED_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

/**
 * Which known variables are set. NEVER their values.
 *
 * A variable present but empty counts as missing: `CRON_SECRET=` in a .env
 * file is a variable somebody meant to fill in.
 */
export function reportEnv(env) {
  const set = []
  const missing = []
  for (const key of KNOWN_ENV_KEYS) {
    const value = env[key]
    if (typeof value === 'string' && value.trim() !== '') set.push(key)
    else missing.push(key)
  }
  return {
    set,
    missing,
    missingRequired: REQUIRED_ENV_KEYS.filter(k => missing.includes(k)),
  }
}

// ============================================
// Scrubbing
// ============================================
// Ordered widest-first: a JWT contains base64 that would otherwise be caught by
// a narrower rule and half-redacted, which is worse than not redacting it at
// all because it looks safe.

const REDACTIONS = [
  // JSON Web Tokens — Supabase anon and service-role keys are both JWTs.
  [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, '[jwt]'],
  // Postgres / URL credentials: scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi, '$1://[credentials]@'],
  // Vendor-prefixed keys: sk_live_…, rk_…, whsec_…, sk-ant-…, SG.…, xoxb-…
  [/\b(?:sk|pk|rk|whsec|sk-ant|SG|xox[baprs])[-_][A-Za-z0-9_-]{8,}/g, '[key]'],
  // Authorization headers, however they are spelled. The scheme word is part
  // of what gets eaten: "Authorization: Bearer abc" must not redact "Bearer"
  // and leave "abc" standing, which is what a single \S+ did.
  [/\b(authorization|api[-_]?key|apikey|token|bearer|basic)\b\s*[:=]?\s*(?:(?:bearer|basic)\s+)?\S+/gi, '$1 [redacted]'],
  // Email addresses — a customer's travellers are in these logs.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]'],
  // UUIDs identify a person as surely as their name does.
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
  // Anything long and secret-shaped that the rules above did not name.
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]'],
  // Passport-ish: two letters and six or more digits, run together.
  [/\b[A-Z]{1,2}\d{6,9}\b/g, '[document-number]'],
]

/**
 * Make one line of text safe to send.
 *
 * Applied to every error line and every free-text field in the bundle. It errs
 * toward over-redacting: an over-redacted log still tells us WHICH error
 * happened and where, which is almost always the part we need.
 */
export function redactText(input) {
  let text = typeof input === 'string' ? input : String(input ?? '')
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement)
  return text
}

/** Keep the most recent lines, scrubbed, and cap the length of each — a stack
 *  trace with a rendered payload in it can run to megabytes. */
export function redactErrorLines(lines, limit = 20) {
  return lines
    .slice(-limit)
    .map(line => redactText(line))
    .map(line => (line.length > 400 ? `${line.slice(0, 400)}…` : line))
}

// ============================================
// Findings
// ============================================

/** How long after a job's last run we start calling it stale. Every scheduled
 *  job in this product is daily or more frequent, so two days of silence is a
 *  scheduler that stopped — the failure mode that makes reports quietly wrong
 *  rather than making them error. Lives here, with the finding that uses it, so
 *  the number and the message cannot drift apart. */
export const STALE_AFTER_HOURS = 48

export const REDACTION_NOTICE = [
  'Environment variables appear by NAME only — no value, not even a prefix.',
  'Table figures are COUNTS only — no names, emails, passports or any row content.',
  'Error lines are scrubbed of addresses, keys, tokens, ids and document numbers.',
  'Only variables this product defines are listed; your own are not reported at all.',
  'HOSTNAMES CAN APPEAR. A failure like "ENOTFOUND db.internal" keeps the host, because which host failed is the useful half of the message. Nothing else about your infrastructure is collected.',
]
