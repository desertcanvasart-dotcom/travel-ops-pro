import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { templateDaysToItineraryDays, addDays, packageTypeForTemplate } from '@/lib/itineraries/template-days'

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
})
