// ============================================
// The rules a B2B or B2C quote is edited, priced and expired by
// ============================================
// Sell audit (2026-10-13). Pure functions, no database:
//   - lib/quotes/validity.ts      an open offer past valid_until reads expired
//   - lib/quotes/lock.ts          converted / booked quotes are read-only
//   - lib/b2b/quote-updates.ts    what a B2B PUT may change
//   - lib/b2c/quote-updates.ts    what a B2C PUT may change; whose party and
//                                 currency an offer is priced in
//   - lib/b2b/quote-pricing.ts    what POST asks the engine, what it stores
//   - lib/b2b/convert-money.ts    converted lines add up to the quote
import { describe, it, expect } from 'vitest'
import { effectiveQuoteStatus, isPastValidUntil, statusFilter, withEffectiveStatus } from '@/lib/quotes/validity'
import { canDeleteQuotes, deleteRefusalMessage, quoteLockReason } from '@/lib/quotes/lock'
import { pickB2bQuoteUpdates } from '@/lib/b2b/quote-updates'
import { itineraryPax, offerCostBase, pickB2cQuoteUpdates, resolveOfferCurrency, resolveTravellers } from '@/lib/b2c/quote-updates'
import { enginePricingRequest, priceMoved, quoteColumnsFromEngine } from '@/lib/b2b/quote-pricing'
import { allocateClientPrices } from '@/lib/b2b/convert-money'
import { priceB2cQuote } from '@/lib/b2c/quote-price'

const TODAY = '2026-10-13'

describe('valid until (#11)', () => {
  it('an open offer past its date reads expired; the date itself is still valid', () => {
    expect(effectiveQuoteStatus('sent', '2026-10-12', TODAY)).toBe('expired')
    expect(effectiveQuoteStatus('draft', '2026-10-12', TODAY)).toBe('expired')
    expect(effectiveQuoteStatus('sent', '2026-10-13', TODAY)).toBe('sent')
    expect(effectiveQuoteStatus('sent', null, TODAY)).toBe('sent')
    expect(isPastValidUntil('2026-10-13T00:00:00Z', TODAY)).toBe(false)
  })

  it('a decided quote keeps its status whatever the date', () => {
    for (const s of ['accepted', 'rejected', 'converted']) expect(effectiveQuoteStatus(s, '2020-01-01', TODAY)).toBe(s)
  })

  it('a row keeps what is stored next to what is shown', () => {
    expect(withEffectiveStatus({ status: 'sent', valid_until: '2026-01-01' }, TODAY)).toMatchObject({ status: 'expired', stored_status: 'sent' })
  })

  it('the status filter agrees with what is shown', () => {
    expect(statusFilter('expired', TODAY)).toEqual({ or: ['status.eq.expired,and(status.in.(draft,sent),valid_until.lt.2026-10-13)'] })
    expect(statusFilter('sent', TODAY)).toEqual({ eq: 'sent', or: ['valid_until.is.null,valid_until.gte.2026-10-13'] })
    expect(statusFilter('accepted', TODAY)).toEqual({ eq: 'accepted', or: [] })
  })
})

describe('converted and booked quotes (#3, #6, #14)', () => {
  it('a booking or a conversion locks the quote', () => {
    expect(quoteLockReason({ status: 'accepted' }, 1)).toBe('booked')
    expect(quoteLockReason({ status: 'converted' }, 0)).toBe('converted')
    expect(quoteLockReason({ status: 'accepted', converted_to_itinerary_id: 'it-1' }, 0)).toBe('converted')
    expect(quoteLockReason({ status: 'accepted' }, 0)).toBeNull()
  })

  it('deleting is manager and above, and the refusal says why', () => {
    expect(['owner', 'admin', 'manager'].every(canDeleteQuotes)).toBe(true)
    expect(canDeleteQuotes('agent')).toBe(false)
    expect(canDeleteQuotes(null)).toBe(false)
    expect(deleteRefusalMessage('booked')).toMatch(/booking/)
    expect(deleteRefusalMessage('converted')).toMatch(/converted to an itinerary/)
  })
})

