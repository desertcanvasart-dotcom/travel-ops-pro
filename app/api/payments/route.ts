import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const { data: payments, error } = await supabase
      .from('payments')
      .select(`
        *,
        itineraries (
          itinerary_code,
          client_name,
          client_phone,
          client_email,
          total_cost
        )
      `)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const formattedPayments = payments?.map((p: any) => ({
      ...p,
      itinerary_code: p.itineraries?.itinerary_code,
      client_name: p.itineraries?.client_name,
      client_phone: p.itineraries?.client_phone,
      client_email: p.itineraries?.client_email,
      total_cost: p.itineraries?.total_cost
    }))

    return NextResponse.json({
      success: true,
      data: formattedPayments || []
    })
  } catch (error: any) {
    console.error('GET /api/payments error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const supabase = createServerClient()
    const body = await request.json()

    // Validate the amount is a positive, finite number before recording — a
    // negative/NaN/string amount would silently corrupt invoice balances.
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'amount must be a positive number' },
        { status: 400 }
      )
    }
    body.amount = amount

    // M3 Phase 2A: stamp org_id from the session, overriding any value the
    // client might have tried to inject through the spread body.
    const { data, error } = await supabase
      .from('payments')
      .insert([{ ...body, org_id: orgId }])
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('POST /api/payments error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}