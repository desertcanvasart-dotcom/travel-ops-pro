import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { loadFxIndex } from '@/lib/fx-report'
import { convertTripExtras } from '@/lib/itinerary-pl-extras'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * The trip's extra expenses in the trip's currency, converted the way the
 * Profit & Loss report converts them (each at the rate on its own date), for
 * the P&L card on the trip page. An expense with no rate is not in `total` and
 * is listed in `missing`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // The card is for finance viewers, as the expenses it adds up are.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id } = await params

    const { data: trip } = await supabaseAdmin
      .from('itineraries')
      .select('id, currency')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!trip) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })

    const { data: expenses, error } = await supabaseAdmin
      .from('expenses')
      .select('amount, currency, expense_date, category, expense_number, status, booking_supplier_status_id')
      .eq('org_id', orgId)
      .eq('itinerary_id', id)
    if (error) {
      console.error('Error fetching trip expenses:', error)
      return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
    }

    const currency = (trip.currency || 'EUR').toUpperCase()
    const converted = convertTripExtras(await loadFxIndex(supabaseAdmin), expenses ?? [], currency)

    return NextResponse.json({
      success: true,
      currency,
      total: converted.total,
      count: converted.count,
      missing: converted.missing.map(h => ({
        reference: h.reference,
        amount: h.amount,
        fromCurrency: h.fromCurrency,
        toCurrency: h.toCurrency,
        date: h.date,
      })),
    })
  } catch (error) {
    console.error('Error in trip extras fx GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
