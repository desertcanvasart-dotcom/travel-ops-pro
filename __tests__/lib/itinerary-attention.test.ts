// The detail page's Needs attention strip, against the reference record
// (ITN-26-009 / NMS803-CR-ABS): English source, Japanese client with no
// Japanese text, placeholders on day 1, tips on both lists, invoiced with no
// booking.
import { describe, it, expect } from 'vitest'
import { itineraryAttention, type AttentionInput } from '@/lib/itineraries/itinerary-attention'
import { summarizeLanguage, type DayText } from '@/lib/itineraries/content-language'

const text = (over: Partial<DayText> = {}): DayText => ({
  title: 'Cairo', description: 'Pyramids of Giza.', city: 'Cairo', overnight_city: 'Cairo', ...over,
})

const base = (over: Partial<AttentionInput> = {}): AttentionInput => ({
  status: 'confirmed',
  sourceLanguage: 'en',
  clientLanguage: 'ja',
  languages: [summarizeLanguage('ja', ['missing', 'missing', 'missing'])],
  days: [
    {
      day_number: 1,
      source: text({ title: 'Overnight flight', description: '【00:00】 Departing on EgyptAir flight XX to Cairo', overnight_city: null }),
      services: [{ service_type: 'transportation' }],
    },
    { day_number: 2, source: text(), services: [{ service_type: 'accommodation' }] },
    { day_number: 3, source: text({ overnight_city: null }), services: [] },
  ],
  inclusions: {
    en: {
      inclusions: ['Tips for drivers, porters, and hotel concierge'],
      exclusions: ['Gratuities for your guide'],
    },
  },
  hasInvoice: true,
  hasBooking: false,
  ...over,
})

const codes = (input: AttentionInput) => itineraryAttention(input).map(i => i.code)

describe('itineraryAttention', () => {
  it('finds everything wrong with the reference record, worst first', () => {
    const items = itineraryAttention(base())
    expect(items.map(i => i.code)).toEqual([
      'clientLanguageMissing', 'placeholders', 'tipsConflict', 'invoicedWithoutBooking',
    ])
    expect(items[1].days).toEqual([1])
    expect(items[1].params.samples).toContain('【00:00】')
  })

  it('a client who reads the source language needs no translation', () => {
    expect(codes(base({ clientLanguage: 'en' }))).not.toContain('clientLanguageMissing')
  })

  it('a fully machine-translated client language is a low note, not a gap', () => {
    const items = itineraryAttention(base({ languages: [summarizeLanguage('ja', ['machine', 'machine', 'reviewed'])] }))
    const item = items.find(i => i.code === 'clientLanguageUnreviewed')
    expect(item?.severity).toBe('low')
    expect(item?.params.count).toBe(2)
  })

  it('outdated days are reported for any target language', () => {
    const items = itineraryAttention(base({ clientLanguage: null, languages: [summarizeLanguage('ja', ['outdated', 'reviewed'])] }))
    expect(items.find(i => i.code === 'languageOutdated')?.params.count).toBe(1)
  })

  it('placeholders in a translation count too', () => {
    const items = itineraryAttention(base({
      days: [{ day_number: 1, source: text(), targets: { ja: text({ description: 'ホテル未定' }) }, services: [{ service_type: 'hotel' }] }, { day_number: 2, source: text(), services: [] }],
    }))
    expect(items.find(i => i.code === 'placeholders')?.days).toEqual([1])
  })

  it('a night with no hotel or cabin line is an incomplete price; the last day and flight nights are not', () => {
    const input = base({
      days: [
        { day_number: 1, source: text({ overnight_city: 'Cairo' }), services: [], hotel_included: false },
        { day_number: 2, source: text(), services: [{ service_type: 'guide' }] },
        { day_number: 3, source: text(), services: [{ service_type: 'cruise' }] },
        { day_number: 4, source: text(), services: [] },
      ],
    })
    const item = itineraryAttention(input).find(i => i.code === 'overnightWithoutStay')
    expect(item?.days).toEqual([2])
  })

  it('a booked trip is not flagged for its invoice', () => {
    expect(codes(base({ hasBooking: true }))).not.toContain('invoicedWithoutBooking')
  })
})
