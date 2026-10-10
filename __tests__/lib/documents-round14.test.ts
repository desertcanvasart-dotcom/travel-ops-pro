import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { priceB2cQuote } from '@/lib/b2c/quote-price'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('round 13 regressions', () => {
  it('API requests are never redirected to the canonical host (Twilio signs the URL it posts to)', () => {
    const mw = src('middleware.ts')
    expect(mw).toContain("request.nextUrl.pathname.startsWith('/api/') ? null : canonicalRedirectOrigin(")
    expect(src('lib/twilio-signature.ts')).toContain(".replace('://', '://www.')")
  })
  it('only platform admins assign WhatsApp numbers; profile saves leave it out unless changed', () => {
    const r = src('app/api/organization/branding/route.ts')
    expect(r).toContain('if (!isPlatformAdmin(me?.email))')
    expect(src('app/components/CompanyProfileCard.tsx')).toContain('whatsapp_number === loadedWhatsapp.current ? rest : form')
  })
  it('the WhatsApp inbox says why a send or a new chat failed', () => {
    const p = src('app/whatsapp-inbox/page.tsx')
    expect(p).toContain("alert(data.error || 'The message could not be sent')")
    expect(p).toContain("alert(data.error || 'The conversation could not be started')")
  })
})

describe('B2C quotes', () => {
  it('revision compare and revert are the org’s; a booked quote is not reverted', () => {
    expect(src('app/api/b2c/quotes/[id]/revisions/compare/route.ts')).toContain("parentQuoteInOrg(supabaseAdmin, 'b2c', id, orgId)")
    const rv = src('app/api/b2c/quotes/[id]/revisions/revert/route.ts')
    expect(rv).toContain("parentQuoteInOrg(supabaseAdmin, 'b2c', id, orgId)")
    expect(rv).toContain('A booked quote cannot be reverted')
  })
  it('create and edit check the trip and client', () => {
    expect(src('app/api/b2c/quotes/route.ts')).toContain('recordsInOrg(supabaseAdmin, orgId, { client_id })')
    expect(src('app/api/b2c/quotes/[id]/route.ts')).toContain('recordsInOrg(supabaseAdmin, orgId, { itinerary_id: updates.itinerary_id, client_id: updates.client_id })')
  })
  it('one price computation: premium kept on re-price, amounts in the currency’s units', () => {
    const yen = priceB2cQuote({ totalCost: 98765, marginPercent: 25, travelers: 3, seasonUpliftPercent: 15, currency: 'JPY' })
    expect(yen.margin_amount).toBe(24691)
    expect(yen.season_uplift_amount).toBe(Math.round((98765 + 24691) * 0.15))
    expect(yen.selling_price).toBe(98765 + 24691 + yen.season_uplift_amount)
    expect(Number.isInteger(yen.price_per_person)).toBe(true)
    const eur = priceB2cQuote({ totalCost: 1000, marginPercent: 20, travelers: 2, seasonUpliftPercent: 0, currency: 'EUR' })
    expect(eur).toEqual({ margin_amount: 200, season_uplift_amount: 0, selling_price: 1200, price_per_person: 600 })
    expect(src('app/api/b2c/quotes/[id]/route.ts')).toContain('seasonUpliftPercent: Number(updates.season_uplift_percent ?? existing?.season_uplift_percent ?? 0)')
  })
})

describe('bookings', () => {
  it('a single-payment booking keeps the whole total as its deposit through extras and added travellers', async () => {
    const { applyExtras, isSinglePayment } = await import('@/lib/booking-extras')
    const { computeAddTravellerReprice } = await import('@/lib/reprice-add-traveller')
    const single = { balance_due_date: null, deposit_amount: 500000, total_cost: 500000 }
    expect(isSinglePayment(single)).toBe(true)
    expect(isSinglePayment({ ...single, balance_due_date: '2026-12-01' })).toBe(false)
    expect(isSinglePayment({ ...single, deposit_amount: 100000 })).toBe(false)
    const applied = applyExtras({ baseTotalCost: null, totalCost: 500000, extrasTotal: 20000, depositPercent: 20, currency: 'JPY', singlePayment: true })
    expect(applied.deposit_amount).toBe(520000)
    const r = computeAddTravellerReprice({ oldTotal: 100000, oldPax: 3, addedPax: 1, depositPercent: 20, oldBalanceDue: 100000, currency: 'JPY', singlePayment: true })
    if (r.method !== 'per_person') throw new Error('expected per_person')
    expect(r.perPerson).toBe(33333)
    expect(r.newDepositAmount).toBe(r.newTotal)
    expect(Number.isInteger(r.newTotal)).toBe(true)
  })
  it('the convert card leaves the deposit to the org’s rule unless the operator changes it', () => {
    const c = src('app/components/ConvertToBookingCard.tsx')
    expect(c).toContain('...(depositEdited ? { deposit_percent: depositPercent } : {})')
    expect(c).toContain("fetch('/api/settings/payment-terms')")
  })
  it('a booking total is in its currency’s units; an extra’s supplier cost is converted to it', () => {
    expect(src('lib/booking-creation.ts')).toContain('const total = roundToCurrency(Number(input.total ?? itinerary.total_cost ?? 0), currency)')
    const e = src('app/api/bookings/[id]/extras/[eid]/route.ts')
    expect(e).toContain('convertCurrency(cost, costCurrency, bookingCurrency, await fetchRunExchangeRates())')
  })
})
