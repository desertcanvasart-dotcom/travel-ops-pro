import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSupplierInsert } from '@/lib/suppliers/create-payload'
import { allowedSupplierTypeKeys, supplierTypeKeysMatching, unknownSupplierTypeError, unknownSupplierTypes } from '@/lib/supplier-types'
import { supplierTypesForCurrentOrg } from '@/lib/vocabulary-server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const status = searchParams.get('status')

    let query = supabaseAdmin
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })

    // Support comma-separated types (e.g., type=transport,local_operator,driver).
    // Matched against `types`, the full set of roles a supplier fills — asking
    // `type` alone would hide the driver who also meets clients at the airport.
    // Each requested type is widened to the agency's own types that BEHAVE
    // like it (Settings → Vocabulary): the hotel-rate form asks for hotels
    // and gets the lodges too.
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(Boolean)
      if (types.length > 0) {
        query = query.overlaps('types', supplierTypeKeysMatching(types, await supplierTypesForCurrentOrg()))
      }
    }
    
    if (status) {
      query = query.eq('status', status)
    }

    // The is_property / parent_supplier_id filters are gone with the columns:
    // that was the 2026-08-22 supplier-IS-a-property model, retired unused.
    // A supplier's assets now live in supplier_properties (see
    // /api/suppliers/[id]/properties).

    const { data, error } = await query

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in suppliers GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const built = buildSupplierInsert(body)
    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    // The roles must be the agency's (or built-in) supplier types. The
    // database keeps only the key SHAPE since 20261007; the list is here.
    const roles: string[] = Array.isArray(built.row.types) ? built.row.types : []
    const unknown = unknownSupplierTypes(roles, allowedSupplierTypeKeys(await supplierTypesForCurrentOrg()))
    if (unknown.length > 0) {
      return NextResponse.json({ error: unknownSupplierTypeError(unknown) }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .insert([built.row])
      .select()
      .single()

    if (error) {
      console.error('Error creating supplier:', error)
      // A constraint violation is a bad request, not a server fault — and the
      // blank "Failed to create supplier" is what hid this bug for a day.
      if (error.code === '23514') {
        return NextResponse.json(
          { error: 'Supplier type must be one of its roles. Pick at least one role.' },
          { status: 400 }
        )
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A supplier with these details already exists.' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Error in suppliers POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}