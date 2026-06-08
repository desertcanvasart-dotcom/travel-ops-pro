import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('accommodation_rates')
      .select(`
        *,
        supplier:suppliers(id, name, city, contact_phone, contact_email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('GET accommodation_rates by id error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load hotel rate') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('GET accommodation_rates by id catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to load hotel rate') }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const updateData = {
      // Basic info
      service_code: body.service_code,
      property_name: body.property_name,
      property_type: body.property_type || 'hotel',
      city: body.city || null,
      board_basis: body.board_basis || 'BB',
      tier: body.tier || 'standard',
      supplier_id: body.supplier_id || null,
      supplier_name: body.supplier_name || null,
      
      // Hotel contacts
      contact_name: body.contact_name || null,
      contact_email: body.contact_email || null,
      contact_phone: body.contact_phone || null,
      reservations_email: body.reservations_email || null,
      reservations_phone: body.reservations_phone || null,
      
      // Low Season dates
      low_season_from: body.low_season_from || null,
      low_season_to: body.low_season_to || null,
      
      // Low Season rates - Per Person EUR
      pp_double_eur: parseFloat(body.pp_double_eur) || 0,
      single_supp_eur: parseFloat(body.single_supp_eur) || 0,
      triple_red_eur: parseFloat(body.triple_red_eur) || 0,

      // Low Season rates - Per Person Non-EUR
      pp_double_non_eur: parseFloat(body.pp_double_non_eur) || 0,
      single_supp_non_eur: parseFloat(body.single_supp_non_eur) || 0,
      triple_red_non_eur: parseFloat(body.triple_red_non_eur) || 0,

      // High Season dates
      high_season_from: body.high_season_from || null,
      high_season_to: body.high_season_to || null,

      // High Season rates - Per Person EUR
      high_pp_double_eur: parseFloat(body.high_pp_double_eur) || 0,
      high_single_supp_eur: parseFloat(body.high_single_supp_eur) || 0,
      high_triple_red_eur: parseFloat(body.high_triple_red_eur) || 0,

      // High Season rates - Per Person Non-EUR
      high_pp_double_non_eur: parseFloat(body.high_pp_double_non_eur) || 0,
      high_single_supp_non_eur: parseFloat(body.high_single_supp_non_eur) || 0,
      high_triple_red_non_eur: parseFloat(body.high_triple_red_non_eur) || 0,

      // Peak Season dates (Period 1)
      peak_season_from: body.peak_season_from || null,
      peak_season_to: body.peak_season_to || null,

      // Peak Season dates (Period 2 - optional)
      peak_season_2_from: body.peak_season_2_from || null,
      peak_season_2_to: body.peak_season_2_to || null,

      // Peak Season rates - Per Person EUR
      peak_pp_double_eur: parseFloat(body.peak_pp_double_eur) || 0,
      peak_single_supp_eur: parseFloat(body.peak_single_supp_eur) || 0,
      peak_triple_red_eur: parseFloat(body.peak_triple_red_eur) || 0,

      // Peak Season rates - Per Person Non-EUR
      peak_pp_double_non_eur: parseFloat(body.peak_pp_double_non_eur) || 0,
      peak_single_supp_non_eur: parseFloat(body.peak_single_supp_non_eur) || 0,
      peak_triple_red_non_eur: parseFloat(body.peak_triple_red_non_eur) || 0,
      
      // Rate validity
      rate_valid_from: body.rate_valid_from || null,
      rate_valid_to: body.rate_valid_to || null,
      
      // Other
      notes: body.notes || null,
      is_active: body.is_active !== false,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('accommodation_rates')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('PUT accommodation_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save hotel rate') }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT accommodation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to save hotel rate') }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { error } = await supabaseAdmin
      .from('accommodation_rates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('DELETE accommodation_rates error:', error)
      return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to delete hotel rate') }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Hotel deleted successfully' })
  } catch (error: any) {
    console.error('DELETE accommodation_rates catch error:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Failed to delete hotel rate') }, { status: 500 })
  }
}