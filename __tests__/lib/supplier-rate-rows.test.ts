// The supplier view's Rates tab. It read `result.data` off the bare array
// /api/resources/transportation returns (always []), showed only for a
// transport-ish PRIMARY role, and printed every amount with the company's
// symbol whatever the rate was entered in. It now reads /api/supplier-rates
// (every rate table, every role) and keeps each rate's own currency.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { rateListFrom, supplierRateRows } from '@/lib/suppliers/supplier-rate-rows'

describe('rateListFrom', () => {
  it('reads both shapes', () => {
    expect(rateListFrom([{ id: 'a' }])).toEqual([{ id: 'a' }])
    expect(rateListFrom({ success: true, data: [{ id: 'b' }] })).toEqual([{ id: 'b' }])
    expect(rateListFrom(null)).toEqual([])
  })
})

describe('supplierRateRows', () => {
  it('one row per vehicle for a transport rate, in the rate’s own currency', () => {
    const rows = supplierRateRows([{
      _rate_type: 'transportation_rates', id: 't1', service_code: 'LXR-DAY', city: 'Luxor', service_type: 'day_tour', rate_currency: 'EGP', is_active: true,
      vehicles: [
        { key: 'sedan', rate_eur: 1500, rate_non_eur: null, capacity_min: 1, capacity_max: 2 },
        { key: 'van', rate_eur: 2500, rate_non_eur: 2800, capacity_min: 3, capacity_max: 7 },
      ],
    }])
    expect(rows.map(r => [r.code, r.eu, r.nonEu, r.currency])).toEqual([['LXR-DAY', 1500, null, 'EGP'], ['LXR-DAY', 2500, 2800, 'EGP']])
    expect(rows[1].label).toContain('van')
  })

  it('a guide’s or a hotel’s rates too, each with its headline amount', () => {
    const rows = supplierRateRows([
      { _rate_type: 'guide_rates', id: 'g', service_code: 'GD-JA', base_rate_eur: 80, base_rate_non_eur: 90, guide_language: 'japanese', city: 'Cairo' },
      { _rate_type: 'accommodation_rates', id: 'h', service_code: 'HTL-1', property_name: 'Old Cataract', pp_double_eur: 150, pp_double_non_eur: 160, base_rate_eur: 999, rate_currency: null, is_active: false },
    ])
    expect(rows.map(r => [r.table, r.eu, r.nonEu, r.active])).toEqual([['guide_rates', 80, 90, true], ['accommodation_rates', 150, 160, false]])
    expect(rows[1].label).toBe('Old Cataract')
  })

  it('the page reads /api/supplier-rates for every supplier and formats in the row currency', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/suppliers/suppliers-content.tsx'), 'utf8')
    expect(src).toContain('/api/supplier-rates?supplier_id=')
    expect(src).not.toContain('/api/resources/transportation?supplier_id=')
    expect(src).toContain('formatRateInRowCurrency(rate.eu')
    expect(src).not.toMatch(/\['transport', 'local_operator', 'driver'\]\.includes\(/)
  })
})
