import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'

// Actor-attributed service-role client (lib/supabase-actor): rate-table
// writes from here reach fn_rate_audit_trigger, and without the actor
// header every one of them lands in rate_audit_log as changed_by NULL —
// which the rate-change digest then reports as "unknown user /
// 不明なユーザー" to the whole team (audit AUT-H04).
const supabaseAdmin = createServerClient()

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const supplierId = searchParams.get('supplier_id')
    const city = searchParams.get('city')
    const activityCategory = searchParams.get('activity_category')
    const activityType = searchParams.get('activity_type')
    const activeOnly = searchParams.get('active_only') === 'true'

    let query = supabaseAdmin
      .from('activity_rates')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email)
      `)
      .order('activity_name')
      .order('activity_category')

    if (supplierId) query = query.eq('supplier_id', supplierId)
    if (city) query = query.eq('city', city)
    if (activityCategory) query = query.eq('activity_category', activityCategory)
    if (activityType) query = query.eq('activity_type', activityType)
    if (activeOnly) query = query.eq('is_active', true)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching activity rates:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const newRate = {
      ...body,
      supplier_id: body.supplier_id || null
    }

    const { data, error } = await supabaseAdmin
      .from('activity_rates')
      .insert([newRate])
      .select(`*, supplier:supplier_id (id, name, city)`)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating activity rate:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}