// app/api/cruises/route.ts

import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    
    const isActive = searchParams.get('is_active')
    
    let query = supabase
      .from('cruise_contacts')
      .select('*')
      .order('name', { ascending: true })
    
    if (isActive === 'true') {
      query = query.eq('is_active', true)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error fetching cruises:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cruises' },
      { status: 500 }
    )
  }
}