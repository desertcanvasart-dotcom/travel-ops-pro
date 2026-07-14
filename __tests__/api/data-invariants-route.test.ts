import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockTables, type MockTables } from '../_mock-supabase'

// Route-level tests for GET /api/cron/data-invariants. Hermetic: mock DB,
// mocked email sender. Each test seeds one violating row and asserts the
// sweep names it — the checks map 1:1 to bug classes the 2026 audits found.

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})

vi.mock('@/lib/email-send', () => ({
  sendEmailInternal: vi.fn(async () => ({ success: true })),
}))

import { GET } from '@/app/api/cron/data-invariants/route'
import { sendEmailInternal } from '@/lib/email-send'

const mockedEmail = vi.mocked(sendEmailInternal)

function makeRequest(headers: Record<string, string> = {}) {
  return { headers: new Headers(headers) } as any
}

const CLEAN: MockTables = {
  itineraries: [
    { id: 'it-1', org_id: 'org-1', total_cost: 1250, supplier_cost: 1000, total_paid: 500, total_days: 2, start_date: '2026-09-01', end_date: '2026-09-02', status: 'draft' },
  ],
  itinerary_days: [
    { id: 'd-1', itinerary_id: 'it-1', day_number: 1 },
    { id: 'd-2', itinerary_id: 'it-1', day_number: 2 },
  ],
  itinerary_services: [{ id: 's-1', itinerary_day_id: 'd-1' }],
  invoices: [
    { id: 'inv-1', invoice_number: 'INV-001', status: 'sent', total_amount: 1250, amount_paid: 500, balance_due: 750 },
  ],
  invoice_payments: [{ id: 'p-1', invoice_id: 'inv-1', amount: 500 }],
  guide_rates: [
    { id: 'g-1', supplier_id: 'sup-1', guide_language: 'English', guide_type: 'standard', tour_duration: 'full_day', city: 'Cairo' },
  ],
  activity_rates: [{ id: 'a-1', supplier_id: null, activity_name: 'Felucca Ride', city: 'Cairo' }],
  transportation_rates: [
    { id: 't-1', supplier_id: null, service_type: 'day_tour', service_code: 'CAIRO-DAY', city: 'Cairo', origin_city: null, destination_city: null, duration: 'full_day', area: null },
    { id: 't-2', supplier_id: null, service_type: 'intercity', service_code: 'CAI-LXR', city: null, origin_city: 'Cairo', destination_city: 'Luxor', duration: null, area: null },
  ],
}

function seed(overrides: MockTables = {}) {
  setMockTables({ ...structuredClone(CLEAN), ...overrides })
}

async function sweep() {
  const res = await GET(makeRequest())
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.CRON_SECRET
  delete process.env.BUSINESS_EMAIL
  seed()
})

