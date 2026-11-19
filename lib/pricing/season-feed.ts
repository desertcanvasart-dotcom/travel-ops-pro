// ============================================
// The seasons feed: the operator's peak calendar, for a partner or a website
// ============================================
// What GET /api/public/v1/seasons answers (ported from autoura-saas #823, its
// Publish feed's /seasons). The same rules quotes use (season-uplift.ts):
//   - matched by the DEPARTURE date;
//   - where windows overlap, the HIGHEST premium wins, never the sum;
//   - the premium is on the whole per-person selling price:
//       peak price = price × (1 + upliftPercent / 100), to the cent.
// Switched-off seasons, 0% seasons and windows that have already ended are left
// out: none of them charges anything.
//
// Pure.

import { seasonForDate, type SeasonWindow } from './season-uplift'

export interface FeedRange { start: string; end: string; label: string | null }
export interface FeedSeason { name: string; upliftPercent: number; ranges: FeedRange[] }

export interface SeasonsFeed {
  asOf: string
  rule: { matchBy: 'departure_date'; overlap: 'highest_wins'; appliesTo: 'per_person_selling_price' }
  seasons: FeedSeason[]
  /** With ?date=: the season that date falls in, or null for an ordinary date. */
  date?: { date: string; season: { name: string; upliftPercent: number } | null }
}

/** One window as read: an ACTIVE season's dates, with the window's own label. */
export type FeedWindow = SeasonWindow & { label?: string | null }

export function seasonsFeed(windows: readonly FeedWindow[], today: string, date?: string | null): SeasonsFeed {
  const live = windows.filter(w => w.upliftPercent > 0 && w.endDate.slice(0, 10) >= today)

  const bySeason = new Map<string, FeedSeason>()
  for (const w of [...live].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    const s = bySeason.get(w.seasonId) ?? { name: w.name, upliftPercent: w.upliftPercent, ranges: [] }
    s.ranges.push({ start: w.startDate.slice(0, 10), end: w.endDate.slice(0, 10), label: w.label ?? null })
    bySeason.set(w.seasonId, s)
  }

  const feed: SeasonsFeed = {
    asOf: today,
    rule: { matchBy: 'departure_date', overlap: 'highest_wins', appliesTo: 'per_person_selling_price' },
    seasons: [...bySeason.values()].sort((a, b) => a.ranges[0].start.localeCompare(b.ranges[0].start) || a.name.localeCompare(b.name)),
  }
  if (date) {
    const m = seasonForDate(live as SeasonWindow[], date)
    feed.date = { date, season: m ? { name: m.name, upliftPercent: m.upliftPercent } : null }
  }
  return feed
}

/** A per-person price on a peak date, to the cent. */
export function peakPerPerson(perPerson: number, upliftPercent: number): number {
  return Math.round(perPerson * (1 + upliftPercent / 100) * 100) / 100
}
