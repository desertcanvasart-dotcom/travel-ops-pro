import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildCommunicationContext } from '@/lib/ai/communication-context-builder'

// A3: the context builder selected columns that do not exist (clients.notes,
// itineraries.tour_name/destination/number_of_*, invoice_payments.status).
// PostgREST fails the whole select on an unknown column, so drafts never saw
// the client, trips or payments. This fake behaves like PostgREST: it errors
// when a selected column is not in the generated schema.

const types = readFileSync(join(process.cwd(), 'types/database.types.ts'), 'utf8')
function columnsOf(table: string): Set<string> {
  const m = types.match(new RegExp(`\\n      ${table}: \\{\\n        Row: \\{\\n([\\s\\S]*?)\\n        \\}`))
  if (!m) throw new Error(`no table ${table}`)
  return new Set(m[1].split('\n').map((l) => l.trim().split(':')[0]))
}

const rows: Record<string, unknown[]> = {
  communication_threads: [{ id: 't1', org_id: 'o1', channel: 'other', client_id: 'c1', whatsapp_conversation_id: null, email_conversation_id: null }],
  clients: [{ id: 'c1', first_name: 'Ana', last_name: 'Silva', email: 'a@x', phone: null, nationality: 'BR', preferred_language: 'pt', internal_notes: 'VIP, vegetarian' }],
  itineraries: [{ id: 'i1', itinerary_code: 'ITN-1', trip_name: 'Nile Classic', destinations: 'Cairo, Luxor', start_date: '2027-01-01', end_date: '2027-01-08', status: 'confirmed', num_adults: 2, num_children: 1, total_cost: 5000, currency: 'USD' }],
  invoices: [{ id: 'inv1', invoice_number: 'INV-1', invoice_type: 'deposit', total_amount: 1000, amount_paid: 500, balance_due: 500, status: 'partial', due_date: null, currency: 'USD' }],
  invoice_payments: [{ id: 'p1', amount: 500, currency: 'USD', payment_method: 'card', payment_date: '2026-10-01' }],
}

function fakeSupabase() {
  const selects: Record<string, string> = {}
  return {
    selects,
    from(table: string) {
      let error: { message: string } | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select(cols: string, opts?: { head?: boolean }) {
          if (!opts?.head) {
            selects[table] = cols
            const known = columnsOf(table)
            const bad = cols.split(',').map((c) => c.trim()).filter((c) => !known.has(c))
            if (bad.length) error = { message: `column ${table}.${bad[0]} does not exist` }
          }
          return q
        },
        eq: () => q, in: () => q, order: () => q, limit: () => q,
        single: () => Promise.resolve(error ? { data: null, error } : { data: rows[table][0], error: null }),
        then(res: (v: unknown) => unknown) {
          return Promise.resolve(error ? { data: null, error, count: null } : { data: rows[table], error: null, count: rows[table].length }).then(res)
        },
      }
      return q
    },
  }
}

describe('buildCommunicationContext (A3)', () => {
  it('only selects columns that exist, so client, trips and payments reach the draft', async () => {
    const sb = fakeSupabase()
    const ctx = await buildCommunicationContext('t1', sb as never)
    expect(ctx.client).toMatchObject({ name: 'Ana Silva', notes: 'VIP, vegetarian', total_bookings: 1 })
    expect(ctx.itineraries).toEqual([expect.objectContaining({ tour_name: 'Nile Classic', destination: 'Cairo, Luxor', pax: 3 })])
    expect(ctx.invoices).toHaveLength(1)
    expect(ctx.payments).toEqual([expect.objectContaining({ amount: 500, payment_method: 'card', paid_at: '2026-10-01' })])
    expect(sb.selects.invoice_payments).not.toMatch(/status/)
  })
})
