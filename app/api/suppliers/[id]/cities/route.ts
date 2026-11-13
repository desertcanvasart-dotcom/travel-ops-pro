// ============================================
// /api/suppliers/[id]/cities — the cities a supplier (a guide) works in
// ============================================
// GET — { success, data: string[] }   [] = every city
// PUT — { cities: string[] } replaces the list; returns the saved list
//
// supplier_cities (migration 20270118); the model is in
// lib/guides/guide-cities. Edited on Rates › Guides beside the guide's
// languages (the supplier form stays contact-only, lib/suppliers/fields.ts).
// Writes are admin/manager via the /api/suppliers mutation gate (middleware).

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { fetchSupplierCities, replaceSupplierCities } from '@/lib/guides/guide-coverage'

const supabaseAdmin = createServerClient()

async function supplierInOrg(id: string, orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('suppliers').select('id').eq('id', id).eq('org_id', orgId).maybeSingle()
  return !!data
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    if (!(await supplierInOrg(id, orgId))) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    return NextResponse.json({ success: true, data: await fetchSupplierCities(supabaseAdmin, orgId, id) })
  } catch (error) {
    console.error('Error in supplier cities GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.cities)) {
      return NextResponse.json({ error: 'cities must be a list (an empty list = every city)' }, { status: 400 })
    }
    if (!(await supplierInOrg(id, orgId))) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

    const result = await replaceSupplierCities(supabaseAdmin, orgId, id, body.cities)
    if ('error' in result) {
      console.error('Error saving supplier cities:', result.error)
      return NextResponse.json({ error: 'Could not save the cities' }, { status: 500 })
    }
    return NextResponse.json({ success: true, data: result.cities })
  } catch (error) {
    console.error('Error in supplier cities PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
