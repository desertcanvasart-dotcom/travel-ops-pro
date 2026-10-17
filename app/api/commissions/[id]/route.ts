import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { commissionFieldError, buildCommissionUpdate } from '@/lib/commission-fields'

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

    // Finance is admin and manager; also enforced by the middleware prefix list.
    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

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

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id } = await params
    const body = await request.json()

    // Only the status, paid date, due date, payment details, notes and labels
    // can change (COMMISSION_EDITABLE_FIELDS). The money — type, category,
    // currency, base, rate, amount — and the supplier, trip and client define
    // what is owed and to whom: they were stripped here while the form offered
    // them, so an edit closed as "saved" with the old figures. A wrong one is
    // deleted and made again.
    const fieldError = commissionFieldError({ status: body.status })
    if (fieldError) {
      return NextResponse.json({ error: fieldError }, { status: 400 })
    }

    const { data: existing, error: readError } = await supabaseAdmin
      .from('commissions')
      .select('id, status, paid_date')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (readError) {
      console.error('Error reading commission:', readError)
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 })
    }

    // paid_date follows the status: set when paid or received, cleared otherwise.
    const updateData = buildCommissionUpdate(body, existing)

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

    const forbidden = await requireRole(['admin', 'manager'])
    if (forbidden) return forbidden

    const { id } = await params

    const { data: existing } = await supabaseAdmin
      .from('commissions')
      .select('id, service_id')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 })
    }

    const { error } = await supabaseAdmin
      .from('commissions')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting commission:', error)
      return NextResponse.json({ error: 'Failed to delete commission' }, { status: 500 })
    }

    // Deleting a generated commission releases its service. The service stayed
    // marked 'generated', so Generate commissions skipped it for ever as
    // already done and the commission could never be made again. (Generation
    // does not duplicate the sibling commission of the same service: it skips
    // a commission the service already has.) Commissions made before
    // commissions.service_id existed carry no link and release nothing.
    if (existing.service_id) {
      const { error: releaseError } = await supabaseAdmin
        .from('itinerary_services')
        .update({ commission_status: 'pending' })
        .eq('id', existing.service_id)
        .eq('commission_status', 'generated')
      if (releaseError) {
        console.error('Commission deleted but its service could not be released:', releaseError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in commission DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}