import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { pickCommunication } from '@/lib/clients/activity'
import { touchLastContact } from '@/lib/clients/last-contact'
import { clientInOrg, clientNotFound } from '@/lib/clients/scope'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAFF = ['admin', 'manager', 'agent']
type Ctx = { params: Promise<{ id: string; commId: string }> }

// The communication must belong to THIS client, and the client to the active
// company: an id from another client or company is a plain 404.

// PATCH - edit a logged communication (the person who logged it stays)
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const { id, commId } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const picked = pickCommunication(await request.json(), 'update')
    if (!picked.ok) return NextResponse.json({ error: picked.error }, { status: 400 })
    if (Object.keys(picked.data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('communication_history')
      .update(picked.data)
      .eq('id', commId)
      .eq('client_id', id)
      .select()
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Communication not found' }, { status: 404 })

    await touchLastContact(supabaseAdmin, id, orgId, data)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]/communications/[commId]:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to save communication') }, { status: 500 })
  }
}

// DELETE - remove a logged communication
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const { id, commId } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const { data, error } = await supabaseAdmin
      .from('communication_history')
      .delete()
      .eq('id', commId)
      .eq('client_id', id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Communication not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]/communications/[commId]:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to delete communication') }, { status: 500 })
  }
}
