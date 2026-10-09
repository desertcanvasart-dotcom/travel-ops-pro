// What clients receive (audit of 2026-10-09):
//   - WhatsApp status messages wrote themselves into itineraries.status (a
//     payment reminder turned a confirmed trip into 'pending_payment');
//   - "Send all reminders" and the daily cron chased DRAFT invoices;
//   - a traveller's own portal link could download the booking's invoices.
import { describe, it, expect, vi } from 'vitest'
import { statusAfterMessage } from '@/lib/whatsapp-status-after-message'
import { reminderBlocker, REMINDABLE_INVOICE_STATUSES } from '@/lib/invoices/reminder-schedule'

describe('a WhatsApp status message and the trip’s status', () => {
  it('a payment reminder or a payment thank-you leaves the trip as it is', () => {
    expect(statusAfterMessage('confirmed', 'pending_payment')).toBeNull()
    expect(statusAfterMessage('confirmed', 'paid')).toBeNull()
  })
  it('confirms a draft or sent trip; completes or cancels; never reopens a finished one', () => {
    expect(statusAfterMessage('draft', 'confirmed')).toBe('confirmed')
    expect(statusAfterMessage('confirmed', 'completed')).toBe('completed')
    expect(statusAfterMessage('cancelled', 'confirmed')).toBeNull()
  })
})

describe('which invoices may be chased', () => {
  it('sent, partly paid or overdue, with a due date — never a draft', () => {
    expect([...REMINDABLE_INVOICE_STATUSES]).toEqual(['sent', 'partial', 'overdue'])
    expect(reminderBlocker({ status: 'sent', due_date: '2026-11-01' })).toBeNull()
    expect(reminderBlocker({ status: 'draft', due_date: '2026-11-01' })).toMatch(/draft/)
    expect(reminderBlocker({ status: 'sent', due_date: null })).toMatch(/no due date/)
  })
})

// ── The portal document route, against a fake service-role client ──────────
const link = { id: 'l1', booking_id: 'b1', org_id: 'o1', passenger_id: null as string | null, revoked_at: null, expires_at: null }
const read: string[] = []
const ROWS: Record<string, unknown> = {
  booking_portal_links: link,
  bookings: { itinerary_id: 'it1', org_id: 'o1', balance_due_date: null, start_date: '2026-11-01', client_name: 'Lead' },
  invoices: { id: 'inv-1', status: 'sent', itinerary_id: 'it1', org_id: 'o1', client_name: 'Lead', total_amount: 3000 },
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      read.push(table)
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order']) chain[m] = () => chain
      chain.maybeSingle = async () => ({ data: ROWS[table] ?? null, error: null })
      return chain
    },
  }),
}))
vi.mock('@/lib/booking-portal', async (orig) => ({
  ...(await orig<typeof import('@/lib/booking-portal')>()),
  isValidPortalToken: () => true,
  isPortalVerified: () => true,
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ success: true }), getClientIdentifier: () => 'x', rateLimitResponse: () => new Response(null, { status: 429 }) }))

describe('a traveller’s own portal link', () => {
  const get = async (key: string) => {
    const { GET } = await import('@/app/api/portal/[token]/documents/[key]/route')
    const req = Object.assign(new Request('http://x'), { cookies: { get: () => ({ value: 'ok' }) } })
    return GET(req as never, { params: Promise.resolve({ token: 't'.repeat(32), key }) } as never)
  }

  it('never serves the booking’s invoices — the invoice is not even read', async () => {
    link.passenger_id = 'p2'
    read.length = 0
    expect((await get('invoice:inv-1')).status).toBe(404)
    expect(read).not.toContain('invoices')
  })
})
