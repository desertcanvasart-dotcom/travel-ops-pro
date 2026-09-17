import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { leadNotes, nameFromSender, processNewEmailLeads, type LeadExtraction } from '@/lib/email/email-leads'

// Operator, 2026-09-17: a travel request by email is a Lead (a potential
// customer), made automatically from new email.

type Row = Record<string, any>

function fakeDb(tables: Record<string, Row[]>) {
  let seq = 0
  return {
    tables,
    from(table: string) {
      const data = (tables[table] ??= [])
      const filters: Array<(r: Row) => boolean> = []
      let order: { col: string; asc: boolean } | null = null
      let limit = Infinity
      let patch: Row | null = null
      let inserted: Row | null = null
      const run = () => {
        let out = data.filter(r => filters.every(f => f(r)))
        if (patch) { for (const r of out) Object.assign(r, patch); return { data: null, error: null } }
        if (order) out = [...out].sort((a, b) => (a[order!.col] < b[order!.col] ? -1 : 1) * (order!.asc ? 1 : -1))
        return { data: out.slice(0, limit), error: null }
      }
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return q },
        is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return q },
        ilike: (c: string, v: string) => { filters.push(r => String(r[c] ?? '').toLowerCase() === v.toLowerCase()); return q },
        order: (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return q },
        limit: (n: number) => { limit = n; return q },
        maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
        single: async () => ({ data: inserted, error: null }),
        then: (res: (v: unknown) => void) => res(run()),
        update: (p: Row) => { patch = p; return q },
        insert: (row: Row) => { inserted = { id: `new-${++seq}`, ...row }; data.push(inserted); return q },
      }
      return q
    },
  }
}

const request: LeadExtraction = {
  is_travel_request: true, first_name: 'Narcís', last_name: 'Poch', phone: null, country: 'Spain', language: 'Spanish',
  destinations: ['Siwa'], travel_dates: 'November 2026', travellers: '2 adults', summary: 'Private trip to Siwa in November',
}

function inbox(conversations: Array<{ id: string; from: string; client_id?: string | null; inbound?: boolean }>, extra: Record<string, Row[]> = {}) {
  return fakeDb({
    email_conversations: conversations.map((c, i) => ({ id: c.id, user_id: 'u1', client_id: c.client_id ?? null, subject: 'Siwa noviembre 2026', lead_checked_at: null, created_at: `2026-09-17T0${i}:00:00Z` })),
    email_messages: conversations.filter(c => c.inbound !== false).map(c => ({ conversation_id: c.id, direction: 'inbound', from_address: c.from, subject: 'Siwa noviembre 2026', body_text: 'Hola, queremos ir a Siwa', sent_at: '2026-09-17T06:43:00Z' })),
    gmail_tokens: [{ email: 'info@travel2egypt.org' }],
    organizations: [{ id: 'org1', office_email_addresses: [] }],
    organization_members: [{ user_id: 'u1', org_id: 'org1', created_at: '2026-01-01' }],
    clients: [], suppliers: [], b2b_partners: [], email_lead_dismissals: [],
    ...extra,
  })
}

describe('a travel request by email becomes a Lead', () => {
  it('creates the client as a lead from the email, with the trip in its notes, and links the conversation', async () => {
    const db = inbox([{ id: 'c1', from: 'Narcis Poch <poch.narcis@gmail.com>' }])
    const out = await processNewEmailLeads(db, { extract: async () => request })
    expect(out).toEqual([{ conversationId: 'c1', outcome: 'lead_created', clientId: 'new-1' }])
    const lead = db.tables.clients[0]
    expect(lead).toMatchObject({ org_id: 'org1', email: 'poch.narcis@gmail.com', first_name: 'Narcís', last_name: 'Poch', status: 'lead', lead_source: 'email', preferred_language: 'Spanish' })
    expect(lead.internal_notes).toContain('Destinations: Siwa')
    expect(db.tables.email_conversations[0]).toMatchObject({ client_id: 'new-1', lead_check: 'lead_created' })
  })

  it('not a request, the office, a known contact, a dismissed sender: no lead, and the AI is not asked for the last three', async () => {
    let asked = 0
    const db = inbox([
      { id: 'spam', from: 'hola@biblinkmail.com' },
      { id: 'office', from: 'Rabab <hello@travel2egypt.org>' },
      { id: 'supplier', from: 'shereif.ali@oberoihotels.com' },
      { id: 'dismissed', from: 'avasofia024@gmail.com' },
    ], {
      suppliers: [{ contact_email: 'shereif.ali@oberoihotels.com' }],
      email_lead_dismissals: [{ org_id: 'org1', email: 'avasofia024@gmail.com' }],
    })
    const out = await processNewEmailLeads(db, { extract: async () => { asked++; return { ...request, is_travel_request: false } } })
    expect(out.map(o => [o.conversationId, o.outcome])).toEqual([
      ['spam', 'not_a_request'], ['office', 'office'], ['supplier', 'known_contact'], ['dismissed', 'dismissed'],
    ])
    expect(asked).toBe(1)
    expect(db.tables.clients).toEqual([])
  })

  it('each conversation is judged once', async () => {
    const db = inbox([{ id: 'c1', from: 'x@example.com' }])
    await processNewEmailLeads(db, { extract: async () => request })
    expect(await processNewEmailLeads(db, { extract: async () => request })).toEqual([])
  })

  it('an AI failure is recorded, never a lead', async () => {
    const db = inbox([{ id: 'c1', from: 'x@example.com' }])
    const out = await processNewEmailLeads(db, { extract: async () => null })
    expect(out[0].outcome).toBe('error')
    expect(db.tables.clients).toEqual([])
  })
})

describe('helpers', () => {
  it('a name from the sender when the email gives none', () => {
    expect(nameFromSender('"Jane Van Dyke" <jane@x.com>')).toEqual({ first: 'Jane Van', last: 'Dyke' })
    expect(nameFromSender('jane.doe@x.com')).toEqual({ first: 'jane.doe', last: '-' })
    expect(leadNotes(request, 'Siwa', '2026-09-17T06:43:00Z').split('\n')[0]).toBe('Lead from email (2026-09-17): Siwa')
  })

  it('the scheduled sync runs lead detection; the inbox offers "Not a lead"', () => {
    expect(readFileSync('app/api/cron/gmail-sync/route.ts', 'utf8')).toContain('processNewEmailLeads(db)')
    expect(readFileSync('components/unified/UnifiedMessageThread.tsx', 'utf8')).toContain("fetch('/api/email/leads/dismiss'")
    const dismiss = readFileSync('app/api/email/leads/dismiss/route.ts', 'utf8')
    expect(dismiss).toContain("client.status !== 'lead' || client.lead_source !== 'email'")
  })
})
