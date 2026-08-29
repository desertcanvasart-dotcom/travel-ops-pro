// .env.example is only useful if it is TRUE. A template that has drifted from
// the code is worse than none: it tells someone installing this to set
// variables that do nothing, and stays silent about the one that stops their
// scheduled jobs from ever running.
//
// So this test derives the answer from the source rather than trusting the
// file: every process.env read in the shipped application must appear in
// .env.example, and .env.example must not advertise anything the app ignores.
//
// Three variables were found set in production and read by NOTHING when this
// was written (DEFAULT_CURRENCY, MARKUP_PERCENTAGE, GMAIL_APP_PASSWORD). That
// is the drift this exists to prevent.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = process.cwd()

/** Source the running application is built from. */
const APP_DIRS = ['app', 'lib', 'components']
const APP_FILES = ['middleware.ts', 'instrumentation.ts']

/**
 * Read by the app but NOT configuration a person sets.
 *
 * Platform-injected values and build metadata belong to the host, and putting
 * them in a template invites someone to override them by hand.
 */
const NOT_CONFIGURATION = new Set([
  'NODE_ENV',
  'NEXT_RUNTIME',
  'RAILWAY_GIT_COMMIT_SHA',
  'RAILWAY_SERVICE_NAME',
  'GIT_SHA',
  'GITHUB_RUN_ID',
  // Applying migrations is an operator action with its own credential; it is
  // documented in docs/SELF-HOSTING.md and must NOT live in .env.local.
  'DATABASE_URL',
  // Development and CI tooling.
  'PRICING_DEBUG',
])

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (['.ts', '.tsx', '.mjs', '.js'].includes(extname(entry))) out.push(full)
    }
  }
  for (const d of APP_DIRS) walk(join(ROOT, d))
  for (const f of APP_FILES) out.push(join(ROOT, f))
  return out
}

/** Every process.env.X the shipped app reads. */
function envVarsUsedByApp(): Set<string> {
  const found = new Set<string>()
  for (const file of sourceFiles()) {
    const code = readFileSync(file, 'utf8')
    for (const m of code.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) found.add(m[1])
  }
  return found
}

/** Every KEY= declared in .env.example (commented-out lines do not count). */
function envVarsDocumented(): Set<string> {
  const text = readFileSync(join(ROOT, '.env.example'), 'utf8')
  const found = new Set<string>()
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/)
    if (m) found.add(m[1])
  }
  return found
}

describe('.env.example', () => {
  it('exists and declares a meaningful number of variables', () => {
    expect(envVarsDocumented().size).toBeGreaterThan(20)
  })

  it('documents every variable the application reads', () => {
    const documented = envVarsDocumented()
    const missing = [...envVarsUsedByApp()]
      .filter(v => !NOT_CONFIGURATION.has(v))
      .filter(v => !documented.has(v))
      .sort()
    expect(
      missing,
      `read by the app but absent from .env.example — someone installing this ` +
        `would never know to set them: ${missing.join(', ')}`,
    ).toEqual([])
  })

  it('does not advertise variables nothing reads', () => {
    const used = envVarsUsedByApp()
    const dead = [...envVarsDocumented()].filter(v => !used.has(v)).sort()
    expect(
      dead,
      `declared in .env.example but read by no source file — telling someone ` +
        `to set these wastes their time and hides real settings: ${dead.join(', ')}`,
    ).toEqual([])
  })

  it('never ships a filled-in secret', () => {
    // A template that carries a real key is a leaked key.
    const text = readFileSync(join(ROOT, '.env.example'), 'utf8')
    const suspicious = text
      .split('\n')
      .filter(l => /^(SUPABASE_SERVICE_ROLE_KEY|.*_SECRET|.*_KEY|.*_TOKEN|.*_SID)=/.test(l))
      .filter(l => {
        const value = l.slice(l.indexOf('=') + 1).trim()
        return value.length > 0
      })
    expect(suspicious, `these lines carry a value: ${suspicious.join(' | ')}`).toEqual([])
  })

  it('tells the reader CRON_IN_PROCESS is required off Railway', () => {
    // instrumentation.ts arms the scheduler only on Railway or when this is
    // explicitly "true". A self-hosted install that misses it gets no
    // exchange-rate refresh and no reminders, silently — the single most
    // consequential line in the file.
    const text = readFileSync(join(ROOT, '.env.example'), 'utf8')
    expect(text).toMatch(/^CRON_IN_PROCESS=true$/m)

    const instrumentation = readFileSync(join(ROOT, 'instrumentation.ts'), 'utf8')
    expect(instrumentation).toContain('CRON_IN_PROCESS')
    expect(instrumentation).toContain('RAILWAY_SERVICE_NAME')
  })
})
