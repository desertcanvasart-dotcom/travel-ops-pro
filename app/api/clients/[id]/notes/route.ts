import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { pickNote } from '@/lib/clients/activity'
import { actorLabel, clientInOrg, clientNotFound } from '@/lib/clients/scope'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAFF = ['admin', 'manager', 'agent']

// Notes on one client of the ACTIVE company. The client page and its note
// modal used to read and write client_notes from the browser, picking the row
// by its id alone; here the client is checked against the company first, and
// a new note carries its author.

// GET - the client's notes, newest first
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const { data, error } = await supabaseAdmin
      .from('client_notes')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/notes:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST - add a note
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const picked = pickNote(await request.json(), 'create')
    if (!picked.ok) return NextResponse.json({ error: picked.error }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('client_notes')
      .insert({ ...picked.data, client_id: id, created_by: await actorLabel(supabaseAdmin, await getCurrentUserId()) })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/notes:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to save note') }, { status: 500 })
  }
}
