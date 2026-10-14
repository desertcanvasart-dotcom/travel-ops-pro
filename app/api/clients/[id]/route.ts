import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { NextRequest, NextResponse } from 'next/server'
import { pickClientFields } from '@/lib/clients/fields'
import { clientInOrg, clientNotFound } from '@/lib/clients/scope'
import { countClientAttachments, isDeletable, refusalMessage } from '@/lib/clients/delete-guard'

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
const ownedClientId = (id: string, orgId: string) => clientInOrg(supabaseAdmin, id, orgId)

/** null/absent clears or leaves it; any id given must be a client of this org. */
async function referrerInOrg(ref: unknown, orgId: string): Promise<boolean> {
  if (ref === undefined || ref === null || ref === '') return true
  if (typeof ref !== 'string') return false
  return ownedClientId(ref, orgId)
}

const notFound = clientNotFound

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

// PUT and PATCH write the same thing: the columns the Edit client and New
// client forms write (lib/clients/fields), for the keys that were sent. Never
// client_code, the revenue and booking counters, created_by or org_id — those
// are the database's — and a status only if it is one the database allows.
async function updateClient(
  request: NextRequest,
  params: Promise<{ id: string }>,
  verb: 'PUT' | 'PATCH',
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json()
    const picked = pickClientFields(body, 'update')
    if (!picked.ok) return NextResponse.json({ error: picked.error }, { status: 400 })
    if (Object.keys(picked.data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    // A referrer is another client by id — it must be one of ours (and not itself).
    const referrer = picked.data.referred_by_client_id
    if (referrer === id || !(await referrerInOrg(referrer, orgId))) {
      return NextResponse.json({ error: 'Referring client not found' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(picked.data)
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
    console.error(`Error in ${verb} /api/clients/[id]:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update client
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return updateClient(request, params, 'PUT')
}

// PATCH - Partial update client
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return updateClient(request, params, 'PATCH')
}

// DELETE - Delete a client that has nothing attached.
//
// Managers and admins only (the owner always): the database reserves deleting
// a client to managers too (clients_org_delete), and this route runs on the
// service role, which would otherwise let an agent do what their own session
// cannot. A client with trips, bookings, invoices, payments, conversations or
// documents is refused with 409 and the counts; there is no force option. The
// client's notes, follow-ups, logged communications, preferences and contacts
// are its own and go with it.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireRole(['admin', 'manager'])
    if (denied) return denied

    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    // Ownership FIRST: everything below this point deletes.
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('id, email')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle()
    if (!client) return notFound()

    const counts = await countClientAttachments(supabaseAdmin, orgId, id, (client as { email?: string | null }).email)
    if (!isDeletable(counts)) {
      return NextResponse.json(
        { error: refusalMessage(counts), blocking: 'attached', counts },
        { status: 409 }
      )
    }

    // template_send_log.client_id has no ON DELETE: its rows are a log of what
    // was sent and stay, detached.
    const { error: logError } = await supabaseAdmin
      .from('template_send_log')
      .update({ client_id: null })
      .eq('client_id', id)
    if (logError) throw logError

    const { error } = await supabaseAdmin
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId)

    if (error) {
      console.error('Error deleting client:', error)

      // A reference made between the check above and now.
      if (error.code === '23503') {
        return NextResponse.json(
          { error: 'This client cannot be deleted: something was just attached to it. Mark the client inactive instead.' },
          { status: 409 }
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
