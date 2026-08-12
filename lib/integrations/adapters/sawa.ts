// ============================================
// SAWA ADAPTER — a worked example of a partner dialect
// ============================================
// Sawa is a seat-pooling platform: several operators sell into one coach, so
// its "seats" are pool-wide, not ours alone. Its payload differs from our
// canonical shape in ways that are typical of this class of partner, which is
// why it makes a good template for the next one:
//
//   * departures arrive under `trips`, not `departures`
//   * seats are expressed as REMAINING, not as booked — the single most common
//     way to get a mirror silently backwards
//   * dates come as a start plus a night count
//   * its own status vocabulary ('selling' / 'closed' / 'waitlist')
//
// Everything here is field translation. The moment it is translated we hand off
// to the generic normalizer, so validation rules live in exactly one place.

import {
  IntegrationError,
  type AdapterIssue,
  type AdapterResult,
  type CanonicalDeparture,
  type DepartureStatus,
  type IntegrationAdapter,
} from '../types'
import { asRecord, normalizeDeparture, toNum, toStr } from './generic'

/** Sawa's status vocabulary → ours. Unmapped values fall through to derived. */
const STATUS_MAP: Record<string, DepartureStatus> = {
  selling: 'open',
  open: 'open',
  waitlist: 'full',
  closed: 'full',
  guaranteed: 'guaranteed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  draft: 'draft',
}

export const sawaAdapter: IntegrationAdapter = {
  slug: 'sawa',
  label: 'Sawa (seat pooling)',
  description:
    'Mirrors Sawa pooled departures. Seats are pool-wide: booked_pax counts every operator selling into that coach, not only yours.',

  normalizeInbound(body: unknown, settings: Record<string, unknown>): AdapterResult {
    const root = asRecord(body)
    if (!root) {
      throw new IntegrationError('Request body must be a JSON object', 400, 'invalid_body')
    }

    const trips = root.trips ?? root.departures ?? root.data
    if (!Array.isArray(trips)) {
      throw new IntegrationError(
        'No trips array found. Sawa deliveries carry { "trips": [...] }.',
        400,
        'invalid_body'
      )
    }

    // Sawa tour codes are theirs, not ours. An operator can map them to local
    // codes in the connection settings; unmapped codes pass through unchanged.
    const codeMap = (asRecord(settings.tour_code_map) ?? {}) as Record<string, unknown>

    const departures: CanonicalDeparture[] = []
    const issues: AdapterIssue[] = []

    trips.forEach((raw, index) => {
      const t = asRecord(raw)
      if (!t) {
        issues.push({ index, message: 'not an object' })
        return
      }

      const capacity = toNum(t.seats_total ?? t.capacity)
      const remaining = toNum(t.seats_remaining ?? t.seats_available)

      // THE trap this adapter exists to document: Sawa reports seats REMAINING.
      // Copying that into booked_pax inverts the mirror — a nearly-full
      // departure would read as nearly empty and we would keep selling it.
      let booked = toNum(t.seats_booked)
      if (booked === null && capacity !== null && remaining !== null) {
        booked = capacity - remaining
      }
      if (booked !== null && booked < 0) {
        issues.push({
          index,
          external_id: toStr(t.trip_id) ?? undefined,
          message: `seats_remaining (${remaining}) exceeds seats_total (${capacity})`,
        })
        return
      }

      const nights = toNum(t.nights)
      const sawaStatus = toStr(t.state ?? t.status)?.toLowerCase()

      const translated = {
        external_id: toStr(t.trip_id ?? t.id),
        tour_name: toStr(t.product_name ?? t.name),
        tour_code: toStr(codeMap[String(toStr(t.product_code) ?? '')] ?? t.product_code),
        start_date: t.departs_on ?? t.start_date,
        end_date: t.returns_on ?? null,
        // Sawa counts NIGHTS; our duration_days counts days on the ground.
        duration_days: nights !== null ? nights + 1 : null,
        max_pax: capacity,
        booked_pax: booked ?? 0,
        min_pax: toNum(t.min_seats),
        status: sawaStatus ? STATUS_MAP[sawaStatus] : null,
        price_per_person: toNum(t.price_pp ?? t.price),
        currency: toStr(t.currency),
        is_guaranteed: sawaStatus === 'guaranteed' ? true : null,
        cutoff_days: toNum(t.cutoff_days),
        public_notes: toStr(t.notes),
      }

      const result = normalizeDeparture(translated)
      if (typeof result === 'string') {
        issues.push({ index, external_id: translated.external_id ?? undefined, message: result })
        return
      }
      departures.push(result)
    })

    return {
      delivery: {
        event_id: toStr(root.delivery_id ?? root.event_id),
        event_type: toStr(root.event) ?? 'departures.sync',
        departures,
      },
      issues,
    }
  },
}
