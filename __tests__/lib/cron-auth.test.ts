// Every cron route checked `if (CRON_SECRET && header !== ...)`: with the
// secret unset (a fresh or self-hosted install) anyone could run the jobs.
import { describe, it, expect, afterEach } from 'vitest'
import { cronAuthorized, internalCronToken } from '@/lib/cron/auth'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const req = (auth?: string) => ({ headers: new Headers(auth ? { authorization: auth } : {}) })
afterEach(() => { delete process.env.CRON_SECRET })

describe('cronAuthorized fails closed', () => {
  it('no secret configured and no token → refused (was: allowed)', () => {
    expect(cronAuthorized(req())).toBe(false)
    expect(cronAuthorized(req('Bearer anything'))).toBe(false)
  })
  it('the in-process scheduler token is accepted with or without CRON_SECRET', () => {
    expect(cronAuthorized(req(`Bearer ${internalCronToken()}`))).toBe(true)
    process.env.CRON_SECRET = 's3cret'
    expect(cronAuthorized(req(`Bearer ${internalCronToken()}`))).toBe(true)
  })
  it('an external caller must present CRON_SECRET exactly', () => {
    process.env.CRON_SECRET = 's3cret'
    expect(cronAuthorized(req('Bearer s3cret'))).toBe(true)
    expect(cronAuthorized(req('Bearer s3cre'))).toBe(false)
    expect(cronAuthorized(req('s3cret'))).toBe(false)
  })
})

describe('every cron route uses it', () => {
  const dir = join(process.cwd(), 'app/api/cron')
  it.each(readdirSync(dir))('%s', name => {
    const src = readFileSync(join(dir, name, 'route.ts'), 'utf8')
    expect(src).toContain('cronAuthorized(request)')
    expect(src).not.toMatch(/CRON_SECRET &&|cronSecret &&/)
  })
})

describe('the scheduler', () => {
  it('authenticates with the internal token, not a possibly-unset secret', () => {
    const src = readFileSync(join(process.cwd(), 'lib/cron/scheduler.ts'), 'utf8')
    expect(src).toContain('Bearer ${internalCronToken()}')
  })
  it('now runs the three jobs pg_cron used to', () => {
    const src = readFileSync(join(process.cwd(), 'lib/cron/scheduler.ts'), 'utf8')
    for (const n of ['refresh-exchange-rates', 'send-reminders', 'task-reminders']) expect(src).toContain(`name: '${n}'`)
  })
})
