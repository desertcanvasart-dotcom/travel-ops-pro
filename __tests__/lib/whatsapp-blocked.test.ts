// Blocked WhatsApp numbers (20270120, ported from autoura-saas #816): the
// number rules and the webhook's check. The webhook end to end is in
// whatsapp-per-org.test.ts.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkBlockNumber, findBlocked, inboundIsBlocked, BLOCK_ROLES } from '@/lib/whatsapp-blocked'

function fakeDb(lookup: { data: unknown; error: { message: string; code?: string } | null }) {
  const updates: Array<Record<string, unknown>> = []
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => lookup }) }) }),
      update: (v: Record<string, unknown>) => { updates.push(v); return { eq: async () => ({ error: null }) } },
    }),
  }
  return { db: db as never, updates }
}

describe('which numbers can be blocked', () => {
  it('international numbers, stored as E.164', () => {
    expect(checkBlockNumber('+20 100 123 4567')).toEqual({ ok: true, number: '+201001234567' })
    expect(checkBlockNumber('whatsapp:+447700900123')).toEqual({ ok: true, number: '+447700900123' })
  })
  it('a number without its country code is refused, not guessed', () => {
    expect(checkBlockNumber('0100 123 4567').ok).toBe(false)
    expect(checkBlockNumber('').ok).toBe(false)
  })
  it('finds the block for a conversation however its number is written', () => {
    const list = [{ phone_number: '+201001234567' }]
    expect(findBlocked(list, 'whatsapp:+20 100 123 4567')).toBe(list[0])
    expect(findBlocked(list, '+447700900123')).toBeNull()
  })
  it('owners, admins and managers block (the owner clears every role gate)', () => {
    expect([...BLOCK_ROLES]).toEqual(['admin', 'manager'])
  })
})

describe('inboundIsBlocked', () => {
  it('not blocked: false, nothing written', async () => {
    const { db, updates } = fakeDb({ data: null, error: null })
    expect(await inboundIsBlocked(db, 'org-1', '+201001234567')).toBe(false)
    expect(updates).toEqual([])
  })
  it('blocked: true, and the count and time move (never the content)', async () => {
    const { db, updates } = fakeDb({ data: { id: 'b1', blocked_message_count: 4 }, error: null })
    expect(await inboundIsBlocked(db, 'org-1', '+201001234567')).toBe(true)
    expect(updates).toHaveLength(1)
    expect(Object.keys(updates[0]).sort()).toEqual(['blocked_message_count', 'last_blocked_at'])
    expect(updates[0].blocked_message_count).toBe(5)
  })
  it('a failed lookup throws, so Twilio delivers again', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'timeout', code: '57014' } })
    await expect(inboundIsBlocked(db, 'org-1', '+201001234567')).rejects.toThrow(/blocked-number lookup/)
  })
  it('before the migration (no table) nothing is blocked and every message is still filed', async () => {
    const spy = vi.fn()
    for (const code of ['42P01', 'PGRST205']) {
      const { db } = fakeDb({ data: null, error: { message: 'no such table', code } })
      expect(await inboundIsBlocked(db, 'org-1', '+201001234567').catch(spy)).toBe(false)
    }
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('the blocked-numbers API', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/whatsapp/blocked/route.ts'), 'utf8')
  it('block and unblock are role-gated; every query is this company\'s', () => {
    expect(src.match(/requireRole\(\[\.\.\.BLOCK_ROLES\]\)/g)).toHaveLength(2)
    expect(src.match(/\.from\('whatsapp_blocked_numbers'\)/g)!.length).toBe(src.match(/\.eq\('org_id', orgId\)|org_id: orgId/g)!.length)
  })
})
