// ============================================
// GENERIC ADAPTER — our own documented payload
// ============================================
// This is the contract we hand a partner who has no adapter of their own:
// "POST us this shape and it works." Every other adapter exists only because a
// platform would not or could not send this.
//
// Expected body:
//
//   {
//     "event_id": "evt_123",            // optional but strongly recommended
//     "event_type": "departures.sync",  // optional
//     "departures": [
//       {
//         "external_id": "DEP-9001",    // required, stable
//         "tour_name": "Nile Cruise 8D",
//         "tour_code": "NILE8",         // optional
//         "start_date": "2026-11-02",
//         "end_date": "2026-11-09",     // or duration_days
//         "duration_days": 8,           // optional
//         "max_pax": 24,
//         "booked_pax": 11,
//         "min_pax": 4,                 // optional
//         "status": "open",             // optional; derived if absent
//         "price_per_person": 1450.00,  // optional
//         "currency": "EUR",            // optional
//         "is_guaranteed": true,        // optional
//         "cutoff_days": 3,             // optional
//         "public_notes": "..."         // optional
//       }
//     ]
//   }

import {
  DEPARTURE_STATUSES,
  IntegrationError,
  type AdapterIssue,
  type AdapterResult,
  type CanonicalDeparture,
  type DepartureStatus,
  type IntegrationAdapter,
} from '../types'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function toStr(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

export function toNum(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 1 || value === '1') return true
  if (value === 'false' || value === 0 || value === '0') return false
  return null
}

/** Accepts YYYY-MM-DD, or anything Date can parse, and normalizes to a date. */
export function toDate(value: unknown): string | null {
  const raw = toStr(value)
  if (!raw) return null
  if (ISO_DATE.test(raw)) return raw
  // A full timestamp is taken at face value in UTC. We do NOT shift it into a
  // local timezone: a departure on the 2nd must not become the 1st because the
  // server happens to sit west of the partner.
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Derive a status when the partner does not send one.
 *
 * Never invents 'cancelled' or 'guaranteed' — those are commitments only the
 * partner can make. This only reports how full the departure is.
 */
export function deriveStatus(maxPax: number, bookedPax: number): DepartureStatus {
  if (maxPax > 0 && bookedPax >= maxPax) return 'full'
  const remaining = maxPax - bookedPax
  if (maxPax > 0 && remaining <= Math.max(2, Math.ceil(maxPax * 0.2))) return 'limited'
  return 'open'
}

/**
 * Normalize one departure. Returns a string on failure rather than throwing,
 * so a bad item is reported without rejecting the batch.
 */
export function normalizeDeparture(raw: unknown): CanonicalDeparture | string {
  const r = asRecord(raw)
  if (!r) return 'not an object'

  const externalId = toStr(r.external_id ?? r.id ?? r.departure_id)
  if (!externalId) return 'missing external_id (the stable id we upsert on)'

  const tourName = toStr(r.tour_name ?? r.name ?? r.title)
  if (!tourName) return 'missing tour_name'

  const startDate = toDate(r.start_date ?? r.departure_date ?? r.date)
  if (!startDate) return 'missing or unparseable start_date'

  const maxPax = toNum(r.max_pax ?? r.capacity ?? r.seats_total)
  if (maxPax === null || maxPax < 0) return 'missing or negative max_pax'

  // Absent booked_pax means "none sold", which is a real and common state.
  const bookedPax = toNum(r.booked_pax ?? r.seats_taken ?? r.sold) ?? 0
  if (bookedPax < 0) return 'booked_pax cannot be negative'

  const durationDays = toNum(r.duration_days ?? r.nights_plus_one)
  let endDate = toDate(r.end_date)
  if (!endDate && durationDays && durationDays > 0) {
    // duration 1 means a same-day departure, so the offset is duration − 1.
    endDate = addDays(startDate, Math.round(durationDays) - 1)
  }
  if (!endDate) endDate = startDate

  if (endDate < startDate) return 'end_date is before start_date'

  const rawStatus = toStr(r.status)?.toLowerCase()
  const status: DepartureStatus | null =
    rawStatus && (DEPARTURE_STATUSES as readonly string[]).includes(rawStatus)
      ? (rawStatus as DepartureStatus)
      : null

  const currency = toStr(r.currency)?.toUpperCase() ?? null
  if (currency && !/^[A-Z]{3}$/.test(currency)) return `currency "${currency}" is not a 3-letter code`

  return {
    external_id: externalId,
    tour_name: tourName,
    tour_code: toStr(r.tour_code ?? r.code),
    start_date: startDate,
    end_date: endDate,
    duration_days: durationDays !== null ? Math.max(1, Math.round(durationDays)) : null,
    max_pax: Math.round(maxPax),
    booked_pax: Math.round(bookedPax),
    min_pax: toNum(r.min_pax),
    status: status ?? deriveStatus(maxPax, bookedPax),
    price_per_person: toNum(r.price_per_person ?? r.price),
    currency,
    is_guaranteed: toBool(r.is_guaranteed),
    cutoff_days: toNum(r.cutoff_days),
    public_notes: toStr(r.public_notes ?? r.notes),
  }
}

/** Pull the departures array out of whatever envelope the body uses. */
export function extractList(body: Record<string, unknown>): unknown[] | null {
  for (const key of ['departures', 'data', 'items', 'results']) {
    const value = body[key]
    if (Array.isArray(value)) return value
  }
  return null
}

export const genericAdapter: IntegrationAdapter = {
  slug: 'generic',
  label: 'Generic (canonical payload)',
  description:
    'Any platform that can POST our documented departures payload. Start here — a partner only needs a dedicated adapter if they cannot send this shape.',

  normalizeInbound(body: unknown): AdapterResult {
    // A bare array is accepted too — several platforms POST one. This is
    // checked BEFORE the object check, because asRecord() rejects arrays and
    // would otherwise make the bare-array path unreachable.
    const root = Array.isArray(body) ? {} : asRecord(body)
    if (!root) {
      throw new IntegrationError('Request body must be a JSON object', 400, 'invalid_body')
    }

    const list = Array.isArray(body) ? (body as unknown[]) : extractList(root)
    if (!list) {
      throw new IntegrationError(
        'No departures array found. Send { "departures": [...] }.',
        400,
        'invalid_body'
      )
    }

    const departures: CanonicalDeparture[] = []
    const issues: AdapterIssue[] = []

    list.forEach((item, index) => {
      const result = normalizeDeparture(item)
      if (typeof result === 'string') {
        issues.push({
          index,
          external_id: toStr(asRecord(item)?.external_id) ?? undefined,
          message: result,
        })
        return
      }
      departures.push(result)
    })

    return {
      delivery: {
        event_id: toStr(root.event_id ?? root.id),
        event_type: toStr(root.event_type) ?? 'departures.sync',
        departures,
      },
      issues,
    }
  },
}
