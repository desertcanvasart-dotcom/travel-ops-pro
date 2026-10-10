import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePeriodRows, parseRateCell, parseSheetDate, PERIOD_SHEETS } from '@/lib/rates/period-csv'
import { RATE_TABLE_CONFIGS, validateImportData, isCalendarDate } from '@/lib/bulk-rate-service'
import { selectAllRows } from '@/lib/db/select-all-rows'
import { batchResolveSuppliers } from '@/lib/suppliers/resolve-supplier'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('rate period sheet: amounts are read, never guessed', () => {
  it('thousands separators and currency symbols still load', () => {
    expect(parseRateCell('1,250')).toBe(1250)
    expect(parseRateCell('€1,250.50')).toBe(1250.5)
    expect(parseRateCell('¥ 12,000')).toBe(12000)
    expect(parseRateCell('')).toBe(0)
    expect(parseRateCell('980')).toBe(980)
  })

  it('a decimal comma or European grouping is refused instead of becoming 15 / 1.25', () => {
    expect(parseRateCell('1,5')).toBeNull()
    expect(parseRateCell('1.250,00')).toBeNull()
    expect(parseRateCell('12,50')).toBeNull()
  })

  it('text and negatives are refused instead of becoming an unpriced 0', () => {
    expect(parseRateCell('abc')).toBeNull()
    expect(parseRateCell('-40')).toBeNull()
  })

  it('a bad amount is a row error and that rate is not replaced', () => {
    const cfg = PERIOD_SHEETS.accommodation
    const row = (from: string, to: string, pp: string) => ({
      'Service Code': 'HTL-1', 'Property Name': 'H', 'Period Name': 'P', From: from, To: to,
      'PP Double (EU passport)': pp,
    })
    const out = parsePeriodRows(cfg, [row('2026-05-01', '2026-09-30', '100'), row('2026-10-01', '2026-12-19', '1,5')])
    expect(out.errors).toHaveLength(1)
    expect(out.errors[0].row).toBe(3)
    expect(out.byKey.has('HTL-1')).toBe(false)
  })

  it('dates that are not on the calendar are refused (US-locale month/day, Feb 30)', () => {
    expect(parseSheetDate('23/06/2026')).toBe('2026-06-23')
    expect(parseSheetDate('06/23/2026')).toBeNull()
    expect(parseSheetDate('2026-02-30')).toBeNull()
    expect(parseSheetDate('2028-02-29')).toBe('2028-02-29')
  })
})

describe('wide rate CSV: dates and row numbers', () => {
  it('isCalendarDate', () => {
    expect(isCalendarDate('2026-12-31')).toBe(true)
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('2026-02-29')).toBe(false)
  })

  it('a US-locale or impossible date is a row/column error, not a failed batch', () => {
    const cfg = RATE_TABLE_CONFIGS.entrance_fees
    const dateCol = cfg.columns.find(c => c.type === 'date' && !c.exportOnly)!
    const required = Object.fromEntries(cfg.columns.filter(c => c.required && !c.exportOnly).map(c => [c.name, c.type === 'number' ? '10' : 'X']))
    const bad = validateImportData([{ ...required, [dateCol.name]: '06/23/2026' }], cfg)
    expect(bad.errors.some(e => e.column === dateCol.name)).toBe(true)
    const good = validateImportData([{ ...required, [dateCol.name]: '23/06/2026' }], cfg)
    expect(good.parsedValidRows?.[0][dateCol.name]).toBe('2026-06-23')
  })

  it('valid rows carry their spreadsheet row numbers, and the importer reports those', () => {
    const cfg = RATE_TABLE_CONFIGS.entrance_fees
    const required = Object.fromEntries(cfg.columns.filter(c => c.required && !c.exportOnly).map(c => [c.name, c.type === 'number' ? '10' : 'X']))
    const firstRequired = cfg.columns.find(c => c.required && !c.exportOnly)!
    const p = validateImportData([{ ...required, [firstRequired.name]: '' }, { ...required }], cfg)
    expect(p.parsedValidRowNumbers).toEqual([3])
    const route = src('app/api/rates/bulk/import/route.ts')
    expect(route).toContain('const rowNum = sheetRowOf.get(row) ?? idx + 2')
    expect(route).toContain('row: sheetRowOf.get(record) ?? idx + 2')
    expect(route).toContain('parsedValidRowNumbers: _rows')
  })
})

