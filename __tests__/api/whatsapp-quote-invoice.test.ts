// "Send invoice via WhatsApp" drew its own PDF in Latin-only Helvetica, so any
// invoice with insurance lines (海外旅行傷害保障…), a kanji client name or
// Japanese notes failed to send, as did one with no client name. The WhatsApp
// quote signed with the install's BUSINESS_NAME and "exploring Egypt", took
// the recipient from the request, printed 1970 for an undated trip and moved
// a confirmed trip back to "sent".
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  eqs: [] as { table: string; col: string; val: unknown }[],
  updates: [] as { table: string; data: Record<string, unknown> }[],
  sent: [] as { to: string; body: string; mediaUrl?: string }[],
  uploaded: [] as Uint8Array[],
}))

function chain(table: string) {
  let mode: 'select' | 'update' = 'select'
  let payload: Record<string, unknown> = {}
  const done = () => {
    if (mode === 'update') { h.updates.push({ table, data: payload }); return { data: null, error: null } }
    const data = h.rows[table] ?? null
    return { data, error: data ? null : { message: 'none' } }
  }
  const b: Row = {
    select: () => b, order: () => b, limit: () => b,
    eq: (col: string, val: unknown) => { h.eqs.push({ table, col, val }); return b },
    update: (d: Record<string, unknown>) => { mode = 'update'; payload = d; return b },
    single: async () => done(), maybeSingle: async () => done(),
    then: (r: (v: unknown) => void) => r(done()),
  }
  return b
}
const client = { from: (t: string) => chain(t) }

vi.mock('@/lib/supabase-server', () => ({ createServerClient: () => client }))
vi.mock('@/lib/supabase/service-client', () => ({ createServiceClient: () => client }))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-A',
  noOrgResponse: () => new Response(null, { status: 403 }),
}))
vi.mock('@/lib/org-identity', async (orig) => ({
  ...(await orig<typeof import('@/lib/org-identity')>()),
  orgIdentity: async () => ({ name: 'さくら旅行', email: 'info@sakura.example', phone: '', website: '', address: '', tagline: '' }),
}))
vi.mock('@/lib/twilio-whatsapp', () => ({ sendWhatsAppMessage: async (m: { to: string; body: string }) => { h.sent.push(m); return { success: true, messageId: 'wa' } } }))
vi.mock('@/lib/storage/outbound-documents', () => ({ uploadOutboundPdf: async (_db: unknown, _name: string, bytes: Uint8Array) => { h.uploaded.push(bytes); return 'https://signed' } }))
vi.mock('@/lib/documents/inline-image', () => ({ inlineImage: async () => null }))
vi.mock('@/lib/pricing/itinerary-completeness', () => ({ loadItineraryServiceLines: async () => ({ ok: true, lines: [] }) }))

import { POST as sendInvoice } from '@/app/api/whatsapp/send-invoice/route'
import { POST as sendQuote } from '@/app/api/whatsapp/send-quote/route'

const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never

beforeEach(() => {
  h.rows = {}; h.eqs.length = 0; h.updates.length = 0; h.sent.length = 0; h.uploaded.length = 0
})

describe('POST /api/whatsapp/send-invoice', () => {
  it('sends an invoice with Japanese insurance lines and no client name', async () => {
    h.rows.invoices = {
      id: 'inv-1', org_id: 'org-A', invoice_number: 'INV-1', invoice_type: 'standard', status: 'draft',
      client_name: null, client_email: null, client_id: null, itinerary_id: 'it-1', currency: 'JPY',
      line_items: [
        { description: '海外旅行傷害保障 トラベルセーフティプラン A（山田太郎）', quantity: 1, unit_price: 5000, amount: 5000 },
        { description: null, quantity: 1, unit_price: 1000, amount: 1000 },
      ],
      subtotal: 6000, tax_rate: 0, tax_amount: 0, discount_amount: 0, total_amount: 6000, amount_paid: 0, balance_due: 6000,
      issue_date: '2026-10-09', due_date: null, notes: '入金確認後に確定', payment_terms: null, payment_instructions: null,
    }
    h.rows.itineraries = { client_phone: '+819000000000' }
    h.rows.organizations = { name: 'さくら旅行', contact_email: 'info@sakura.example' }
    const res = await sendInvoice(post({ invoiceId: 'inv-1' }))
    expect(res.status).toBe(200)
    expect(Buffer.from(h.uploaded[0]).toString('latin1').startsWith('%PDF-')).toBe(true)
    expect(h.sent[0].to).toBe('+819000000000')
  })

  it('no longer carries its own Latin-only pdf-lib invoice', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/whatsapp/send-invoice/route.ts'), 'utf8')
    expect(route).not.toContain('StandardFonts')
    expect(route).toContain('loadJapaneseFont()')
  })
})

describe('POST /api/whatsapp/send-quote', () => {
  const itinerary = (status: string, over: Row = {}) => ({
    id: 'it-1', org_id: 'org-A', status, client_name: 'Jamie', client_phone: '+201000000000', trip_name: null,
    currency: 'EUR', total_cost: 2400, start_date: null, end_date: null, num_adults: 2, num_children: 0, ...over,
  })

  it('reads the trip only within the org and sends to its own client, as the org', async () => {
    h.rows.itineraries = itinerary('draft')
    const res = await sendQuote(post({ itineraryId: 'it-1', clientPhone: '+19999999999', clientName: 'Someone' }))
    expect(res.status).toBe(200)
    expect(h.eqs.some(e => e.table === 'itineraries' && e.col === 'org_id' && e.val === 'org-A')).toBe(true)
    const msg = h.sent[0]
    expect(msg.to).toBe('+201000000000')
    expect(msg.body).toContain('さくら旅行')
    expect(msg.body).toContain('Dear Jamie')
    expect(msg.body).not.toMatch(/Egypt|🐪|🇪🇬|1970|Invalid Date|All entrance fees/)
    expect(h.updates).toContainEqual({ table: 'itineraries', data: expect.objectContaining({ status: 'sent' }) })
  })

  it('never moves a confirmed trip back to "sent"', async () => {
    h.rows.itineraries = itinerary('confirmed', { start_date: '2026-11-01', end_date: '2026-11-08' })
    await sendQuote(post({ itineraryId: 'it-1' }))
    expect(h.sent[0].body).toContain('1 November 2026 - 8 November 2026')
    expect(h.updates.some(u => u.table === 'itineraries')).toBe(false)
  })
})

describe('the B2B quote PDF', () => {
  const code = readFileSync(join(process.cwd(), 'app/api/b2b/quotes/[id]/pdf/route.ts'), 'utf8')

  it('escapes the tour banner fields', () => {
    expect(code).toContain('${esc(template?.template_name || quote.trip_name || labels.tourPackage)}')
    expect(code).toContain('${esc(variation?.variation_name ||')
  })

  it('lets no main-frame navigation out, only about: and data:', () => {
    expect(code).not.toMatch(/isNavigationRequest\(\) && req\.frame\(\) === page\.mainFrame\(\)\) return void req\.continue\(\)/)
    expect(code).toContain("if (scheme === 'data' || scheme === 'about') return void req.continue()")
  })
})
