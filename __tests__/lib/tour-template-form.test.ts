// Tours › Tour Templates audit — the pure pieces behind the page and its
// routes (#1 wording, #6, #7, #8, #10, #12, #13), plus the page wiring that
// cannot run without a browser (read from the source).
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('../_mock-supabase')
  return { createClient: mock.createMockClient }
})
import { templateSaveBody, variationPayloads, TEMPLATE_FORM_FIELDS } from '@/lib/tours/template-form'
import { generateTemplateCode, insertWithTemplateCode, isUniqueViolation } from '@/lib/tours/template-code'
import { describeReferences, refusalMessage, referenceTotal, NO_REFERENCES } from '@/lib/tours/catalogue-references'
import { englishVersionOf } from '@/lib/tours/english-version'
import { usesAutoPricing } from '@/lib/tours/cached-price'
import { packageTypeForTourType } from '@/app/api/b2b/transport-preview/route'
import { parseItinerary, determineTransportNeeds } from '@/lib/auto-pricing-service'

const page = readFileSync('app/tours/manage/TourManagerContent.tsx', 'utf8')

describe('#6: the save body carries only the fields the form shows', () => {
  const form = {
    template_code: '', template_name: 'Cairo', tour_type: 'day_tour', duration_days: 1, is_active: true, pricing_mode: 'manual',
    // The constants the form used to load in place of the stored values:
    age_suitability: 'all_ages', pickup_required: true, meals_included: [], default_transportation_service: 'day_tour',
    transportation_city: 'Cairo', long_description: '', image_url: '', uses_day_builder: true,
  }
  it('never sends the hidden fields, so PUT keeps their stored values', () => {
    const body = templateSaveBody(form)
    for (const k of ['age_suitability', 'pickup_required', 'meals_included', 'default_transportation_service', 'transportation_city', 'long_description', 'image_url', 'uses_day_builder']) {
      expect(body).not.toHaveProperty(k)
    }
    expect(body).toMatchObject({ template_name: 'Cairo', pricing_mode: 'manual', is_active: true })
  })
  it('a blank code is left to the server; a typed one is sent trimmed', () => {
    expect(templateSaveBody(form)).not.toHaveProperty('template_code')
    expect(templateSaveBody({ ...form, template_code: ' CAI-DAY-9 ' }).template_code).toBe('CAI-DAY-9')
  })
  it('every listed field is one the form has an input for', () => {
    for (const k of TEMPLATE_FORM_FIELDS) expect(page).toContain(`formData.${k}`)
  })
})

