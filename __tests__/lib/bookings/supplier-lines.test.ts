import { describe, it, expect } from 'vitest'
import { supplierLinesFromServices, supplierTypeForService, supplierCostCurrency } from '@/lib/bookings/supplier-lines'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supplierBacking } from '@/lib/bookings/supplier-backing'

// A booking's supplier list leaves out what nobody confirms and lists each
// supplier once per day; a "not needed" row leaves the confirmed count.

describe('supplierLinesFromServices', () => {
  const day = (n: number) => ({ day_number: n, day_date: `2026-12-0${n}` })

  it('leaves out water, tips and supplies', () => {
    expect(supplierTypeForService('supplies')).toBeNull()
    expect(supplierTypeForService('tips')).toBeNull()
    const lines = supplierLinesFromServices([
      { service_type: 'supplies', service_name: 'Bottled Water', total_cost: 2, ...day(1) },
      { service_type: 'tips', service_name: 'Driver Tip', total_cost: 5, ...day(1) },
      { service_type: 'airport_service', service_name: 'Airport Meet & Greet', total_cost: 30, ...day(1) },
    ], null)
    expect(lines.map(l => l.supplier_name)).toEqual(['Airport Meet & Greet'])
    expect(lines[0].supplier_type).toBe('airport_service')
  })

  it('lists one supplier once per day, costs summed', () => {
    const lines = supplierLinesFromServices([
      { supplier_id: 's1', supplier_name: 'Sedan Cairo', service_type: 'transportation', total_cost: 40, ...day(2) },
      { supplier_id: 's1', supplier_name: 'Sedan Cairo', service_type: 'transportation', total_cost: 60, ...day(2) },
      { supplier_id: 's1', supplier_name: 'Sedan Cairo', service_type: 'transportation', total_cost: 50, ...day(3) },
    ], null)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ supplier_id: 's1', supplier_type: 'transport', service_date: '2026-12-02', quoted_cost: 100 })
  })

  it("costs a row in its supplier's own currency while every line's original still agrees", () => {
    const lines = supplierLinesFromServices([
      // a guide paid EGP on a yen trip: two lines on the same day, one row
      { supplier_id: 'g1', supplier_name: 'Ahmed', service_type: 'guide', total_cost: 9000, supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 3, ...day(1) },
      { supplier_id: 'g1', supplier_name: 'Ahmed', service_type: 'guide', total_cost: 1500, supplier_currency: 'egp', supplier_cost_original: 500, exchange_rate_used: 3, ...day(1) },
      // a cruise contracted in USD
      { supplier_id: 'c1', supplier_name: 'MS Nile', service_type: 'cruise', total_cost: 150000, supplier_currency: 'USD', supplier_cost_original: 1000, exchange_rate_used: 150, ...day(2) },
    ], null, 'JPY')
    expect(lines).toEqual([
      expect.objectContaining({ supplier_id: 'g1', quoted_cost: 3500, cost_currency: 'EGP' }),
      expect.objectContaining({ supplier_id: 'c1', quoted_cost: 1000, cost_currency: 'USD' }),
    ])
  })

  it("falls back to the trip's currency and total_cost for mixed currencies; an edited line keeps its own", () => {
    const mixed = supplierLinesFromServices([
      { supplier_id: 't1', supplier_name: 'Car', service_type: 'transport', total_cost: 100, supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 1 / 30, ...day(1) },
      { supplier_id: 't1', supplier_name: 'Car', service_type: 'transport', total_cost: 50, supplier_currency: 'USD', supplier_cost_original: 55, exchange_rate_used: 50 / 55, ...day(1) },
    ], null, 'eur')
    expect(mixed[0]).toMatchObject({ quoted_cost: 150, cost_currency: 'EUR' })
    // edited from 2 rooms to 3 after pricing: the original no longer agrees,
    // so the cost is the current total at the line's own rate — still EGP
    const edited = supplierLinesFromServices([
      { supplier_id: 'h1', supplier_name: 'Hotel', service_type: 'hotel', total_cost: 67500, supplier_currency: 'EGP', supplier_cost_original: 15000, exchange_rate_used: 3, ...day(1) },
    ], null, 'JPY')
    expect(edited[0]).toMatchObject({ quoted_cost: 22500, cost_currency: 'EGP' })
    // trip currency unknown: nothing is "foreign", the row is the booking's
    const unknown = supplierLinesFromServices([
      { supplier_id: 'g1', supplier_name: 'Ahmed', service_type: 'guide', total_cost: 9000, supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 3, ...day(1) },
    ], null)
    expect(unknown[0]).toMatchObject({ quoted_cost: 9000, cost_currency: null })
  })

  it('supplierCostCurrency: the row\'s own, else the booking\'s', () => {
    expect(supplierCostCurrency({ cost_currency: 'egp' }, 'JPY')).toBe('EGP')
    expect(supplierCostCurrency({ cost_currency: null }, 'JPY')).toBe('JPY')
    expect(supplierCostCurrency({}, null)).toBe('EUR')
  })

  it('dates a line from the trip start when the day has no date', () => {
    const [l] = supplierLinesFromServices([{ service_type: 'guide', service_name: 'Guide', day_number: 3 }], '2026-12-05')
    expect(l.service_date).toBe('2026-12-07')
  })
})

