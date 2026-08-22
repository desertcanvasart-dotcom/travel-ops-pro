// The in-process scheduler replaces railway.toml [[cron]] blocks that Railway
// never read. Pins the cron matcher on the three real schedules, the due-job
// selection, and the claim rule (exactly one winner per job × slot).
import { describe, it, expect, vi } from 'vitest'
import { matchesCron, minuteSlot } from '@/lib/cron/schedule'
import { claimSlot, dueJobs, tick, type CronJob } from '@/lib/cron/scheduler'

const at = (s: string) => new Date(s)

describe('matchesCron', () => {
  it('*/15 fires on the quarter hours only', () => {
    expect(matchesCron('*/15 * * * *', at('2026-08-23T10:00:00Z'))).toBe(true)
    expect(matchesCron('*/15 * * * *', at('2026-08-23T10:45:00Z'))).toBe(true)
    expect(matchesCron('*/15 * * * *', at('2026-08-23T10:46:00Z'))).toBe(false)
  })
  it('nightly schedules fire at their UTC minute', () => {
    expect(matchesCron('0 2 * * *', at('2026-08-23T02:00:00Z'))).toBe(true)
    expect(matchesCron('0 2 * * *', at('2026-08-23T02:01:00Z'))).toBe(false)
    expect(matchesCron('15 3 * * *', at('2026-08-23T03:15:00Z'))).toBe(true)
    expect(matchesCron('15 3 * * *', at('2026-08-23T15:15:00Z'))).toBe(false)
  })
  it('ranges, lists, day-of-week; rejects garbage', () => {
    expect(matchesCron('0 9-17 * * 1-5', at('2026-08-24T13:00:00Z'))).toBe(true)  // Monday
    expect(matchesCron('0 9-17 * * 1-5', at('2026-08-23T13:00:00Z'))).toBe(false) // Sunday
    expect(matchesCron('0,30 * * * *', at('2026-08-23T13:30:00Z'))).toBe(true)
    expect(() => matchesCron('* * * *', new Date())).toThrow()
    expect(() => matchesCron('61 * * * *', new Date())).toThrow()
  })
  it('minuteSlot drops seconds', () => {
    expect(minuteSlot(at('2026-08-23T10:15:42.123Z')).toISOString()).toBe('2026-08-23T10:15:00.000Z')
  })
})

const fakeDb = (state: Map<string, string>) => ({
  from: () => ({
    insert: async (row: { job: string; slot: string }) => {
      if (state.has(row.job)) return { error: { code: '23505', message: 'dup' } }
      state.set(row.job, row.slot); return { error: null }
    },
    update: (patch: { slot: string }) => ({ eq: (_c: string, job: string) => ({ lt: (_c2: string, slot: string) => ({ select: async () => {
      const cur = state.get(job)
      if (cur !== undefined && cur < slot) { state.set(job, patch.slot); return { data: [{ job }], error: null } }
      return { data: [], error: null }
    } }) }) }),
  }),
})

describe('claimSlot', () => {
  it('exactly one claimant per job × slot; a later slot can be claimed again', async () => {
    const state = new Map<string, string>(); const db = fakeDb(state)
    const s1 = at('2026-08-23T10:00:00Z'), s2 = at('2026-08-23T10:15:00Z')
    expect(await claimSlot(db, 'j', s1)).toBe(true)
    expect(await claimSlot(db, 'j', s1)).toBe(false)   // second container, same slot
    expect(await claimSlot(db, 'j', s2)).toBe(true)
    expect(await claimSlot(db, 'j', s1)).toBe(false)   // stale slot never re-runs
  })
})

describe('tick', () => {
  it('runs only due jobs, once, with the bearer secret', async () => {
    process.env.CRON_SECRET = 's3cret'
    const seen: string[] = []
    const handler = vi.fn(async (req: Request) => { seen.push(req.headers.get('authorization') ?? ''); return new Response('ok') })
    const jobs: CronJob[] = [
      { name: 'quarter', schedule: '*/15 * * * *', handler: async () => handler as never },
      { name: 'nightly', schedule: '0 2 * * *', handler: async () => handler as never },
    ]
    const db = fakeDb(new Map())
    expect(await tick(db, at('2026-08-23T10:15:30Z'), jobs)).toEqual(['quarter'])
    expect(await tick(db, at('2026-08-23T10:15:59Z'), jobs)).toEqual([])   // same slot, already claimed
    expect(dueJobs(jobs, at('2026-08-23T02:00:00Z')).map(j => j.name)).toEqual(['quarter', 'nightly']) // 02:00 is a quarter-hour too
    expect(dueJobs(jobs, at('2026-08-23T02:01:00Z')).map(j => j.name)).toEqual([])
    expect(seen).toEqual(['Bearer s3cret'])
  })
})
