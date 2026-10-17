import { describe, it, expect } from 'vitest'
import { buildCommunicationContext } from '@/lib/ai/communication-context-builder'

// The copilot context builder runs on the service role. It read the thread's
// client, trips and invoices by client id alone, so a thread carrying another
// company's client id put that client's name, contact details and internal
// notes in the drafted reply. Every one of those reads now also names the
// thread's own company.

type Eq = { table: string; col: string; val: unknown }

function recordingSupabase(thread: Record<string, unknown>) {
  const eqs: Eq[] = []
  return {
    eqs,
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq(col: string, val: unknown) { eqs.push({ table, col, val }); return q },
        in: () => q, order: () => q, limit: () => q,
        single: () => Promise.resolve({
          data: table === 'communication_threads' ? thread : { id: 'c-foreign', first_name: 'Ana', last_name: 'B', email: null, phone: null, nationality: null, preferred_language: null, internal_notes: null },
          error: null,
        }),
        then(res: (v: unknown) => unknown) { return Promise.resolve({ data: [], error: null, count: 0 }).then(res) },
      }
      return q
    },
  }
}

describe('buildCommunicationContext scopes by company', () => {
  it("filters the client, the trips, the invoices and the payments' invoices by the thread's org", async () => {
    const sb = recordingSupabase({ id: 't1', org_id: 'org-a', channel: 'other', client_id: 'c-foreign', whatsapp_conversation_id: null, email_conversation_id: null })
    await buildCommunicationContext('t1', sb as never)
    const orgFilterOn = (table: string) => sb.eqs.filter(e => e.table === table && e.col === 'org_id' && e.val === 'org-a').length
    expect(orgFilterOn('clients')).toBe(1)
    expect(orgFilterOn('itineraries')).toBeGreaterThanOrEqual(2) // the booking count and the trip list
    expect(orgFilterOn('invoices')).toBeGreaterThanOrEqual(2) // the invoice list and the payments' lookup
    expect(orgFilterOn('communication_threads')).toBe(0) // (the thread itself is looked up by id)
  })
})
