// POST /api/b2c/quotes/[id]/revisions/revert — revert a B2C offer to a prior revision. Manager+.
import { createClient } from '@supabase/supabase-js'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserRole } from '@/lib/auth/current-org'

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
    const role = await getCurrentUserRole()
    if (!role || !['owner', 'admin', 'manager'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions. Requires manager role or higher.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const versionNumber = body.version_number
    if (!versionNumber) {
      return NextResponse.json({ success: false, error: 'version_number is required' }, { status: 400 })
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

    const { data: updatedQuote } = await supabaseAdmin.from('b2c_quotes').select('*').eq('id', id).single()

    return NextResponse.json({ success: true, message: `Quote reverted to version ${versionNumber}`, new_revision_id: newRevisionId, updated_quote: updatedQuote })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
