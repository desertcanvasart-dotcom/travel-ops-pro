import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { templateDaysToItineraryDays, addDays, packageTypeForTemplate, itineraryServiceType, serviceLineForItinerary } from '@/lib/itineraries/template-days'
import { SERVICE_TYPES } from '@/lib/service-types'

// "Convert to Itinerary" answered "Quote not found" for every quote in
// production (2026-09-02, QT-2026-00001, seen live). The quote had passed the
// org check a line earlier; what failed was the fetch that embedded
// `tour_days` under `tour_templates` — a legacy table keyed by tour_id with
// no relationship to templates. PostgREST refuses an embed without a foreign
// key (PGRST200) and fails the whole query, and the route reported that as a
// missing quote. The programme actually lives on tour_templates.itinerary.

const ROOT = join(__dirname, '..', '..')

// The real NMS803-CR-ABS programme, day 2, as stored in production.
const PROGRAMME = [
  { day: 1, city: 'Overnight flight', title: 'Overnight flight', description: '', meals: [], overnight_kind: 'flight', services: {} },
  {
    day: 2, city: 'Nile Cruise', title: 'Nile Cruise', overnight_city: 'Nile Cruise', is_cruise_day: true,
    description: '【00:00】カイロ到着後、乗り継ぎルクソールへ。',
    attractions: ['世界最大級の神殿「カルナック神殿」見学', 'ルクソール神殿見学'],
    meals: ['lunch', 'dinner'],
    services: { guide_required: true, airport_arrival: false, airport_departure: false, hotel_checkin: false, hotel_checkout: false },
  },
  { day: 6, city: 'Abu Simbel', title: 'Abu Simbel', meals: ['lunch'], overnight_kind: 'hotel', services: { guide_required: true } },
  { day: 8, city: 'Cairo', title: 'ご出発', meals: [], services: { airport_departure: true } },
]

