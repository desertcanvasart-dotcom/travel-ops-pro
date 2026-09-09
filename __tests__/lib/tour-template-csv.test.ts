// Flat tour-template CSV: serialize the portable columns and parse them back,
// with required-field and duplicate-code refusals. The nested itinerary/hotels
// never enter this format by design.
import { describe, it, expect } from 'vitest'
import Papa from 'papaparse'
import { serializeTemplatesCsv, parseTemplatesCsv, sampleTemplateCsv, TEMPLATE_CSV_COLUMNS } from '@/lib/tours/template-csv'

const papa = (csv: string) => {
  const p = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() })
  return { data: p.data, errors: p.errors.map(e => ({ message: e.message })) }
}

describe('serializeTemplatesCsv', () => {
  it('emits the portable columns, joins cities, and renders booleans', () => {
    const csv = serializeTemplatesCsv([
      { template_code: 'CAI-DAY-828', template_name: 'Memphis Day Trip', name_ja: 'メンフィス日帰り', tour_type: 'day_tour', duration_days: 1, duration_nights: 0, cities_covered: ['Cairo', 'Giza'], short_description: 'x', long_description: '', is_featured: false, is_active: true },
    ])
    const [header, row] = csv.trim().split('\n')
    expect(header).toBe(TEMPLATE_CSV_COLUMNS.map(c => c.label).join(','))
    expect(row).toContain('"CAI-DAY-828"')
    expect(row).toContain('"Cairo; Giza"')
    expect(row).toContain('"メンフィス日帰り"')
    expect(row.endsWith('"false","true"')).toBe(true)
  })
})

describe('parseTemplatesCsv', () => {
  it('round-trips a serialized sheet into typed records', () => {
    const csv = serializeTemplatesCsv([
      { template_code: 'NMS601-LND', template_name: 'Cairo & Luxor', tour_type: 'land_tour', duration_days: 6, duration_nights: 5, cities_covered: ['Cairo', 'Luxor'], is_active: true, is_featured: false },
    ])
    const { records, refused } = parseTemplatesCsv(csv, papa)
    expect(refused).toEqual([])
    expect(records[0]).toMatchObject({
      template_code: 'NMS601-LND', template_name: 'Cairo & Luxor', tour_type: 'land_tour',
      duration_days: 6, duration_nights: 5, cities_covered: ['Cairo', 'Luxor'], is_active: true, is_featured: false,
    })
  })

  it('omits blank optional cells so an update never nulls them', () => {
    const { records } = parseTemplatesCsv('Code,Name,Type,Duration Days,Short Description\nX-1,Foo,day_tour,1,\n', papa)
    expect(records[0]).not.toHaveProperty('short_description')
    expect(records[0]).not.toHaveProperty('cities_covered')
  })

  it('refuses rows missing a required field, with the reason', () => {
    const { records, refused } = parseTemplatesCsv(
      ['Code,Name,Type,Duration Days', ',Nameless,day_tour,1', 'X-2,,day_tour,1', 'X-3,Foo,,1', 'X-4,Foo,day_tour,0'].join('\n'),
      papa,
    )
    expect(records).toEqual([])
    expect(refused.map(r => r.reason)).toEqual([
      'missing Code',
      '"X-2": missing Name',
      '"X-3": missing Type',
      '"X-4": Duration Days must be a whole number ≥ 1',
    ])
  })

  it('skips the sample sheet’s EXAMPLE- guide row so uploading it unedited is a no-op', () => {
    const { records, refused } = parseTemplatesCsv(sampleTemplateCsv(), papa)
    expect(records).toEqual([])
    expect(refused).toEqual([])
  })

  it('imports real rows alongside the example row (example skipped)', () => {
    const csv = sampleTemplateCsv() + '"EGY-DAY-9","Real Tour","","day_tour","1","0","Cairo","","","false","true"\n'
    const { records } = parseTemplatesCsv(csv, papa)
    expect(records.map(r => r.template_code)).toEqual(['EGY-DAY-9'])
  })

  it('refuses a duplicate code within the file', () => {
    const { records, refused } = parseTemplatesCsv('Code,Name,Type,Duration Days\nDUP,A,day_tour,1\nDUP,B,day_tour,2\n', papa)
    expect(records).toHaveLength(1)
    expect(refused[0].reason).toMatch(/appears more than once/)
  })
})
