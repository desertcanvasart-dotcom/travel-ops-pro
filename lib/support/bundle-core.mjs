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

/**
 * Redact values we actually hold, by value.
 *
 * The pattern rules above catch things that LOOK like secrets. This catches
 * things we KNOW are secrets because they are sitting in our own environment,
 * whatever shape they happen to be.
 *
 * Added after a test caught a real gap: a 17-character password embedded in an
 * error message matched none of the patterns — not a JWT, not vendor-prefixed,
 * not an email or UUID, and under the 40-character catch-all — and travelled
 * into the bundle intact. Shape-based redaction cannot close that on its own.
 *
 * Values shorter than 8 characters are skipped: `PORT=3000` would otherwise
 * redact every "3000" in a log, which destroys the diagnosis to protect
 * nothing.
 */
export function redactKnownSecrets(input, env) {
  let text = typeof input === 'string' ? input : String(input ?? '')
  if (!env) return text
  for (const key of KNOWN_ENV_KEYS) {
    const value = env[key]
    if (typeof value !== 'string' || value.trim().length < 8) continue
    text = text.split(value).join(`[redacted:${key}]`)
  }
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
// Releases
// ============================================

/**
 * Is this version a release, or just whatever main happened to be?
 *
 * T5 gives releases the form YYYY.MM.DD (with -2, -3 … for a second cut the
 * same day). Anything else — a semver left over from scaffolding, or an empty
 * string — means this build was not cut as a release, and support is offered
 * against tags. Defined here so the release script, /api/version and the
 * support bundle cannot disagree about what counts.
 */
export function isReleaseVersion(v) {
  return /^\d{4}\.\d{2}\.\d{2}(-\d+)?$/.test(String(v ?? ''))
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

// ============================================
// The bundle
// ============================================

/** Assemble the bundle. The only way one is built — so the redaction cannot be
 *  skipped by a caller assembling the object itself. */
export function buildBundle(parts) {
  return {
    generatedAt: parts.generatedAt,
    app: {
      version: parts.version,
      sha: parts.sha,
      node: parts.node,
      uptimeSeconds: parts.uptimeSeconds ?? null,
    },
    database: {
      ...parts.database,
      // Both passes: patterns first, then anything we hold the value of.
      ...(parts.database.error
        ? { error: redactText(redactKnownSecrets(parts.database.error, parts.env)) }
        : {}),
      ...(parts.database.notChecked
        ? { notChecked: redactText(redactKnownSecrets(parts.database.notChecked, parts.env)) }
        : {}),
    },
    env: reportEnv(parts.env),
    integrations: parts.integrations ?? {},
    crons: parts.crons ?? [],
    counts: parts.counts ?? {},
    recentErrors: redactErrorLines((parts.errors ?? []).map(l => redactKnownSecrets(l, parts.env))),
    redaction: REDACTION_NOTICE,
  }
}

/**
 * The one-screen summary: what is wrong, in the order it should be read.
 *
 * Exists so nobody has to interpret JSON during an incident — the customer can
 * often fix it themselves from this, which is the whole point.
 */
export function bundleFindings(bundle) {
  const findings = []

  if (bundle.env.missingRequired.length) {
    findings.push(
      `Required environment variables are missing: ${bundle.env.missingRequired.join(', ')}. The app cannot work without them.`
    )
  }
  if (bundle.database.notChecked) {
    findings.push(`Not checked: ${bundle.database.notChecked}. This is a limit of how the check was run, not a fault in the install.`)
  } else if (!bundle.database.reachable) {
    findings.push(
      `The database is not reachable${bundle.database.error ? ` (${bundle.database.error})` : ''}. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and that the project is running.`
    )
  }
  const pending = bundle.database.migrationsPending
  if (pending && pending.length) {
    findings.push(
      `${pending.length} migration${pending.length === 1 ? '' : 's'} not applied, starting with ${pending[0]}. Run: DATABASE_URL=… npm run migrate`
    )
  }
  for (const [name, state] of Object.entries(bundle.integrations)) {
    if (state === 'failed') findings.push(`${name} is configured but not responding.`)
  }

  // This product schedules its own jobs in-process, so "nothing has ever run"
  // usually means one specific thing, and it is worth naming rather than
  // sending somebody to read a document.
  const neverRun = bundle.crons.filter(c => c.lastRun === null).map(c => c.name)
  const scheduledHere = bundle.crons.filter(c => c.scheduledInProcess)
  const neverRunScheduled = scheduledHere.filter(c => c.lastRun === null)

  if (scheduledHere.length > 0 && neverRunScheduled.length === scheduledHere.length) {
    findings.push(
      'No scheduled job has ever run here. This app schedules its own jobs in-process, and the scheduler only arms itself when CRON_IN_PROCESS=true (or on Railway). Set it. Until then the retention purge never destroys expired passport scans, and reports quietly drift.'
    )
  } else if (neverRun.length) {
    const external = neverRun.filter(n => !scheduledHere.some(c => c.name === n))
    if (neverRunScheduled.length) {
      findings.push(
        `These in-process jobs have never run: ${neverRunScheduled.map(c => c.name).join(', ')}.`
      )
    }
    if (external.length) {
      findings.push(
        `These jobs have never run and NOTHING IN THIS APP SCHEDULES THEM: ${external.join(', ')}. They need an external caller hitting /api/cron/* with CRON_SECRET — see "Scheduled jobs" in docs/SELF-HOSTING.md.`
      )
    }
  }

  for (const cron of bundle.crons) {
    if (!cron.lastRun) continue
    const age = Date.now() - Date.parse(cron.lastRun)
    if (Number.isFinite(age) && age > STALE_AFTER_HOURS * 3600000) {
      findings.push(
        `The "${cron.name}" job last ran ${Math.floor(age / 3600000)} hours ago and should run at least daily. Its schedule has probably stopped.`
      )
    }
    if (cron.lastOutcome === 'failed') findings.push(`The "${cron.name}" job's last run FAILED.`)
    if (cron.lastOutcome === 'unfinished') {
      findings.push(
        `The "${cron.name}" job started and never reported back — the process was probably killed mid-run.`
      )
    }
  }
  if (!isReleaseVersion(bundle.app.version)) {
    findings.push(
      `This build was not cut as a release (version "${bundle.app.version}"). Support is offered against tags — see docs/SELF-HOSTING.md. The commit is ${bundle.app.sha}.`
    )
  }
  if (bundle.app.sha === 'unknown') {
    findings.push(
      'The running commit is unknown — no GIT_SHA or RAILWAY_GIT_COMMIT_SHA was available, so we cannot tell which version this is.'
    )
  }

  if (!findings.length) findings.push('No problems found by these checks.')
  return findings
}

