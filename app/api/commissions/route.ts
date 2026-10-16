import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { getOrgDefaultCurrency } from '@/lib/org-default-currency'
import { recordsInOrg } from '@/lib/org-refs'
import { priceChangeFlags } from '@/lib/commission-price-sync'
import { commissionFieldError, commissionPaidDate, summariseCommissions, findDuplicateCommission, duplicateCommissionMessage } from '@/lib/commission-fields'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Finance is admin and manager; the middleware prefix list says so too,
    // checked here as well so the route does not rest on one table alone.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') // receivable, payable
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const supplierId = searchParams.get('supplierId')
    const itineraryId = searchParams.get('itineraryId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabaseAdmin
      .from('commissions')
      .select(`
        *,
        supplier:suppliers(id, name, type),
        itinerary:itineraries(id, itinerary_code, client_name),
        client:clients(id, first_name, last_name, email)
      `)
      .eq('org_id', orgId)
      .order('transaction_date', { ascending: false })

    if (type) query = query.eq('commission_type', type)
    if (category) query = query.eq('category', category)
    if (status) query = query.eq('status', status)
    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (itineraryId) query = query.eq('itinerary_id', itineraryId)
    if (startDate) query = query.gte('transaction_date', startDate)
    if (endDate) query = query.lte('transaction_date', endDate)

    const { data, error } = await query

    if (error) {
      console.error('Error fetching commissions:', error)
      return NextResponse.json({ error: 'Failed to fetch commissions' }, { status: 500 })
    }

    // Per currency, and without cancelled commissions: see summariseCommissions.
    const summary = summariseCommissions(data || [])

    // "Price changed since paid" on every load, not only after Recalculate:
    // a paid, received, invoiced or disputed commission whose service now
    // prices differently carries price_changed_status. Computed, not stored.
    const flags = await priceChangeFlags(supabaseAdmin, orgId, data || [])
    const rows = (data || []).map((c: { id: string }) => (flags[c.id] ? { ...c, price_changed_status: flags[c.id] } : c))

    return NextResponse.json({
      success: true,
      data: rows,
      summary
    })
  } catch (error) {
    console.error('Error in commissions GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const body = await request.json()

    // Validate required fields. M13: commission_amount=0 is a legitimate
    // zero-commission entry but the previous `!body.commission_amount`
    // rejected it. Also allow rate-based input: either an explicit
    // commission_amount (incl. 0), or (base_amount + commission_rate).
    const hasExplicitAmount = body.commission_amount !== undefined
      && body.commission_amount !== null
      && body.commission_amount !== ''
    const hasRateInputs = body.base_amount !== undefined
      && body.base_amount !== null
      && body.commission_rate !== undefined
      && body.commission_rate !== null

    if (!body.commission_type || !body.category || (!hasExplicitAmount && !hasRateInputs)) {
      return NextResponse.json(
        { error: 'Commission type, category, and either commission_amount or (base_amount + commission_rate) are required' },
        { status: 400 }
      )
    }

    // Type, category, status and currency are checked against the CHECK sets
    // the database enforces, so a bad one is a 400 with the reason.
    const fieldError = commissionFieldError(body)
    if (fieldError) {
      return NextResponse.json({ error: fieldError }, { status: 400 })
    }
    for (const field of ['commission_amount', 'base_amount', 'commission_rate'] as const) {
      const v = body[field]
      if (v !== undefined && v !== null && v !== '' && !Number.isFinite(Number(v))) {
        return NextResponse.json({ error: `${field} must be a number` }, { status: 400 })
      }
    }

    // The supplier, trip and client must be this company's (suppliers.org_id,
    // 20261205). The trip and client were stored unchecked, and the list embeds
    // them by that key: another company's trip code, client name and email on
    // this company's Commissions page.
    if (!(await recordsInOrg(supabaseAdmin, orgId, {
      supplier_id: body.supplier_id || undefined,
      itinerary_id: body.itinerary_id || undefined,
      client_id: body.client_id || undefined,
    }))) {
      return NextResponse.json({ error: 'Supplier, trip or client not found' }, { status: 404 })
    }

    // Calculate commission amount from rate if explicit amount missing.
    const commissionAmount = hasExplicitAmount
      ? Number(body.commission_amount)
      : (Number(body.base_amount) * Number(body.commission_rate)) / 100
    // "abc" or a blank base made NaN, which the insert rejected as a 500.
    if (!Number.isFinite(commissionAmount)) {
      return NextResponse.json({ error: 'The commission amount must be a number' }, { status: 400 })
    }

    // The same money must not be on the books twice: a manual commission for a
    // trip, supplier, type and amount that already has one (generated or typed)
    // is refused, naming the one that holds it.
    if (body.itinerary_id) {
      const { data: onTrip, error: dupError } = await supabaseAdmin
        .from('commissions')
        .select('id, commission_number, itinerary_id, supplier_id, source_name, commission_type, commission_amount, status, description')
        .eq('org_id', orgId)
        .eq('itinerary_id', body.itinerary_id)
        .eq('commission_type', body.commission_type)
      if (dupError) {
        console.error('Error checking for a duplicate commission:', dupError)
        return NextResponse.json({ error: 'Failed to create commission' }, { status: 500 })
      }
      const duplicate = findDuplicateCommission(onTrip ?? [], {
        id: '',
        itinerary_id: body.itinerary_id,
        supplier_id: body.supplier_id || null,
        source_name: body.source_name || null,
        commission_type: body.commission_type,
        commission_amount: commissionAmount,
      })
      if (duplicate) {
        return NextResponse.json({ error: duplicateCommissionMessage(duplicate), existing_commission_id: duplicate.id }, { status: 409 })
      }
    }

    const status = body.status || 'pending'
    const newCommission = {
      org_id: orgId,
      itinerary_id: body.itinerary_id || null,
      supplier_id: body.supplier_id || null,
      client_id: body.client_id || null,
      commission_type: body.commission_type,
      category: body.category,
      source_name: body.source_name || null,
      source_contact: body.source_contact || null,
      description: body.description || null,
      base_amount: body.base_amount || 0,
      commission_rate: body.commission_rate || null,
      commission_amount: commissionAmount,
      // The company's own currency when none is sent — not a hardcoded EUR.
      currency: typeof body.currency === 'string' && body.currency.trim()
        ? body.currency.trim().toUpperCase()
        : await getOrgDefaultCurrency(supabaseAdmin, orgId),
      status,
      transaction_date: body.transaction_date || new Date().toISOString().split('T')[0],
      due_date: body.due_date || null,
      // Follows the status, as on a PUT: a pending commission has no paid date.
      paid_date: commissionPaidDate(status, body.paid_date),
      payment_method: body.payment_method || null,
      payment_reference: body.payment_reference || null,
      notes: body.notes || null
    }

    const { data, error } = await supabaseAdmin
      .from('commissions')
      .insert([newCommission])
      .select(`
        *,
        supplier:suppliers(id, name, type),
        itinerary:itineraries(id, itinerary_code, client_name)
      `)
      .single()

    if (error) {
      console.error('Error creating commission:', error)
      return NextResponse.json({ error: 'Failed to create commission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Error in commissions POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}