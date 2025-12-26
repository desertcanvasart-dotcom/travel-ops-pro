// app/api/rates/attractions/route.ts

import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from('entrance_fees')
      .select(`
        *,
        supplier:suppliers(id, name)
      `)
      .order('attraction_name', { ascending: true })
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching attractions:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attractions' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    
    // Generate service code if not provided
    if (!body.service_code) {
      const prefix = 'ENT'
      const random = Math.random().toString(36).substring(2, 8).toUpperCase()
      body.service_code = `${prefix}-${random}`
    }
    
    const { data, error } = await supabase
      .from('entrance_fees')
      .insert([{
        service_code: body.service_code,
        attraction_name: body.attraction_name,
        city: body.city,
        fee_type: body.fee_type || 'standard',
        eur_rate: body.eur_rate || 0,
        non_eur_rate: body.non_eur_rate || 0,
        egyptian_rate: body.egyptian_rate || null,
        student_discount_percentage: body.student_discount_percentage || null,
        child_discount_percent: body.child_discount_percent || null,
        season: body.season || 'all_year',
        rate_valid_from: body.rate_valid_from,
        rate_valid_to: body.rate_valid_to,
        category: body.category || null,
        notes: body.notes || null,
        is_active: body.is_active ?? true,
        supplier_id: body.supplier_id || null
      }])
      .select()
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error creating attraction:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create attraction' },
      { status: 500 }
    )
  }
}