// POST /api/b2c/quotes/[id]/revisions/revert — revert a B2C offer to a prior revision. Manager+.
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole, getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { parentQuoteInOrg, notFoundInOrg } from '@/lib/api/org-scope'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // The revert SQL updates by quote id alone: the quote must be this org's.
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    if (!(await parentQuoteInOrg(supabaseAdmin, 'b2c', id, orgId))) return notFoundInOrg('Quote')
    const role = await getCurrentUserRole()
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions. Requires manager role or higher.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const versionNumber = body.version_number
    if (!versionNumber) {
      return NextResponse.json({ success: false, error: 'version_number is required' }, { status: 400 })
    }

    // A booked quote is the price the booking was made at; reverting brought
    // back an older price the booking (and any re-send) then disagreed with.
    const { count: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('quote_id', id)
      .eq('quote_type', 'b2c')
    if ((bookings ?? 0) > 0) {
      return NextResponse.json({ success: false, error: 'A booked quote cannot be reverted' }, { status: 409 })
    }

    let userId: string | null = null
    try {
      const { createServerClient } = await import('@/lib/supabase-server')
      const { data } = await createServerClient().auth.getUser()
      userId = data?.user?.id ?? null
    } catch { /* changed_by stays null */ }

    const { data: newRevisionId, error } = await supabaseAdmin.rpc('revert_b2c_quote_to_revision', {
      p_quote_id: id,
      p_version_number: versionNumber,
      p_reverted_by: userId,
      p_revert_reason: body.revert_reason || 'Reverted to previous version',
    })

    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })

    const { data: updatedQuote } = await supabaseAdmin.from('b2c_quotes').select('*').eq('id', id).eq('org_id', orgId).single()

    return NextResponse.json({ success: true, message: `Quote reverted to version ${versionNumber}`, new_revision_id: newRevisionId, updated_quote: updatedQuote })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
