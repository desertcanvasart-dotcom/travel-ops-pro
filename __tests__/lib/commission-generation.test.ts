import { describe, it, expect } from 'vitest'
import {
  buildCommissions,
  summariseSkips,
  unmappedServiceTypes,
  SERVICE_TYPE_TO_CATEGORY,
  type CommissionSourceService,
} from '@/lib/commission-generation'

// ============================================
// The route this backs had NEVER run: it queried `itinerary_services.day_id`
// (real column: `itinerary_day_id`) and read selling_price / cost / description
// (real: client_price / total_cost / service_name). Every call 500'd, which is
// why the commissions table is empty — and why the P&L reports every trip's
// full gross as net.
//
// These lock in the corrected field mapping, and the thing that makes a fixed
// version distinguishable from the broken one: a zero-commission run explains
// WHY, per service.
// ============================================

const CTX = {
  orgId: 'org-1',
  itineraryId: 'itin-1',
  itineraryCode: 'ITN-2026-1',
  clientId: 'client-1',
  startDate: '2026-09-01',
  currency: 'EUR',
  today: '2026-08-12',
}

const service = (over: Partial<CommissionSourceService> = {}): CommissionSourceService => ({
  id: 'svc-1',
  service_type: 'accommodation',
  service_name: 'Steigenberger Cairo — 3 nights',
  client_price: 1000,
  total_cost: 800,
  supplier_id: 'sup-1',
  commission_rate: null,
  commission_status: 'pending',
  supplier: {
    id: 'sup-1',
    name: 'Steigenberger',
    commission_type: 'receivable',
    default_commission_rate: 10,
  },
  ...over,
})

describe('field mapping (the reason this never worked)', () => {
  it('reads total_cost / service_name, not the columns that do not exist', () => {
    const { pairs } = buildCommissions([service()], CTX)
    expect(pairs).toHaveLength(1)

    const c = pairs[0].commission
    expect(c.base_amount).toBe(800)                        // total_cost
    expect(c.description).toContain('Steigenberger Cairo') // service_name
    expect(c.description).toContain('ITN-2026-1')
  })

  it("bases the commission on the SUPPLIER's price, never on our marked-up one", () => {
    // Operator decision 2026-08-12: a supplier's commission is a percentage of
    // what they charge. The pre-existing code used the client price first,
    // which over-claims against every supplier by the size of our margin.
    const { pairs } = buildCommissions([service({ client_price: 1000, total_cost: 800 })], CTX)
    expect(pairs[0].commission.base_amount).toBe(800)
    expect(pairs[0].commission.base_amount).not.toBe(1000)
    expect(pairs[0].commission.commission_amount).toBe(80) // 10% of 800, not of 1000
  })

  it('does NOT fall back to the client price when there is no supplier cost', () => {
    // Falling back would reintroduce the exact over-claim above, on precisely
    // the rows where nobody would notice.
    const { pairs, skipped } = buildCommissions(
      [service({ client_price: 1000, total_cost: null })],
      CTX
    )
    expect(pairs).toHaveLength(0)
    expect(skipped[0].reason).toBe('no_base_amount')
    expect(skipped[0].detail).toMatch(/SUPPLIER price/)
  })

  it('pairs each commission with its OWN service id', () => {
    // The pairing is what keeps claim/insert/rollback in lockstep. A previous
    // version matched two arrays positionally and mis-attributed commissions.
    const { pairs } = buildCommissions(
      [
        service({ id: 'a', total_cost: 0 }), // skipped: no supplier cost
        service({ id: 'b' }),
        service({ id: 'c' }),
      ],
      CTX
    )
    expect(pairs.map(p => p.serviceId)).toEqual(['b', 'c'])
  })
})

describe('commission arithmetic', () => {
  it('is supplier cost × rate percent, rounded to cents', () => {
    const { pairs } = buildCommissions([service({ total_cost: 1000 })], CTX)
    expect(pairs[0].commission.commission_amount).toBe(100)
    expect(pairs[0].commission.commission_rate).toBe(10)
  })

  it('does not emit float noise into the ledger', () => {
    const { pairs } = buildCommissions([service({ total_cost: 123.45 })], CTX)
    // 123.45 × 10% = 12.345 → 12.35 (and never 12.340000000000002)
    expect(pairs[0].commission.commission_amount).toBe(12.35)
  })

  it('prefers a rate set on the service over the supplier default', () => {
    const { pairs } = buildCommissions([service({ commission_rate: 15, total_cost: 1000 })], CTX)
    expect(pairs[0].commission.commission_rate).toBe(15)
    expect(pairs[0].commission.commission_amount).toBe(150)
  })
})