describe('B2B PUT allowlist (#1, #2, #3)', () => {
  const open = { valid_until: '2026-12-31', lock: null }

  it('prices, the quote number, the conversion fields and authorship are not taken', () => {
    const r = pickB2bQuoteUpdates({
      selling_price: 1, total_cost: 1, price_per_person: 1, services_snapshot: [], quote_number: 'QT-2026-X1',
      converted_to_itinerary_id: 'it-9', converted_at: 'now', source: 'x', created_by: 'u', org_id: 'o', notes: 'hello',
    }, open, TODAY)
    expect(r).toEqual({ ok: true, updates: { notes: 'hello' } })
  })

  it("'converted' is refused: only convert sets it", () => {
    expect(pickB2bQuoteUpdates({ status: 'converted' }, open, TODAY)).toMatchObject({ ok: false, status: 400 })
    expect(pickB2bQuoteUpdates({ status: 'paid' }, open, TODAY)).toMatchObject({ ok: false, status: 400 })
    expect(pickB2bQuoteUpdates({ status: 'sent' }, open, TODAY)).toEqual({ ok: true, updates: { status: 'sent' } })
  })

  it('a converted or booked quote changes its notes only', () => {
    expect(pickB2bQuoteUpdates({ notes: 'n' }, { lock: 'booked' }, TODAY)).toEqual({ ok: true, updates: { notes: 'n' } })
    expect(pickB2bQuoteUpdates({ status: 'draft' }, { lock: 'converted' }, TODAY)).toMatchObject({ ok: false, status: 409 })
    expect(pickB2bQuoteUpdates({ client_name: 'X' }, { lock: 'booked' }, TODAY)).toMatchObject({ ok: false, status: 409 })
  })

  it('an expired offer is not accepted until its date is extended', () => {
    expect(pickB2bQuoteUpdates({ status: 'accepted' }, { valid_until: '2026-10-01', lock: null }, TODAY)).toMatchObject({ ok: false, status: 409 })
    expect(pickB2bQuoteUpdates({ status: 'accepted', valid_until: '2026-11-30' }, { valid_until: '2026-10-01', lock: null }, TODAY))
      .toEqual({ ok: true, updates: { status: 'accepted', valid_until: '2026-11-30' } })
  })

  it('a field of the wrong shape refuses the whole update', () => {
    expect(pickB2bQuoteUpdates({ notes: 5, status: 'sent' }, open, TODAY)).toMatchObject({ ok: false, status: 400 })
    expect(pickB2bQuoteUpdates({ valid_until: '13/10/2026' }, open, TODAY)).toMatchObject({ ok: false, status: 400 })
  })
})

