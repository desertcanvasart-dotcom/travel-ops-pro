import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================
// TRANSPORTATION RATES API - Single Record
// File: app/api/rates/transportation/[id]/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VEHICLE_TIERS = ['sedan', 'minivan', 'van', 'minibus', 'bus'] as const

// Helper to parse tiered rate fields from request body
function parseTieredRates(body: any) {
  const rates: Record<string, any> = {}
  for (const tier of VEHICLE_TIERS) {
    if (body[`${tier}_rate_eur`] !== undefined) {
      rates[`${tier}_rate_eur`] = body[`${tier}_rate_eur`] !== null ? parseFloat(body[`${tier}_rate_eur`]) || null : null
    }
    if (body[`${tier}_rate_non_eur`] !== undefined) {
      rates[`${tier}_rate_non_eur`] = body[`${tier}_rate_non_eur`] !== null ? parseFloat(body[`${tier}_rate_non_eur`]) || null : null
    }
    if (body[`${tier}_capacity_min`] !== undefined) {
      rates[`${tier}_capacity_min`] = body[`${tier}_capacity_min`] !== null ? parseInt(body[`${tier}_capacity_min`]) : null
    }
    if (body[`${tier}_capacity_max`] !== undefined) {
      rates[`${tier}_capacity_max`] = body[`${tier}_capacity_max`] !== null ? parseInt(body[`${tier}_capacity_max`]) : null
    }
  }
  return rates
}

// GET - Single transportation rate by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET transportation_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: 'Rate not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET transportation_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// PUT - Update single transportation rate (tiered vehicle rates)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Remove id from body to avoid conflicts
    const { id: _, ...rawUpdates } = body

    // Parse tiered rates
    const tieredRates = parseTieredRates(rawUpdates)

    // Build non-tier updates
    const updates: Record<string, any> = {}
    for (const [key, val] of Object.entries(rawUpdates)) {
      if (!VEHICLE_TIERS.some(t => key.startsWith(`${t}_`))) {
        updates[key] = val
      }
    }

    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .update({ ...updates, ...tieredRates })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT transportation_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT transportation_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// DELETE - Delete single transportation rate
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('transportation_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE transportation_rates/[id] error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE transportation_rates/[id] catch error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
