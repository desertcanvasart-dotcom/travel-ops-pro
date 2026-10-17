import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'

// Actor-attributed service-role client (lib/supabase-actor): rate-table
// writes from here reach fn_rate_audit_trigger, and without the actor
// header every one of them lands in rate_audit_log as changed_by NULL —
// which the rate-change digest then reports as "unknown user /
// 不明なユーザー" to the whole team (audit AUT-H04).
const supabaseAdmin = createServerClient()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await rowInOrg(supabaseAdmin, 'activity_rates', id, orgId))) return notFoundInOrg('Rate')
    
    const { data, error } = await supabaseAdmin
      .from('activity_rates')
      .select(`
        *,
        supplier:supplier_id (id, name, city, contact_phone, contact_email)
      `)
      .eq('org_id', orgId)
      .eq('id', id)
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error fetching activity rate:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
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
    if (!(await rowInOrg(supabaseAdmin, 'activity_rates', id, orgId))) return notFoundInOrg('Rate')
    const body = await request.json()
    
    const { data, error } = await supabaseAdmin
      .from('activity_rates')
      .update({
        ...body,
        // It stays this company's, whatever the body says.
        org_id: orgId,
        updated_at: new Date().toISOString()
      })
      .eq('org_id', orgId)
      .eq('id', id)
      .select(`
        *,
        supplier:supplier_id (id, name, city)
      `)
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error updating activity rate:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
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
    if (!(await rowInOrg(supabaseAdmin, 'activity_rates', id, orgId))) return notFoundInOrg('Rate')
    
    const { error } = await supabaseAdmin
      .from('activity_rates')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)
    
    if (error) throw error
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting activity rate:', error)
    return NextResponse.json(
      { success: false, error: clientMessage(error, 'Internal server error') },
      { status: 500 }
    )
  }
}