// ============================================
// Which guide or meal rate prices a day
// ============================================
// The Guides and Meals rate pages let an office enter several rates for one
// service — per city, per supplier, per validity period, a half day beside a
// full one, a starred restaurant beside the rest. The engine used to take the
// first row of the language (any city, any period) for a guide and AVERAGE
// every lunch row of the tier across all restaurants and cities for a meal,
// so an expired rate kept pricing, a Cairo and a Luxor rate were picked in
// database order, and a per-group restaurant price was charged per person
// (Rates audit, Guides & Services #5, #6, #7).
//
// One rule now, pure so it is tested once and shared by the engine, the B2B
// calculator and anything else that prices from these tables:
//
//   1. Only a rate whose validity covers the date (blank dates = always).
//   2. Then a FIXED order: the day's city before a city-less rate before
//      another city's; the chosen supplier first; a starred (preferred)
//      restaurant first; the newest period; then service code and id — never
//      database order.
//
// Client-safe (no server imports).

import { sameGuideLanguage } from '@/lib/guides/guide-language'
import { rateGuideMode } from '@/lib/guides/guide-mode'

type Dated = { rate_valid_from?: string | null; rate_valid_to?: string | null }

/** Today as YYYY-MM-DD (UTC) — the date a dateless price is asked for. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Does this rate's validity period cover `date`? Blank ends are open. */
export function rateValidOn(row: Dated, date: string | null | undefined): boolean {
  if (!date) return true
  const d = date.slice(0, 10)
  const from = row.rate_valid_from ? String(row.rate_valid_from).slice(0, 10) : null
  const to = row.rate_valid_to ? String(row.rate_valid_to).slice(0, 10) : null
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

const lc = (v: unknown) => String(v ?? '').trim().toLowerCase()

/** 0 = the asked city, 1 = no city on the rate, 2 = another city. */
function cityRank(row: { city?: string | null }, city: string | null | undefined): number {
  if (!city) return row.city ? 1 : 0
  if (!row.city) return 1
  return lc(row.city) === lc(city) ? 0 : 2
}

/** The fixed tie-break after the business ranks: newest period, code, id. */
function stableCompare(a: Record<string, any>, b: Record<string, any>): number {
  const fa = String(a.rate_valid_from ?? ''), fb = String(b.rate_valid_from ?? '')
  if (fa !== fb) return fa > fb ? -1 : 1
  const ca = String(a.service_code ?? ''), cb = String(b.service_code ?? '')
  if (ca !== cb) return ca < cb ? -1 : 1
  const ia = String(a.id ?? ''), ib = String(b.id ?? '')
  return ia < ib ? -1 : ia > ib ? 1 : 0
}

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

/** The durations the engine asks for. Extended (10h+) and Hourly rates are
 *  kept for vouchers and the pricing grid; no trip day asks for them. */
export type GuideAskDuration = 'full_day' | 'half_day' | 'meet_greet'

export interface GuideAsk {
  language: string
  /** guide_rates.guide_type */
  grade: string
  duration: GuideAskDuration
  mode: string
  city?: string | null
  /** The day's date; rates outside their validity are not used. */
  date?: string | null
  /** A guide the operator chose: that guide's rate first. */
  supplierId?: string | null
}

/**
 * The guide_rates row for one guiding day, or null.
 *
 * Exact grade + duration first. For the DEFAULT ask (an Egyptologist, a full
 * day, spot) any rate of the language still serves, so installs whose rows
 * predate grades price as before; any other ask must match a real row.
 */
export function pickGuideRate<T extends Record<string, any>>(rows: T[], ask: GuideAsk): T | null {
  const ofLanguage = rows.filter(r =>
    r.is_active !== false &&
    sameGuideLanguage(r.guide_language, ask.language) &&
    rateGuideMode(r) === ask.mode &&
    rateValidOn(r, ask.date)
  )
  const order = (list: T[]) => [...list].sort((a, b) =>
    cityRank(a, ask.city) - cityRank(b, ask.city) ||
    (ask.supplierId ? Number(b.supplier_id === ask.supplierId) - Number(a.supplier_id === ask.supplierId) : 0) ||
    stableCompare(a, b)
  )
  const exact = order(ofLanguage.filter(r => r.guide_type === ask.grade && r.tour_duration === ask.duration))
  if (exact.length) return exact[0]
  if (ask.grade === 'egyptologist' && ask.duration === 'full_day' && ask.mode === 'spot') {
    return order(ofLanguage)[0] ?? null
  }
  return null
}

/**
 * Is this a half-day guiding day? Only when the trip says so: a template sold
 * as a half-day tour, or a day whose transport the operator set to a half
 * day. A day is never guessed half from how few sights it lists.
 */
export function isHalfDayGuiding(
  day: { transport?: { duration?: string | null } | null; transport_lines?: Array<{ service_type?: string | null }> | null },
  tourType?: string | null,
): boolean {
  if (tourType === 'half_day') return true
  if (day.transport?.duration === 'half_day') return true
  const lines = day.transport_lines ?? []
  const sightseeing = lines.filter(l => ['half_day', 'day_tour', 'extended_day_tour', 'city_tour'].includes(String(l.service_type)))
  return sightseeing.length > 0 && sightseeing.every(l => l.service_type === 'half_day')
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export interface MealAsk {
  /** 'lunch' | 'dinner' */
  mealType: string
  city?: string | null
  date?: string | null
  /** A restaurant rate the operator picked: exactly that row. */
  rateId?: string | null
}

export interface PickedMeal {
  row: Record<string, any>
  rate: number
  /** false = one price for the whole group (meal_rates.per_person_rate). */
  perPerson: boolean
  /** A per-person rate is charged for at least this many people. */
  minimumPax: number
}

/** The legacy one-row-per-tier shape: lunch_rate_eur / dinner_rate_eur. */
const legacyColumn = (mealType: string) => (mealType === 'lunch' ? 'lunch_rate_eur' : mealType === 'dinner' ? 'dinner_rate_eur' : null)

function asPicked(row: Record<string, any>, rate: number): PickedMeal {
  const min = Number(row.minimum_pax)
  return {
    row,
    rate,
    perPerson: row.per_person_rate !== false,
    minimumPax: Number.isFinite(min) && min > 1 ? Math.floor(min) : 1,
  }
}

/**
 * The ONE restaurant rate a meal is priced at — never an average across
 * restaurants. A picked rate id wins outright. Otherwise: valid on the date,
 * of this meal type, with a price; the day's city first, the starred
 * (Preferred) restaurant first, then the fixed order. Rows from before the
 * meals page (lunch_rate_eur / dinner_rate_eur on one row) still price.
 */
export function pickMealRate(rows: Record<string, any>[], ask: MealAsk): PickedMeal | null {
  const mealType = lc(ask.mealType)
  if (ask.rateId) {
    const chosen = rows.find(r => r.id === ask.rateId)
    const rate = Number(chosen?.base_rate_eur) || 0
    return chosen && rate > 0 ? asPicked(chosen, rate) : null
  }
  const valid = rows.filter(r => r.is_active !== false && rateValidOn(r, ask.date))
  const typed = valid
    .filter(r => lc(r.meal_type) === mealType && (Number(r.base_rate_eur) || 0) > 0)
    .sort((a, b) =>
      cityRank(a, ask.city) - cityRank(b, ask.city) ||
      Number(b.is_preferred === true) - Number(a.is_preferred === true) ||
      lc(a.restaurant_name).localeCompare(lc(b.restaurant_name)) ||
      stableCompare(a, b)
    )
  if (typed.length) return asPicked(typed[0], Number(typed[0].base_rate_eur))
  const col = legacyColumn(mealType)
  if (!col) return null
  const legacy = valid
    .filter(r => (Number(r[col]) || 0) > 0)
    .sort((a, b) => cityRank(a, ask.city) - cityRank(b, ask.city) || stableCompare(a, b))[0]
  // A legacy row is per person with no minimum, as it always priced.
  return legacy ? { row: legacy, rate: Number(legacy[col]), perPerson: true, minimumPax: 1 } : null
}

/**
 * What a picked meal costs a group of `pax`: a per-group rate once; a
 * per-person rate × the group, but never fewer than its minimum.
 */
export function mealCostForGroup(meal: Pick<PickedMeal, 'rate' | 'perPerson' | 'minimumPax'>, pax: number): number {
  const people = Math.max(1, Math.floor(pax) || 1)
  if (!meal.perPerson) return meal.rate
  return meal.rate * Math.max(people, meal.minimumPax)
}

/**
 * How many times a voucher line charges a picked meal rate: once for a
 * per-group rate, else the party — never fewer than the restaurant's minimum.
 * The voucher multiplied every meal rate by the party, per group or not.
 */
export function mealVoucherQuantity(rate: { per_person_rate?: boolean | null; minimum_pax?: number | null }, pax: number): number {
  if (rate.per_person_rate === false) return 1
  const people = Math.max(1, Math.floor(pax) || 1)
  const min = Number(rate.minimum_pax)
  return Math.max(people, Number.isFinite(min) && min > 1 ? Math.floor(min) : 1)
}
