// ============================================
// Where a trip stands, what to do next, and what needs attention
// ============================================
// The itinerary page had ten header buttons in seven colours and nothing
// said which one was the next thing to do. This works it out from what the
// page already knows — the itinerary's status, its booking, its invoice and
// the money the Profit & Loss report reads (lib/trip-pnl.ts) — so the page
// can show one main button and a short list of what is wrong.
//
// Derived, never stored. Pure: the page and the tests share it.
//
// Ported from autoura-saas, where the itinerary page was redesigned first.
// Labels are this app's to translate (messages: itineraries.detail.stage),
// so steps and actions carry keys, not English.

export type StepKey = 'quoted' | 'confirmed' | 'booked' | 'invoiced' | 'paid' | 'operated' | 'closed'

export interface TripFacts {
  /** itineraries.status: draft | sent | confirmed | completed | cancelled */
  status: string | null | undefined
  hasBooking: boolean
  hasInvoice: boolean
  /** From the P&L: what was invoiced and what was paid, in the trip's currency. */
  invoiced: number | null
  paid: number | null
  startDate: string | null | undefined
  endDate: string | null | undefined
  /** YYYY-MM-DD, the agency's today. */
  today: string
}

export interface Step {
  key: StepKey
  done: boolean
  /** The first step not done: where the trip is now. */
  current: boolean
}

const day = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null)

export function isPaidInFull(f: Pick<TripFacts, 'invoiced' | 'paid'>): boolean {
  return f.invoiced != null && f.paid != null && f.invoiced > 0 && f.paid >= f.invoiced - 0.005
}

export function tripSteps(f: TripFacts): Step[] {
  const status = String(f.status ?? '').toLowerCase()
  const end = day(f.endDate)
  const done: Record<StepKey, boolean> = {
    quoted: status !== 'draft' && status !== '',
    confirmed: status === 'confirmed' || status === 'completed' || f.hasBooking,
    booked: f.hasBooking,
    invoiced: f.hasInvoice,
    paid: isPaidInFull(f),
    // The trip ran: its last day is behind us (a closed trip ran too).
    operated: status === 'completed' || (!!end && end < f.today),
    // Closed out: the office marked it completed ("Close out trip").
    closed: status === 'completed',
  }
  // A later step done means the earlier ones were passed, whatever was recorded.
  const order: StepKey[] = ['quoted', 'confirmed', 'booked', 'invoiced', 'paid', 'operated', 'closed']
  for (let i = order.length - 1; i > 0; i--) {
    // Being paid, having run or being closed says nothing about invoicing or
    // payment (a trip can run, and be closed, still owing money).
    if (done[order[i]] && order[i] !== 'operated' && order[i] !== 'paid' && order[i] !== 'closed') {
      // Booked is read off the booking itself: a trip invoiced before it was
      // booked (ITN-26-009) shows the gap.
      for (let j = 0; j < i; j++) if (order[j] !== 'booked') done[order[j]] = true
    }
  }
  const firstOpen = order.find(k => !done[k])
  return order.map(k => ({ key: k, done: done[k], current: k === firstOpen }))
}

export type PrimaryKind =
  | 'send_quote'
  /** Confirm the trip, which makes its booking (status → confirmed). */
  | 'convert'
  /** Already confirmed, no booking yet: make it. */
  | 'create_booking'
  | 'create_invoice'
  | 'record_payment'
  | 'assign_resources'
  | 'open_trip_log'
  | 'close_out'

export interface PrimaryAction {
  kind: PrimaryKind
}

/** The one thing to do next, or null when nothing is (cancelled, closed). */
export function nextAction(f: TripFacts): PrimaryAction | null {
  const status = String(f.status ?? '').toLowerCase()
  if (status === 'cancelled' || status === 'completed') return null
  const start = day(f.startDate)
  const end = day(f.endDate)
  const ended = !!end && end < f.today

  if (ended) return { kind: 'close_out' }
  if (status === 'draft' || status === '') return { kind: 'send_quote' }
  if (!f.hasBooking) return { kind: status === 'confirmed' ? 'create_booking' : 'convert' }
  if (!f.hasInvoice) return { kind: 'create_invoice' }
  if (!isPaidInFull(f)) return { kind: 'record_payment' }
  if (start && f.today >= start) return { kind: 'open_trip_log' }
  return { kind: 'assign_resources' }
}

// ── Which section to open ─────────────────────────────────────────────────

export type TabKey = 'itinerary' | 'operations' | 'finance' | 'messages'

/** Before the trip, its days; while it runs, its operations; after, its money. */
export function defaultTab(f: Pick<TripFacts, 'startDate' | 'endDate' | 'today' | 'status'>): TabKey {
  const start = day(f.startDate)
  const end = day(f.endDate)
  if (String(f.status ?? '').toLowerCase() === 'cancelled') return 'itinerary'
  if (end && end < f.today) return 'finance'
  if (start && f.today >= start) return 'operations'
  return 'itinerary'
}
