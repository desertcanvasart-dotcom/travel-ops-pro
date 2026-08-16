// ============================================
// API: POST /api/bookings/from-quote — convert an accepted quote to a booking
// ============================================
// One call turns an accepted quote into a booking with a deposit computed from a
// caller-supplied percentage (default 30%), instead of the operator re-entering
// the trip and re-deriving the numbers.
//
// Money comes from the QUOTE (its selling price is the agreed figure), trip and
// client details come from the linked ITINERARY (the operational record). The
// itinerary's total_cost can drift after a quote is agreed; the quote is what
// the client accepted, so it wins.
//
// Guards, in order:
//   1. deposit_percent validated before it touches arithmetic
//   2. quote_type restricted to b2b|b2c
//   3. quote must exist and be bookable (accepted; B2B also allows converted)
//   4. quote must have a linked itinerary, in THIS org
//   5. itinerary must have real dates (a booking without them is unusable)
//   6. the quote must not already be booked — and the DB unique index, not this
//      check, is what actually prevents two deposits for one quote
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import {
  buildBookingRow,
  populateSuppliersFromItinerary,
  validateDepositPercent,
} from '@/lib/booking-creation'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** b2c_quotes and tour_quotes overlap on very little beyond selling_price. */
const QUOTE_TABLES = { b2c: 'b2c_quotes', b2b: 'tour_quotes' } as const
type QuoteType = keyof typeof QUOTE_TABLES

/**
 * Statuses a booking may be created from.
 *
 * B2B also allows 'converted', because this app's B2B flow is
 * accepted → convert-to-itinerary → status becomes 'converted'. An operator who
 * has already built the itinerary is MORE ready to book, not less, so refusing
 * 'converted' would block the most natural path to a booking. ('converted'
 * implies it was accepted first — /api/b2b/quotes/[id]/convert is the only thing
 * that sets it.) b2c_quotes has no such status: its CHECK allows only
 * draft/sent/accepted/rejected/expired.
 */
const BOOKABLE_STATUSES: Record<QuoteType, string[]> = {
  b2b: ['accepted', 'converted'],
  b2c: ['accepted'],
}

interface ResolvedQuote {
  id: string
  status: string | null
  itinerary_id: string | null
  /** B2B only — the itinerary produced by convert-to-itinerary. */
  converted_to_itinerary_id?: string | null
  selling_price: number | null
  currency: string | null
  quote_number: string | null
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'No organization membership for current user' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { quote_id, quote_type } = body ?? {}

    if (!quote_id || !quote_type) {
      return NextResponse.json(
        { success: false, error: 'quote_id and quote_type are required' },
        { status: 400 }
      )
    }
    if (!Object.prototype.hasOwnProperty.call(QUOTE_TABLES, quote_type)) {
      return NextResponse.json(
        { success: false, error: 'quote_type must be b2b or b2c' },
        { status: 400 }
      )
    }
    const quoteType = quote_type as QuoteType

    // Validated BEFORE any arithmetic: unchecked, -50 yields a negative deposit
    // and 500 bills five times the trip.
    const depositCheck = validateDepositPercent(body?.deposit_percent)
    if (!depositCheck.ok) {
      return NextResponse.json({ success: false, error: depositCheck.error }, { status: 400 })
    }
    const depositPercent = depositCheck.value

    // ---------- Load the quote ----------
    // b2c_quotes carries org_id; tour_quotes does NOT (it predates org scoping),
    // so for B2B the org check is enforced on the linked itinerary below. That is
    // why the itinerary fetch is org-scoped for both paths and is not optional.
    const table = QUOTE_TABLES[quoteType]
    // Column lists are literals per branch — never interpolated into .select(),
    // which is what broke the build in PR #38.
    let quoteQuery =
      quoteType === 'b2b'
        ? supabaseAdmin
            .from(table)
            .select(
              'id, status, itinerary_id, converted_to_itinerary_id, selling_price, currency, quote_number'
            )
            .eq('id', quote_id)
        : supabaseAdmin
            .from(table)
            .select('id, status, itinerary_id, selling_price, currency, quote_number')
            .eq('id', quote_id)
    if (quoteType === 'b2c') {
      quoteQuery = quoteQuery.eq('org_id', orgId)
    }

    const { data: quote, error: quoteError } = (await quoteQuery.maybeSingle()) as {
      data: ResolvedQuote | null
      error: { message: string } | null
    }

    if (quoteError) {
      return NextResponse.json(
        { success: false, error: clientMessage(quoteError, 'Failed to load quote') },
        { status: 500 }
      )
    }
    if (!quote) {
      return NextResponse.json({ success: false, error: 'Quote not found' }, { status: 404 })
    }

    if (!BOOKABLE_STATUSES[quoteType].includes(quote.status ?? '')) {
      return NextResponse.json(
        {
          success: false,
          error: `Only an accepted quote can be converted to a booking — this one is "${quote.status ?? 'unknown'}".`,
        },
        { status: 422 }
      )
    }

