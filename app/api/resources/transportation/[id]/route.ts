import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching transportation rate:', error)
      return NextResponse.json({ error: 'Transportation rate not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in transportation rate GET:', error)
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

    // Validate required fields
    if (!body.city || !body.service_type) {
      return NextResponse.json(
        { error: 'City and service type are required' },
        { status: 400 }
      )
    }

    // Parse tiered rates
    const tieredRates = parseTieredRates(body)

    // Build non-tier update fields
    const updateData: Record<string, any> = {
      service_code: body.service_code,
      service_type: body.service_type,
      city: body.city,
      origin_city: body.origin_city || null,
      destination_city: body.destination_city || null,
      duration: body.duration || null,
      area: body.area || null,
      includes: body.includes || null,
      season: body.season || null,
      rate_valid_from: body.rate_valid_from,
      rate_valid_to: body.rate_valid_to,
      supplier_name: body.supplier_name || null,
      notes: body.notes || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      updated_at: new Date().toISOString(),
      ...tieredRates
    }

    // Keep legacy base_rate_eur in sync with first available tier rate
    const firstTierRate = VEHICLE_TIERS.map(t => tieredRates[`${t}_rate_eur`]).find(r => r != null && r > 0)
    if (firstTierRate) {
      updateData.base_rate_eur = firstTierRate
      updateData.base_rate_non_eur = firstTierRate
    }

    const { data, error } = await supabaseAdmin
      .from('transportation_rates')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating transportation rate:', error)
      return NextResponse.json(
        { error: `Failed to update transportation rate: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in transportation rate PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
      console.error('Error deleting transportation rate:', error)
      return NextResponse.json(
        { error: `Failed to delete transportation rate: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in transportation rate DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
