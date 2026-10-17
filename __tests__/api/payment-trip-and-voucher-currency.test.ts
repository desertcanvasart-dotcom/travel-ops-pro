// Operate › Documents audit #3 and #8.
//   #8 GET /api/payments/[id] (the invoice and receipt pages) embedded the
//      payment's trip and returned its client, phone, email and total with no
//      check that the trip is the caller's org — a legacy payment pointing at
//      the other company's trip printed that company's client on our PDF.
//   #3 the voucher editor's pickers copied rate-currency amounts onto a voucher
//      in another currency (and labelled meals and guides "€" whatever it was).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const state = vi.hoisted(() => ({ payment: null as Record<string, unknown> | null }))
vi.mock('@/lib/supabase-server', () => ({
  createServerClient: () => {
    const b: any = {
      select: () => b,
      eq: () => b,
      single: async () => ({ data: state.payment, error: null }),
    }
    return { from: () => b }
  },
}))
vi.mock('@/lib/auth/current-org', () => ({
  getCurrentOrgId: async () => 'org-A',
  noOrgResponse: () => new Response(null, { status: 403 }),
}))

import { GET } from '@/app/api/payments/[id]/route'
import { toVoucherAmount, voucherPickFx } from '@/lib/documents/voucher-pick-price'

const params = { params: Promise.resolve({ id: 'pay-1' }) } as never
const trip = (org_id: string) => ({
  org_id, itinerary_code: 'ITN-9', client_name: 'Their Client', client_phone: '+20100', client_email: 'c@their.example',
  total_cost: 9999, vat_applied: true, vat_rate: 14,
})

beforeEach(() => { state.payment = null })

describe('GET /api/payments/[id] shows only the caller’s own trip', () => {
  it("another company's trip is not shown: no client, contact, total or VAT", async () => {
    state.payment = { id: 'pay-1', org_id: 'org-A', amount: 100, itineraries: trip('org-B') }
    const { data } = await (await GET(new Request('http://x') as never, params)).json()
    expect(data.itineraries).toBeNull()
    expect(data).toMatchObject({ amount: 100, vat_applied: false, vat_rate: null })
    for (const k of ['itinerary_code', 'client_name', 'client_phone', 'client_email', 'total_cost']) expect(data[k]).toBeUndefined()
    expect(JSON.stringify(data)).not.toContain('Their Client')
  })

  it('its own trip is shown as before', async () => {
    state.payment = { id: 'pay-1', org_id: 'org-A', amount: 100, itineraries: trip('org-A') }
    const { data } = await (await GET(new Request('http://x') as never, params)).json()
    expect(data).toMatchObject({ itinerary_code: 'ITN-9', client_name: 'Their Client', client_email: 'c@their.example', total_cost: 9999, vat_applied: true, vat_rate: 14 })
  })
})

describe('a picked rate is converted into the voucher’s currency', () => {
  const frozen = { base: 'EUR', rates: { EUR: 1, JPY: 160, EGP: 50 }, frozen_at: '2026-01-01', frozen_by: null, source: 'test' }

  it('same currency: as is', () => {
    expect(voucherPickFx('EUR', 'EUR', null, null)).toBe(1)
  })

  it("at the trip's frozen rate first, else today's; null when neither is known", () => {
    expect(voucherPickFx('EUR', 'JPY', frozen, { base: 'EUR', rates: { JPY: 170 } })).toBe(160)
    expect(voucherPickFx('EUR', 'JPY', null, { base: 'EUR', rates: { JPY: 170 } })).toBe(170)
    expect(voucherPickFx('EUR', 'JPY', null, null)).toBeNull()
  })

  it('a €50 meal on a yen voucher is ¥8,000, not "50"', () => {
    expect(toVoucherAmount(50, voucherPickFx('EUR', 'JPY', frozen, null)!)).toBe(8000)
    expect(toVoucherAmount(12.345, 1)).toBe(12.35)
  })

  it('the editor uses it on every picker and labels every line in the voucher’s currency', () => {
    const page = readFileSync(path.join(process.cwd(), 'app/documents/supplier/[id]/edit/page.tsx'), 'utf8')
    expect(page).not.toContain("'\\u20AC'")
    expect(page).not.toMatch(/unit_rate: rate\.base_rate_eur/)
    for (const add of ['addRoute', 'addMeal', 'addGuide', 'addAttraction']) {
      const body = page.slice(page.indexOf(`const ${add} =`), page.indexOf(`const ${add} =`) + 900)
      expect(body, add).toMatch(/inVoucher\(/)
    }
  })
})
