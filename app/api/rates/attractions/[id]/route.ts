// app/api/rates/attractions/[id]/route.ts

import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    
    const { data, error } = await supabase
      .from('entrance_fees')
      .select(`
        *,
        supplier:suppliers(id, name)
      `)
      .eq('id', id)
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching attraction:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attraction' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    const body = await request.json()
    
    const { data, error } = await supabase
      .from('entrance_fees')
      .update({
        service_code: body.service_code,
        attraction_name: body.attraction_name,
        city: body.city,
        fee_type: body.fee_type,
        eur_rate: body.eur_rate,
        non_eur_rate: body.non_eur_rate,
        egyptian_rate: body.egyptian_rate || null,
        student_discount_percentage: body.student_discount_percentage || null,
        child_discount_percent: body.child_discount_percent || null,
        season: body.season,
        rate_valid_from: body.rate_valid_from,
        rate_valid_to: body.rate_valid_to,
        category: body.category || null,
        notes: body.notes || null,
        is_active: body.is_active,
        supplier_id: body.supplier_id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('Error updating attraction:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update attraction' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { id } = await params
    
    const { error } = await supabase
      .from('entrance_fees')
      .delete()
      .eq('id', id)
    
    if (error) throw error
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting attraction:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete attraction' },
      { status: 500 }
    )
  }
}