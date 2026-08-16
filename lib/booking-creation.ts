// ============================================
// BOOKING CREATION — shared by both entry points
// ============================================
// A booking can be created two ways:
//   POST /api/bookings              from an itinerary directly
//   POST /api/bookings/from-quote   from an ACCEPTED quote, with a deposit %
//
// Both produce the same kind of record, so the row-building and the supplier
// manifest live here rather than being written twice and drifting.
//
// MONEY INVARIANT — balance_due is `total_cost - total_paid`, which at creation
// time (nothing paid) means **balance_due === total_cost**. This is not a
// stylistic choice: record_booking_payment() recomputes it as
// `greatest(0, total_cost - total_paid)` on every payment, so any other value
// here is a number the very next payment will contradict. The previous code set
// `total_cost - deposit_amount` at creation, which showed 70% of the trip as
// owed on a booking where nothing had been paid at all, then jumped UP when the
// first payment landed.
//
// The deposit is a SCHEDULE, not a payment: deposit_amount says how much of the
// balance is due first, and deposit_paid stays false until money actually
// arrives.

/** Money to 2dp, half away from zero, no negative zero. */
function roundMoney(value: number): number {
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

export interface DepositBreakdown {
  /** Portion of the total due up front. */
  depositAmount: number
  /** Everything still owed — the full total until a payment is recorded. */
  balanceDue: number
}

/**
 * Split a total into deposit and outstanding balance.
 *
 * Assumes `depositPercent` has already passed validateDepositPercent — callers
 * that take it from a request body MUST validate first, or a negative percent
 * produces a negative deposit and 500 charges five times the trip.
 */
export function computeDeposit(total: number, depositPercent: number): DepositBreakdown {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0
  return {
    depositAmount: roundMoney((safeTotal * depositPercent) / 100),
    // NOT total - deposit. See the header.
    balanceDue: roundMoney(safeTotal),
  }
}

export interface DepositPercentResult {
  ok: boolean
  value: number
  error?: string
}

/** The default when a caller does not specify one. */
export const DEFAULT_DEPOSIT_PERCENT = 30

/**
 * Validate a deposit percentage from an untrusted request body.
 *
 * Rejects non-numbers, NaN/Infinity, and anything outside 0–100. A numeric
 * string is accepted and coerced, because JSON clients routinely send "30".
 */
export function validateDepositPercent(raw: unknown): DepositPercentResult {
  if (raw === undefined || raw === null) {
    return { ok: true, value: DEFAULT_DEPOSIT_PERCENT }
  }

  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, value: 0, error: 'deposit_percent must be a number' }
  }
  if (value < 0 || value > 100) {
    return { ok: false, value: 0, error: 'deposit_percent must be between 0 and 100' }
  }

  return { ok: true, value }
}

/** Days after creation that the deposit is due, when a deadline is set at all. */
export const DEPOSIT_DEADLINE_DAYS = 7

/** `YYYY-MM-DD`, n days from now — the column is a DATE. */
export function depositDeadline(daysFromNow: number = DEPOSIT_DEADLINE_DAYS): string {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]
}

/** Minimal client shape — works with the service-role or an RLS-scoped client. */
type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

/**
 * Copy the itinerary's services onto the booking as a supplier manifest, so
 * operations can confirm each one.
 *
 * Best-effort by design: the booking already exists and is the valuable record.
 * A failure here is logged and reported rather than unwinding the booking, and
 * the manifest can be rebuilt later from /api/bookings/[id]/sync-suppliers.
 */
