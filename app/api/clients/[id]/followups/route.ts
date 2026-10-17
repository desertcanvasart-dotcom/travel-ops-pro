import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { clientMessage } from '@/lib/api-errors'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { clientInOrg, clientNotFound } from '@/lib/clients/scope'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - the follow-ups of one client of the ACTIVE company, soonest first.
// (Creating, editing and completing them goes through /api/followups.) The
// client page read client_followups from the browser, whose RLS judges the
// role of the person's FIRST company, not the active one.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireRole(['admin', 'manager', 'agent'])
    if (denied) return denied
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await clientInOrg(supabaseAdmin, id, orgId))) return clientNotFound()

    const { data, error } = await supabaseAdmin
      .from('client_followups')
      .select('*')
      .eq('client_id', id)
      .order('due_date', { ascending: true })
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (error) {
    console.error('Error in GET /api/clients/[id]/followups:', error)
    return NextResponse.json({ error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
