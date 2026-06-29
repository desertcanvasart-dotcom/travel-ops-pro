import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

// GET /api/concierge-briefs
// List AI-Concierge planning briefs for the current org. Optional ?status= filter.
// Org-scoped (orgAuth + explicit .eq('org_id')); RLS via user_is_in_org is the backstop.
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
      .limit(200)

    if (status && status !== 'all') {
      query = query.eq('review_status', status)
    }

    const { data, error } = await query

    if (error) {
      // Table may not exist yet (migration not applied) — return empty rather than 500.
      console.error('Error fetching concierge briefs:', error.message)
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in concierge-briefs GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
