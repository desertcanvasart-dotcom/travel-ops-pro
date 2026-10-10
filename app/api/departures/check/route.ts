import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { businessToday, shiftDateISO } from '@/lib/today'

// ============================================
// DEPARTURE AVAILABILITY CHECK API
// File: app/api/departures/check/route.ts
//
// Check tour departure availability
// Used by WhatsApp AI agent for availability responses
// ============================================

interface DepartureAvailability {
  id: string
  tour_name: string
  tour_code: string | null
  start_date: string
  end_date: string
  duration_days: number
  status: string
  max_pax: number
  booked_pax: number
  available_spots: number
  price_per_person: number | null
  currency: string
  is_bookable: boolean
}

interface CheckResult {
  has_departures: boolean
  departures: DepartureAvailability[]
  message: string
  suggestions?: string[]
}

/**
 * POST /api/departures/check
 * Check departure availability for a tour/date (used by AI agent)
 *
 * Body:
 * - org_id: string (required)
 * - tour_name: string (optional - search by tour name)
 * - template_id: string (optional - search by template)
 * - start_date: YYYY-MM-DD (optional - search for departures around this date)
 * - month: YYYY-MM (optional - search for departures in this month)
 * - num_travelers: number (optional - filter by available spots)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      tour_name,
      template_id,
      start_date,
      month,
      num_travelers = 1
    } = body

    // WHOSE departures are read comes from the SESSION, never the body. It
    // took `org_id` from the request, so any signed-in user of any
    // organisation could list another's departures — dates, seats sold and
    // prices — by naming its id (the same hole capacity/check had).
    const org_id = await getCurrentOrgId()
    if (!org_id) return noOrgResponse()

    // Use admin client since this is called by AI agent
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Build query
    let query = supabase
      .from('tour_departures')
      .select(`
        id, tour_name, tour_code, start_date, end_date, duration_days,
        status, max_pax, booked_pax, price_per_person, currency,
        cutoff_days, is_guaranteed
      `)
      .eq('org_id', org_id)
      .in('status', ['open', 'limited', 'guaranteed']) // Only bookable statuses
      .order('start_date', { ascending: true })

    // Filter by tour name (fuzzy search)
    if (tour_name) {
      query = query.ilike('tour_name', `%${tour_name}%`)
    }

    // Filter by template
    if (template_id) {
      query = query.eq('template_id', template_id)
    }

    // Filter by date/month — calendar arithmetic on YYYY-MM-DD strings, with
    // "today" in the business timezone rather than UTC.
    const today = businessToday()

    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(String(start_date))) {
      // Search for departures within 2 weeks of requested date
      const twoWeeksBefore = shiftDateISO(String(start_date), -14)
      const twoWeeksAfter = shiftDateISO(String(start_date), 14)

      query = query
        .gte('start_date', twoWeeksBefore > today ? twoWeeksBefore : today)
        .lte('start_date', twoWeeksAfter)
    } else if (month && /^\d{4}-\d{2}$/.test(String(month))) {
      // Search for departures in specific month. Built from local-time Date
      // objects and printed in UTC, the month started on the last day of the
      // previous month on any host east of UTC.
      const [year, monthNum] = String(month).split('-').map(Number)
      const monthStart = `${month}-01`
      const monthEnd = new Date(Date.UTC(year, monthNum, 0)).toISOString().slice(0, 10)

      query = query
        .gte('start_date', monthStart > today ? monthStart : today)
        .lte('start_date', monthEnd)
    } else {
      // Default: next 3 months of upcoming departures
      const [y, m, d] = today.split('-').map(Number)
      const threeMonths = new Date(Date.UTC(y, m - 1 + 3, d)).toISOString().slice(0, 10)

      query = query
        .gte('start_date', today)
        .lte('start_date', threeMonths)
        .limit(10)
    }

    const { data: departures, error } = await query

    if (error) {
      console.error('Error checking departures:', error)
      return NextResponse.json(
        { success: false, error: clientMessage(error, 'Internal server error') },
        { status: 500 }
      )
    }

    // Process departures
    const availableDepartures: DepartureAvailability[] = (departures || [])
      .map(dep => {
        const availableSpots = dep.max_pax - dep.booked_pax
        // Bookable until the cutoff day itself (business calendar). `?? 3`,
        // not `|| 3`: a cutoff of 0 means "bookable up to departure day".
        const cutoffDate = shiftDateISO(dep.start_date, -(dep.cutoff_days ?? 3))
        const isBeforeCutoff = today < cutoffDate

        return {
          id: dep.id,
          tour_name: dep.tour_name,
          tour_code: dep.tour_code,
          start_date: dep.start_date,
          end_date: dep.end_date,
          duration_days: dep.duration_days,
          status: dep.status,
          max_pax: dep.max_pax,
          booked_pax: dep.booked_pax,
          available_spots: availableSpots,
          price_per_person: dep.price_per_person,
          currency: dep.currency || 'EUR',
          is_bookable: availableSpots >= num_travelers && isBeforeCutoff
        }
      })
      .filter(dep => dep.available_spots > 0) // Only show departures with spots

    // Filter by num_travelers
    const bookableDepartures = availableDepartures.filter(dep => dep.is_bookable)

    // Build response message
    let result: CheckResult

    if (bookableDepartures.length === 0 && availableDepartures.length === 0) {
      result = {
        has_departures: false,
        departures: [],
        message: tour_name
          ? `We don't have any scheduled departures for "${tour_name}" at the moment. Would you like us to arrange a private tour instead?`
          : `We don't have any group departures scheduled for that period. Would you like us to arrange a private tour for your dates?`,
        suggestions: ['Ask about private tours', 'Check different dates', 'Join our waitlist']
      }
    } else if (bookableDepartures.length === 0) {
      // Have departures but none with enough spots
      result = {
        has_departures: true,
        departures: availableDepartures,
        message: `We have departures scheduled, but they don't have enough spots for ${num_travelers} traveler${num_travelers > 1 ? 's' : ''}. Would you like to join the waitlist or consider a private tour?`,
        suggestions: ['Join waitlist', 'Book private tour']
      }
    } else if (bookableDepartures.length === 1) {
      const dep = bookableDepartures[0]
      const spotText = dep.available_spots === 1 ? '1 spot' : `${dep.available_spots} spots`
      result = {
        has_departures: true,
        departures: bookableDepartures,
        message: `Great news! We have a ${dep.tour_name} departing on ${formatDate(dep.start_date)} with ${spotText} available.${dep.price_per_person ? ` Price: ${dep.currency} ${dep.price_per_person} per person.` : ''} Would you like to book?`
      }
    } else {
      // Multiple departures
      const departuresList = bookableDepartures.slice(0, 3).map(dep => {
        const spotText = dep.available_spots === 1 ? '1 spot' : `${dep.available_spots} spots`
        return `${formatDate(dep.start_date)} (${spotText} left)`
      }).join(', ')

      result = {
        has_departures: true,
        departures: bookableDepartures,
        message: `We have ${bookableDepartures.length} departure${bookableDepartures.length > 1 ? 's' : ''} available: ${departuresList}. Which date works best for you?`
      }
    }

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error: unknown) {
    console.error('Departure check error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to format date nicely
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}
