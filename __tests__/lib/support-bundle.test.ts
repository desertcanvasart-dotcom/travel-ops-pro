// T4b: the bundle a customer sends us, and the probe their monitoring watches.
//
// The test that matters most is the last one: build a bundle in an environment
// where every variable holds a real-shaped secret, then assert none of those
// values appears anywhere in the output. A bundle that leaks is worse than no
// bundle, and "we were careful" is not a check.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KNOWN_ENV_KEYS, buildBundle, bundleFindings } from '@/lib/support/bundle'
import { integrationState, integrationStates } from '@/lib/support/collect'
import { bearerMatches } from '@/lib/support/probe-auth'

const baseParts = {
  generatedAt: '2026-08-29T12:00:00Z',
  version: '2026.08.29', // a release — see the not-a-release case below
  sha: 'abc123',
  node: 'v20.20.2',
  uptimeSeconds: 100,
  database: { reachable: true, latencyMs: 12, migrationsApplied: 127, migrationsPending: [] },
  env: {} as unknown as NodeJS.ProcessEnv,
  integrations: {},
  crons: [],
  counts: {},
  errors: [],
}

describe('bundleFindings', () => {
  it('says so plainly when nothing is wrong', () => {
    const b = buildBundle({ ...baseParts, env: { NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y', SUPABASE_SERVICE_ROLE_KEY: 'z' } })
    expect(bundleFindings(b)).toEqual(['No problems found by these checks.'])
  })

  it('says a build was not cut as a release, and gives the commit instead', () => {
    // Support is offered against tags, so "which version is this?" must have a
    // real answer or an explicit admission that it does not.
    const b = buildBundle({
      ...baseParts,
      version: '0.1.1',
      env: { NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y', SUPABASE_SERVICE_ROLE_KEY: 'z' },
    })
    const text = bundleFindings(b).join('\n')
    expect(text).toMatch(/not cut as a release/)
    expect(text).toMatch(/abc123/) // the sha, which is what identifies it instead
  })

  it('names missing required variables first — it is the likeliest cause', () => {
    const b = buildBundle({ ...baseParts, env: {} })
    expect(bundleFindings(b)[0]).toMatch(/Required environment variables are missing/)
  })

  it('gives the command that applies pending migrations', () => {
    const b = buildBundle({
      ...baseParts,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y', SUPABASE_SERVICE_ROLE_KEY: 'z' },
      database: { ...baseParts.database, migrationsPending: ['20260830_job_runs.sql'] },
    })
    expect(bundleFindings(b).join('\n')).toMatch(/npm run migrate/)
  })

  it('distinguishes "not checked" from "broken" — a missing credential is not a fault', () => {
    // Reporting an unreachable database when DATABASE_URL simply was not
    // supplied sends the reader to check the wrong variables.
    const b = buildBundle({
      ...baseParts,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y', SUPABASE_SERVICE_ROLE_KEY: 'z' },
      database: { reachable: false, latencyMs: null, migrationsApplied: null, migrationsPending: null, notChecked: 'DATABASE_URL was not provided' },
    })
    const findings = bundleFindings(b).join('\n')
    expect(findings).toMatch(/not a fault in the install/)
    expect(findings).not.toMatch(/is not reachable/)
  })

  it('blames the in-process scheduler when nothing scheduled has ever run', () => {
    const b = buildBundle({
      ...baseParts,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y', SUPABASE_SERVICE_ROLE_KEY: 'z' },
      crons: [
        { name: 'data-invariants', lastRun: null, lastOutcome: null, scheduledInProcess: true },
        { name: 'rate-change-digest', lastRun: null, lastOutcome: null, scheduledInProcess: true },
      ],
    })
    // The specific, actionable cause — not "read a document".
    expect(bundleFindings(b).join('\n')).toMatch(/CRON_IN_PROCESS=true/)
  })

  it('does not prescribe CRON_IN_PROCESS to an install that already sets it', () => {
    // The same mistake as the doctor reading a working install as broken, one
    // layer down: an install stood up an hour ago HAS set the variable and has
    // simply not reached 02:00 yet. Telling that operator to set what they set
    // is how a findings list stops being read at all.
    const b = buildBundle({
      ...baseParts,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'x',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y',
        SUPABASE_SERVICE_ROLE_KEY: 'z',
        CRON_IN_PROCESS: 'true',
      },
      crons: [
        { name: 'data-invariants', lastRun: null, lastOutcome: null, scheduledInProcess: true },
        { name: 'rate-change-digest', lastRun: null, lastOutcome: null, scheduledInProcess: true },
      ],
    })
    const text = bundleFindings(b).join('\n')
    expect(text).toMatch(/CRON_IN_PROCESS is set/)
    expect(text).not.toMatch(/Set it\./)
  })

  it('separates jobs nothing schedules from jobs that merely have not run', () => {
    const b = buildBundle({
      ...baseParts,
      env: { NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y', SUPABASE_SERVICE_ROLE_KEY: 'z' },
      crons: [
        { name: 'data-invariants', lastRun: '2026-08-29T11:00:00Z', lastOutcome: 'ok', scheduledInProcess: true },
        { name: 'send-reminders', lastRun: null, lastOutcome: null, scheduledInProcess: false },
      ],
    })
    const text = bundleFindings(b).join('\n')
    expect(text).toMatch(/NOTHING IN THIS APP SCHEDULES THEM/)
    expect(text).toMatch(/send-reminders/)
  })

  it('reports a failed and an unfinished run differently', () => {
    const mk = (lastOutcome: string) =>
      bundleFindings(
        buildBundle({
          ...baseParts,
          env: { NEXT_PUBLIC_SUPABASE_URL: 'x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'y', SUPABASE_SERVICE_ROLE_KEY: 'z' },
          crons: [{ name: 'data-invariants', lastRun: new Date().toISOString(), lastOutcome, scheduledInProcess: true }],
        }),
      ).join('\n')
    expect(mk('failed')).toMatch(/last run FAILED/)
    expect(mk('unfinished')).toMatch(/never reported back/)
  })
})

describe('integration states', () => {
  it('reports configured without probing — a check must not spend money', () => {
    expect(integrationState({ ANTHROPIC_API_KEY: 'x' } as unknown as NodeJS.ProcessEnv, 'ANTHROPIC_API_KEY')).toBe('configured')
    expect(integrationState({} as unknown as NodeJS.ProcessEnv, 'ANTHROPIC_API_KEY')).toBe('unconfigured')
  })

  it('needs every key of a multi-key integration', () => {
    const partial = { GOOGLE_CLIENT_ID: 'x' } as unknown as NodeJS.ProcessEnv
    expect(integrationStates(partial).google).toBe('unconfigured')
  })

  it('covers this product’s integrations, not the sibling’s', () => {
    const states = integrationStates({} as unknown as NodeJS.ProcessEnv)
    expect(Object.keys(states).sort()).toEqual(
      ['accounting', 'anthropic', 'exchangeRates', 'google', 'supabase', 'whatsapp'].sort(),
    )
  })
})

describe('bearerMatches', () => {
  it('fails closed when no secret is configured', () => {
    // An install that never set CRON_SECRET must be closed, not open.
    expect(bearerMatches('Bearer anything', undefined)).toBe(false)
    expect(bearerMatches('Bearer anything', '')).toBe(false)
    expect(bearerMatches('Bearer anything', '   ')).toBe(false)
  })

  it('accepts the right token and rejects near-misses', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true)
    expect(bearerMatches('Bearer s3creT', 's3cret')).toBe(false)
    expect(bearerMatches('s3cret', 's3cret')).toBe(false)
    expect(bearerMatches(null, 's3cret')).toBe(false)
  })
})

describe('the deep probe guards itself regardless of middleware', () => {
  it('this app does NOT exempt /api/health — unlike the sibling', () => {
    // Worth pinning, because the ported comment originally claimed the
    // opposite. On autoura-saas /api/health is an exempt prefix and the route's
    // own check is the only gate; here the route is also behind the session
    // gate. If someone later adds the exemption, this fails and they will find
    // the route's guard already in place.
    const mw = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8')
    expect(mw).not.toContain('/api/health')
  })

  it('guards itself anyway — middleware coverage it does not state is not protection', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/health/deep/route.ts'), 'utf8')
    expect(route).toContain('bearerMatches')
    expect(route).toContain('roleAllows')
  })
})

describe('THE BUNDLE MUST NOT LEAK', () => {
  it('no environment VALUE appears anywhere in the output', () => {
    // Every known variable gets a distinctive, real-shaped value. If any one of
    // them survives into the bundle, this fails and names it.
    const env: Record<string, string> = {}
    for (const [i, key] of KNOWN_ENV_KEYS.entries()) env[key] = `SECRETVALUE${i}xyzzy`

    const bundle = buildBundle({
      ...baseParts,
      env: env as NodeJS.ProcessEnv,
      database: { ...baseParts.database, error: `connect failed for ${env.DATABASE_URL}` },
      errors: [
        `Authorization: Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        `postgres://u:${env.ENCRYPTION_KEY}@db.internal:5432/x`,
      ],
    })

    const serialized = JSON.stringify(bundle)
    const leaked = KNOWN_ENV_KEYS.filter(k => serialized.includes(env[k]))
    expect(leaked, `these values leaked into the bundle: ${leaked.join(', ')}`).toEqual([])
  })

  it('variable NAMES are reported — that is the point', () => {
    const bundle = buildBundle({ ...baseParts, env: { ANTHROPIC_API_KEY: 'sk-ant-real' } as unknown as NodeJS.ProcessEnv })
    expect(bundle.env.set).toContain('ANTHROPIC_API_KEY')
    expect(JSON.stringify(bundle)).not.toContain('sk-ant-real')
  })

  it('carries the redaction notice, so the reader knows what they are sending', () => {
    const bundle = buildBundle({ ...baseParts })
    expect(bundle.redaction.join(' ')).toMatch(/HOSTNAMES CAN APPEAR/)
  })
})

describe('the doctor sees the same configuration the app does', () => {
  // docs/SELF-HOSTING.md tells the operator to run `npm run doctor`, which is
  // plain node — and plain node does not read .env.local. On a correctly
  // configured install the doctor therefore reported "required environment
  // variables are missing" and called a working install broken. Found by
  // standing up a real second install.
  const src = readFileSync(join(process.cwd(), 'scripts/doctor.mjs'), 'utf8')

  it('loads .env.local when it exists', () => {
    expect(src).toContain('.env.local')
    expect(src).toMatch(/function loadEnvLocal/)
    expect(src).toMatch(/loadEnvLocal\(\)/)
  })

  it('never overrides a real environment variable with the file', () => {
    // A deploy that sets a variable in the environment means it; the file is
    // only there to fill gaps for someone running the command by hand.
    expect(src).toMatch(/if \(process\.env\[key\] !== undefined\) continue/)
  })

  it('does not fail when there is no .env.local', () => {
    expect(src).toMatch(/if \(!existsSync\(file\)\) return/)
  })
})
