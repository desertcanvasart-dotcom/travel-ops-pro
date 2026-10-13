import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

// The list is the newest LIST_LIMIT briefs. The tab counts used to be counted
// from those rows, so past the cap they were silently low; they are counted
// in the database now, and `total` lets the page say the list is capped.
const LIST_LIMIT = 200
const REVIEW_STATUSES = ['needs_review', 'in_progress', 'responded', 'archived'] as const

// GET /api/concierge-briefs
// List AI-Concierge planning briefs for the current org. Optional ?status= filter.
// Org-scoped (orgAuth + explicit .eq('org_id')); RLS via user_is_in_org is the backstop.
// Returns { data, counts: { <review_status>: n }, total, limit }.
export async function GET(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Not authenticated' }, { status: auth.status })
    }
    const { supabase, org_id } = auth

    const status = new URL(request.url).searchParams.get('status')

    let query = supabase
      .from('concierge_briefs')
      .select(
        'id, conversation_id, brief_revision, language, visitor_name, visitor_email, ' +
        'visitor_phone, preferred_contact, travelers_count, travelers_detail, dates_specific, ' +
        'dates_window, trip_length_days, origin_city, nationality, destinations, comfort_level, ' +
        'interests, must_see, must_avoid, brief_summary, constraint_dietary, constraint_mobility, ' +
        'constraint_religious, constraint_medical, review_status, is_actionable, flags, client_id, ' +
        'received_at, committed_response_by'
      )
      .eq('org_id', org_id)
      .order('received_at', { ascending: false })
      .limit(LIST_LIMIT)

    if (status && status !== 'all') {
      query = query.eq('review_status', status)
    }

    const countFor = (reviewStatus?: string) => {
      let q = supabase.from('concierge_briefs').select('id', { count: 'exact', head: true }).eq('org_id', org_id)
      if (reviewStatus) q = q.eq('review_status', reviewStatus)
      return q
    }
    const [{ data, error }, totalRes, ...statusRes] = await Promise.all([
      query,
      countFor(),
      ...REVIEW_STATUSES.map(s => countFor(s)),
    ])

    // A failed read is an error, not an empty inbox (it used to answer
    // success with no rows, which looked like "no leads").
    const failed = error || totalRes.error || statusRes.find(r => r.error)?.error
    if (failed) {
      console.error('Error fetching concierge briefs:', failed.message)
      return NextResponse.json({ success: false, error: 'Could not load concierge briefs' }, { status: 500 })
    }

    const counts: Record<string, number> = {}
    REVIEW_STATUSES.forEach((s, i) => { counts[s] = statusRes[i].count ?? 0 })

    return NextResponse.json({ success: true, data: data || [], counts, total: totalRes.count ?? 0, limit: LIST_LIMIT })
  } catch (error) {
    console.error('Error in concierge-briefs GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
