// ============================================
// NEEDS ATTENTION — one itinerary
// ============================================
// The detail page's strip of things that are wrong with THIS trip, built from
// what the page has already loaded. Each rule is one sentence a person can act
// on; none of them blocks anything (the send paths keep their own guards, see
// lib/pricing/itinerary-completeness).
//
// Pure: the page passes in what it knows and gets back codes and parameters;
// the wording lives in messages/*.json under itineraries.detail.attention.

import type { Language } from '@/types/multilingual'
import {
  findPlaceholders,
  tipsConflict,
  type DayText,
  type LanguageSummary,
} from './content-language'

export type AttentionSeverity = 'high' | 'medium' | 'low'

export interface AttentionItem {
  /** Stable per kind (+ language), for React keys and tests. */
  key: string
  code:
    | 'clientLanguageMissing'
    | 'languageOutdated'
    | 'clientLanguageUnreviewed'
    | 'placeholders'
    | 'tipsConflict'
    | 'invoicedWithoutBooking'
    | 'overnightWithoutStay'
  severity: AttentionSeverity
  params: Record<string, string | number>
  /** The language the item is about, when it is about one. */
  language?: Language
  /** Day numbers the item points at, for the "Day 1, 3" list and jump links. */
  days?: number[]
}

export interface AttentionDay {
  day_number: number
  /** Source text (canonical, as shown in the source language). */
  source: DayText
  /** Target text per language, when it exists. */
  targets?: Partial<Record<Language, DayText | null>>
  services: Array<{ service_type?: string | null }>
  /** itinerary_days flags: false means the night is not spent in a bed we
   *  book (a flight, a home day trip). */
  hotel_included?: boolean | null
  overnight?: boolean | null
}

export interface AttentionInput {
  status: string
  sourceLanguage: Language
  clientLanguage: Language | null
  languages: LanguageSummary[]
  days: AttentionDay[]
  inclusions: Partial<Record<Language, { inclusions: string[]; exclusions: string[] }>>
  hasInvoice: boolean
  hasBooking: boolean
}

const STAY_TYPES = new Set(['accommodation', 'hotel', 'cruise'])

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 }

export function itineraryAttention(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = []
  const summaryOf = (lang: Language) => input.languages.find(l => l.language === lang)

  // The client reads a language the trip is not (fully) written in.
  const client = input.clientLanguage
  if (client && client !== input.sourceLanguage) {
    const summary = summaryOf(client)
    if (summary && (summary.status === 'missing' || summary.status === 'partial')) {
      items.push({
        key: `clientLanguageMissing:${client}`,
        code: 'clientLanguageMissing',
        severity: 'high',
        language: client,
        params: { missing: summary.counts.missing, total: summary.total },
      })
    } else if (summary && summary.counts.machine > 0) {
      items.push({
        key: `clientLanguageUnreviewed:${client}`,
        code: 'clientLanguageUnreviewed',
        severity: 'low',
        language: client,
        params: { count: summary.counts.machine },
      })
    }
  }

  // Translations made before the source was last edited.
  for (const summary of input.languages) {
    if (summary.status === 'source' || summary.counts.outdated === 0) continue
    items.push({
      key: `languageOutdated:${summary.language}`,
      code: 'languageOutdated',
      severity: 'medium',
      language: summary.language,
      params: { count: summary.counts.outdated },
    })
  }

  // Template residue in client text, in any language.
  const placeholderDays: number[] = []
  const samples = new Set<string>()
  for (const day of input.days) {
    const texts = [day.source, ...Object.values(day.targets ?? {})]
      .filter((t): t is DayText => !!t)
      .flatMap(t => [t.title, t.description])
    const found = texts.flatMap(t => findPlaceholders(t))
    if (found.length > 0) {
      placeholderDays.push(day.day_number)
      for (const f of found) samples.add(f.match)
    }
  }
  if (placeholderDays.length > 0) {
    items.push({
      key: 'placeholders',
      code: 'placeholders',
      severity: 'high',
      days: placeholderDays,
      params: { days: placeholderDays.join(', '), samples: [...samples].slice(0, 3).join('  ') },
    })
  }

  // Tips included on one list and excluded on the other.
  for (const [lang, lists] of Object.entries(input.inclusions) as Array<[Language, { inclusions: string[]; exclusions: string[] }]>) {
    const conflict = tipsConflict(lists?.inclusions, lists?.exclusions)
    if (!conflict) continue
    items.push({
      key: `tipsConflict:${lang}`,
      code: 'tipsConflict',
      severity: 'medium',
      language: lang,
      params: { included: conflict.included[0], excluded: conflict.excluded[0] },
    })
  }

  // Invoiced before anything was booked: the pipeline ran out of order.
  if (input.hasInvoice && !input.hasBooking) {
    items.push({
      key: 'invoicedWithoutBooking',
      code: 'invoicedWithoutBooking',
      severity: 'medium',
      params: {},
    })
  }

  // A night somewhere with no hotel or cabin on the day. The last day is the
  // departure and has no night; a day with no overnight city, or one marked
  // as no hotel / no overnight, is a flight or a day trip home.
  const lastDay = Math.max(0, ...input.days.map(d => d.day_number))
  const unhoused = input.days
    .filter(d => d.day_number !== lastDay && (d.source.overnight_city ?? '').trim())
    .filter(d => d.hotel_included !== false && d.overnight !== false)
    .filter(d => !d.services.some(s => STAY_TYPES.has(String(s.service_type ?? '').toLowerCase())))
    .map(d => d.day_number)
  if (unhoused.length > 0) {
    items.push({
      key: 'overnightWithoutStay',
      code: 'overnightWithoutStay',
      severity: 'high',
      days: unhoused,
      params: { days: unhoused.join(', '), count: unhoused.length },
    })
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