describe('B2C offers (#13, #14, #15, #16)', () => {
  it('the party is the itinerary’s; another number is refused with the way forward', () => {
    expect(itineraryPax({ num_adults: 3, num_children: 1 })).toBe(4)
    expect(itineraryPax({ num_adults: 0, num_travelers: 5 })).toBe(5)
    expect(itineraryPax({})).toBeNull()
    expect(resolveTravellers(undefined, 4)).toEqual({ travellers: 4 })
    expect(resolveTravellers(4, 4)).toEqual({ travellers: 4 })
    const r = resolveTravellers(2, 4)
    expect('error' in r && r.error).toMatch(/priced for 4 traveller\(s\).*re-price the itinerary for 2/)
    expect(resolveTravellers(3, null)).toEqual({ travellers: 3 })
    expect(resolveTravellers(0, null)).toHaveProperty('error')
  })

  it('a 4-person trip offered without a traveller count is per person over 4', () => {
    const t = resolveTravellers(undefined, itineraryPax({ num_adults: 4 }))
    if ('error' in t) throw new Error(t.error)
    const p = priceB2cQuote({ totalCost: 4000, marginPercent: 25, travelers: t.travellers, seasonUpliftPercent: 0, currency: 'EUR' })
    expect(p.selling_price).toBe(5000)
    expect(p.price_per_person).toBe(1250)
  })

  it('the currency is the itinerary’s: another is refused, not relabelled', () => {
    expect(resolveOfferCurrency(undefined, 'eur')).toEqual({ currency: 'EUR' })
    expect(resolveOfferCurrency('EUR', 'EUR')).toEqual({ currency: 'EUR' })
    expect(resolveOfferCurrency('JPY', 'EUR')).toHaveProperty('error')
  })

  it('cost comes from the supplier cost, total_cost only for legacy trips', () => {
    expect(offerCostBase({ supplier_cost: 800, total_cost: 1000 })).toBe(800)
    expect(offerCostBase({ supplier_cost: null, total_cost: 1000 })).toBe(1000)
  })

  it('PUT takes margin (0–100), status, notes and the date — not the cost, currency or number', () => {
    const open = { valid_until: '2026-12-31', lock: null }
    expect(pickB2cQuoteUpdates({ total_cost: 1, currency: 'JPY', quote_number: 'X', created_by: 'u', season_uplift_percent: 50, margin_percent: 30 }, open, TODAY))
      .toEqual({ ok: true, updates: { margin_percent: 30 } })
    expect(pickB2cQuoteUpdates({ margin_percent: -50 }, open, TODAY)).toMatchObject({ ok: false, status: 400 })
    expect(pickB2cQuoteUpdates({ margin_percent: 150 }, open, TODAY)).toMatchObject({ ok: false, status: 400 })
    expect(pickB2cQuoteUpdates({ margin_percent: 10 }, { lock: 'booked' }, TODAY)).toMatchObject({ ok: false, status: 409 })
    expect(pickB2cQuoteUpdates({ client_notes: 'see you' }, { lock: 'booked' }, TODAY)).toEqual({ ok: true, updates: { client_notes: 'see you' } })
    expect(pickB2cQuoteUpdates({ status: 'accepted' }, { valid_until: '2026-01-01', lock: null }, TODAY)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('B2B price from the engine (#1, #5)', () => {
  it('asks the engine with the calculator’s inputs, never its prices', () => {
    const req = enginePricingRequest({
      variation_id: 'v1', num_adults: 4, num_children: 0, travel_date: '2027-05-01', is_eur_passport: false,
      margin_percent: 0, tier: 'deluxe', language: 'Japanese', tour_leader_included: true, guide_grade: 'senior',
      guide_mode: 'throughout', selected_optional_ids: ['o1', 7], extras: ['e1'], selling_price: 1, total_cost: 1,
    })
    expect(req).toEqual({
      variation_id: 'v1', num_pax: 4, travel_date: '2027-05-01', is_eur_passport: false, margin_percent: 0,
      tier: 'deluxe', language: 'Japanese', tour_leader_included: true, guide_grade: 'senior', guide_mode: 'throughout',
      selected_optional_ids: ['o1'], extras: ['e1'],
    })
    expect(enginePricingRequest({ variation_id: 'v', num_adults: 2, num_children: 1 })).toMatchObject({ num_adults: 2, num_children: 1 })
  })

  it('stores the engine’s figures, the season premium included, and only bookable lines + chosen options', () => {
    const cols = quoteColumnsFromEngine({
      services: [{ service_name: 'Hotel', line_total: 400 }, { service_name: 'Lunch', included: true, issue: 'Included' }],
      optional_services: [{ service_name: 'Balloon', is_selected: true }, { service_name: 'Show', is_selected: false }],
      total_cost: 400, margin_percent: 25, margin_amount: 100, selling_price: 575, price_per_person: 287.5,
      currency: 'USD', season_uplift: { season_name: 'Golden Week (Japan)', percent: 15, amount: 75 },
    })
    expect(cols.services_snapshot.map((s) => s.service_name)).toEqual(['Hotel', 'Balloon'])
    expect(cols).toMatchObject({ total_cost: 400, margin_amount: 100, selling_price: 575, currency: 'USD', season_name: 'Golden Week (Japan)', season_uplift_percent: 15, season_uplift_amount: 75 })
    // The legacy varchar(20) column gets a name that fits.
    expect(cols.season!.length).toBeLessThanOrEqual(20)
    // The breakdown adds up: cost + margin + premium = selling.
    expect(cols.total_cost + cols.margin_amount + cols.season_uplift_amount).toBe(cols.selling_price)
  })

  it('a save whose shown price moved is caught; one minor unit is not a move', () => {
    expect(priceMoved(1, 5000, 'EUR')).toBe(true)
    expect(priceMoved(5000.01, 5000, 'EUR')).toBe(false)
    expect(priceMoved(5001, 5000, 'JPY')).toBe(false)
    expect(priceMoved(5002, 5000, 'JPY')).toBe(true)
    expect(priceMoved(undefined, 5000, 'EUR')).toBe(false)
    expect(priceMoved('abc', 5000, 'EUR')).toBe(true)
  })
})

describe('converted lines add up to the quote (#4)', () => {
  it('a 0% margin quote’s lines are not marked up 25%', () => {
    const lines = allocateClientPrices([300, 700], 1000, 'EUR')
    expect(lines).toEqual([300, 700])
  })

  it('the selling price (premium and tour leader inside it) is shared by cost, to the cent', () => {
    const lines = allocateClientPrices([333.33, 333.33, 333.34, 0], 1437.5, 'EUR')
    expect(lines[3]).toBe(0)
    expect(Math.round(lines.reduce((a, b) => a + b, 0) * 100) / 100).toBe(1437.5)
    for (const l of lines) expect(Math.round(l * 100)).toBe(l * 100)
  })

  it('in whole yen', () => {
    const lines = allocateClientPrices([1, 1, 1], 1000, 'JPY')
    expect(lines.every(Number.isInteger)).toBe(true)
    expect(lines.reduce((a, b) => a + b, 0)).toBe(1000)
  })

  it('nothing to share by: lines stay at 0', () => {
    expect(allocateClientPrices([0, 0], 500, 'EUR')).toEqual([0, 0])
  })
})