export async function populateSuppliersFromItinerary(
  supabase: DbClient,
  bookingId: string,
  itineraryId: string
): Promise<{ inserted: number; error?: string }> {
  const { data: days, error: daysError } = await supabase
    .from('itinerary_days')
    .select('id, date, day_number')
    .eq('itinerary_id', itineraryId)
    .order('day_number', { ascending: true })

  if (daysError) return { inserted: 0, error: daysError.message }
  if (!days || days.length === 0) return { inserted: 0 }

  const { data: services, error: svcError } = await supabase
    .from('itinerary_services')
    .select('*, itinerary_day_id')
    .in('itinerary_day_id', days.map((d: { id: string }) => d.id))

  if (svcError) return { inserted: 0, error: svcError.message }
  if (!services || services.length === 0) return { inserted: 0 }

  const dayById = new Map<string, { id: string; date: string | null }>(
    days.map((d: { id: string; date: string | null }) => [d.id, d])
  )

  const rows = services.map((service: Record<string, unknown>) => ({
    booking_id: bookingId,
    supplier_type: service.service_type || 'other',
    supplier_name: service.service_name || service.supplier_name || 'Unknown',
    service_description: service.notes,
    service_date: dayById.get(service.itinerary_day_id as string)?.date,
    quoted_cost: service.total_cost,
    status: 'pending',
  }))

  const { error: insertError } = await supabase.from('booking_supplier_status').insert(rows)
  if (insertError) return { inserted: 0, error: insertError.message }

  return { inserted: rows.length }
}

/** The itinerary columns a booking is built from. */
export interface BookingSourceItinerary {
  id: string
  client_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  trip_name?: string | null
  start_date?: string | null
  end_date?: string | null
  num_adults?: number | null
  num_children?: number | null
  total_cost?: number | null
  currency?: string | null
  tier?: string | null
  assigned_guide_id?: string | null
  assigned_vehicle_id?: string | null
  partner_id?: string | null
}

export interface BuildBookingRowInput {
  orgId: string
  bookingCode: string
  itinerary: BookingSourceItinerary
  /** Already validated. */
  depositPercent: number
  /**
   * Booking total. Pass the QUOTE's selling price when converting a quote — the
   * quote is the agreed number and may differ from the itinerary's current
   * total. Defaults to the itinerary total.
   */
  total?: number | null
  /**
   * Currency of `total`. MUST be passed whenever `total` is — an amount and its
   * currency are one fact, and taking them from different rows silently
   * relabels the money: a ¥1,854,367 quote booked against a EUR itinerary
   * becomes €1,854,367. Defaults to the itinerary's currency, which is correct
   * only when the total also came from the itinerary.
   */
  currency?: string | null
  partnerName?: string | null
  /** Set only when converting; omitted for a plain itinerary booking. */
  quote?: { id: string; type: 'b2b' | 'b2c' } | null
  /** Set a deposit deadline. Off by default to preserve existing behaviour. */
  withDeadline?: boolean
}

/**
 * Build the bookings insert row. Pure — no I/O, so the money arithmetic and the
 * field mapping are testable without a database.
 */
export function buildBookingRow(input: BuildBookingRowInput): Record<string, unknown> {
  const { orgId, bookingCode, itinerary, depositPercent, quote } = input
  const total = Number(input.total ?? itinerary.total_cost ?? 0)
  const { depositAmount, balanceDue } = computeDeposit(total, depositPercent)

  return {
    org_id: orgId,
    booking_code: bookingCode,
    itinerary_id: itinerary.id,

    client_name: itinerary.client_name,
    client_email: itinerary.client_email,
    client_phone: itinerary.client_phone,

    trip_name: itinerary.trip_name,
    start_date: itinerary.start_date,
    end_date: itinerary.end_date,
    num_adults: itinerary.num_adults || 1,
    num_children: itinerary.num_children || 0,
    total_cost: roundMoney(total),
    // Paired with `total` above, never sourced independently — see the comment
    // on BuildBookingRowInput.currency.
    currency: input.currency || itinerary.currency || 'EUR',
    tier: itinerary.tier,

    status: 'pending',
    payment_status: 'pending',
    deposit_amount: depositAmount,
    deposit_percent: depositPercent,
    deposit_paid: false,
    balance_due: balanceDue,
    ...(input.withDeadline ? { payment_deadline: depositDeadline() } : {}),

    assigned_guide_id: itinerary.assigned_guide_id,
    assigned_vehicle_id: itinerary.assigned_vehicle_id,

    partner_id: itinerary.partner_id || null,
    partner_name: input.partnerName || null,

    ...(quote ? { quote_id: quote.id, quote_type: quote.type } : {}),
  }
}
