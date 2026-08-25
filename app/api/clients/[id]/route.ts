import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { NextRequest, NextResponse } from 'next/server'

// Admin client that bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// TENANT BOUNDARY for every handler in this file.
//
// The client id is a UUID in the URL and this file runs on the service-role
// client, so before clients.org_id existed there was nothing at all stopping one
// organisation from reading, editing or deleting another's customer by id. Each
// handler now confirms the row belongs to the caller's org first, and answers a
// plain 404 when it does not — a 403 would confirm the id exists.
async function ownedClientId(id: string, orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  return !!data
}

function notFound() {
  return NextResponse.json({ error: 'Client not found' }, { status: 404 })
}

// GET single client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching client:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    if (!data) {
      return notFound()
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in GET /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update client
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()

    // Drop `id` (update conflicts) and `org_id` — a caller must not be able to
    // hand their customer to another organisation, or claim one from it.
    const { id: _, org_id: __, ...updateData } = body

    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error updating client:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    if (!data) {
      return notFound()
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PUT /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Partial update client
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()

    // Drop `id` (update conflicts) and `org_id` — a caller must not be able to
    // hand their customer to another organisation, or claim one from it.
    const { id: _, org_id: __, ...updateData } = body

    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error updating client:', error)
      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    if (!data) {
      return notFound()
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Helper: safely delete or unlink records from a table by client_id
async function cleanupTable(
  table: string,
  clientId: string,
  mode: 'delete' | 'unlink' = 'delete'
): Promise<void> {
  try {
    if (mode === 'unlink') {
      const { error } = await supabaseAdmin
        .from(table)
        .update({ client_id: null })
        .eq('client_id', clientId)
      if (error) {
        console.warn(`Could not unlink ${table}, trying delete:`, error.message)
        // Fallback to delete
        const { error: delErr } = await supabaseAdmin
          .from(table)
          .delete()
          .eq('client_id', clientId)
        if (delErr) console.warn(`Could not delete ${table}:`, delErr.message)
      }
    } else {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq('client_id', clientId)
      if (error) console.warn(`Could not delete from ${table}:`, error.message)
    }
  } catch (e) {
    // Table may not exist — ignore
    console.warn(`Cleanup ${table} skipped:`, e)
  }
}

// DELETE - Delete client
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Ownership FIRST: everything below this point deletes, and it used to run
    // on nothing but an id from the URL.
    if (!(await ownedClientId(id, orgId))) return notFound()

    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    // Check for itineraries
    const { data: itineraries } = await supabaseAdmin
      .from('itineraries')
      .select('id, itinerary_code, trip_name')
      .eq('client_id', id)

    if (itineraries && itineraries.length > 0) {
      if (!force) {
        return NextResponse.json(
          {
            error: `Cannot delete client: ${itineraries.length} itinerary/itineraries found. Use force delete to remove them.`,
            blocking: 'itineraries',
            count: itineraries.length,
            items: itineraries.map(i => ({ id: i.id, code: i.itinerary_code, name: i.trip_name }))
          },
          { status: 400 }
        )
      }

      // Force: cascade delete itineraries (and their related data)
      for (const itin of itineraries) {
        // Delete itinerary days & services
        const { data: days } = await supabaseAdmin
          .from('itinerary_days')
          .select('id')
          .eq('itinerary_id', itin.id)

        // Each step is checked: these used to be fire-and-forget, and the
        // services delete filtered on `day_id` — a column that does not exist
        // (it is `itinerary_day_id`) — so it failed with 42703 every time, the
        // day delete then hit the services' FK, and the cascade left the trip's
        // days and services behind while reporting the client deleted.
        const step = async (label: string, q: PromiseLike<{ error: { message: string } | null }>) => {
          const { error } = await q
          if (error) throw new Error(`force delete: ${label} — ${error.message}`)
        }
        if (days && days.length > 0) {
          const dayIds = days.map(d => d.id)
          await step('trip services', supabaseAdmin.from('itinerary_services').delete().in('itinerary_day_id', dayIds))
          await step('day versions', supabaseAdmin.from('itinerary_day_versions').delete().in('itinerary_day_id', dayIds))
        }
        await step('trip days', supabaseAdmin.from('itinerary_days').delete().eq('itinerary_id', itin.id))
        await step('trip versions', supabaseAdmin.from('itinerary_versions').delete().eq('itinerary_id', itin.id))

        // Detach bookings from this itinerary
        await supabaseAdmin.from('bookings').delete().eq('itinerary_id', itin.id)

        // Detach quotes
        await supabaseAdmin
          .from('tour_quotes')
          .update({ itinerary_id: null })
          .eq('itinerary_id', itin.id)
          .not('variation_id', 'is', null)
        // Already transitively ours — the client was org-verified above and
        // these are its itineraries — but the filter costs nothing and means
        // this line reads safely on its own.
        await supabaseAdmin.from('tour_quotes').delete().eq('itinerary_id', itin.id).eq('org_id', orgId)

        // Delete the itinerary itself
        await step('trip', supabaseAdmin.from('itineraries').delete().eq('id', itin.id))
      }
    }

    // Check for invoices
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('client_id', id)
      .limit(1)

    if (invoices && invoices.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete client with existing invoices. Please delete or reassign invoices first.', blocking: 'invoices' },
        { status: 400 }
      )
    }

    // Clean up WhatsApp: delete messages first, then conversations
    const { data: waConvs } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id')
      .eq('client_id', id)

    if (waConvs && waConvs.length > 0) {
      await supabaseAdmin
        .from('whatsapp_messages')
        .delete()
        .in('conversation_id', waConvs.map(c => c.id))
    }

    // Clean up email: delete messages first, then conversations
    const { data: emailConvs } = await supabaseAdmin
      .from('email_conversations')
      .select('id')
      .eq('client_id', id)

    if (emailConvs && emailConvs.length > 0) {
      await supabaseAdmin
        .from('email_messages')
        .delete()
        .in('conversation_id', emailConvs.map(c => c.id))
    }

    // Clean up all related tables (delete or unlink as appropriate)
    // These run in parallel for speed — each is independent
    await Promise.allSettled([
      cleanupTable('follow_ups', id),
      cleanupTable('whatsapp_conversations', id),
      cleanupTable('email_conversations', id),
      cleanupTable('client_preferences', id),
      cleanupTable('client_notes', id),
      cleanupTable('commissions', id, 'unlink'),
      cleanupTable('template_send_log', id, 'unlink'),
    ])

    // Now delete the client
    const { error } = await supabaseAdmin
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting client:', error)

      // If there's STILL a FK constraint, log the detail for debugging
      if (error.code === '23503') {
        const detail = error.details || error.message
        console.error('FK constraint detail:', detail)
        return NextResponse.json(
          { error: `Cannot delete client: a related record still exists. Detail: ${detail}` },
          { status: 400 }
        )
      }

      return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Client deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}