describe('data-invariants — auth', () => {
  it('401s without the bearer token when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'sekrit'
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('accepts the correct bearer token', async () => {
    process.env.CRON_SECRET = 'sekrit'
    const res = await GET(makeRequest({ authorization: 'Bearer sekrit' }))
    expect(res.status).toBe(200)
  })
})

describe('data-invariants — clean dataset', () => {
  it('reports ok with zero violations and full scan counts', async () => {
    const { status, json } = await sweep()
    expect(status).toBe(200)
    expect(json.violations).toEqual([])
    expect(json.ok).toBe(true)
    expect(json.scanned.itineraries).toBe(1)
    expect(json.scanned.transportation_rates).toBe(2)
    expect(mockedEmail).not.toHaveBeenCalled()
  })
})

describe('data-invariants — each violation class is detected', () => {
  const expectViolation = async (check: string) => {
    const { json } = await sweep()
    expect(json.ok).toBe(false)
    expect(json.violations.map((v: any) => v.check)).toContain(check)
    return json
  }

  it('NULL org_id on an itinerary', async () => {
    seed({ itineraries: [{ ...CLEAN.itineraries[0], org_id: null }] })
    await expectViolation('itinerary_org_id_null')
  })

  it('client price below supplier cost (margin inversion)', async () => {
    seed({ itineraries: [{ ...CLEAN.itineraries[0], total_cost: 800, supplier_cost: 1000 }] })
    await expectViolation('itinerary_price_below_cost')
  })

  it('inverted dates', async () => {
    seed({ itineraries: [{ ...CLEAN.itineraries[0], start_date: '2026-09-05', end_date: '2026-09-01' }] })
    await expectViolation('itinerary_dates_inverted')
  })

  it('day-count drift is a warning, not a violation', async () => {
    seed({ itineraries: [{ ...CLEAN.itineraries[0], total_days: 5 }] })
    const { json } = await sweep()
    expect(json.ok).toBe(true)
    expect(json.warnings.map((w: any) => w.check)).toContain('itinerary_daycount_drift')
  })

  it('orphaned day and duplicate day_number', async () => {
    seed({
      itinerary_days: [
        ...CLEAN.itinerary_days,
        { id: 'd-orphan', itinerary_id: 'it-GONE', day_number: 1 },
        { id: 'd-dup', itinerary_id: 'it-1', day_number: 2 },
      ],
    })
    const json = await expectViolation('day_orphaned')
    expect(json.violations.map((v: any) => v.check)).toContain('day_number_duplicate')
  })

  it('orphaned service', async () => {
    seed({ itinerary_services: [{ id: 's-orphan', itinerary_day_id: 'd-GONE' }] })
    await expectViolation('service_orphaned')
  })

  it('invoice balance arithmetic mismatch', async () => {
    seed({ invoices: [{ ...CLEAN.invoices[0], balance_due: 999 }] })
    await expectViolation('invoice_balance_mismatch')
  })

  it('paid invoice still carrying a balance', async () => {
    seed({ invoices: [{ ...CLEAN.invoices[0], status: 'paid', amount_paid: 1250, balance_due: 100 }] })
    await expectViolation('invoice_paid_with_balance')
  })

  it('invoice_payments sum disagreeing with amount_paid', async () => {
    seed({ invoice_payments: [{ id: 'p-1', invoice_id: 'inv-1', amount: 123 }] })
    await expectViolation('invoice_payments_sum_mismatch')
  })

  it('duplicate guide-rate natural key (same supplier/language/type/duration/city)', async () => {
    seed({ guide_rates: [...CLEAN.guide_rates, { ...CLEAN.guide_rates[0], id: 'g-2' }] })
    await expectViolation('rate_duplicate_natural_key')
  })

  it('duplicate intercity transport key matches case-insensitively on cities and code', async () => {
    seed({
      transportation_rates: [
        ...CLEAN.transportation_rates,
        { id: 't-3', supplier_id: null, service_type: 'intercity', service_code: 'cai-lxr', city: null, origin_city: 'CAIRO', destination_city: 'luxor', duration: null, area: null },
      ],
    })
    await expectViolation('rate_duplicate_natural_key')
  })

  it('does NOT flag same route under a different service_code (named route variants)', async () => {
    // Live data legitimately holds many rows per city/service_type that
    // differ only by service_code (e.g. 15 named Aswan city-tour routes).
    seed({
      transportation_rates: [
        ...CLEAN.transportation_rates,
        { id: 't-3', supplier_id: null, service_type: 'intercity', service_code: 'CAI-LXR-OVERDAY', city: null, origin_city: 'Cairo', destination_city: 'Luxor', duration: null, area: null },
      ],
    })
    const { json } = await sweep()
    expect(json.ok).toBe(true)
  })

  it('does NOT flag same cities under different service types', async () => {
    seed({
      transportation_rates: [
        ...CLEAN.transportation_rates,
        { id: 't-3', supplier_id: null, service_type: 'intercity_with_sightseeing', service_code: 'CAI-LXR', city: null, origin_city: 'Cairo', destination_city: 'Luxor', duration: null, area: null },
      ],
    })
    const { json } = await sweep()
    expect(json.ok).toBe(true)
  })
})

describe('data-invariants — alerting', () => {
  it('emails BUSINESS_EMAIL when violations exist', async () => {
    process.env.BUSINESS_EMAIL = 'ops@example.com'
    seed({ itineraries: [{ ...CLEAN.itineraries[0], org_id: null }] })
    await sweep()
    expect(mockedEmail).toHaveBeenCalledTimes(1)
    const call = mockedEmail.mock.calls[0][0] as any
    expect(call.to).toBe('ops@example.com')
    expect(call.subject).toMatch(/1 violation/)
  })

  it('sends no email when clean', async () => {
    process.env.BUSINESS_EMAIL = 'ops@example.com'
    await sweep()
    expect(mockedEmail).not.toHaveBeenCalled()
  })
})
