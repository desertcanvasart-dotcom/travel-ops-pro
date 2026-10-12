// ============================================
// API Route: /api/resources/hotel-staff/[id]/route.ts
// ============================================
// Single hotel staff operations: GET, PUT, DELETE
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

// The caller's company's staff only (the view carries suppliers.org_id,
// 20261205): another company's id is a plain 404.

// GET - Get single hotel staff
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { id } = await params

    const { data, error } = await supabase
      .from('hotel_staff')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Hotel staff not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in hotel staff GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update hotel staff
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { id } = await params
    const body = await request.json()

    const updateData: any = {}
    
    if (body.name !== undefined) updateData.name = body.name
    if (body.role !== undefined) updateData.role = body.role
    // No hotel_id: hotel_staff has no such column (staff are not hotel-scoped
    // in this schema) — sending it failed the whole update.
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp
    if (body.email !== undefined) updateData.email = body.email
    if (body.languages !== undefined) updateData.languages = body.languages
    if (body.shift_times !== undefined) updateData.shift_times = body.shift_times
    if (body.emergency_contact !== undefined) updateData.emergency_contact = body.emergency_contact
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await supabase
      .from('hotel_staff')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*')
      .maybeSingle()

    if (error) {
      console.error('Error updating hotel staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update hotel staff' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Hotel staff not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Hotel staff updated successfully'
    })

  } catch (error) {
    console.error('Error in hotel staff PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete hotel staff
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()
    const { id } = await params

    const { data: deleted, error } = await supabase
      .from('hotel_staff')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id')

    if (error) {
      console.error('Error deleting hotel staff:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete hotel staff' },
        { status: 500 }
      )
    }
    if (!deleted?.length) {
      return NextResponse.json(
        { success: false, error: 'Hotel staff not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Hotel staff deleted successfully'
    })

  } catch (error) {
    console.error('Error in hotel staff DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}