import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('commissions')
      .select(`
        *,
        supplier:suppliers(id, name, type, contact_email, contact_phone),
        itinerary:itineraries(id, itinerary_code, client_name, start_date, end_date, total_cost),
        client:clients(id, first_name, last_name, email)
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) {
      console.error('Error fetching commission:', error)
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in commission GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const body = await request.json()

    // If marking as received/paid, set the paid_date
    if ((body.status === 'received' || body.status === 'paid') && !body.paid_date) {
      body.paid_date = new Date().toISOString().split('T')[0]
    }

    // Only the fields a commission's edit form owns (AUDIT H20). The amount,
    // rate, base value, cost and entity links are derived at generation time;
    // org_id and client_id would move the row to another org or point it at
    // another org's client. Everything else in the body is dropped.
    const EDITABLE = [
      'commission_type', 'category', 'source_name', 'source_contact', 'description',
      'currency', 'status', 'transaction_date', 'due_date', 'paid_date',
      'payment_method', 'payment_reference', 'notes',
    ] as const
    const updateData: Record<string, unknown> = {}
    for (const key of EDITABLE) {
      if (key in body) updateData[key] = body[key] === '' ? null : body[key]
    }
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('commissions')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select(`
        *,
        supplier:suppliers(id, name, type),
        itinerary:itineraries(id, itinerary_code, client_name)
      `)
      .single()

    if (error) {
      console.error('Error updating commission:', error)
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in commission PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params

    const { error } = await supabaseAdmin
      .from('commissions')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting commission:', error)
      return NextResponse.json({ error: 'Failed to delete commission' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in commission DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}