describe('#7: a tier from Settings › Vocabulary gets the fallback config', () => {
  const presets = { standard: { defaults: { min_pax: 1, max_pax: 10, group_type: 'private' as const, vehicle_type: 'modern_van', accommodation_standard: '4_star', meal_quality: 'good' } } }
  const fallback = { ...presets.standard.defaults, max_pax: 12 }
  it('builds a row for 5_star from the fallback, named with the vocabulary label', () => {
    const rows = variationPayloads({
      templateId: 't1', templateName: 'Nile', tiers: ['standard', '5_star'], groupTypes: { standard: 'shared' },
      configFor: k => presets[k as 'standard'], fallback, labelFor: k => (k === '5_star' ? 'Five Star' : 'Standard'),
    })
    expect(rows).toEqual([
      expect.objectContaining({ tier: 'standard', variation_name: 'Nile - Standard', group_type: 'shared', max_pax: 10 }),
      expect.objectContaining({ tier: '5_star', variation_name: 'Nile - Five Star', group_type: 'private', max_pax: 12 }),
    ])
  })
  it('the page builds its rows inside the try and never reads TIER_CONFIG[tier].label bare', () => {
    expect(page).not.toContain('${config.label}')
    expect(page.match(/variationPayloads\(\{/g)).toHaveLength(2)
    expect(page.match(/fallback: CUSTOM_TIER_CONFIG\.defaults/g)).toHaveLength(2)
    // The modal's map sits inside the try, so the button frees on any error.
    const modal = page.slice(page.indexOf('const handleCreate = async'), page.indexOf('return (', page.indexOf('const handleCreate = async')))
    expect(modal.indexOf('try {')).toBeLessThan(modal.indexOf('variationPayloads('))
  })
  it('after the template is saved the modal closes whatever the variations do (no twin on resubmit)', () => {
    const submit = page.slice(page.indexOf('const handleSubmit = async'), page.indexOf('// A template that quotes'))
    expect(submit).toContain('Template created, but its variations were not')
    expect(submit.trimEnd().split('\n').slice(-3).join('\n')).toContain('setShowModal(false)')
  })
})

describe('#12: template codes', () => {
  it('CITY-TYPE-NNN from the first city and the type', () => {
    expect(generateTemplateCode(['Luxor', 'Aswan'], 'multi_day', () => 0.042)).toBe('LUX-MUL-042')
    expect(generateTemplateCode([], 'day_tour', () => 0)).toBe('EGY-DAY-000')
  })
  it('a generated code is drawn again on a clash; a typed one is not', async () => {
    const taken = new Set(['CAI-DAY-100'])
    const draws = [0.1, 0.2]
    const insert = async (code: string) => taken.has(code)
      ? { data: null, error: { code: '23505', message: 'duplicate key' } }
      : { data: { code }, error: null }
    const gen = await insertWithTemplateCode(insert, { cities: ['Cairo'], tourType: 'day_tour', random: () => draws.shift()! })
    expect(gen).toMatchObject({ data: { code: 'CAI-DAY-200' }, clash: false })
    const typed = await insertWithTemplateCode(insert, { typed: 'CAI-DAY-100' })
    expect(typed).toMatchObject({ data: null, clash: true, code: 'CAI-DAY-100' })
  })
  it('another error is not a clash and is not retried', async () => {
    let calls = 0
    const r = await insertWithTemplateCode(async () => { calls++; return { data: null, error: { message: 'boom' } } }, { cities: [], tourType: 'day_tour' })
    expect(r.clash).toBe(false)
    expect(calls).toBe(1)
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(true)
  })
})

describe('#1: the refusal says what uses the template', () => {
  it('names only the kinds in use, singular and plural', () => {
    const r = { ...NO_REFERENCES, quotes: 3, departures: 1, holds: 2 }
    expect(describeReferences(r)).toBe('3 quotes, 1 departure, 2 seat holds')
    expect(referenceTotal(r)).toBe(6)
    expect(refusalMessage('template', 'Nile', r)).toMatch(/^"Nile" is used by 3 quotes, .* Deactivate it instead/)
  })
  it('the page offers Deactivate on a 409', () => {
    const del = page.slice(page.indexOf('const handleDelete = async'), page.indexOf('const filteredTemplates'))
    expect(del).toContain('response.status === 409 && data.can_deactivate')
    expect(del).toContain("confirmText: 'Deactivate'")
    expect(del).toContain('JSON.stringify({ is_active: false })')
  })
})

describe('#9: the EN version row is built from the saved template', () => {
  it('carries every translatable field', () => {
    const row = englishVersionOf({ id: 't', template_name: 'N', short_description: 'S', highlights: ['h'], inclusions: ['i'], itinerary: [{ day: 1 }] })
    expect(row).toMatchObject({ template_id: 't', language: 'en', template_name: 'N', short_description: 'S', highlights: ['h'], inclusions: ['i'], exclusions: [], best_for: [], itinerary: [{ day: 1 }] })
  })
})

describe('#10: Auto-Pricing is pricing_mode, and the engine honours manual', () => {
  it("'manual' wins over uses_day_builder; auto or a day plan prices", () => {
    expect(usesAutoPricing({ uses_day_builder: true, pricing_mode: 'manual' })).toBe(false)
    expect(usesAutoPricing({ uses_day_builder: false, pricing_mode: 'auto' })).toBe(true)
    expect(usesAutoPricing({ uses_day_builder: true, pricing_mode: null })).toBe(true)
    expect(usesAutoPricing({ uses_day_builder: false, pricing_mode: null })).toBe(false)
  })
  it('the checkbox is bound to pricing_mode', () => {
    expect(page).toContain('name="pricing_mode"')
    expect(page).not.toContain('name="uses_day_builder"')
  })
})

describe('#8: the preview prices a day tour as a day trip', () => {
  const day = [{ day: 1, title: 'Giza', city: 'Cairo', meals: [], attractions: [] }]
  const airport = (packageType?: string) => {
    const it = parseItinerary(day, { packageType })
    return determineTransportNeeds(it[0], null, null, { road: null }).map(n => n.serviceType).filter(t => t.startsWith('airport'))
  }
  it('day_tour / half_day / stopover → day-trips, with no airport transfers', () => {
    expect(packageTypeForTourType('day_tour')).toBe('day-trips')
    expect(packageTypeForTourType('half_day')).toBe('day-trips')
    expect(packageTypeForTourType('multi_day')).toBeUndefined()
    expect(airport(packageTypeForTourType('day_tour'))).toEqual([])
    expect(airport(undefined).length).toBeGreaterThan(0)
  })
  it('the route reads tour_type from the body, and the editor sends it', () => {
    const route = readFileSync('app/api/b2b/transport-preview/route.ts', 'utf8')
    expect(route).toContain('packageType = packageTypeForTourType(body.tour_type)')
    expect(page).toContain('tourType={formData.tour_type}')
  })
})

describe('#13: attraction fees in their own currency, and no silent cap', () => {
  it("converts from each row's rate_currency", () => {
    expect(page).toContain('formatWithConversion(attr.eur_rate, attr.rate_currency || rateCurrency)')
    expect(page).toContain('formatWithConversion(attr.non_eur_rate, attr.rate_currency || rateCurrency)')
  })
  it('asks the server for non-add-on fees without the 500 cap, and says when the list is capped', () => {
    expect(page).not.toContain('entrance-fees?limit=500')
    expect(page).toContain("'/api/rates/entrance-fees?active_only=true&is_addon=false'")
    expect(page).toContain('Type at least two letters to search all of them')
  })
})

describe('#11: Duplicate goes through the server copy', () => {
  it('the page posts to the duplicate route', () => {
    expect(page).toContain('/api/tours/templates/${template.id}/duplicate')
  })
})
