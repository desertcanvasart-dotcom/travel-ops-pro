// ============================================
// PARTNER INTEGRATIONS — the canonical contract
// ============================================
// This app syncs departures and availability with external platforms. It is
// sold to different operators, each of whom may use a DIFFERENT platform, so
// nothing here names a partner. The shape below is what we accept and emit; an
// adapter translates one platform's dialect into it.
//
// Adding a partner means writing one adapter file and inserting one row in
// `integrations`. It must never mean a migration or a change to this file.

/** A departure as this system understands it, whoever it came from. */
export interface CanonicalDeparture {
  /** The PARTNER's id for this departure. Stable across their updates — it is
   *  the upsert key, so an unstable id here creates duplicates rather than
   *  updates. */
  external_id: string
  tour_name: string
  tour_code?: string | null
  /** ISO date, YYYY-MM-DD. */
  start_date: string
  /** ISO date. Derived from duration when the partner sends only a start. */
  end_date?: string | null
  duration_days?: number | null
  /** Total seats on this departure. */
  max_pax: number
  /** Seats already sold — by anyone on the pool, not only by us. */
  booked_pax: number
  min_pax?: number | null
  status?: DepartureStatus | null
  price_per_person?: number | null
  currency?: string | null
  is_guaranteed?: boolean | null
  cutoff_days?: number | null
  public_notes?: string | null
}

export const DEPARTURE_STATUSES = [
  'draft',
  'open',
  'limited',
  'full',
  'guaranteed',
  'cancelled',
] as const
export type DepartureStatus = (typeof DEPARTURE_STATUSES)[number]

/** What an inbound delivery carries once normalized. */
export interface NormalizedDelivery {
  /** The partner's id for this DELIVERY (not the departure). Used for
   *  idempotency — a retry carries the same one. Null means we cannot
   *  de-duplicate and must rely on the per-departure upsert alone. */
  event_id: string | null
  event_type: string
  departures: CanonicalDeparture[]
}

/** A single problem with one item, kept rather than thrown. */
export interface AdapterIssue {
  /** Index in the incoming array, so a partner can find the offending item. */
  index: number
  external_id?: string
  message: string
}

export interface AdapterResult {
  delivery: NormalizedDelivery
  /**
   * Items that could not be normalized. Deliberately NOT fatal: one malformed
   * departure in a batch of fifty must not reject the other forty-nine, or a
   * partner's bad row silently blocks a whole day of syncing. They come back in
   * the response so the partner can fix them.
   */
  issues: AdapterIssue[]
}

/**
 * Translates one platform's payload into the canonical shape.
 *
 * Adapters are PURE — no database, no network. That keeps them trivially
 * testable and means a partner's format can be verified against a fixture
 * without touching an environment.
 */
export interface IntegrationAdapter {
  /** Slug stored in integrations.provider. */
  readonly slug: string
  /** Shown in the connection UI. */
  readonly label: string
  /** One line on what this partner is, for the settings page. */
  readonly description: string
  /**
   * Normalize an inbound webhook body.
   * Throws ONLY when the payload is unusable as a whole (not an object, no
   * recognisable departures array). Per-item problems become `issues`.
   */
  normalizeInbound(body: unknown, settings: Record<string, unknown>): AdapterResult
}

/** Availability as served to a partner over the outbound API. */
export interface AvailabilityDay {
  date: string
  status: 'available' | 'limited' | 'busy' | 'blackout'
  /** Group slots left. Null when the operator has not set a limit. */
  available_slots: number | null
  /** Only set for blackout/busy, and only when the operator wrote one.
   *  Internal notes are NEVER included — see the outbound route. */
  reason?: string | null
}

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = 'integration_error'
  ) {
    super(message)
    this.name = 'IntegrationError'
  }
}
