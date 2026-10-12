// app/api/cruises/[id]/route.ts

import { createServerClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { rowInOrg, notFoundInOrg } from '@/lib/api/org-scope'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const supabase = createServerClient()
    if (!(await rowInOrg(supabase, 'cruise_contacts', id, orgId))) return notFoundInOrg('Cruise')
    
    const { data, error } = await supabase
      .from('cruise_contacts')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching cruise:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cruise' },
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
    if (!(await rowInOrg(supabase, 'cruise_contacts', id, orgId))) return notFoundInOrg('Cruise')
    const body = await request.json()
    
    const { data, error } = await supabase
      .from('cruise_contacts')
      .update({
        ...body,
        // It stays this company's, whatever the body says.
        org_id: orgId,
        updated_at: new Date().toISOString()
      })
      .eq('org_id', orgId)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating cruise:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update cruise' },
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
    if (!(await rowInOrg(supabase, 'cruise_contacts', id, orgId))) return notFoundInOrg('Cruise')
    
    const { error } = await supabase
      .from('cruise_contacts')
      .delete()
      .eq('org_id', orgId)
      .eq('id', id)
    
    if (error) throw error
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting cruise:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete cruise' },
      { status: 500 }
    )
  }
}