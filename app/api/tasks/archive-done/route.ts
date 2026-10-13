import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { NOT_ARCHIVED } from '@/lib/tasks/summary'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - archive every done task of the organisation in one statement.
// "Archive Done" sent one PUT per done task in the loaded, filtered list, so
// with a priority or assignee filter on it archived only that slice (and
// nothing past the list cap), while it read — and the docs said — "every
// completed task". It is now the company's done tasks, whatever the filters.
export async function POST() {
  try {
    const denied = await requireRole(['admin', 'manager', 'agent'])
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({ archived: true, archived_at: now, updated_at: now })
      .eq('org_id', orgId)
      .eq('status', 'done')
      .or(NOT_ARCHIVED)
      .select('id')

    if (error) {
      console.error('Error archiving done tasks:', error)
      return NextResponse.json({ success: false, error: 'Failed to archive done tasks' }, { status: 500 })
    }

    return NextResponse.json({ success: true, archived: (data ?? []).length })
  } catch (error) {
    console.error('Error in tasks archive-done:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
