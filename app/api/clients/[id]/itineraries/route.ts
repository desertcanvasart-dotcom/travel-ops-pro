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

    // A trip belongs to a client by client_id — except that NO itinerary in this
    // system has ever had one set. They carry the client's name and email as
    // text, which is how the trip and the invoices for it were connected in
    // practice. Matching on the email as well means the booking history shows
    // the trips that exist, not the ones that were linked properly.
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('email')
      .eq('id', id)
      .maybeSingle()

    const email = (client as { email?: string } | null)?.email?.trim()

    const COLUMNS = 'id, itinerary_code, trip_name, status, start_date, end_date, num_adults, num_children, total_cost, currency, created_at'
    let query = supabaseAdmin
      .from('itineraries')
      // currency travels with total_cost: the amount is meaningless without it,
      // and this operator prices in yen.
      .select(COLUMNS)
      .order('created_at', { ascending: false })

    // Two queries rather than one .or() with the email interpolated into it:
    // a filter string built from stored data is the injection shape this
    // codebase already had to fix once (sanitizeSearchTerm, PR #14 era).
    const [byId, byEmail] = await Promise.all([
      query.eq('client_id', id),
      email
        ? supabaseAdmin.from('itineraries').select(COLUMNS).ilike('client_email', email)
        : Promise.resolve({ data: [], error: null }),
    ])

    const error = byId.error || byEmail.error
    const seen = new Set<string>()
    const data = [...(byId.data || []), ...(byEmail.data || [])]
      .filter(row => {
        const key = (row as { id: string }).id
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) =>
        String((b as { created_at?: string }).created_at ?? '').localeCompare(
          String((a as { created_at?: string }).created_at ?? '')
        )
      )

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
