// ============================================
// No VAT on extras or insurance — through the real routes
// ============================================
// Owner's decision (2026-10-13): "No taxes over extras or insurance." An
// invoice that carries a traveller's insurance premium and a confirmed extra
// records VAT on the rest only; a B2B quote with a catalogue extra likewise;
// a B2C offer leaves out its trip's extras lines; a deposit and its final
// still add up. Runs on the in-memory Supabase mock; the B2B engine is canned.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { setMockTables, createMockClient } from '../_mock-supabase'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-1',
  getCurrentUserId: async () => 'user-1',
  getCurrentUserRole: async () => 'manager',
  noOrgResponse: () => new Response(JSON.stringify({ error: 'no org' }), { status: 403 }),
}))
vi.mock('@/lib/auto-pricing-service', () => ({ loadSeasonWindows: async () => [] }))
vi.mock('@/lib/org-rate-currency', async (orig) => ({ ...(await orig<typeof import('@/lib/org-rate-currency')>()), getOrgRateCurrency: async () => 'JPY' }))
vi.mock('@/lib/accounting', () => ({ syncInvoice: async () => undefined }))
vi.mock('@/lib/org-refs', () => ({ recordsInOrg: async () => true }))
vi.mock('@/lib/document-numbering', () => ({
  nextDocumentNumber: async () => 'INV-2026-001',
  insertWithUniqueRetry: async ({ generateRow, insert }: { generateRow: () => Promise<unknown>; insert: (r: unknown) => Promise<unknown> }) => insert(await generateRow()),
}))

// The calculator's answer for a quote with one catalogue extra: fast-track,
// cost ¥4,000, taking the 25% margin → ¥5,000 of the ¥105,000 selling price.
const ENGINE = {
  services: [
    { service_id: 's1', service_name: 'Hotel', service_category: 'accommodation', rate_source: 'accommodation_rates', line_total: 80000, day_number: 1 },
    { service_id: 'x1', service_name: 'Fast-track', service_category: 'extra', rate_source: 'extras_catalogue', line_total: 4000, day_number: null, extra: { unit: 'per_booking', pinned: false, sell_total: null, margin_total: 0, cost_known: true } },
  ],
  optional_services: [],
  total_cost: 84000, margin_percent: 25, margin_amount: 21000, selling_price: 105000, price_per_person: 52500,
  tour_leader_cost: 0, single_supplement: 0, currency: 'JPY', season_uplift: null,
}
vi.mock('@/app/api/b2b/calculate-price/route', () => ({ POST: async () => Response.json({ success: true, data: ENGINE }) }))

import { POST as createInvoice } from '@/app/api/invoices/route'
import { PUT as editInvoice } from '@/app/api/invoices/[id]/route'
import { POST as createB2bQuote } from '@/app/api/b2b/quotes/route'
import { POST as createOffer } from '@/app/api/b2c/quotes/route'
import { updateB2bQuote } from '@/lib/b2b/update-quote'
import { readInvoiceVat, readVat, vatMarker } from '@/lib/vat'

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/x', { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
const call = async (res: Response) => ({ status: res.status, json: await res.json() })
const rows = async (t: string) => (await (createMockClient().from(t) as any).select('*')).data as any[]
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  setMockTables({
    organizations: [{ id: 'org-1', default_margin_percent: 25, vat_rate: 14 }],
    itineraries: [
      // A trip with a confirmed insurance premium and an extra, no extras lines of its own.
      { id: 'it-ins', org_id: 'org-1', total_cost: 100000, currency: 'JPY', num_adults: 2, vat_applied: true, vat_rate: 14 },
      // A trip whose lines include an extra: ¥10,000 of its ¥100,000 client total.
      { id: 'it-lines', org_id: 'org-1', start_date: '2027-03-01', supplier_cost: 80000, total_cost: 100000, currency: 'JPY', num_adults: 2, num_children: 0, vat_applied: true, vat_rate: 14 },
    ],
    itinerary_days: [{ id: 'd-1', itinerary_id: 'it-lines' }],
    itinerary_services: [
      { id: 'l-1', itinerary_day_id: 'd-1', service_type: 'accommodation', total_cost: 72000, client_price: 90000 },
      { id: 'l-2', itinerary_day_id: 'd-1', service_type: 'extra', total_cost: 8000, client_price: 10000 },
    ],
    booking_passengers: [
      { id: 'p-1', first_name: 'Aiko', last_name: 'Sato', insurance_plan_code: 'A1', insurance_premium_jpy: 12200, insurance_confirmed_at: '2026-10-01', bookings: { itinerary_id: 'it-ins', org_id: 'org-1' } },
    ],
    booking_extras: [
      { id: 'x-1', org_id: 'org-1', title: 'Balloon ride', kind: 'addon', quantity: 2, unit_price: 9000, currency: 'JPY', status: 'confirmed', invoiced_at: null, bookings: { itinerary_id: 'it-ins', org_id: 'org-1' } },
    ],
    invoices: [],
    tour_quotes: [
      { id: 'q-x', org_id: 'org-1', status: 'draft', valid_until: '2099-01-01', selling_price: 105000, currency: 'JPY', margin_percent: 25, season_uplift_percent: 0, services_snapshot: ENGINE.services, vat_applied: false, vat_amount: 0 },
    ],
    tour_variations: [{ id: 'var-1', org_id: 'org-1', template_id: 'tpl-1' }],
    quote_versions: [],
    b2c_quotes: [],
    bookings: [],
    clients: [],
  })
})

