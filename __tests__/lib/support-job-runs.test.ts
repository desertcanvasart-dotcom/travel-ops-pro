// T4a: the redaction rules and the job recorder.
//
// The redaction half is the load-bearing part — a bundle that leaks is worse
// than no bundle — so it is tested with values shaped like the real thing
// rather than with placeholders that would pass a broken rule.
//
// The recorder half is tested for the property that actually matters:
// FAIL-OPEN. A missing job_runs table, or a database that is down, must never
// stop the job it was describing. A support feature that breaks the retention
// purge would be worse than no support feature.
import { describe, it, expect } from 'vitest'
import {
  KNOWN_ENV_KEYS,
  REQUIRED_ENV_KEYS,
  redactErrorLines,
  redactText,
  reportEnv,
} from '@/lib/support/bundle-core.mjs'
import { JOB_NAMES, SCHEDULED_IN_PROCESS } from '@/lib/support/job-names.mjs'
import { isStale, latestJobRuns, withJobRun } from '@/lib/support/job-runs'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

describe('redaction — names, counts, scrubbed', () => {
  it('removes a Supabase JWT entirely, not half of it', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r'
    const out = redactText(`token=${jwt}`)
    expect(out).not.toContain('eyJ')
    // Half-redacting is worse than not redacting: it looks safe.
    expect(out).not.toMatch(/[A-Za-z0-9_-]{20,}/)
  })

  it('removes database credentials but keeps the host', () => {
    const out = redactText('postgresql://postgres.abc:hunter2@db.example.com:5432/postgres')
    expect(out).not.toContain('hunter2')
    expect(out).toContain('db.example.com')
  })

  it('keeps hostnames deliberately — which host failed is the diagnosis', () => {
    expect(redactText('ENOTFOUND db.internal')).toBe('ENOTFOUND db.internal')
  })

  it('removes emails and uuids, which identify a traveller as surely as a name', () => {
    const out = redactText('ahmed.maher@kempinski.com 7ad1f827-9088-4769-862b-18510222da32')
    expect(out).not.toContain('@kempinski.com')
    expect(out).not.toContain('7ad1f827')
  })

  it('removes vendor keys and passport-shaped strings', () => {
    expect(redactText('sk-ant-api03-abcdefghijklmno')).not.toContain('abcdefghijklmno')
    expect(redactText('passport AB1234567')).not.toContain('AB1234567')
  })

  it('eats the scheme word with the credential, not just the credential', () => {
    // A rule that leaves "Bearer" standing and redacts nothing else is the
    // regression this was written for.
    const out = redactText('Authorization: Bearer abc123def456')
    expect(out).not.toContain('abc123def456')
  })

  it('caps very long lines and keeps only the most recent', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`)
    const out = redactErrorLines(lines, 5)
    expect(out).toHaveLength(5)
    expect(out.at(-1)).toBe('line 49')
    expect(redactErrorLines(['x'.repeat(900)])[0].length).toBeLessThanOrEqual(401)
  })
})

describe('environment reporting — names, never values', () => {
  it('reports which are set without ever returning a value', () => {
    const report = reportEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', CRON_SECRET: '' })
    expect(report.set).toContain('NEXT_PUBLIC_SUPABASE_URL')
    // Present but empty is a variable somebody meant to fill in.
    expect(report.missing).toContain('CRON_SECRET')
    expect(JSON.stringify(report)).not.toContain('supabase.co')
  })

  it('names the required ones that are absent', () => {
    expect(reportEnv({}).missingRequired).toEqual([...REQUIRED_ENV_KEYS])
  })

  it("never reports a variable that is not ours — a customer's own stay invisible", () => {
    const report = reportEnv({ THEIR_INTERNAL_KEY: 'secret' })
    expect(report.set).not.toContain('THEIR_INTERNAL_KEY')
    expect(report.missing).not.toContain('THEIR_INTERNAL_KEY')
  })

  it('the allow-list matches .env.example — two lists would drift', () => {
    const example = readFileSync(join(process.cwd(), '.env.example'), 'utf8')
    const documented = new Set(
      example.split('\n').flatMap(l => {
        const m = l.match(/^([A-Z_][A-Z0-9_]*)=/)
        return m ? [m[1]] : []
      }),
    )
    // DATABASE_URL and PORT are deliberately absent from .env.example (the app
    // never needs them) but the doctor still reports on them.
    const extra = KNOWN_ENV_KEYS.filter(k => !documented.has(k) && !['DATABASE_URL', 'PORT'].includes(k))
    expect(extra, `in the allow-list but not in .env.example: ${extra.join(', ')}`).toEqual([])
  })
})

describe('the job vocabulary', () => {
  it('lists every cron route, not just the scheduled ones', () => {
    const routes = readdirSync(join(process.cwd(), 'app/api/cron'))
    expect([...JOB_NAMES].sort()).toEqual([...routes].sort())
  })

  it('marks which are actually scheduled in-process', () => {
    // The gap is the finding: a job nothing schedules should be visible as
    // such, not quietly absent from the report.
    expect(SCHEDULED_IN_PROCESS.length).toBeLessThan(JOB_NAMES.length)
    for (const n of SCHEDULED_IN_PROCESS) expect(JOB_NAMES).toContain(n)
  })

  it('the in-process list matches the scheduler registry', () => {
    const scheduler = readFileSync(join(process.cwd(), 'lib/cron/scheduler.ts'), 'utf8')
    const registered = [...scheduler.matchAll(/name: '([a-z-]+)'/g)].map(m => m[1])
    expect([...SCHEDULED_IN_PROCESS].sort()).toEqual([...registered].sort())
  })
})

describe('withJobRun is fail-open', () => {
  const okHandler = async () => new Response('done', { status: 200 })

  it('runs the job even when there is no database at all', async () => {
    const wrapped = withJobRun('data-invariants', () => {
      throw new Error('no client')
    }, okHandler)
    const res = await wrapped()
    expect(res.status).toBe(200)
  })

  it('runs the job even when job_runs does not exist yet', async () => {
    const db = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => { throw new Error('relation "job_runs" does not exist') } }) }),
      }),
    }
    const res = await withJobRun('data-invariants', () => db, okHandler)()
    expect(res.status).toBe(200)
  })

  it('still throws what the handler threw — recording must not swallow failures', async () => {
    const boom = async () => {
      throw new Error('the job itself failed')
    }
    const db = { from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null }) }) }) }) }
    await expect(withJobRun('data-invariants', () => db, boom)()).rejects.toThrow('the job itself failed')
  })

  it('a rejected probe is not a run', async () => {
    // Otherwise an attacker's curl makes the scheduler look healthy.
    const deleted: string[] = []
    const db = {
      from: () => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'run-1' } }) }) }),
        delete: () => ({ eq: (_c: string, v: string) => { deleted.push(v); return Promise.resolve({}) } }),
      }),
    }
    const res = await withJobRun('data-invariants', () => db, async () => new Response('no', { status: 401 }))()
    expect(res.status).toBe(401)
    expect(deleted).toContain('run-1')
  })
})

describe('latestJobRuns and staleness', () => {
  it('reports a job that has never run rather than omitting it', async () => {
    const db = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }
    const runs = await latestJobRuns(db)
    expect(runs).toHaveLength(JOB_NAMES.length)
    expect(runs.every(r => r.lastRun === null)).toBe(true)
  })

  it('survives the table not existing', async () => {
    const db = { from: () => { throw new Error('no table') } }
    await expect(latestJobRuns(db)).resolves.toHaveLength(JOB_NAMES.length)
  })

  it('calls a job stale after the threshold, and never calls "never" stale', () => {
    const now = new Date('2026-08-29T12:00:00Z')
    expect(isStale('2026-08-29T11:00:00Z', now)).toBe(false)
    expect(isStale('2026-08-25T11:00:00Z', now)).toBe(true)
    // "never ran" is a separate, louder finding — not staleness.
    expect(isStale(null, now)).toBe(false)
  })
})
