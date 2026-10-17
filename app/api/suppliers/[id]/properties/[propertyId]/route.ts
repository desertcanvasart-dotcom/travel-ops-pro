// PUT/DELETE one supplier property. Scoped by BOTH ids so a property can
// never be edited through the wrong supplier's URL — and by the caller's
// company (supplier_properties.org_id, 20261205): another company's property
// is a plain 404.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

const supabaseAdmin = createServerClient()

const WRITABLE = ['property_type', 'name', 'city', 'category', 'contact_name', 'contact_phone', 'contact_email', 'notes', 'is_active', 'name_ja', 'address'] as const

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id, propertyId } = await params
    const body = await request.json()
    const record: Record<string, unknown> = {}
    for (const k of WRITABLE) if (k in body) record[k] = body[k]
    if ('name' in record) {
      record.name = String(record.name ?? '').trim()
      if (!record.name) return NextResponse.json({ success: false, error: 'Property name is required' }, { status: 400 })
    }
    record.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('supplier_properties')
      .update(record)
      .eq('id', propertyId)
      .eq('supplier_id', id)
      .eq('org_id', orgId)
      .select('*')
      .maybeSingle()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'This supplier already has a property with that name' }, { status: 409 })
      }
      throw error
    }
    if (!data) return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 })

    // Write-through: rate rows that reference this ship display its name from
    // their own denormalized column (the engine, PDFs and CSV read it), so a
    // rename must follow into them or the two drift apart. This company's rows
    // only: a rate row elsewhere carrying this id is not ours to rename.
    if ('name' in record && data.property_type === 'ship') {
      await supabaseAdmin.from('nile_cruises').update({ ship_name: data.name }).eq('property_id', propertyId).eq('org_id', orgId)
    }
    if ('name' in record && data.property_type === 'hotel') {
      await supabaseAdmin.from('accommodation_rates').update({ property_name: data.name }).eq('property_id', propertyId).eq('org_id', orgId)
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT supplier property error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; propertyId: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id, propertyId } = await params

    const { data: own } = await supabaseAdmin
      .from('supplier_properties')
      .select('id')
      .eq('id', propertyId)
      .eq('supplier_id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!own) return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 })

    // Refuse while rates still reference it: deleting the ship under priced
    // rows would strand them (property_id would null out and the link is lost
    // silently). Deactivate instead, or delete the rates first. Only this
    // company's rates count — another company's row must not block our delete.
    const counts = await Promise.all([
      supabaseAdmin.from('nile_cruises').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('org_id', orgId),
      supabaseAdmin.from('accommodation_rates').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('org_id', orgId),
      supabaseAdmin.from('train_rates').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('org_id', orgId),
      supabaseAdmin.from('sleeping_train_rates').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('org_id', orgId),
    ])
    const inUse = counts.reduce((n, c) => n + (c.count ?? 0), 0)
    if (inUse > 0) {
      return NextResponse.json(
        { success: false, error: `${inUse} rate(s) still use this property. Delete those rates first, or mark the property inactive.` },
        { status: 409 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('supplier_properties')
      .delete()
      .eq('id', propertyId)
      .eq('supplier_id', id)
      .eq('org_id', orgId)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Property not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE supplier property error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
