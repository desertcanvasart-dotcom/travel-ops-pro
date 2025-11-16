import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    // Get ALL itineraries (no auth check for now)
    const { data, error } = await supabase
      .from('itineraries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    console.log('✅ Found itineraries:', data?.length || 0)

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}