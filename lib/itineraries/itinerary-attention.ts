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
//
// Two families: this app's content checks (languages, placeholders, a night
// with no hotel) and the trip's operational ones, ported from autoura-saas's
// tripAttention (lib/itineraries/trip-stage there) — a night whose property
// left Rates, no invoice or money still owed close to the start, a guide or
// vehicle still missing close to the start, a trip losing money, a trip that
// ended and was never closed. Each operational item carries the action that
// deals with it.

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
    | 'staleNight'
    | 'noInvoiceSoon'
    | 'unpaidSoon'
    | 'missingResource'
    | 'losingMoney'
    | 'endedNotClosed'
  severity: AttentionSeverity
  params: Record<string, string | number>
  /** The language the item is about, when it is about one. */
  language?: Language
  /** Day numbers the item points at, for the "Day 1, 3" list and jump links. */
  days?: number[]
  /** What deals with it, when one action does. */
  action?: { kind: AttentionAction; day?: number }
}

export type AttentionAction = 'create_invoice' | 'record_payment' | 'close_out' | 'go_to_day' | 'assign_resources' | 'open_finance'

/** Where the trip stands, for the operational rules (autoura-saas TripFacts). */
export interface TripState {
  /** YYYY-MM-DD, the office's today. */
  today: string
  startDate: string | null | undefined
  endDate: string | null | undefined
  currency: string
  /** From the P&L: what was invoiced and paid; null until it has loaded. */
  invoiced: number | null
  paid: number | null
  /** Profit on the costs recorded so far (P&L gross profit); null = unknown. */
  profit: number | null
  /** A night whose hotel or ship has since left Rates, or was switched off. */
  staleNights: Array<{ day: number; property: string; switchedOff: boolean }>
  /** Guide / vehicle / airport staff some day needs with nobody assigned. */
  missingResources: Array<{ type: string; days: number[] }>
  /** How many days before the start money owed becomes urgent. Default 14. */
  paymentDueDays?: number
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
  /** The operational rules run only when this is given. */
  trip?: TripState
}

const STAY_TYPES = new Set(['accommodation', 'hotel', 'cruise'])

const SEVERITY_ORDER: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 }

const day10 = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** The operational items — autoura-saas's tripAttention, as codes. */
function tripItems(status: string, hasInvoice: boolean, hasBooking: boolean, t: TripState): AttentionItem[] {
  const out: AttentionItem[] = []
  if (status === 'cancelled') return out
  const start = day10(t.startDate)
  const end = day10(t.endDate)
  const dueDays = t.paymentDueDays ?? 14

  for (const n of t.staleNights) {
    out.push({
      key: `staleNight:${n.day}`,
      code: 'staleNight',
      severity: 'medium',
      days: [n.day],
      params: { day: n.day, property: n.property, switchedOff: n.switchedOff ? 'yes' : 'no' },
      action: { kind: 'go_to_day', day: n.day },
    })
  }

  const balance = t.invoiced != null && t.paid != null ? t.invoiced - t.paid : null
  const untilStart = start ? daysBetween(t.today, start) : null
  const ended = !!end && end < t.today
  const when = untilStart == null ? '' : untilStart < 0 ? 'started' : untilStart === 0 ? 'today' : 'days'

  if (!ended && untilStart != null && untilStart <= dueDays) {
    if ((status === 'confirmed' || hasBooking) && !hasInvoice) {
      out.push({ key: 'noInvoiceSoon', code: 'noInvoiceSoon', severity: 'high', params: { when, days: Math.max(untilStart, 0) }, action: { kind: 'create_invoice' } })
    } else if (hasInvoice && balance != null && balance > 0.005) {
      out.push({
        key: 'unpaidSoon', code: 'unpaidSoon', severity: 'high',
        params: { when, days: Math.max(untilStart, 0), amount: `${t.currency} ${balance.toFixed(2)}` },
        action: { kind: 'record_payment' },
      })
    }
  }

  // A guide or a vehicle still missing matters once the trip is booked and close.
  if (!ended && untilStart != null && untilStart <= dueDays && (status === 'confirmed' || hasBooking)) {
    for (const m of t.missingResources) {
      if (m.days.length === 0) continue
      out.push({
        key: `missingResource:${m.type}`, code: 'missingResource', severity: 'high', days: m.days,
        params: { type: m.type, days: m.days.join(', ') },
        action: { kind: 'assign_resources' },
      })
    }
  }

  if (t.profit != null && t.profit < -0.005) {
    out.push({ key: 'losingMoney', code: 'losingMoney', severity: 'high', params: { amount: `${t.currency} ${t.profit.toFixed(2)}` }, action: { kind: 'open_finance' } })
  }

  if (ended && status !== 'completed') {
    out.push({ key: 'endedNotClosed', code: 'endedNotClosed', severity: 'low', params: { end: end!, status: status || 'open' }, action: { kind: 'close_out' } })
  }
  return out
}

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

  if (input.trip) items.push(...tripItems(input.status, input.hasInvoice, input.hasBooking, input.trip))

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
