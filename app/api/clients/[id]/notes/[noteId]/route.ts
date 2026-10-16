import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { pickNote } from '@/lib/clients/activity'
import { clientInOrg, clientNotFound } from '@/lib/clients/scope'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STAFF = ['admin', 'manager', 'agent']
type Ctx = { params: Promise<{ id: string; noteId: string }> }

// The note must belong to THIS client, and the client to the active company:
// an id from another client or another company is a plain 404.

// PATCH - edit a note (its text, type and importance; the author stays)
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const { id, noteId } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const picked = pickNote(await request.json(), 'update')
    if (!picked.ok) return NextResponse.json({ error: picked.error }, { status: 400 })
    if (Object.keys(picked.data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('client_notes')
      .update(picked.data)
      .eq('id', noteId)
      .eq('client_id', id)
      .select()
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]/notes/[noteId]:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to save note') }, { status: 500 })
  }
}

// DELETE - remove a note
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const { id, noteId } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const { data, error } = await supabaseAdmin
      .from('client_notes')
      .delete()
      .eq('id', noteId)
      .eq('client_id', id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]/notes/[noteId]:', error)
    return NextResponse.json({ error: clientMessage(error, 'Failed to delete note') }, { status: 500 })
  }
}
