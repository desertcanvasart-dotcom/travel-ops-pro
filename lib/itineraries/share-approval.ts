// ============================================
// What an operator approved about a shared link's price
// ============================================
// A share link for an itinerary with services that have no cost is created
// only when the operator says "share anyway" (app/api/itineraries/[id]/share).
// The link records exactly which gaps that approval covered. The public page
// (app/share/[token]) re-checks on every view and shows the price only while
// every current gap is one of them — a service that loses its cost after the
// link went out withholds the price until the operator looks again.
//
// A gap is identified by its day and service name. Pure: no database.

import type { QuoteGap } from '@/lib/pricing/quote-completeness'
import { quoteCompleteness } from '@/lib/pricing/quote-completeness'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import type { ItineraryLinesResult } from '@/lib/pricing/itinerary-completeness'

export interface ApprovedGap {
  day: number | null
  name: string
}

function keyOf(g: { day?: unknown; name?: unknown }): string {
  const day = Number(g.day)
  return `${Number.isFinite(day) && day > 0 ? day : ''}|${String(g.name ?? '').trim().toLowerCase()}`
}

/** The record stored on the link: day and name only, the reason is not identity. */
export function toApprovedGaps(gaps: readonly QuoteGap[]): ApprovedGap[] {
  return gaps.map(g => ({ day: g.day ?? null, name: g.name }))
}

/** Current gaps the stored approval does not cover. Anything unreadable covers nothing. */
export function unapprovedGaps(current: readonly QuoteGap[], approved: unknown): QuoteGap[] {
  const keys = new Set(
    (Array.isArray(approved) ? approved : [])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map(keyOf),
  )
  return current.filter(g => !keys.has(keyOf(g)))
}

export type SharePriceDecision =
  | { show: true }
  | { show: false; reason: 'unchecked' | 'draft' | 'amount' | 'new_gaps'; gaps?: QuoteGap[] }

/**
 * May the public page show this itinerary's total? FAILS CLOSED: if the
 * services could not be read, the price is withheld — the itinerary itself
 * still shows.
 */
export function sharePriceDecision(input: {
  status: string | null | undefined
  totalCost: unknown
  currency: string | null | undefined
  lines: ItineraryLinesResult
  approvedGaps: unknown
}): SharePriceDecision {
  if (!input.lines.ok) return { show: false, reason: 'unchecked' }
  if (input.status === 'draft') return { show: false, reason: 'draft' }
  const amount = input.totalCost == null || input.totalCost === '' ? null : Number(input.totalCost)
  if (!checkAmountDeliverable(amount, { currency: input.currency }).ok) {
    return { show: false, reason: 'amount' }
  }
  const { gaps } = quoteCompleteness(input.lines.lines)
  const unapproved = unapprovedGaps(gaps, input.approvedGaps)
  if (unapproved.length > 0) return { show: false, reason: 'new_gaps', gaps: unapproved }
  return { show: true }
}
