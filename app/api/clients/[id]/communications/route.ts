import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { COMMUNICATION_PAGE, COMMUNICATION_PAGE_MAX, pickCommunication } from '@/lib/clients/activity'
import { touchLastContact } from '@/lib/clients/last-contact'
import { actorLabel, clientInOrg, clientNotFound } from '@/lib/clients/scope'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAFF = ['admin', 'manager', 'agent']

// Logged communications of one client of the ACTIVE company. As with notes,
// the client page and its Log communication modal used to read and write
// communication_history from the browser by id alone, with no author.

// GET ?page=&limit= - newest first, with the exact total so the tab can say
// how many there are and page back through them.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const sp = new URL(request.url).searchParams
    const askedLimit = parseInt(sp.get('limit') || '', 10)
    const limit = Number.isFinite(askedLimit) ? Math.min(Math.max(askedLimit, 1), COMMUNICATION_PAGE_MAX) : COMMUNICATION_PAGE
    const askedPage = parseInt(sp.get('page') || '', 10)
    const page = Number.isFinite(askedPage) ? Math.max(askedPage, 1) : 1
    const from = (page - 1) * limit

    const { data, error, count } = await supabaseAdmin
      .from('communication_history')
      .select('*', { count: 'exact' })
      .eq('client_id', id)
      .order('communication_date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + limit - 1)
    // A page past the last one is an empty page.
    if (error && error.code !== 'PGRST103') throw error
    return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/communications:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}

// POST - log a communication; the client's last contact moves to it
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const picked = pickCommunication(await request.json(), 'create')
    if (!picked.ok) return NextResponse.json({ error: picked.error }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('communication_history')
      .insert({
        ...picked.data,
        client_id: id,
        handled_by: await actorLabel(supabaseAdmin, await getCurrentUserId()),
      })
      .select()
      .single()
    if (error) throw error

    await touchLastContact(supabaseAdmin, id, orgId, data)
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/clients/[id]/communications:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to save communication') }, { status: 500 })
  }
}