    // The itinerary produced by convert-to-itinerary wins when it exists: that is
    // the trip operations will actually run. `itinerary_id` is the itinerary the
    // quote was BUILT from, which for a converted quote is the older record.
    const itineraryId = quote.converted_to_itinerary_id || quote.itinerary_id
    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'This quote has no linked itinerary, so there is no trip to book.' },
        { status: 422 }
      )
    }

    // The agreed number. A booking whose total is missing or broken would put a
    // wrong deposit in front of a client, so it runs the same gate as the send paths.
    const priceCheck = checkAmountDeliverable(quote.selling_price, { currency: quote.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'Quote price is not usable for a booking',
          violations: priceCheck.violations,
        },
        { status: 422 }
      )
    }

    // ---------- Load the itinerary (also the org gate for B2B) ----------
    const { data: itinerary, error: itineraryError } = await supabaseAdmin
      .from('itineraries')
      .select('*, b2b_partners(id, company_name, partner_code)')
      .eq('id', itineraryId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (itineraryError) {
      return NextResponse.json(
        { success: false, error: clientMessage(itineraryError, 'Failed to load itinerary') },
        { status: 500 }
      )
    }
    if (!itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    if (!itinerary.start_date || !itinerary.end_date) {
      return NextResponse.json(
        { success: false, error: 'The itinerary has no start or end date, so it cannot be booked.' },
        { status: 422 }
      )
    }

    // ---------- Already booked? ----------
    // Fast path for a friendly 409. The unique index is the real guarantee.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_code')
      .eq('quote_id', quote_id)
      .eq('quote_type', quoteType)
      .eq('org_id', orgId)
      .maybeSingle()

    // A failed lookup must not read as "not booked yet" — that is how a second
    // booking (and a second deposit) gets created.
    if (existingError) {
      return NextResponse.json(
        { success: false, error: 'Could not verify whether this quote is already booked' },
        { status: 500 }
      )
    }
    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'This quote has already been converted to a booking.',
          booking_id: existing.id,
          booking_code: existing.booking_code,
        },
        { status: 409 }
      )
    }

    // This app also treats a booking as one-per-itinerary (see POST /api/bookings).
    const { data: itineraryBooking } = await supabaseAdmin
      .from('bookings')
      .select('id, booking_code')
      .eq('itinerary_id', itineraryId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (itineraryBooking) {
      return NextResponse.json(
        {
          success: false,
          error: 'This itinerary is already booked.',
          booking_id: itineraryBooking.id,
          booking_code: itineraryBooking.booking_code,
        },
        { status: 409 }
      )
    }

    // ---------- Create ----------
    const { data: codeData } = await supabaseAdmin.rpc('generate_booking_code')
    const bookingCode =
      codeData || `BKG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`

    const partnerInfo = itinerary.b2b_partners as { company_name?: string } | null
    const row = buildBookingRow({
      orgId,
      bookingCode,
      itinerary,
      depositPercent,
      total: quote.selling_price,
      // The agreed price and the currency it was agreed in travel together.
      currency: quote.currency,
      partnerName: partnerInfo?.company_name ?? null,
      quote: { id: quote_id, type: quoteType },
      // A deposit without a date to pay it by is not a deposit.
      withDeadline: true,
    })

    const { data: booking, error: createError } = await supabaseAdmin
      .from('bookings')
      .insert(row)
      .select()
      .single()

    if (createError) {
      // 23505 on uq_bookings_one_per_quote: converted concurrently between our
      // check and our insert. Return THEIR booking — the caller wanted this
      // quote booked, and it is.
      if (createError.code === '23505') {
        const { data: raced } = await supabaseAdmin
          .from('bookings')
          .select('id, booking_code')
          .eq('quote_id', quote_id)
          .eq('quote_type', quoteType)
          .maybeSingle()

        if (raced) {
          return NextResponse.json(
            {
              success: false,
              error: 'This quote has already been converted to a booking.',
              booking_id: raced.id,
              booking_code: raced.booking_code,
            },
            { status: 409 }
          )
        }
      }

      console.error('Error creating booking from quote:', createError)
      return NextResponse.json(
        { success: false, error: clientMessage(createError, 'Failed to create booking') },
        { status: 500 }
      )
    }

    // ---------- Follow-ups (best-effort, never unwind the booking) ----------
    const suppliers = await populateSuppliersFromItinerary(
      supabaseAdmin,
      booking.id,
      itineraryId
    )
    if (suppliers.error) {
      console.error('Booking created but supplier manifest failed:', suppliers.error)
    }

    // The trip is now committed operationally.
    const { error: statusError } = await supabaseAdmin
      .from('itineraries')
      .update({ status: 'confirmed' })
      .eq('id', itineraryId)
      .eq('org_id', orgId)

    if (statusError) {
      console.error('Booking created but itinerary status not updated:', statusError)
    }

    return NextResponse.json(
      {
        success: true,
        data: booking,
        quote: { id: quote.id, number: quote.quote_number, type: quoteType },
        suppliers_added: suppliers.inserted,
        // Surfaced rather than hidden: the booking is real either way, but the
        // caller should know if a follow-up did not complete.
        warnings: [
          suppliers.error ? 'Supplier manifest could not be created — use Sync suppliers.' : null,
          statusError ? 'Itinerary status could not be set to confirmed.' : null,
        ].filter(Boolean),
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error('Bookings from-quote POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
