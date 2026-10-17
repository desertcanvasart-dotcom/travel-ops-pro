import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { orgAuth } from '@/lib/auth/org-auth'
import { shiftDateISO, todayFromRequest } from '@/lib/today'
import { getOrgDefaultCurrency } from '@/lib/org-default-currency'
import { normaliseRateCurrency } from '@/lib/org-rate-currency'
import { DEPARTURE_STATUSES, withSeatCounts } from '@/lib/departures/seats'
import { durationError, paxRangeError } from '@/lib/departures/validate'

/** Rows per read. PostgREST caps a response (max_rows, 1000 on Supabase);
 *  the list's per-programme counts and seat totals need every date. */
const PAGE = 1000

// ============================================
// TOUR DEPARTURES API
// File: app/api/departures/route.ts
//
// List and create tour departures
// ============================================

export interface TourDeparture {
  id: string
  org_id: string
  template_id: string | null
  variation_id: string | null
  tour_name: string
  tour_code: string | null
  duration_days: number
  start_date: string
  end_date: string
  max_pax: number
  booked_pax: number
  min_pax: number
  /** Seat counts (lib/departures/seats), added by GET. */
  held_confirmed?: number
  held_pending?: number
  seats_taken?: number
  seats_free?: number
  status: 'draft' | 'open' | 'limited' | 'full' | 'guaranteed' | 'cancelled'
  cutoff_days: number
  is_guaranteed: boolean
  price_per_person: number | null
  currency: string
  public_notes: string | null
  internal_notes: string | null
  created_at: string
  updated_at: string
  // Joined data
  tour_template?: {
    id: string
    template_name: string
    template_code: string
    duration_days: number
  }
}

