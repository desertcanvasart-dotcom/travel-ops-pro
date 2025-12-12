import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all profiles (team members)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'
    const role = searchParams.get('role')

    let query = supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (role) {
      query = query.eq('role', role)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error fetching profiles:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profiles' },
      { status: 500 }
    )
  }
}