describe('whole-table reads page past the 1000-row cap', () => {
  it('selectAllRows walks ranges until a short page', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: i }))
    const ranges: Array<[number, number]> = []
    const builder = () => {
      const q: any = {
        order: () => q,
        range: async (from: number, to: number) => {
          ranges.push([from, to])
          return { data: all.slice(from, to + 1), error: null }
        },
      }
      return q
    }
    const { data } = await selectAllRows(builder)
    expect(data).toHaveLength(2500)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('supplier name resolution sees suppliers past the first page', async () => {
    const suppliers = Array.from({ length: 1200 }, (_, i) => ({ id: `id-${i}`, name: `Supplier ${i}`, supplier_code: `SUP-${i}` }))
    const db: any = {
      from: () => {
        const q: any = {
          select: () => q,
          order: () => q,
          range: async (from: number, to: number) => ({ data: suppliers.slice(from, to + 1), error: null }),
        }
        return q
      },
    }
    const r = await batchResolveSuppliers([{ supplier_name: 'Supplier 1150' }], db)
    expect(r.resolvedIdByName.get('supplier 1150')).toBe('id-1150')
  })

  it('the supplier import, the resolver and the rate export use it', () => {
    expect(src('app/api/suppliers/import/route.ts')).toContain('selectAllRows')
    expect(src('lib/suppliers/resolve-supplier.ts').match(/selectAllRows/g)!.length).toBeGreaterThanOrEqual(3)
    expect(src('app/api/rates/bulk/export/route.ts')).toContain("{ order: [{ column: 'created_at', ascending: false }, { column: 'id' }] }")
  })
})

describe('guides', () => {
  const list = src('app/api/guides/route.ts')
  it('the list finds every supplier with the guide ROLE, not only primary type', () => {
    expect(list).toContain(".overlaps('types', supplierTypeKeysMatching(['guide'], await supplierTypesForCurrentOrg()))")
    expect(list).not.toContain(".eq('type', 'guide')")
  })
  it('creating a guide sets types so the type-in-types check passes', () => {
    expect(list).toContain("types: ['guide'],")
  })
  it('stats are this org\'s trips, revenue per currency', () => {
    expect(list).toMatch(/\.eq\('assigned_guide_id', guide\.id\)\s*\n\s*\.eq\('org_id', orgId\)/)
    expect(list).toContain('addToTotals(revenueByCurrency, b.total_cost, b.currency)')
    expect(list).not.toContain('reduce((sum, b) => sum + (b.total_cost || 0), 0)')
  })
  it('delete is refused while any trip or money record references the guide', () => {
    const one = src('app/api/guides/[id]/route.ts')
    expect(one).toContain('SUPPLIER_REFERENCE_CHECKS.map')
    expect(one).toContain('describeBlockers(counts)')
    const del = one.slice(one.indexOf('export async function DELETE'))
    expect(del).toMatch(/select\('id', \{ count: 'exact', head: true \}\)\s*\n\s*\.eq\('assigned_guide_id', id\)\s*\n/)
  })
})

describe('trip resource assignments', () => {
  const s = src('app/api/itinerary-resources/route.ts')
  const post = s.slice(s.indexOf('export async function POST'), s.indexOf('export async function DELETE'))
  it('a reversed date range is refused (the overlap check could never see it)', () => {
    expect(post).toContain("'The end date is before the start date'")
  })
  it('the itinerary day must be a day of this trip', () => {
    expect(post).toMatch(/\.from\('itinerary_days'\)\s*\n\s*\.select\('id'\)\s*\n\s*\.eq\('id', itinerary_day_id\)\s*\n\s*\.eq\('itinerary_id', itinerary_id\)/)
  })
})

describe('resources overview and supplier pickers', () => {
  it('each tab reads its own endpoint, not /api/resources?type= (which ignores type)', () => {
    const page = src('app/resources/page.tsx')
    expect(page).not.toContain("/api/resources?type=")
    for (const url of ["fetch('/api/guides')", "fetch('/api/resources/hotels')", "fetch('/api/resources/restaurants')", "fetch('/api/resources/airport-staff')", "fetch('/api/resources/hotel-staff')"]) {
      expect(page).toContain(url)
    }
    expect(page).toContain('`/api/rates/meals/${deleteModal.id}`')
  })
  it('restaurants filter on meal_rates.city', () => {
    const s = src('app/api/resources/restaurants/route.ts')
    expect(s).toContain("query.eq('city', city)")
    expect(s).not.toContain("eq('restaurant_city'")
  })
  it('transport suppliers are matched by role', () => {
    const s = src('app/api/resources/vehicles/route.ts')
    expect(s).toContain(".overlaps('types', supplierTypeKeysMatching(['transport', 'local_operator', 'driver']")
    expect(s).not.toContain(".in('type',")
  })
  it('supplier rates cover airlines, rail operators and assistants', () => {
    const s = src('app/api/supplier-rates/route.ts')
    expect(s).toContain("air_carrier: ['flight_rates']")
    expect(s).toContain("train_operator: ['train_rates', 'sleeping_train_rates']")
    expect(s).toContain("airport_assistant: ['airport_staff_rates']")
    expect(s).toContain("hotel_assistant: ['hotel_staff_rates']")
  })
})
