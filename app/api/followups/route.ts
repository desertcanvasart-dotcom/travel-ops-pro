import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { recordsInOrg } from '@/lib/org-refs'
import { shiftDateISO, todayFromRequest } from '@/lib/today'
import { FOLLOWUP_LIST_LIMIT, followupFieldsError, followupTitle, isISODate } from '@/lib/followups'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Follow-ups of the ACTIVE company only (see lib/followups). Served here on
// the membership role, not from the browser: the table's RLS reads clients,
// whose policy checks user_profiles.role — the role of the person's FIRST
// company — so an agent whose first company made them a viewer saw an empty
// page. The role here is the active company's (requireRole).
const STAFF = ['admin', 'manager', 'agent']

const LIST_FIELDS = `
  id, client_id, followup_type, title, description, due_date, priority, status, created_at,
  clients!inner(id, client_code, first_name, last_name, email, phone, org_id)
`

type Row = { clients?: unknown } & Record<string, unknown>
const withClient = ({ clients, ...rest }: Row) => ({ ...rest, client: clients ?? null })

// GET - pending follow-ups, soonest first, plus the dashboard cards counted by
// the database. ?from=YYYY-MM-DD lists only those due on or after that day;
// ?limit=N lists fewer (the main dashboard's "upcoming five").
export async function GET(request: NextRequest) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { searchParams } = new URL(request.url)
    const today = todayFromRequest(request.url)
    const from = searchParams.get('from')
    const asked = Number(searchParams.get('limit'))
    const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, FOLLOWUP_LIST_LIMIT) : FOLLOWUP_LIST_LIMIT

    let query = supabaseAdmin
      .from('client_followups')
      .select(LIST_FIELDS, { count: 'exact' })
      .eq('clients.org_id', orgId)
      .eq('status', 'pending')
    if (isISODate(from)) query = query.gte('due_date', from)
    const { data, error, count } = await query.order('due_date', { ascending: true }).limit(limit)
    if (error) throw error

    // Each card is a count-only query over every pending follow-up of the
    // company, not a count of the rows that happened to load.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pending = async (narrow: (q: any) => any = q => q) => {
      const { count: n, error: countError } = await narrow(
        supabaseAdmin
          .from('client_followups')
          .select('id, clients!inner(org_id)', { count: 'exact', head: true })
          .eq('clients.org_id', orgId)
          .eq('status', 'pending')
      )
      if (countError) throw countError
      return n ?? 0
    }
    const [dueToday, week, overdue, total] = await Promise.all([
      pending(q => q.eq('due_date', today)),
      pending(q => q.gte('due_date', today).lte('due_date', shiftDateISO(today, 7))),
      pending(q => q.lt('due_date', today)),
      pending(),
    ])

    return NextResponse.json({
      success: true,
      data: ((data ?? []) as Row[]).map(withClient),
      matched: count ?? (data ?? []).length,
      counts: { today: dueToday, week, overdue, total },
    })
  } catch (error) {
    console.error('Error listing follow-ups:', error)
    return NextResponse.json({ success: false, error: 'Failed to load follow-ups' }, { status: 500 })
  }
}

// POST - schedule a follow-up for one of the company's clients. The person
// who schedules it is its owner (assigned_to): the task-reminders cron gives
// them an in-app reminder on the due date.
export async function POST(request: NextRequest) {
  try {
    const denied = await requireRole(STAFF)
    if (denied) return denied
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()
    const userId = await getCurrentUserId()
    const body = await request.json().catch(() => ({}))

    if (typeof body.client_id !== 'string' || !body.client_id) {
      return NextResponse.json({ success: false, error: 'client_id is required' }, { status: 400 })
    }
    if (!(await recordsInOrg(supabaseAdmin, orgId, { client_id: body.client_id }))) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }
    const invalid = followupFieldsError(body, true)
    if (invalid) return NextResponse.json({ success: false, error: invalid }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('client_followups')
      .insert({
        client_id: body.client_id,
        title: followupTitle(body),
        followup_type: body.followup_type,
        due_date: body.due_date,
        priority: body.priority ?? 'medium',
        status: 'pending',
        description: typeof body.description === 'string' && body.description.trim() ? body.description : null,
        assigned_to: userId,
      })
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error creating follow-up:', error)
    return NextResponse.json({ success: false, error: 'Failed to save follow-up' }, { status: 500 })
  }
}