const base = { client_name: 'C', client_id: 'cl-1', currency: 'JPY', line_items: [{ description: 'Trip', quantity: 1, unit_price: 100000, amount: 100000 }] }

describe('invoice with insurance and an extra', () => {
  it('records VAT on the remainder only; the premium and the extra are still billed', async () => {
    const { status, json } = await call(await createInvoice(req('POST', { ...base, itinerary_id: 'it-ins', total_amount: 100000, vat_applied: true })))
    expect(status).toBe(201)
    // Net 100,000 + insurance 12,200 + extras 18,000 = 130,200; VAT 14% of 100,000.
    expect(json).toMatchObject({ subtotal: 130200, tax_rate: 14, tax_amount: 14000, total_amount: 144200, balance_due: 144200, vat_base: 100000 })
    expect(json.subtotal + json.tax_amount - json.discount_amount).toBe(json.total_amount)
    // The server's additions are tagged on the stored lines.
    expect(json.line_items.map((l: any) => l.source ?? null)).toEqual([null, 'insurance', 'extra'])
    expect(vatMarker(readInvoiceVat(json), 'JPY')).toBe('VAT 14% included: ¥14,000 (extras and insurance not taxed)')
  })

  it('a caller cannot tag its own line to shrink the base', async () => {
    const { json } = await call(await createInvoice(req('POST', {
      ...base, total_amount: 100000, vat_applied: true,
      line_items: [{ description: 'Trip', quantity: 1, unit_price: 100000, amount: 100000, source: 'insurance' }],
    })))
    expect(json).toMatchObject({ tax_amount: 14000, total_amount: 114000 })
    expect(json.vat_base).toBeUndefined()
    expect(json.line_items[0].source).toBeUndefined()
  })

  it('without VAT: "VAT not applied", nothing recorded', async () => {
    const { json } = await call(await createInvoice(req('POST', { ...base, itinerary_id: 'it-ins', total_amount: 100000, vat_applied: false })))
    expect(json).toMatchObject({ tax_amount: 0, total_amount: 130200 })
    expect(json.vat_base).toBeUndefined()
    expect(vatMarker(readInvoiceVat(json), 'JPY')).toBe('VAT not applied')
  })

  it('switching VAT on afterwards leaves the same lines out', async () => {
    const { json: inv } = await call(await createInvoice(req('POST', { ...base, itinerary_id: 'it-ins', total_amount: 100000, vat_applied: false })))
    const { status, json } = await call(await editInvoice(req('PUT', { vat_applied: true }), params(inv.id)))
    expect(status).toBe(200)
    expect(json).toMatchObject({ vat_applied: true, tax_amount: 14000, total_amount: 144200, vat_base: 100000 })
  })

  it('deposit + final still add up, and tax the trip without the additions', async () => {
    const dep = await call(await createInvoice(req('POST', { ...base, itinerary_id: 'it-ins', invoice_type: 'deposit', deposit_percent: 20, full_trip_cost: 100000, vat_applied: true })))
    // The deposit is 20% of the tour, no additions: VAT on all of it.
    expect(dep.json).toMatchObject({ total_amount: 22800, tax_amount: 2800 })
    expect(dep.json.vat_base).toBeUndefined()
    const fin = await call(await createInvoice(req('POST', { ...base, itinerary_id: 'it-ins', invoice_type: 'final', deposit_percent: 20, parent_invoice_id: dep.json.id, full_trip_cost: 100000 })))
    // Balance 80,000 + insurance 12,200 + extras 18,000 = 110,200; VAT on 80,000.
    expect(fin.json).toMatchObject({ vat_applied: true, tax_amount: 11200, total_amount: 121400, vat_base: 80000 })
    expect(dep.json.tax_amount + fin.json.tax_amount).toBe(14000)
    expect(dep.json.total_amount + fin.json.total_amount).toBe(130200 + 14000)
  })

  it('a trip whose lines include an extra: that share is left out too', async () => {
    const { json } = await call(await createInvoice(req('POST', { ...base, itinerary_id: 'it-lines', total_amount: 100000, vat_applied: true })))
    // ¥10,000 of the ¥100,000 trip is an extra: VAT on 90,000.
    expect(json).toMatchObject({ tax_amount: 12600, total_amount: 112600, vat_base: 90000 })
  })
})