/**
 * GET /api/departures
 * List tour departures with optional filters
 *
 * Query params:
 * - status: filter by status
 * - template_id: filter by tour template
 * - start_date: filter departures starting on or after this date
 * - end_date: filter departures starting on or before this date
 * - upcoming: if "true", only show future departures
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, org_id } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const templateId = searchParams.get('template_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const upcoming = searchParams.get('upcoming')

    const build = () => {
      let query = supabase
        .from('tour_departures')
        .select(`
          *,
          tour_template:tour_templates(id, template_name, template_code, duration_days)
        `)
        .eq('org_id', org_id)
        .order('start_date', { ascending: true })
        .order('id', { ascending: true })

      // Apply filters
      if (status) {
        query = query.eq('status', status)
      }

      if (templateId) {
        query = query.eq('template_id', templateId)
      }

      if (startDate) {
        query = query.gte('start_date', startDate)
      }

      if (endDate) {
        query = query.lte('start_date', endDate)
      }

      if (upcoming === 'true') {
        // The caller's own calendar date (?today=), else the business timezone's.
        // The UTC date is still yesterday until 09:00 in Tokyo, so departures
        // that had already left stayed on the "Upcoming" list all morning.
        const today = todayFromRequest(request.url)
        query = query.gte('start_date', today)
      }
      return query
    }

    // Every matching date, a page at a time: one read stopped at the
    // server's row cap, and the list's counts and seat totals silently
    // covered only the first 1000 dates.
    const rows: Array<{ id: string; max_pax: number | null; booked_pax: number | null }> = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build().range(from, from + PAGE - 1)
      if (error) {
        console.error('Error fetching departures:', error)
        return NextResponse.json(
          { success: false, error: clientMessage(error, 'Internal server error') },
          { status: 500 }
        )
      }
      rows.push(...((data ?? []) as typeof rows))
      if (!data || data.length < PAGE) break
    }

    // Each date's seats as every screen counts them: booked outside the app
    // + confirmed + pending holds (lib/departures/seats). booked_pax alone
    // left web-order holds out of the list's "booked" figure.
    const data = await withSeatCounts(supabase, org_id, rows)

    return NextResponse.json({
      success: true,
      data,
      // What a new departure is priced in: the company's own currency.
      default_currency: await getOrgDefaultCurrency(supabase, org_id)
    })
  } catch (error: unknown) {
    console.error('Departures GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/departures
 * Create a new tour departure
 *
 * Body:
 * - template_id: UUID (optional, link to tour template)
 * - tour_name: string (required if no template_id)
 * - start_date: YYYY-MM-DD (required)
 * - duration_days: number (required if no template_id)
 * - max_pax: number
 * - min_pax: number
 * - status: string
 * - price_per_person: number
 * - etc.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await orgAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, org_id, user } = authResult
    if (!supabase || !org_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const {
      template_id,
      variation_id,
      tour_name,
      tour_code,
      duration_days,
      start_date,
      max_pax = 20,
      min_pax = 2,
      status = 'open',
      cutoff_days = 3,
      is_guaranteed = false,
      price_per_person,
      currency,
      public_notes,
      internal_notes
    } = body

    // Validate required fields
    if (!start_date) {
      return NextResponse.json(
        { success: false, error: 'start_date is required' },
        { status: 400 }
      )
    }

    // If template_id provided, fetch template details
    let finalTourName = tour_name
    let finalTourCode = tour_code
    let finalDurationDays = duration_days

    if (template_id) {
      const { data: template, error: templateError } = await supabase
        .from('tour_templates')
        .select('template_name, template_code, duration_days')
        .eq('id', template_id)
        // The company's own programme only (tour_templates.org_id, 20261207):
        // another company's template is "not found".
        .eq('org_id', org_id)
        .single()

      if (templateError || !template) {
        return NextResponse.json(
          { success: false, error: 'Tour template not found' },
          { status: 404 }
        )
      }

      finalTourName = finalTourName || template.template_name
      finalTourCode = finalTourCode || template.template_code
      finalDurationDays = finalDurationDays || template.duration_days
    }

    if (variation_id) {
      const { data: variation } = await supabase
        .from('tour_variations')
        .select('id')
        .eq('id', variation_id)
        .eq('org_id', org_id)
        .maybeSingle()
      if (!variation) {
        return NextResponse.json(
          { success: false, error: 'Tour variation not found' },
          { status: 404 }
        )
      }
    }

    if (!finalTourName) {
      return NextResponse.json(
        { success: false, error: 'tour_name is required (or provide template_id)' },
        { status: 400 }
      )
    }

    if (!finalDurationDays) {
      return NextResponse.json(
        { success: false, error: 'duration_days is required (or provide template_id)' },
        { status: 400 }
      )
    }
    const badDuration = durationError(finalDurationDays)
    if (badDuration) {
      return NextResponse.json({ success: false, error: badDuration }, { status: 400 })
    }

    // Seats: whole numbers, and the minimum to run no more than the seats.
    if (!Number.isInteger(Number(max_pax)) || Number(max_pax) < 1) {
      return NextResponse.json({ success: false, error: 'max_pax must be a whole number of at least 1' }, { status: 400 })
    }
    if (min_pax !== null && (!Number.isInteger(Number(min_pax)) || Number(min_pax) < 0)) {
      return NextResponse.json({ success: false, error: 'min_pax must be a whole number' }, { status: 400 })
    }
    const rangeError = paxRangeError(max_pax, min_pax)
    if (rangeError) {
      return NextResponse.json({ success: false, error: rangeError }, { status: 400 })
    }

    // The price is in the company's own currency unless the caller names
    // one (a clone keeps its source's). It defaulted to EUR for everyone, so
    // a JPY company's prices were stored — and read back by the availability
    // check and the WhatsApp assistant — as euros.
    const priceCurrency = currency == null || currency === ''
      ? await getOrgDefaultCurrency(supabase, org_id)
      : normaliseRateCurrency(currency)
    if (!priceCurrency) {
      return NextResponse.json({ success: false, error: `Unsupported currency: ${currency}` }, { status: 400 })
    }

    if (typeof start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return NextResponse.json(
        { success: false, error: 'start_date must be YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Calculate end_date — calendar arithmetic on the date string. Parsing it
    // as a UTC instant and adding days in the host's LOCAL time put the end a
    // day early whenever the tour spanned a DST change east of UTC.
    const end_date = shiftDateISO(start_date, Number(finalDurationDays) - 1)

    // Validate status
    if (!(DEPARTURE_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${DEPARTURE_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Create the departure
    const departureData = {
      org_id,
      template_id: template_id || null,
      variation_id: variation_id || null,
      tour_name: finalTourName,
      tour_code: finalTourCode,
      duration_days: Number(finalDurationDays),
      start_date,
      end_date,
      max_pax: Number(max_pax),
      min_pax: min_pax === null ? null : Number(min_pax),
      booked_pax: 0,
      status,
      cutoff_days,
      is_guaranteed,
      price_per_person: price_per_person || null,
      currency: priceCurrency,
      public_notes: public_notes || null,
      internal_notes: internal_notes || null,
      created_by: user?.id
    }

    const { data, error } = await supabase
      .from('tour_departures')
      .insert(departureData)
      .select(`
        *,
        tour_template:tour_templates(id, template_name, template_code, duration_days)
      `)
      .single()

    if (error) {
      console.error('Error creating departure:', error)

      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A departure for this tour on this date already exists' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Tour departure created successfully'
    })
  } catch (error: unknown) {
    console.error('Departures POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
