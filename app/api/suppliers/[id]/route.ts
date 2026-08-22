import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SUPPLIER_REFERENCE_CHECKS, describeBlockers } from '@/lib/suppliers/delete-guard'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

import { SUPPLIER_WRITABLE_FIELDS } from '@/lib/suppliers/fields'

// One whitelist with create and the form (lib/suppliers/fields.ts), so a
// field cannot be shown but silently dropped on save — which is exactly what
// happened to the assistants' "Daily Rate" before 2026-08-22.
const VALID_FIELDS = SUPPLIER_WRITABLE_FIELDS

// Filter object to only include valid fields
function filterValidFields(obj: Record<string, any>): Record<string, any> {
  const filtered: Record<string, any> = {}
  for (const key of VALID_FIELDS) {
    if (obj[key] !== undefined) {
      filtered[key] = obj[key]
    }
  }
  return filtered
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching supplier:', error)
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in supplier GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Same rule as create: the primary type is always one of the roles held.
    if (Array.isArray(body.types) && body.types.length > 0) {
      body.type = body.type && body.types.includes(body.type) ? body.type : body.types[0]
    } else if (body.type) {
      body.types = [body.type]
    }

    // Filter to only valid fields to prevent database errors
    const updateData = filterValidFields(body)

    // Remove id if present (shouldn't update primary key)
    delete (updateData as any).id
    delete (updateData as any).created_at
    delete (updateData as any).updated_at

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating supplier:', error)
      return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in supplier PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if supplier exists first
    const { data: existing } = await supabaseAdmin
      .from('suppliers')
      .select('id, name')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    }

    // Money and records must not lose their supplier. Refuse with the reason
    // rather than letting the foreign key decide (a 500, or a quiet orphan).
    const counts = await Promise.all(
      SUPPLIER_REFERENCE_CHECKS.map(async ({ table, column, label }) => {
        const { count } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true }).eq(column, id)
        return { label, count: count ?? 0 }
      })
    )
    const blocked = describeBlockers(counts)
    if (blocked) {
      return NextResponse.json({ error: blocked, blocked: true }, { status: 409 })
    }

    const { error } = await supabaseAdmin
      .from('suppliers')
      .delete()
      .eq('id', id)

    if (error) {
      // A reference this guard doesn't list. Still a 409 with a reason, not a 500.
      if ((error as { code?: string }).code === '23503') {
        return NextResponse.json({ error: 'Supplier is still referenced by other records — deactivate it instead', blocked: true }, { status: 409 })
      }
      console.error('Error deleting supplier:', error)
      return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: `Supplier "${existing.name}" deleted` })
  } catch (error) {
    console.error('Error in supplier DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}