describe('B2B quote with a catalogue extra', () => {
  it('records VAT on the selling price less the extra\'s share', async () => {
    const { status, json } = await call(await createB2bQuote(new NextRequest('http://localhost/api/b2b/quotes', {
      method: 'POST', body: JSON.stringify({ variation_id: 'var-1', num_adults: 2, extras: ['x1'], vat_applied: true }),
    })))
    expect(status).toBe(201)
    const saved = (await rows('tour_quotes')).find((q) => q.id === json.data.id)
    // 105,000 − 4,000 × 1.25 = 100,000; 14% = 14,000.
    expect(saved).toMatchObject({ selling_price: 105000, vat_applied: true, vat_rate: 14, vat_amount: 14000, vat_base: 100000 })
    expect(vatMarker(readVat(saved), 'JPY')).toBe('VAT 14% included: ¥14,000 (extras and insurance not taxed)')
    expect(vatMarker(readVat(saved), 'JPY', 'ja')).toBe('VAT（14%）適用：¥14,000（オプション・保険はVAT対象外）')
  })

  it('switched on in an edit: the same base; switched off: the base is cleared', async () => {
    const db = createMockClient() as never
    const on = await updateB2bQuote(db, { orgId: 'org-1', id: 'q-x', body: { vat_applied: true }, actor: null })
    expect(on.body.data).toMatchObject({ vat_applied: true, vat_amount: 14000, vat_base: 100000 })
    const off = await updateB2bQuote(db, { orgId: 'org-1', id: 'q-x', body: { vat_applied: false }, actor: null })
    expect(off.body.data).toMatchObject({ vat_applied: false, vat_amount: 0, vat_base: null })
    expect(vatMarker(readVat(off.body.data as never), 'JPY')).toBe('VAT not applied')
  })
})

describe('B2C offer', () => {
  it('leaves out its trip\'s extras lines\' share of the price', async () => {
    const { status, json } = await call(await createOffer(req('POST', { itinerary_id: 'it-lines', vat_applied: true })))
    expect(status).toBe(200)
    // Cost 80,000 + 25% = 100,000; extras are 8,000 of the 80,000 cost → 10,000 of the price.
    expect(json.data).toMatchObject({ selling_price: 100000, vat_applied: true, vat_rate: 14, vat_amount: 12600, vat_base: 90000 })
  })
})
