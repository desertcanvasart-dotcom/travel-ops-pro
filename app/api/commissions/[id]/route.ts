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

    // Strip computed/immutable fields — the commission amount, rate, base value
    // and entity links are derived at generation time and must not be editable here.
    const {
      id: _, created_at, itinerary_id, supplier_id, service_id,
      base_amount, commission_rate, commission_amount,
      ...updateData
    } = body

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