describe('skips are reported, never silent', () => {
  it('explains a service with no supplier', () => {
    const { pairs, skipped } = buildCommissions(
      [service({ supplier: null, supplier_id: null })],
      CTX
    )
    expect(pairs).toHaveLength(0)
    expect(skipped[0].reason).toBe('no_supplier')
    expect(skipped[0].service_name).toBe('Steigenberger Cairo — 3 nights')
    expect(skipped[0].detail).toBeTruthy()
  })

  it('explains the case that describes EVERY row in the database today: no rate', () => {
    // 12 of 89 services have a supplier; none has a rate, and every supplier's
    // default_commission_rate is 0 or null. A correct run still yields zero —
    // so it has to say why, or it looks exactly like the broken version.
    const { pairs, skipped } = buildCommissions(
      [
        service({ supplier: { ...service().supplier!, default_commission_rate: 0 } }),
        service({ id: 'svc-2', supplier: { ...service().supplier!, default_commission_rate: null } }),
      ],
      CTX
    )
    expect(pairs).toHaveLength(0)
    expect(skipped.map(s => s.reason)).toEqual(['no_rate', 'no_rate'])
    expect(skipped[0].detail).toMatch(/default_commission_rate/)
  })

  it('never creates a zero or negative commission off an unpriced service', () => {
    const { pairs, skipped } = buildCommissions(
      [
        service({ id: 'zero', total_cost: 0 }),
        service({ id: 'negative', total_cost: -50 }),
        service({ id: 'garbage', total_cost: 'abc' as unknown as number }),
      ],
      CTX
    )
    expect(pairs).toHaveLength(0)
    expect(skipped.map(s => s.reason)).toEqual(['no_base_amount', 'no_base_amount', 'no_base_amount'])
  })

  it('skips a service whose commission was already generated', () => {
    const { pairs, skipped } = buildCommissions(
      [service({ commission_status: 'generated' })],
      CTX
    )
    expect(pairs).toHaveLength(0)
    expect(skipped[0].reason).toBe('already_generated')
  })

  it('treats a missing commission_status as eligible', () => {
    const { pairs } = buildCommissions([service({ commission_status: null })], CTX)
    expect(pairs).toHaveLength(1)
  })

  it('summarises skips by reason', () => {
    const { skipped } = buildCommissions(
      [
        service({ id: 'a', supplier: null, supplier_id: null }),
        service({ id: 'b', supplier: null, supplier_id: null }),
        service({ id: 'c', total_cost: 0 }),
      ],
      CTX
    )
    expect(summariseSkips(skipped)).toEqual({ no_supplier: 2, no_base_amount: 1 })
  })
})

describe('category mapping', () => {
  it('maps the service types the app actually writes', () => {
    const cases: Array<[string, string]> = [
      ['accommodation', 'hotel'],
      ['meal', 'restaurant'],
      ['transportation', 'transport'],
      ['cruise', 'cruise'],
      ['entrance', 'attraction'],
      ['activity', 'activity'],
      ['flight', 'transport'],
    ]
    for (const [type, category] of cases) {
      const { pairs } = buildCommissions([service({ service_type: type })], CTX)
      expect(pairs[0].commission.category, type).toBe(category)
    }
  })

  it('maps BOTH spellings of the airport/hotel service types', () => {
    // Today's code writes the singular; older rows carry the plural.
    for (const type of ['airport_service', 'airport_services']) {
      const { pairs } = buildCommissions([service({ service_type: type })], CTX)
      expect(pairs[0].commission.category, type).toBe('transport')
    }
    for (const type of ['hotel_service', 'hotel_services']) {
      const { pairs } = buildCommissions([service({ service_type: type })], CTX)
      expect(pairs[0].commission.category, type).toBe('hotel')
    }
  })

  it('falls back to a category the UI can actually render', () => {
    // The old map keyed on 'hotel'/'transport'/'restaurant' — values the app
    // never writes — so everything fell through to 'other' anyway.
    const { pairs } = buildCommissions([service({ service_type: 'sky_diving' })], CTX)
    expect(pairs[0].commission.category).toBe('other')
  })

  it('covers every service type the routing table knows about', () => {
    expect(unmappedServiceTypes()).toEqual([])
  })

  it('only emits categories the commissions UI can render', () => {
    const RENDERABLE = new Set([
      'hotel', 'shopping', 'restaurant', 'transport', 'cruise', 'attraction',
      'optional_tour', 'activity', 'show', 'spa', 'agent_referral', 'partner', 'other',
    ])
    for (const category of Object.values(SERVICE_TYPE_TO_CATEGORY)) {
      expect(RENDERABLE.has(category), category).toBe(true)
    }
  })
})

