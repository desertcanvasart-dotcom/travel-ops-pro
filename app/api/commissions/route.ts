import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { emptyTotals, addToTotals, sumByCurrency, type CurrencyTotals } from '@/lib/currency-totals'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

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

    // Calculate summary stats
    const receivable = (data || []).filter(c => c.commission_type === 'receivable')
    const payable = (data || []).filter(c => c.commission_type === 'payable')

    // Every figure is PER CURRENCY. A commission is stored in its own
    // currency (an EGP guide tip, a JPY agent fee), and these used to be summed
    // raw into one number the page then labelled €. Nothing here converts.
    type Row = { commission_amount: unknown; currency?: unknown }
    const amount = (c: Row) => c.commission_amount
    const cur = (c: Row) => c.currency
    const net = emptyTotals()
    for (const c of receivable) addToTotals(net, Number(c.commission_amount) || 0, c.currency)
    for (const c of payable) addToTotals(net, -(Number(c.commission_amount) || 0), c.currency)

    const summary = {
      total_receivable: sumByCurrency(receivable, amount, cur),
      total_payable: sumByCurrency(payable, amount, cur),
      pending_receivable: sumByCurrency(
        receivable.filter(c => c.status === 'pending' || c.status === 'invoiced'), amount, cur),
      pending_payable: sumByCurrency(payable.filter(c => c.status === 'pending'), amount, cur),
      received: sumByCurrency(receivable.filter(c => c.status === 'received'), amount, cur),
      paid: sumByCurrency(payable.filter(c => c.status === 'paid'), amount, cur),
      net_commission: net,
      by_category: {} as Record<string, { receivable: CurrencyTotals; payable: CurrencyTotals; count: number }>
    }

    // Group by category
    ;(data || []).forEach(c => {
      if (!summary.by_category[c.category]) {
        summary.by_category[c.category] = { receivable: emptyTotals(), payable: emptyTotals(), count: 0 }
      }
      summary.by_category[c.category].count++
      if (c.commission_type === 'receivable') {
        addToTotals(summary.by_category[c.category].receivable, c.commission_amount, c.currency)
      } else {
        addToTotals(summary.by_category[c.category].payable, c.commission_amount, c.currency)
      }
    })

    return NextResponse.json({
      success: true,
      data: data || [],
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

    // Calculate commission amount from rate if explicit amount missing.
    const commissionAmount = hasExplicitAmount
      ? Number(body.commission_amount)
      : (Number(body.base_amount) * Number(body.commission_rate)) / 100

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
      currency: body.currency || 'EUR',
      status: body.status || 'pending',
      transaction_date: body.transaction_date || new Date().toISOString().split('T')[0],
      due_date: body.due_date || null,
      paid_date: body.paid_date || null,
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