import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const supabase = createServerClient()

    const { data: payment, error } = await supabase
      .from('payments')
      .select(`
        *,
        itineraries (
          itinerary_code,
          client_name,
          total_cost
        )
      `)
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error) throw error

    const formattedPayment = {
      ...payment,
      itinerary_code: payment.itineraries?.itinerary_code,
      client_name: payment.itineraries?.client_name,
      total_cost: payment.itineraries?.total_cost
    }

    return NextResponse.json({
      success: true,
      data: formattedPayment
    })
  } catch (error: any) {
    console.error('GET payment error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
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
    const supabase = createServerClient()
    const body = await request.json()

    console.log('Updating payment:', id, body)

    // M3 Phase 2A: strip any caller-supplied org_id so an update can't
    // re-home a payment row into another org.
    const { org_id: _ignoredOrgId, ...safeBody } = body

    const { data, error } = await supabase
      .from('payments')
      .update(safeBody)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single()

    if (error) {
      console.error('Supabase update error:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('PUT payment error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
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
    const supabase = createServerClient()

    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) throw error

    return NextResponse.json({
      success: true
    })
  } catch (error: any) {
    console.error('DELETE payment error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}