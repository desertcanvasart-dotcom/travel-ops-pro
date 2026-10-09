// The WhatsApp receipt, contract and invoice sends read their record by id
// alone with a service-role client, so anyone signed in could send another
// org's receipt, contract or invoice to that org's client (and flip the
// invoice to "sent"). Receipts also went out for pending, failed and refunded
// payments, contracts crashed on a trip with no price and named "Cairo,
// Luxor, Aswan" and "Egypt Tour" for every trip, and every message was signed
// with one install-wide business name.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Call = { table: string; op: string; args: unknown[] }
const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; args: unknown[] }[],
  rows: {} as Record<string, unknown>,
  sent: [] as { to: string; body: string }[],
}))

function chain(table: string) {
  const result = () => ({ data: h.rows[table] ?? null, error: h.rows[table] ? null : { message: 'none' } })
  const proxy: any = new Proxy({}, { // eslint-disable-line @typescript-eslint/no-explicit-any
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result())
      if (prop === 'single' || prop === 'maybeSingle') return async () => result()
      return (...args: unknown[]) => { h.calls.push({ table, op: prop, args }); return proxy }
    },
  })
  return proxy
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
  orgIdentity: async () => ({ name: 'Nile Journeys', email: 'hi@nile.example', phone: '', website: '', address: '', tagline: '' }),
}))
vi.mock('@/lib/twilio-whatsapp', () => ({
  sendWhatsAppMessage: async (m: { to: string; body: string }) => { h.sent.push(m); return { success: true, messageId: 'wa' } },
}))
vi.mock('@/lib/storage/outbound-documents', () => ({ uploadOutboundPdf: async () => 'https://signed' }))

import { POST as sendReceipt } from '@/app/api/whatsapp/send-receipt/route'
import { POST as sendContract } from '@/app/api/whatsapp/send-contract/route'
import { POST as sendInvoice } from '@/app/api/whatsapp/send-invoice/route'
import { contractPrice, contractPricePerPerson, describeDestinations } from '@/lib/contract-facts'

const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) }) as never
const orgFilters = (table: string) =>
  h.calls.filter((c: Call) => c.table === table && c.op === 'eq' && c.args[0] === 'org_id').map(c => c.args[1])

const payment = (payment_status: string) => ({
  id: 'pay-1', payment_status, amount: 500, currency: 'USD', payment_method: 'cash', payment_date: null,
  created_at: '2026-10-01T00:00:00Z', transaction_reference: null,
  itineraries: { id: 'it-1', itinerary_code: 'IT-1', client_name: 'Jamie', client_phone: '+201000000000' },
})

beforeEach(() => { h.calls.length = 0; h.sent.length = 0; h.rows = {} })

describe('POST /api/whatsapp/send-receipt', () => {
  it('reads the payment only within the caller’s org', async () => {
    await sendReceipt(post({ paymentId: 'pay-1' }))
    expect(orgFilters('payments')).toEqual(['org-A'])
  })

  it.each(['pending', 'failed', 'refunded'])('sends no receipt for a %s payment', async (status) => {
    h.rows.payments = payment(status)
    expect((await sendReceipt(post({ paymentId: 'pay-1' }))).status).toBe(409)
    expect(h.sent).toHaveLength(0)
  })

  it('signs a completed payment’s receipt as the org, never with "1 January 1970"', async () => {
    h.rows.payments = payment('completed')
    expect((await sendReceipt(post({ paymentId: 'pay-1' }))).status).toBe(200)
    expect(h.sent[0].body).toContain('Nile Journeys Team')
    expect(h.sent[0].body).not.toContain('1970')
  })
})

describe('POST /api/whatsapp/send-contract', () => {
  const itinerary = {
    id: 'it-1', itinerary_code: 'IT-1', client_name: 'Jamie', client_phone: '+201000000000',
    trip_name: null, total_cost: null, currency: 'EUR', num_adults: 2, num_children: 0,
    start_date: '2026-11-01', end_date: '2026-11-08', destinations: ['Hurghada', 'Siwa'],
  }

  it('reads the itinerary only within the caller’s org', async () => {
    await sendContract(post({ itineraryId: 'it-1' }))
    expect(orgFilters('itineraries')).toEqual(['org-A'])
  })

  it('sends a trip with no price or name, with its own destinations', async () => {
    h.rows.itineraries = itinerary
    const res = await sendContract(post({ itineraryId: 'it-1' }))
    expect(res.status).toBe(200)
    const body = h.sent[0].body
    expect(body).toContain('To be confirmed')
    expect(body).toContain('Your tour')
    expect(body).not.toMatch(/Egypt Tour|NaN|🐪/)
    expect(body).toContain('Nile Journeys')
  })
})

describe('POST /api/whatsapp/send-invoice', () => {
  it('reads and marks the invoice only within the caller’s org', async () => {
    await sendInvoice(post({ invoiceId: 'inv-1' }))
    expect(orgFilters('invoices')).toEqual(['org-A'])
  })
})

describe('contract facts', () => {
  it('price "To be confirmed" with no total, never NaN; no per-person without travellers', () => {
    expect(contractPrice(null, 'EUR')).toBe('To be confirmed')
    expect(contractPrice(Number.NaN, 'EUR')).toBe('To be confirmed')
    expect(contractPrice(1500, 'EUR')).toBe('EUR 1,500')
    expect(contractPricePerPerson(1500, 0)).toBeNull()
    expect(contractPricePerPerson(1500, 3)).toBe(500)
    expect(describeDestinations(['Cairo', '', 'Siwa'])).toBe('Cairo, Siwa')
  })
})

describe('the pages', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')

  it('the receipt offers nothing to send unless the payment is completed', () => {
    const page = read('app/documents/receipt/[id]/page.tsx')
    expect(page).toContain("const received = payment.payment_status === 'completed'")
    expect(page).toContain('{received && payment.client_phone && (')
    expect(page).not.toContain('router.back()')
    expect(page).not.toContain('Cairo, Egypt')
    expect(read('app/receipts/page.tsx')).toContain("itineraryPayments.filter((p: any) => p.payment_status === 'completed')")
    expect(read('app/payments/[id]/page.tsx')).toMatch(/payment\.payment_status === 'completed' && \(\s*<Link\s+href=\{withReturnTo\(`\/documents\/receipt\//)
  })

  it('the payment API returns the client’s phone and email', () => {
    const route = read('app/api/payments/[id]/route.ts')
    expect(route).toContain('client_phone: payment.itineraries?.client_phone')
    expect(route).toContain('client_email: payment.itineraries?.client_email')
  })

  it('the contract shows the trip’s currency and survives no price', () => {
    const page = read('app/documents/contract/[id]/page.tsx')
    expect(page).not.toContain("currency: 'USD',")
    expect(page).not.toContain('contractData.totalCost.toLocaleString()')
    expect(page).toContain('contractPrice(contractData.totalCost, currency)')
  })
})
