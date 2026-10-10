import { NextRequest, NextResponse } from 'next/server'
import { templateSender, type TemplateSender } from '@/lib/template-sender'
import { formatMoney } from '@/lib/currency-totals'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse } from '@/lib/auth/current-org'
import { clientMessage } from '@/lib/api-errors'
import { businessToday } from '@/lib/today'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/clients/[id]/template-data
// Returns client info + their latest itinerary for template placeholder replacement
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id: clientId } = await params
    const { searchParams } = new URL(request.url)
    const itineraryId = searchParams.get('itineraryId') // Optional: specific itinerary

    // Fetch client data - using first_name, last_name instead of name
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, first_name, last_name, email, phone, preferred_language')
      .eq('id', clientId)
      // Service-role client: the organisation's own client only.
      .eq('org_id', orgId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Transform client to have combined name
    const clientWithName = {
      id: client.id,
      name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
      email: client.email,
      phone: client.phone,
      preferred_language: client.preferred_language ?? null,
    }

    // Fetch itinerary - either specific one or latest for this client
    let itineraryQuery = supabase
      .from('itineraries')
      .select(`
        id,
        itinerary_code,
        client_id,
        client_name,
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
        status
      `)
      .eq('client_id', clientId)
      .eq('org_id', orgId)

    if (itineraryId) {
      itineraryQuery = itineraryQuery.eq('id', itineraryId)
    } else {
      // Get the most recent itinerary
      itineraryQuery = itineraryQuery
        .order('created_at', { ascending: false })
        .limit(1)
    }

    const { data: itineraries, error: itineraryError } = await itineraryQuery

    const latestItinerary = itineraries && itineraries.length > 0 ? itineraries[0] : null

    // The trip's real payment dates are on its booking; with no booking there
    // are none yet (they were invented: deposit "today + 7", balance "start − 14").
    let paymentDates: { deposit_due?: string | null; balance_due?: string | null } = {}
    if (latestItinerary) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('payment_deadline, balance_due_date')
        .eq('itinerary_id', latestItinerary.id)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      paymentDates = { deposit_due: booking?.payment_deadline ?? null, balance_due: booking?.balance_due_date ?? null }
    }

    const sender = await templateSender(supabase, orgId, await getCurrentUserId())

    // Also fetch all itineraries for this client (for dropdown selection)
    const { data: allItineraries } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, trip_name, start_date, status, total_cost')
      .eq('client_id', clientId)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Build the placeholder data
    const placeholderData = buildPlaceholderData(clientWithName, latestItinerary, sender, paymentDates)

    return NextResponse.json({
      client: clientWithName,
      latestItinerary,
      allItineraries: allItineraries || [],
      placeholderData,
      // The language this client is written to in — the inbox picks templates in it.
      clientLanguage: clientWithName.preferred_language || null,
    })

  } catch (error: any) {
    console.error('Error fetching client template data:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// Helper function to build placeholder data
function buildPlaceholderData(
  client: { name: string; email: string; phone?: string | null },
  itinerary: any,
  sender: TemplateSender,
  paymentDates: { deposit_due?: string | null; balance_due?: string | null } = {}
): Record<string, string> {
  const data: Record<string, string> = {}
  const currency = itinerary?.currency || 'EUR'

  // Client data
  data.client_name = client.name || ''
  data.client_first_name = client.name ? client.name.split(' ')[0] : ''
  data.client_email = client.email || ''
  if (client.phone) data.client_phone = client.phone

  // Trip data (if itinerary exists)
  if (itinerary) {
    data.trip_name = itinerary.trip_name || ''
    data.itinerary_code = itinerary.itinerary_code || ''
    data.booking_ref = itinerary.itinerary_code || ''
    data.confirmation_number = itinerary.itinerary_code || ''
    
    if (itinerary.start_date) {
      data.start_date = formatDate(itinerary.start_date)
    }
    if (itinerary.end_date) {
      data.end_date = formatDate(itinerary.end_date)
    }
    if (itinerary.start_date && itinerary.end_date) {
      data.trip_dates = formatDateRange(itinerary.start_date, itinerary.end_date)
    }
    
    if (itinerary.total_days) {
      data.total_days = `${itinerary.total_days} days`
    }
    if (itinerary.num_adults !== undefined) {
      data.num_adults = itinerary.num_adults.toString()
    }
    if (itinerary.num_children !== undefined) {
      data.num_children = itinerary.num_children.toString()
    }
    if (itinerary.num_adults !== undefined && itinerary.num_children !== undefined) {
      data.total_travelers = (itinerary.num_adults + (itinerary.num_children || 0)).toString()
    }

    // Financial data
    if (itinerary.total_cost !== undefined) {
      data.total = formatCurrency(itinerary.total_cost, currency)
    }
    if (itinerary.deposit_amount !== undefined) {
      data.deposit = formatCurrency(itinerary.deposit_amount, currency)
    }
    if (itinerary.balance_due !== undefined) {
      data.balance = formatCurrency(itinerary.balance_due, currency)
    }
    if (itinerary.total_paid !== undefined) {
      data.total_paid = formatCurrency(itinerary.total_paid, currency)
    }
    data.currency = currency
    if (itinerary.payment_status) {
      data.payment_status = formatPaymentStatus(itinerary.payment_status)
    }

    if (paymentDates.balance_due) data.final_payment_due = formatDate(paymentDates.balance_due)
    if (paymentDates.deposit_due) data.deposit_due_date = formatDate(paymentDates.deposit_due)
  }

  // The sending organisation and agent (lib/template-sender).
  Object.assign(data, sender)

  // Dynamic dates
  // The business's calendar day, not the UTC host's: in Tokyo every email
  // merged before 09:00 was dated yesterday.
  data.today = formatDate(businessToday())

  return data
}

function formatCurrency(amount: number | string | undefined, currency: string = 'EUR'): string {
  if (amount === undefined || amount === null) return ''
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return ''
  // The currency's own decimals and symbol (JPY has none; MAD is a code).
  return formatMoney(num, currency)
}

function formatDate(date: string | Date | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  // Stored dates are calendar days (YYYY-MM-DD → UTC midnight): format them
  // in UTC so no host timezone can move them a day.
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  
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