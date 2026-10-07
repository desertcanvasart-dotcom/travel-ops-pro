// Needs attention, dismissed: a row stays hidden while its state holds and
// comes back when the situation changes — never just because time passed
// (lib/dashboard/attention-dismissals.ts, migration 20261108).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { attentionFingerprint, attentionKey, withoutDismissed, type DismissableItem } from '@/lib/dashboard/attention-dismissals'

const balance = (over: Record<string, unknown> = {}): DismissableItem => ({
  type: 'balance_due', bookingId: 'b1', href: '/bookings/b1',
  detail: { balanceDue: 1200, dueDate: '2026-10-20', overdue: false, ...over },
})
const email = (over: Record<string, unknown> = {}): DismissableItem => ({
  type: 'reply_overdue', bookingId: '', href: '/communications?awaiting_reply=1',
  detail: { conversationId: 'c1', waitingSince: '2026-10-01T09:00:00Z', lastMessageAt: '2026-10-01T09:00:00Z', waiting: '6d', ...over },
})
const dismiss = (i: DismissableItem) => ({ item_key: attentionKey(i), fingerprint: attentionFingerprint(i) })

describe('a dismissed row', () => {
  it('stays hidden while nothing changes', () => {
    const out = withoutDismissed([balance(), email()], [dismiss(balance())])
    expect(out.items.map(i => i.type)).toEqual(['reply_overdue'])
    expect(out.dismissed).toBe(1)
  })

  it('stays hidden as the customer keeps waiting — the clock is not news', () => {
    expect(withoutDismissed([email({ waiting: '9d' })], [dismiss(email())]).items).toEqual([])
  })

  it('comes back when the customer writes again', () => {
    expect(withoutDismissed([email({ lastMessageAt: '2026-10-06T10:00:00Z' })], [dismiss(email())]).items).toHaveLength(1)
  })

  it('comes back when the balance or its deadline moves, or it falls overdue', () => {
    for (const changed of [{ balanceDue: 900 }, { dueDate: '2026-10-25' }, { overdue: true }]) {
      expect(withoutDismissed([balance(changed)], [dismiss(balance())]).items, JSON.stringify(changed)).toHaveLength(1)
    }
  })

  it('is one row: another booking or conversation is not hidden by it', () => {
    const other = { ...balance(), bookingId: 'b2', href: '/bookings/b2' }
    expect(withoutDismissed([other, email({ conversationId: 'c2' })], [dismiss(balance()), dismiss(email())]).items).toHaveLength(2)
  })

  it('two requests on one booking are two rows', () => {
    const req = (at: string): DismissableItem => ({ type: 'change_request', bookingId: 'b1', href: '/bookings/b1', detail: { kind: 'add_traveller', requestedAt: at } })
    expect(attentionKey(req('2026-10-01'))).not.toBe(attentionKey(req('2026-10-02')))
  })
})

describe('wiring', () => {
  it('the list hides dismissed rows, scoped to the organisation, and sends each row its key', () => {
    const code = readFileSync('app/api/dashboard/attention/route.ts', 'utf8')
    expect(code).toMatch(/from\('dashboard_attention_dismissals'\)[\s\S]{0,120}\.eq\('org_id', orgId\)/)
    expect(code).toMatch(/withoutDismissed\(/)
    expect(code).toMatch(/dismissKey: attentionKey\(i\)/)
  })
  it('the table is organisation-scoped with RLS', () => {
    const sql = readFileSync('migrations/20261108_dashboard_attention_dismissals.sql', 'utf8')
    expect(sql).toMatch(/org_id UUID NOT NULL REFERENCES public\.organizations/)
    expect(sql).toMatch(/UNIQUE \(org_id, item_key\)/)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })
})
