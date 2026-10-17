import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { listClientTrips } from '@/lib/clients/trips'

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
    // TENANT BOUNDARY. Service-role client: the client and every trip listed
    // must be this organisation's. The email match below used to search every
    // organisation's itineraries, so a customer who had also booked with
    // another operator showed that operator's trips and prices here.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // A trip belongs to a client by client_id — except that most itineraries in
    // this system carry the client's name and email as text, which is how the
    // trip and the invoices for it were connected in practice. Matching on the
    // email as well means the booking history shows the trips that exist, not
    // only the ones that were linked properly (lib/clients/trips).
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('email')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ data: [], error: 'Client not found' }, { status: 404 })
    }

    const { data, error } = await listClientTrips(
      supabaseAdmin, orgId, id, (client as { email?: string | null }).email)

    if (error) {
      console.error('Error fetching client itineraries:', error)
      return NextResponse.json({ data: [], error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/itineraries:', error)
    return NextResponse.json({ data: [], error: 'Internal server error' }, { status: 500 })
  }
}