describe('supplierBacking', () => {
  it('a not-needed row leaves the count', () => {
    expect(supplierBacking([{ status: 'confirmed' }, { status: 'cancelled' }])).toEqual({ total: 1, confirmed: 1, backed: true })
  })
})

describe('booking creation and Sync from itinerary cost rows by the shared rule', () => {
  it('populateSuppliersFromItinerary passes the itinerary currency and stores cost_currency', async () => {
    const { populateSuppliersFromItinerary } = await import('@/lib/booking-creation')
    const inserted: Record<string, unknown>[] = []
    const data: Record<string, unknown> = {
      itinerary_days: [{ id: 'd1', date: '2026-12-01', day_number: 1 }],
      itinerary_services: [
        { itinerary_day_id: 'd1', supplier_id: 'g1', supplier_name: 'Ahmed', service_type: 'guide', total_cost: 9000, supplier_currency: 'EGP', supplier_cost_original: 3000, exchange_rate_used: 3 },
        { itinerary_day_id: 'd1', supplier_id: 'h1', supplier_name: 'Hotel', service_type: 'hotel', total_cost: 20000, supplier_currency: 'JPY', supplier_cost_original: 20000, exchange_rate_used: 1 },
      ],
      itineraries: { currency: 'JPY' },
    }
    const from = (table: string) => {
      const q = {
        select: () => q, eq: () => q, in: () => q, order: () => q,
        maybeSingle: async () => ({ data: data[table], error: null }),
        insert: async (rows: Record<string, unknown>[]) => (inserted.push(...rows), { error: null }),
        then: <T,>(res: (r: { data: unknown; error: null }) => T) => Promise.resolve({ data: data[table], error: null }).then(res),
      }
      return q
    }
    expect(await populateSuppliersFromItinerary({ from }, 'b1', 'it1')).toEqual({ inserted: 2 })
    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ supplier_id: 'g1', quoted_cost: 3000, cost_currency: 'EGP', status: 'pending', booking_id: 'b1' }),
      expect.objectContaining({ supplier_id: 'h1', quoted_cost: 20000, cost_currency: 'JPY' }),
    ]))
  })

  it('sync-suppliers reads the itinerary currency and hands it to the shared rule', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/bookings/[id]/sync-suppliers/route.ts'), 'utf8')
    expect(src).toContain(".select('start_date, currency')")
    expect(src).toMatch(/tripStartDate,\s*itinerary\?\.currency \?\? null,/)
  })

  it('the Suppliers tab labels quoted and confirmed cost with the row currency; saving keeps it', () => {
    const src = readFileSync(join(process.cwd(), 'app/bookings/[id]/page.tsx'), 'utf8')
    expect(src).toContain('{supplierCostCurrency(supplier, booking.currency)}</span>')
    expect(src).toContain('quoted {supplierCostCurrency(supplier, booking.currency)} {Number(supplier.quoted_cost).toFixed(2)}')
    // saving a confirmed cost never rewrites the row's currency: only a new
    // row (added by hand, with its currency picker) sets it
    const api = readFileSync(join(process.cwd(), 'app/api/bookings/[id]/suppliers/route.ts'), 'utf8')
    const [updateBranch, createBranch] = api.split('// Create new supplier entry')
    expect(updateBranch).not.toMatch(/cost_currency/)
    expect(createBranch).toContain('cost_currency: costCurrency,')
    expect(src).toContain('cost_currency: supplierForm.cost_currency || null')
  })

  it("the docs say booking-supplier expenses are in the supplier's own currency, converted at the expense date", () => {
    const bookings = readFileSync(join(process.cwd(), 'app/(public)/docs/bookings/page.tsx'), 'utf8')
    const expenses = readFileSync(join(process.cwd(), 'app/(public)/docs/expenses-commissions/page.tsx'), 'utf8')
    expect(bookings).not.toContain("records an expense in the\n            booking&apos;s currency")
    expect(bookings).toContain('supplier&apos;s own currency')
    expect(expenses).toContain('Expenses from booking suppliers')
    expect(expenses).toContain('exchange rate on the expense date')
  })
})