describe('templateDaysToItineraryDays', () => {
  const rows = templateDaysToItineraryDays(PROGRAMME, '2026-12-05', 8)

  it('produces one dated row per day of the trip, in order', () => {
    expect(rows.map(r => r.day_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(rows[0].date).toBe('2026-12-05')
    expect(rows[7].date).toBe('2026-12-12')
  })

  it('copies the programme text, city, attractions and meals for a described day', () => {
    const d2 = rows[1]
    expect(d2.title).toBe('Nile Cruise')
    expect(d2.description).toContain('ルクソール')
    expect(d2.attractions).toHaveLength(2)
    expect(d2.lunch_included).toBe(true)
    expect(d2.dinner_included).toBe(true)
    expect(d2.is_cruise_day).toBe(true)
    expect(d2.guide_required).toBe(true)
    expect(d2.overnight_city).toBe('Nile Cruise')
  })

  it('invents nothing for a day the programme does not describe', () => {
    const d3 = rows[2]
    expect(d3.title).toBe('Day 3')
    expect(d3.description).toBe('')
    expect(d3.city).toBe('')
    expect(d3.attractions).toEqual([])
    expect(d3.lunch_included).toBe(false)
    expect(d3.guide_required).toBe(false)
  })

  it('a night in the air is not a hotel night; the last day has no overnight at all', () => {
    expect(rows[0].hotel_included).toBe(false)
    expect(rows[5].hotel_included).toBe(true)
    expect(rows[7].hotel_included).toBe(false)
    expect(rows[7].overnight_city).toBe('')
    expect(rows[7].airport_departure).toBe(true)
  })

  it('survives a missing or malformed programme', () => {
    expect(templateDaysToItineraryDays(null, '2026-12-05', 2)).toHaveLength(2)
    expect(templateDaysToItineraryDays([{ day: 'x' as unknown as number }], '2026-12-05', 1)[0].title).toBe('Day 1')
    expect(templateDaysToItineraryDays([], '2026-12-05', 0)).toHaveLength(1)
  })

  it('dates on calendar parts, not local midnight', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('the convert route reads the programme from the template, never tour_days', () => {
  const src = readFileSync(join(ROOT, 'app', 'api', 'b2b', 'quotes', '[id]', 'convert', 'route.ts'), 'utf8')

  it('does not embed tour_days (there is no foreign key — the embed fails the whole query)', () => {
    expect(src).not.toMatch(/tour_days\s*\(/)
  })

  it('selects the template itinerary JSON and maps it through the tested helper', () => {
    expect(src).toMatch(/tour_templates\s*\([^)]*\bitinerary\b/)
    expect(src).toContain('templateDaysToItineraryDays(')
  })

  it('no API route embeds tour_days under tour_templates', () => {
    // The trap generalises: any select that nests tour_days inside a
    // tour_templates embed fails at runtime with PGRST200.
    const { readdirSync, statSync } = require('fs') as typeof import('fs')
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (e === 'route.ts') out.push(p)
      }
      return out
    }
    const offenders = walk(join(ROOT, 'app', 'api')).filter(f => /tour_templates\s*\([\s\S]*?tour_days\s*\(/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('writes an enum member for package_type, never "custom", and links the template', () => {
    // Second failure in the same flow, one step later: itineraries.package_type
    // is a Postgres enum and the route wrote 'custom'. Found by replaying the
    // schema locally — the route reported only "Failed to create itinerary".
    expect(src).not.toMatch(/package_type:\s*'custom'/)
    expect(src).toContain('package_type: packageTypeForTemplate(template)')
    expect(src).toMatch(/template_id:\s*template\?\.id/)
  })
})

describe('packageTypeForTemplate', () => {
  const ENUM = ['day-trips', 'tours-only', 'land-package', 'full-package', 'cruise-land', 'shore-excursions', 'cruise-package']

  it('a single-day tour type is a day trip', () => {
    for (const t of ['day_tour', 'half_day', 'stopover']) expect(packageTypeForTemplate({ tour_type: t, duration_days: 1 })).toBe('day-trips')
    expect(packageTypeForTemplate({ tour_type: 'multi_day', duration_days: 1 })).toBe('day-trips')
  })

  it('a cruise programme is cruise + land; anything else keeps the full-package assumption', () => {
    expect(packageTypeForTemplate({ tour_type: 'cruise', duration_days: 8 })).toBe('cruise-land')
    expect(packageTypeForTemplate({ tour_type: 'land', duration_days: 8 })).toBe('full-package')
    expect(packageTypeForTemplate({ tour_type: 'cultural', duration_days: 5 })).toBe('full-package')
    expect(packageTypeForTemplate(null)).toBe('full-package')
  })

  it('only ever answers with a member of the database enum', () => {
    for (const t of ['day_tour', 'cruise', 'land', 'multi_day', 'cultural', 'weird', '', undefined]) {
      expect(ENUM).toContain(packageTypeForTemplate({ tour_type: t as string, duration_days: 5 }))
    }
  })

  it('writes only columns itinerary_services actually has', () => {
    // Third failure in this route: the service-line insert wrote
    // supplier_cost / margin_percent / selling_price / currency / status —
    // none of which exist. The write-contract guard skips payloads built by
    // a map(), which is exactly how this one is built, so pin it here.
    const src = readFileSync(join(ROOT, 'app', 'api', 'b2b', 'quotes', '[id]', 'convert', 'route.ts'), 'utf8')
    const types = readFileSync(join(ROOT, 'types', 'database.types.ts'), 'utf8')
    const m = types.match(/^ {6}itinerary_services: \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/m)!
    const live = new Set([...m[1].matchAll(/^ {10}([a-z_0-9]+)\??:/gm)].map(x => x[1]))
    expect(src).toContain('serviceLineForItinerary(service')
    const row = serviceLineForItinerary({ service_name: 'x', service_category: 'water', line_total: 2, quantity: 1, quantity_mode: 'per_pax' }, { dayId: 'd', pax: 2, marginPercent: 25, currency: 'USD' })
    const keys = Object.keys(row)
    expect(keys.length).toBeGreaterThan(5)
    expect(keys.filter(k => !live.has(k))).toEqual([])
  })
})

describe('itineraryServiceType', () => {
  // Fourth failure in the route, found in the local replay: the CHECK on
  // itinerary_services.service_type rejected 'water' (bottled water lines)
  // and 'other', and the whole conversion rolled back.
  it('maps every category the saved quote QT-2026-00002 carries to an accepted type', () => {
    for (const c of ['airport_service', 'hotel_service', 'transportation', 'tips', 'accommodation', 'water']) {
      expect(SERVICE_TYPES).toContain(itineraryServiceType(c))
    }
    expect(itineraryServiceType('water')).toBe('supplies')
    expect(itineraryServiceType('extras_catalogue')).toBe('extra')
  })

  it('falls back to the catch-all, never to a confident wrong guess', () => {
    expect(itineraryServiceType('other')).toBe('extra')
    expect(itineraryServiceType('zeppelin')).toBe('extra')
    expect(itineraryServiceType(undefined)).toBe('extra')
  })

  it('the route builds every service line through the helper', () => {
    const src = readFileSync(join(ROOT, 'app', 'api', 'b2b', 'quotes', '[id]', 'convert', 'route.ts'), 'utf8')
    expect(src).toContain('serviceLineForItinerary(service')
    expect(src).not.toMatch(/service_type:\s*service\.service_category/)
  })
})

describe('serviceLineForItinerary', () => {
  // Fifth failure: a 2-pax quote of $1,317.26 converted into a $793.26
  // itinerary. The snapshot's per_pax lines carry the per-person amount at
  // quantity 1; the quote total multiplies them by the party. Reconciled
  // against QT-2026-00002: fixed 269.26 + per_pax 524.00 × 2 = 1317.26.
  const opts = { dayId: 'day-1', pax: 2, marginPercent: 25, currency: 'USD' }

  it('multiplies a per-person line by the party', () => {
    const r = serviceLineForItinerary({ service_name: 'Hotel', service_category: 'accommodation', quantity: 1, quantity_mode: 'per_pax', unit_cost: 170, line_total: 170 }, opts)
    expect(r.quantity).toBe(2)
    expect(r.rate_eur).toBe(170)
    expect(r.total_cost).toBe(340)
    expect(r.client_price).toBe(425)
    expect(r.supplier_currency).toBe('USD')
    expect(r.supplier_cost_original).toBe(340)
  })

  it('charges a fixed line once whatever the party', () => {
    const r = serviceLineForItinerary({ service_name: 'Sedan', service_category: 'transportation', quantity: 1, quantity_mode: 'fixed', unit_cost: 79.31, line_total: 79.31 }, opts)
    expect(r.quantity).toBe(1)
    expect(r.total_cost).toBe(79.31)
  })

  it('reconciles the whole QT-2026-00002 shape: fixed + per_pax × pax', () => {
    const lines = [
      ...Array(7).fill({ service_name: 'Water', service_category: 'water', quantity: 1, quantity_mode: 'per_pax', line_total: 2 }),
      ...Array(3).fill({ service_name: 'Hotel', service_category: 'accommodation', quantity: 1, quantity_mode: 'per_pax', line_total: 170 }),
      { service_name: 'Sedan', service_category: 'transportation', quantity: 1, quantity_mode: 'fixed', line_total: 269.26 },
    ]
    const total = lines.map(l => serviceLineForItinerary(l, opts).total_cost).reduce((a, b) => a + b, 0)
    expect(Math.round(total * 100) / 100).toBe(1317.26)
  })

  it('maps the category onto the constrained vocabulary and remembers the original', () => {
    const r = serviceLineForItinerary({ service_name: 'Water', service_category: 'water', quantity: 1, quantity_mode: 'per_pax', line_total: 2, pricing_note: 'sightseeing' }, opts)
    expect(r.service_type).toBe('supplies')
    expect(r.notes).toBe('sightseeing · category: water')
  })
})
