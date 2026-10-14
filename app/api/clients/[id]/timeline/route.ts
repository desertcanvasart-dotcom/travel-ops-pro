import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { listClientTrips } from '@/lib/clients/trips'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PER_KIND = 200

// GET - everything the client's timeline shows, from the ACTIVE company:
// the client's creation, communications, trips, notes and follow-ups.
//
// The timeline read itineraries by client_id only — so it disagreed with the
// Bookings tab, which also matches trips carrying the client's email — and
// took every column of the trip (costs and margins) into the browser. Trips
// come from the same function as the Bookings tab now, with the columns a
// client page needs.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(['admin', 'manager', 'agent'])
    if (denied) return denied
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('created_at, first_name, last_name, email')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const [communications, trips, notes, followups] = await Promise.all([
      supabaseAdmin.from('communication_history').select('*').eq('client_id', id)
        .order('communication_date', { ascending: false }).limit(PER_KIND),
      listClientTrips(supabaseAdmin, orgId, id, (client as { email?: string | null }).email),
      supabaseAdmin.from('client_notes').select('*').eq('client_id', id)
        .order('created_at', { ascending: false }).limit(PER_KIND),
      supabaseAdmin.from('client_followups').select('*').eq('client_id', id)
        .order('due_date', { ascending: false }).limit(PER_KIND),
    ])
    const error = communications.error || trips.error || notes.error || followups.error
    if (error) throw error

    return NextResponse.json({
      client: { created_at: client.created_at, first_name: client.first_name, last_name: client.last_name },
      communications: communications.data ?? [],
      trips: trips.data,
      notes: notes.data ?? [],
      followups: followups.data ?? [],
    })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/timeline:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
