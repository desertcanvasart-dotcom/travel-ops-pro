import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSupplierInsert } from '@/lib/suppliers/create-payload'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const isProperty = searchParams.get('is_property')
    const parentId = searchParams.get('parent_supplier_id')

    let query = supabaseAdmin
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })

    // Support comma-separated types (e.g., type=transport,local_operator,driver).
    // Matched against `types`, the full set of roles a supplier fills — asking
    // `type` alone would hide the driver who also meets clients at the airport.
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(Boolean)
      if (types.length === 1) {
        query = query.contains('types', [types[0]])
      } else if (types.length > 1) {
        query = query.overlaps('types', types)
      }
    }
    
    if (status) {
      query = query.eq('status', status)
    }

    // Filter by is_property (true = individual properties, false = parent companies)
    if (isProperty === 'true') {
      query = query.eq('is_property', true)
    } else if (isProperty === 'false') {
      query = query.eq('is_property', false)
    }

    // Filter by parent supplier (get all properties under a specific company)
    if (parentId) {
      query = query.eq('parent_supplier_id', parentId)
    }

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