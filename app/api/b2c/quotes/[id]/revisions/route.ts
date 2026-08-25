// GET /api/b2c/quotes/[id]/revisions — revision history of a B2C offer.
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { parentQuoteInOrg, notFoundInOrg } from '@/lib/api/org-scope'
import { clientMessage } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    // quote_revisions carries no org_id; scope through the parent b2c quote.
    if (!(await parentQuoteInOrg(supabaseAdmin, 'b2c', id, orgId))) return notFoundInOrg('Quote')

    const { data: revisions, error } = await supabaseAdmin
      .from('quote_revisions')
      .select('id, version_number, is_current, changed_by, changed_at, change_reason, change_summary, changes_diff')
      .eq('quote_type', 'b2c')
      .eq('quote_id', id)
      .order('version_number', { ascending: false })

    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })

    const userIds = [...new Set((revisions || []).map((r: any) => r.changed_by).filter(Boolean))]
    let emails: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email, full_name')
        .in('id', userIds)
      emails = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.email || p.full_name || '']))
    }

    const withEditor = (revisions || []).map((r: any) => ({
      ...r,
      changed_by_email: r.changed_by ? emails[r.changed_by] || null : null,
    }))

    return NextResponse.json({ success: true, revisions: withEditor, total_revisions: withEditor.length })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Internal server error') }, { status: 500 })
  }
}
