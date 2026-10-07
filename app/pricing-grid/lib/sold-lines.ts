// ============================================
// What the grid SELLS — one rule for the screen and the save
// ============================================
// The calculator decides what a quote charges; the save writes the itinerary's
// service lines and then stores, as the trip's total, the sum of those lines.
// So any line the save writes that the calculator does not charge — or any
// price it writes differently — becomes a stored total that is not the quote.
// Four such differences, each fixed here once for both sides:
//
//   1. THE SINGLE SUPPLEMENT. Picking a hotel puts its "Single Supplement"
//      add-on (`<id>_supp`) under it. The calculator charges it to a party of
//      ONE only; the save wrote it for every party, × pax.
//   2. A TYPED ACCOMMODATION AMOUNT (a legacy row, an old draft). The save
//      preferred it, the on-screen day ignored it, the B2B sheet used it only
//      with no hotel picked. It is per person, and it wins — as in every slot.
//   3. THE DAY'S OWN RATE. The screen prices a day from the rate period that
//      covers its date; the save wrote each rate's base price (the first
//      period), so a December night was stored at the June rate.
//   4. THE THROUGHOUT GUIDE. His bed, his seat on each flight and — at three
//      or fewer travellers — his meals are in the price; the save never wrote
//      them, so they fell out of the stored total.
//
// (The guide switch — guide-rule.ts — is the fifth, shared the same way.)
// Ported from autoura-saas (#579, #580, #583); 3 is this app's own.

import { rateOnDate } from '@/lib/rates/date-window'
import { isSupplementItem } from '../types'

type Passport = 'eu' | 'non_eu'

interface PricedItem {
  rateId: string
  name?: string
  rateEur: number
  rateNonEur: number
  periods?: Parameters<typeof rateOnDate>[0]['periods']
  supplementKey?: string
  guideRate?: number | null
}

/** The single supplement is sold to a party of one only. */
export const supplementSold = (pax: number): boolean => pax === 1

/**
 * The accommodation items a party of `pax` is charged: the room, the agency's
 * supplements (a view, a meal plan — every traveller pays them), and the
 * single supplement only for a party of one. Anything else under the room is
 * a legacy single supplement, sold the same way.
 */
export function soldAccommodationItems<T extends PricedItem>(items: readonly T[], pax: number): T[] {
  return items.filter((item, i) => i === 0 || isSupplementItem(item) || supplementSold(pax))
}

/** What an item costs on the day it is used: its dated period, else its own
 *  price; a date no period covers is 0 — the grid's "unpriced". */
export function rateOn(item: PricedItem, passport: Passport, date: string | null): number {
  return rateOnDate(item, passport, date) ?? 0
}

/** Both prices of an item on a date, for a stored line. */
export function ratesOn(item: PricedItem, date: string | null): { rateEur: number; rateNonEur: number } {
  return { rateEur: rateOn(item, 'eu', date), rateNonEur: rateOn(item, 'non_eu', date) }
}

export interface ThroughoutRow {
  serviceType: 'accommodation' | 'cruise' | 'flight' | 'meal'
  name: string
  kind: 'bed' | 'seat' | 'meal'
  amount: number
}

/**
 * The throughout guide's own costs on one day, as the calculator charges them
 * (calculateDay): the night's guide rate, a seat on each flight (his fare, else
 * the passenger fare), and his meals at the same rates when the party is three
 * or fewer. Only when the guide is throughout AND switched on.
 */
export function throughoutGuideRows(
  slots: ReadonlyArray<{ slotId: string; customAmount?: number; selectedItems?: PricedItem[] | null }>,
  config: { guideMode?: string; withGuide?: boolean; pax: number; passport: Passport },
  date: string | null,
): ThroughoutRow[] {
  if (!(config.guideMode === 'throughout' && config.withGuide)) return []
  const rows: ThroughoutRow[] = []
  for (const slot of slots) {
    const items = slot.selectedItems ?? []
    if ((slot.slotId === 'accommodation' || slot.slotId === 'cruise') && items.length > 0) {
      const bed = Number(items[0].guideRate) || 0
      if (bed > 0) rows.push({ serviceType: slot.slotId, kind: 'bed', name: `Throughout Guide — bed (${items[0].name ?? ''})`, amount: bed })
    }
    if (slot.slotId === 'flights') {
      for (const item of items) {
        const fare = item.guideRate != null ? Number(item.guideRate) || 0 : rateOn(item, config.passport, date)
        if (fare > 0) rows.push({ serviceType: 'flight', kind: 'seat', name: `Throughout Guide — seat (${item.name ?? ''})`, amount: fare })
      }
    }
    if (slot.slotId === 'meals' && config.pax <= 3) {
      if ((slot.customAmount ?? 0) > 0) {
        rows.push({ serviceType: 'meal', kind: 'meal', name: 'Throughout Guide — meals', amount: Number(slot.customAmount) })
      } else {
        for (const item of items) {
          const rate = rateOn(item, config.passport, date)
          if (rate > 0) rows.push({ serviceType: 'meal', kind: 'meal', name: `Throughout Guide — ${item.name ?? 'meal'}`, amount: rate })
        }
      }
    }
  }
  return rows
}
