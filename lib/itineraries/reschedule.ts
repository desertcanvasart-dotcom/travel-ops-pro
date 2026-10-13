// ============================================
// Moving a trip to other dates (the calendar's drag)
// ============================================
// The calendar used to PUT only the trip's start and end dates. Its days kept
// their old dates (editor, PDFs, supplier manifest), guide and vehicle
// assignments stayed on the old dates, and a booked trip's booking dates,
// balance due date, payment schedule and supplier confirmations did not move
// either. Moving a trip now shifts the trip, every day and every resource
// assignment by the same number of days in one database call
// (shift_itinerary_dates, migration 20261212) — and is refused outright for a
// trip that has a booking or supplier documents: those carry dates that have
// been promised to the client and to suppliers, and re-dating them is a
// conversation, not a drag. Such a trip is moved by changing the booking with
// the people involved, not from the calendar.

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Whole days from `from` to `to` (ISO dates), or null when either is not a date. */
export function daysBetween(from: string, to: string): number | null {
  if (!DATE.test(from) || !DATE.test(to)) return null
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / 86_400_000)
}

export interface RescheduleFacts {
  status: string | null
  startDate: string
  newStartDate: string
  today: string
  booking: { booking_code: string | null; status: string | null } | null
  supplierDocuments: number
}

/** Why the move is refused, or null with the shift in days. */
export function rescheduleCheck(f: RescheduleFacts): { refusal: string; status: number } | { days: number } {
  const days = daysBetween(f.startDate, f.newStartDate)
  if (days === null) return { refusal: 'start_date must be a date (YYYY-MM-DD)', status: 400 }
  if (f.newStartDate < f.today) return { refusal: 'A trip cannot be moved into the past.', status: 400 }
  if (f.status === 'cancelled' || f.status === 'completed') {
    return { refusal: `A ${f.status} trip cannot be moved.`, status: 409 }
  }
  if (f.booking && f.booking.status !== 'cancelled') {
    return {
      refusal: `This trip has a booking (${f.booking.booking_code ?? 'no code'}): its dates, payment schedule and supplier confirmations would not follow a drag. Change the dates with the client and suppliers, then on the booking.`,
      status: 409,
    }
  }
  if (f.supplierDocuments > 0) {
    return {
      refusal: `This trip has ${f.supplierDocuments} supplier document(s) carrying its dates. Cancel or reissue them before moving the trip.`,
      status: 409,
    }
  }
  return { days }
}
