import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/current-org'
import { findServiceTypeConflict, sanitizeServiceTypes } from '@/lib/department-admin'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    // The management screen needs deactivated departments too; everything
    // else (task routing, pickers) keeps seeing only active ones.
    const includeInactive = request.nextUrl.searchParams.get('include_inactive') === '1'
    let query = supabaseAdmin
      .from('departments')
      .select('id, name, description, service_types, is_active')
      .order('name')
    if (!includeInactive) query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) {
      console.error('Error fetching departments:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch departments' }, { status: 500 })
    }
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in departments GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const forbidden = await requireRole(['admin'])
    if (forbidden) return forbidden

    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }
    const serviceTypes = sanitizeServiceTypes(body.service_types)

    const conflict = await findServiceTypeConflict(serviceTypes, null)
    if (conflict) {
      return NextResponse.json(
        { success: false, error: `Service type already routed to ${conflict}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('departments')
      .insert({
        name,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        service_types: serviceTypes,
        is_active: true,
      })
      .select('id, name, description, service_types, is_active')
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Error in departments POST:', error)
    return NextResponse.json({ success: false, error: 'Failed to create department' }, { status: 500 })
  }
}
