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
  it('reads client_price / total_cost / service_name, not the columns that do not exist', () => {
    const { pairs } = buildCommissions([service()], CTX)
    expect(pairs).toHaveLength(1)

    const c = pairs[0].commission
    expect(c.base_amount).toBe(1000)                       // client_price
    expect(c.description).toContain('Steigenberger Cairo') // service_name
    expect(c.description).toContain('ITN-2026-1')
  })

  it('falls back to total_cost when there is no client price', () => {
    const { pairs } = buildCommissions([service({ client_price: null })], CTX)
    expect(pairs[0].commission.base_amount).toBe(800)
  })

  it('pairs each commission with its OWN service id', () => {
    // The pairing is what keeps claim/insert/rollback in lockstep. A previous
    // version matched two arrays positionally and mis-attributed commissions.
    const { pairs } = buildCommissions(
      [
        service({ id: 'a', client_price: 0, total_cost: 0 }), // skipped
        service({ id: 'b' }),
        service({ id: 'c' }),
      ],
      CTX
    )
    expect(pairs.map(p => p.serviceId)).toEqual(['b', 'c'])
  })
})

describe('commission arithmetic', () => {
  it('is base × rate percent, rounded to cents', () => {
    const { pairs } = buildCommissions([service({ client_price: 1000 })], CTX)
    expect(pairs[0].commission.commission_amount).toBe(100)
    expect(pairs[0].commission.commission_rate).toBe(10)
  })

  it('does not emit float noise into the ledger', () => {
    const { pairs } = buildCommissions(
      [service({ client_price: 123.45, supplier: { ...service().supplier!, default_commission_rate: 10 } })],
      CTX
    )
    // 123.45 × 10% = 12.345 → 12.35 (and never 12.340000000000002)
    expect(pairs[0].commission.commission_amount).toBe(12.35)
  })

  it('prefers a rate set on the service over the supplier default', () => {
    const { pairs } = buildCommissions([service({ commission_rate: 15 })], CTX)
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
        service({ id: 'zero', client_price: 0, total_cost: 0 }),
        service({ id: 'negative', client_price: -50, total_cost: 0 }),
        service({ id: 'garbage', client_price: 'abc' as unknown as number, total_cost: null }),
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
        service({ id: 'c', client_price: 0, total_cost: 0 }),
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
  it("takes the supplier's own commission_type", () => {
    const { pairs } = buildCommissions(
      [service({ supplier: { ...service().supplier!, commission_type: 'payable' } })],
      CTX
    )
    expect(pairs[0].commission.commission_type).toBe('payable')
  })

  it('defaults to receivable when the supplier does not say', () => {
    const { pairs } = buildCommissions(
      [service({ supplier: { ...service().supplier!, commission_type: null } })],
      CTX
    )
    expect(pairs[0].commission.commission_type).toBe('receivable')
  })
})
