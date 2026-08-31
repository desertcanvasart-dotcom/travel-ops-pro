// ============================================
// /api/suppliers/[id]/properties — the assets a supplier operates
// ============================================
// GET  — list a supplier's properties (optionally ?type=ship&active_only=true)
// POST — add one (name + property_type required; contact fields optional)
//
// A property is the supplier-HAS-properties model (2026-08-31): the ship /
// hotel / train as a sub-entity of the company, with its own contact. Rate
// forms pick a property instead of typing its name into the rate row.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { PROPERTY_TYPES, type PropertyType } from '@/lib/supplier-properties'

const supabaseAdmin = createServerClient()

// What a caller may set. id/supplier_id/timestamps are never writable.
const WRITABLE = ['property_type', 'name', 'city', 'category', 'contact_name', 'contact_phone', 'contact_email', 'notes', 'is_active'] as const

function pickWritable(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of WRITABLE) if (k in body) out[k] = body[k]
  return out
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sp = request.nextUrl.searchParams
    let query = supabaseAdmin
      .from('supplier_properties')
      .select('*')
      .eq('supplier_id', id)
      .order('property_type')
      .order('name')
    const type = sp.get('type')
    if (type) query = query.eq('property_type', type)
    if (sp.get('active_only') === 'true') query = query.eq('is_active', true)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('GET supplier properties error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const record = pickWritable(body)

    const name = String(record.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'Property name is required' }, { status: 400 })
    }
    if (!PROPERTY_TYPES.includes(record.property_type as PropertyType)) {
      return NextResponse.json({ success: false, error: `property_type must be one of: ${PROPERTY_TYPES.join(', ')}` }, { status: 400 })
    }

    // The supplier must exist — a property cannot be orphaned at birth.
    const { data: supplier } = await supabaseAdmin.from('suppliers').select('id').eq('id', id).maybeSingle()
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 })
    }

    const { data, error } = await supabaseAdmin
      .from('supplier_properties')
      .insert({ ...record, name, supplier_id: id })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: `This supplier already has a ${record.property_type} named "${name}"` }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('POST supplier property error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
