// ============================================
// A booking's code — per company, never drawn twice
// ============================================
// generate_booking_code(p_org_id) (migration 20261212) numbers each company's
// bookings on its own counter, under a row lock, so two bookings created at
// the same moment cannot draw the same code and neither company's codes count
// the other's bookings. The three places a booking is born (POST
// /api/bookings, the auto-create on Confirm, /api/bookings/from-quote) insert
// through here: if the insert still meets a taken code (a code typed by hand,
// or the database function missing on a deployment that has not run the
// migration), a fresh code is drawn and the insert retried — it used to be
// a 500, or on Confirm no booking at all, with only a log line to say so.

type DbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => any
}

export interface DbError { code?: string; message?: string; details?: string }

const ATTEMPTS = 5

/** A unique-key clash on the booking code (and not on, say, one booking per quote). */
export function isBookingCodeClash(error: DbError | null | undefined): boolean {
  if (!error || error.code !== '23505') return false
  return /booking_code/.test(`${error.message ?? ''} ${error.details ?? ''}`)
}

/** Only when the database cannot number: random, and retried on a clash. */
export function fallbackBookingCode(year: number, random = Math.random()): string {
  return `BKG-${year}-${String(Math.floor(random * 9000) + 1000)}`
}

export async function nextBookingCode(supabase: DbClient, orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_booking_code', { p_org_id: orgId })
  if (!error && typeof data === 'string' && data) return data
  if (error) console.warn('[booking-code] generate_booking_code failed, using a random code:', error.message)
  return fallbackBookingCode(new Date().getFullYear())
}

/**
 * Insert the row `build(code)` returns, drawing a new code while the code is
 * taken. Any other error is returned as it came, for the caller to handle
 * (from-quote turns a one-booking-per-quote clash into "already converted").
 */
export async function insertBookingWithCode<Row>(
  supabase: DbClient,
  orgId: string,
  build: (bookingCode: string) => Record<string, unknown>
): Promise<{ data: Row | null; error: DbError | null; bookingCode: string }> {
  let last: { data: Row | null; error: DbError | null; bookingCode: string } = { data: null, error: null, bookingCode: '' }
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const bookingCode = await nextBookingCode(supabase, orgId)
    const { data, error } = await supabase.from('bookings').insert(build(bookingCode)).select().single()
    last = { data: (data as Row) ?? null, error: error ?? null, bookingCode }
    if (!error) return last
    if (!isBookingCodeClash(error)) return last
  }
  return last
}
