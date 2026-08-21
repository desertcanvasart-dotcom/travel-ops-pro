import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Get itineraries for a client (bypasses RLS)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('itineraries')
      // currency travels with total_cost: the amount is meaningless without it,
      // and this operator prices in yen.
      .select('id, itinerary_code, trip_name, status, start_date, end_date, num_adults, num_children, total_cost, currency, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching client itineraries:', error)
      return NextResponse.json({ data: [], error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/itineraries:', error)
    return NextResponse.json({ data: [], error: 'Internal server error' }, { status: 500 })
  }
}