describe('currency and date', () => {
  it("uses the TRIP's currency, not a hardcoded EUR", () => {
    // The P&L converts a commission at the rate on its own date, so a wrong
    // currency label silently turns a real amount into a wrong one.
    const { pairs } = buildCommissions([service()], { ...CTX, currency: 'usd' })
    expect(pairs[0].commission.currency).toBe('USD')
  })

  it('books the commission against the trip start date', () => {
    const { pairs } = buildCommissions([service()], CTX)
    expect(pairs[0].commission.transaction_date).toBe('2026-09-01')
  })

  it('falls back to today when the trip has no start date', () => {
    const { pairs } = buildCommissions([service()], { ...CTX, startDate: null })
    expect(pairs[0].commission.transaction_date).toBe('2026-08-12')
  })
})

describe('commission direction', () => {
  // Two directions (operator, 2026-08-22). WE RECEIVE a share of the
  // supplier's sale (a shop); WE PAY a supplier a share of OUR PROFIT (a guide
  // who sold an optional tour). Until then every commission was computed off
  // the supplier's cost regardless of direction — a "we pay" guide would have
  // been owed a percentage of their own invoice.
  const payable = (over: Partial<CommissionSourceService> = {}) =>
    service({
      id: 'tour-1',
      service_type: 'activity',
      service_name: 'Optional: Sound & Light at Karnak',
      client_price: 150,
      total_cost: 100,
      supplier: { id: 'guide-1', name: 'Ahmed (guide)', commission_type: 'payable', default_commission_rate: 20 },
      ...over,
    })

  it("takes the supplier's own commission_type", () => {
    const { pairs } = buildCommissions([payable()], CTX)
    expect(pairs[0].commission.commission_type).toBe('payable')
  })

  it('defaults to receivable when the supplier does not say', () => {
    const { pairs } = buildCommissions(
      [service({ supplier: { ...service().supplier!, commission_type: null } })],
      CTX
    )
    expect(pairs[0].commission.commission_type).toBe('receivable')
  })

  it('we receive: a share of the SUPPLIER price', () => {
    const { pairs } = buildCommissions([service({ client_price: 1000, total_cost: 800 })], CTX)
    expect(pairs[0].commission).toMatchObject({ commission_type: 'receivable', base_amount: 800, cost_amount: 800, commission_amount: 80 })
  })

  it('we pay: a share of OUR PROFIT on the service, never of the client price', () => {
    // client 150, cost 100 → profit 50 → 20% = 10. Not 20% of 150 (30) and
    // not 20% of 100 (20), which is what the old code would have paid.
    const { pairs } = buildCommissions([payable()], CTX)
    expect(pairs[0].commission).toMatchObject({
      commission_type: 'payable',
      base_amount: 50,
      cost_amount: 100,
      commission_rate: 20,
      commission_amount: 10,
    })
    expect(pairs[0].commission.notes).toMatch(/of profit/)
  })

  it('we pay: rounds the profit and the commission to cents', () => {
    const { pairs } = buildCommissions([payable({ client_price: 123.45, total_cost: 100.1 })], CTX)
    expect(pairs[0].commission.base_amount).toBe(23.35)
    expect(pairs[0].commission.commission_amount).toBe(4.67) // 20% of 23.35 = 4.67
  })

  it('we pay: no profit, no commission — and says so', () => {
    const { pairs, skipped } = buildCommissions(
      [
        payable({ id: 'break-even', client_price: 100, total_cost: 100 }),
        payable({ id: 'loss', client_price: 90, total_cost: 100 }),
      ],
      CTX
    )
    expect(pairs).toHaveLength(0)
    expect(skipped.map(s => s.reason)).toEqual(['no_profit', 'no_profit'])
    expect(skipped[0].detail).toMatch(/loss/)
  })

  it('we pay: a service with no client price has no profit to share', () => {
    const { pairs, skipped } = buildCommissions(
      [payable({ id: 'unpriced', client_price: null }), payable({ id: 'zero', client_price: 0 })],
      CTX
    )
    expect(pairs).toHaveLength(0)
    expect(skipped.map(s => s.reason)).toEqual(['no_client_price', 'no_client_price'])
    expect(skipped[0].detail).toMatch(/Rates › Commissions/)
  })

  it('we pay: still needs the supplier cost — profit cannot be computed without it', () => {
    const { pairs, skipped } = buildCommissions([payable({ total_cost: null })], CTX)
    expect(pairs).toHaveLength(0)
    expect(skipped[0].reason).toBe('no_base_amount')
  })

  it('a mixed trip produces both directions, each on its own base', () => {
    const { pairs } = buildCommissions(
      [
        service({ id: 'shop', service_type: 'activity', client_price: 500, total_cost: 400,
          supplier: { id: 'shop-1', name: 'Khan el-Khalili Bazaar', commission_type: 'receivable', default_commission_rate: 25 } }),
        payable({ id: 'tour' }),
      ],
      CTX
    )
    expect(pairs.map(p => [p.serviceId, p.commission.commission_type, p.commission.base_amount, p.commission.commission_amount])).toEqual([
      ['shop', 'receivable', 400, 100],
      ['tour', 'payable', 50, 10],
    ])
  })
})
