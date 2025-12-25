import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B QUOTES API
// File: app/api/b2b/quotes/route.ts
// ============================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const partner_id = searchParams.get('partner_id')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabaseAdmin
      .from('tour_quotes')
      .select(`
        *,
        tour_variations (variation_name, variation_code, tier, tour_templates (template_name, template_code)),
        b2b_partners (company_name, partner_code)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (partner_id) query = query.eq('partner_id', partner_id)
    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      variation_id, partner_id, client_name, client_email, client_phone,
      client_nationality, travel_date, num_adults = 2, num_children = 0,
      margin_percent = 25, notes, valid_days = 14
    } = body

    if (!variation_id) {
      return NextResponse.json({ error: 'variation_id is required' }, { status: 400 })
    }

    // Calculate price
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const priceResponse = await fetch(`${baseUrl}/api/b2b/calculate-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variation_id,
        num_pax: num_adults + num_children,
        travel_date,
        is_eur_passport: client_nationality?.toLowerCase().includes('eur') || true,
        margin_percent,
        partner_id
      })
    })

    const priceResult = await priceResponse.json()

    if (!priceResult.success) {
      return NextResponse.json({ error: 'Failed to calculate price' }, { status: 500 })
    }

    const pricing = priceResult.data

    // Generate quote number
    const { data: quoteNumData } = await supabaseAdmin.rpc('generate_quote_number')
    const quoteNumber = quoteNumData || `TQ-${Date.now()}`

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + valid_days)

    const { data: quote, error } = await supabaseAdmin
      .from('tour_quotes')
      .insert({
        quote_number: quoteNumber,
        variation_id, partner_id, client_name, client_email, client_phone,
        client_nationality, travel_date, num_adults, num_children,
        services_snapshot: pricing.services,
        total_cost: pricing.total_cost,
        margin_percent: pricing.margin_percent,
        margin_amount: pricing.margin_amount,
        selling_price: pricing.selling_price,
        price_per_person: pricing.price_per_person,
        currency: 'EUR',
        status: 'draft',
        valid_until: validUntil.toISOString().split('T')[0],
        notes
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: quote }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}