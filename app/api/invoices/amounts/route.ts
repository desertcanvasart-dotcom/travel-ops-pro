import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserRole, noOrgResponse } from '@/lib/auth/current-org'
import { roundToCurrency } from '@/lib/currency-totals'
import { invoiceNet } from '@/lib/invoices/totals'
import { canOverrideInvoiceAmount, loadTripInvoiceBase, plannedTourAmount } from '@/lib/invoices/server-amounts'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// What the server would bill for a trip, so the New Invoice form shows the
// figure the invoice will carry (POST /api/invoices works it out the same way,
// from the same function) instead of its own arithmetic on a price the browser
// read earlier. Read-only; nothing is stored.
//
//   GET /api/invoices/amounts?itineraryId=…&type=standard|deposit|final&percent=20[&parentId=…]
export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const params = request.nextUrl.searchParams
    const itineraryId = params.get('itineraryId')
    if (!itineraryId) return NextResponse.json({ error: 'itineraryId is required' }, { status: 400 })
    const type = params.get('type') || 'standard'
    if (!['standard', 'deposit', 'final'].includes(type)) return NextResponse.json({ error: 'type must be standard, deposit or final' }, { status: 400 })
    const percent = params.get('percent') === null ? 10 : Number(params.get('percent'))
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return NextResponse.json({ error: 'percent must be more than 0 and at most 100' }, { status: 400 })
    }

    const trip = await loadTripInvoiceBase(supabaseAdmin, orgId, itineraryId)
    if (!trip) return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 })
    const currency = trip.currency

    let parentNet: number | null = null
    const parentId = params.get('parentId')
    if (parentId) {
      const { data: parent } = await supabaseAdmin
        .from('invoices')
        .select('total_amount, tax_amount')
        .eq('id', parentId)
        .eq('org_id', orgId)
        .maybeSingle()
      if (parent) parentNet = invoiceNet(parent)
    }

    const amount = plannedTourAmount({ invoiceType: type, tripNet: trip.net, depositPercent: percent, currency, parentNet })
    const deposit = parentNet ?? roundToCurrency((trip.net * percent) / 100, currency)
    return NextResponse.json({
      currency,
      trip_total: trip.net,
      amount,
      deposit_amount: deposit,
      balance_amount: Math.max(0, roundToCurrency(trip.net - deposit, currency)),
      can_override: canOverrideInvoiceAmount(await getCurrentUserRole()),
    })
  } catch (error) {
    console.error('Error in invoice amounts GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
