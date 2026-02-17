import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('id, name, description, service_types, is_active')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Error fetching departments:', error)
      return NextResponse.json({ success: false, error: 'Failed to fetch departments' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in departments GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
