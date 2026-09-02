// ============================================
// /api/extras-catalogue — the extras that are not attractions
// ============================================
// Airport fast-track, extra luggage, a late check-out: things the office sells
// that no rate table models. Org-scoped, unlike the shared entrance_fees
// catalogue, because these are one agency's commercial offers.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

export const dynamic = 'force-dynamic'

// '*' on purpose: rate_currency arrives by migration (20260902) and the page
// must keep loading on a database that has not run it yet.
const COLS = '*'

const WRITABLE = [
  'name', 'description', 'category', 'supplier_cost', 'supplier_id',
  'selling_price', 'unit', 'is_active',
  // Only ever sent when the user picked a currency or cleared one
  // (rateCurrencyPatch), so an unmigrated database still saves.
  'rate_currency',
] as const

/** A blank number field means "not priced", never 0 — the unpriced-rates rule. */
function numberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pickWritable(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of WRITABLE) {
    if (!(k in body)) continue
    out[k] = k === 'supplier_cost' || k === 'selling_price' ? numberOrNull(body[k])
      : k === 'rate_currency' ? (body[k] || null)
      : body[k]
  }
  return out
}

export async function GET(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()

    let query = supabase
      .from('extras_catalogue')
      .select(COLS)
      .eq('org_id', orgId)
      .order('category', { ascending: true, nullsFirst: false })
      .order('name')
    if (request.nextUrl.searchParams.get('active_only') === 'true') {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('GET extras-catalogue:', error)
    return NextResponse.json({ success: false, error: 'Failed to load extras' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const supabase = createServerClient()

    const body = await request.json()
    const record = pickWritable(body)
    const name = String(record.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }
    if (record.unit !== undefined && !['per_person', 'per_booking'].includes(String(record.unit))) {
      return NextResponse.json({ success: false, error: 'Unit must be per_person or per_booking' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('extras_catalogue')
      .insert({ ...record, name, org_id: orgId })
      .select(COLS)
      .single()
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: `An extra named "${name}" already exists` }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('POST extras-catalogue:', error)
    return NextResponse.json({ success: false, error: 'Failed to create the extra' }, { status: 500 })
  }
}
