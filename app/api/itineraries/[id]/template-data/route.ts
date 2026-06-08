import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/itineraries/[id]/template-data
// Returns itinerary data formatted for template placeholder replacement
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itineraryId } = await params

    // Fetch full itinerary data
    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .select(`
        id,
        itinerary_code,
        client_id,
        client_name,
        client_email,
        client_phone,
        trip_name,
        start_date,
        end_date,
        total_days,
        num_adults,
        num_children,
        total_cost,
        deposit_amount,
        balance_due,
        total_paid,
        currency,
        payment_status,
        status,
        pickup_time,
        pickup_location,
        notes,
        guide_notes,
        vehicle_notes,
        tier
      `)
      .eq('id', itineraryId)
      .single()

    if (itineraryError || !itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    }

    // Fetch days for this itinerary
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('id, day_number, date, city, title, description, overnight_city')
      .eq('itinerary_id', itineraryId)
      .order('day_number', { ascending: true })

    const itineraryDays = days || []

    // Build the placeholder data
    const placeholderData = buildItineraryPlaceholderData(itinerary, itineraryDays)

    return NextResponse.json({
      success: true,
      itinerary,
      days: itineraryDays,
      placeholderData,
    })

  } catch (error: any) {
    console.error('Error fetching itinerary template data:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load template data') }, { status: 500 })
  }
}

// Helper function to build placeholder data from itinerary
function buildItineraryPlaceholderData(
  itinerary: any,
  days: any[]
): Record<string, string> {
  const data: Record<string, string> = {}
  const currency = itinerary?.currency || 'USD'

  // Client/Guest data
  data.GuestName = itinerary.client_name || ''
  data.ClientName = itinerary.client_name || ''
  data.ClientEmail = itinerary.client_email || ''
  data.ClientPhone = itinerary.client_phone || ''

  // First name extraction
  if (itinerary.client_name) {
    data.GuestFirstName = itinerary.client_name.split(' ')[0]
    data.ClientFirstName = itinerary.client_name.split(' ')[0]
  }

  // Trip identification
  data.TripName = itinerary.trip_name || ''
  data.TourFocus = itinerary.trip_name || ''
  data.ItineraryCode = itinerary.itinerary_code || ''
  data.ProviderRef = itinerary.itinerary_code || ''
  data.BookingRef = itinerary.itinerary_code || ''

  // Date formatting
  if (itinerary.start_date) {
    data.Date = formatDate(itinerary.start_date)
    data.StartDate = formatDate(itinerary.start_date)
  }
  if (itinerary.end_date) {
    data.EndDate = formatDate(itinerary.end_date)
  }
  if (itinerary.start_date && itinerary.end_date) {
    data.TripDates = formatDateRange(itinerary.start_date, itinerary.end_date)
  }
  if (itinerary.total_days) {
    data.TotalDays = `${itinerary.total_days} days`
    data.Duration = `${itinerary.total_days} days`
  }

  // Location data from first day
  if (days.length > 0) {
    data.City = days[0].city || ''
    data.FirstCity = days[0].city || ''
    if (days[days.length - 1]) {
      data.LastCity = days[days.length - 1].city || ''
    }
  }

  // Pickup information
  data.PickupTime = itinerary.pickup_time || ''
  data.PickupLocation = itinerary.pickup_location || ''

  // Notes and special requests
  data.Notes = itinerary.notes || ''
  data.SpecialRequests = itinerary.notes || ''
  data.GuideNotes = itinerary.guide_notes || ''
  data.VehicleNotes = itinerary.vehicle_notes || ''

  // PAX information
  data.NumAdults = String(itinerary.num_adults || 0)
  data.NumChildren = String(itinerary.num_children || 0)
  data.TotalPax = String((itinerary.num_adults || 0) + (itinerary.num_children || 0))
  data.Pax = String((itinerary.num_adults || 0) + (itinerary.num_children || 0))

  // Financial data
  if (itinerary.total_cost !== undefined && itinerary.total_cost !== null) {
    data.Total = formatCurrency(itinerary.total_cost, currency)
    data.TotalCost = formatCurrency(itinerary.total_cost, currency)
  }
  if (itinerary.deposit_amount !== undefined && itinerary.deposit_amount !== null) {
    data.Deposit = formatCurrency(itinerary.deposit_amount, currency)
  }
  if (itinerary.balance_due !== undefined && itinerary.balance_due !== null) {
    data.Balance = formatCurrency(itinerary.balance_due, currency)
    data.BalanceDue = formatCurrency(itinerary.balance_due, currency)
  }
  data.Currency = currency

  // Status
  data.Status = itinerary.status || ''
  if (itinerary.payment_status) {
    data.PaymentStatus = formatPaymentStatus(itinerary.payment_status)
  }

  // Tier/Service level
  if (itinerary.tier) {
    data.Tier = itinerary.tier.charAt(0).toUpperCase() + itinerary.tier.slice(1)
    data.ServiceLevel = itinerary.tier.charAt(0).toUpperCase() + itinerary.tier.slice(1)
  }

  // Language preference (default English)
  data.Language = 'English'

  // Dynamic dates
  data.Today = formatDate(new Date())

  // Company defaults
  data.AgentName = 'Islam'
  data.CompanyName = 'Travel2Egypt'

  return data
}

function formatCurrency(amount: number | string | undefined, currency: string = 'USD'): string {
  if (amount === undefined || amount === null) return ''
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return ''

  const symbols: Record<string, string> = {
    EUR: '€',
    USD: '$',
    GBP: '£',
    EGP: 'EGP ',
  }

  const symbol = symbols[currency] || `${currency} `
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

function formatDate(date: string | Date | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const startMonth = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return `${startMonth} - ${endFormatted}`
}

function formatPaymentStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'not_paid': 'Not Paid',
    'deposit_paid': 'Deposit Paid',
    'partial_paid': 'Partially Paid',
    'fully_paid': 'Fully Paid',
    'overdue': 'Overdue',
  }
  return statusMap[status] || status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}
