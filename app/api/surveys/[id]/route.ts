// ============================================
// DELETE /api/surveys/[id] — remove an unanswered guest survey
// ============================================
// A survey nobody answered can go: a test trip's, or one whose trip was
// deleted (itinerary_id is SET NULL then, and the daily invite job never
// sends it, so it stayed "Pending" for good — operator, 2026-10-19). One with
// answers is refused: guests' answers are not thrown away from here.
// Managers and above (middleware: /api/surveys).

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await orgAuth()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, org_id } = auth
    if (!supabase || !org_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })
    const { id } = await params

    const { count, error: countError } = await supabase
      .from('guest_survey_responses')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .eq('survey_id', id)
    if (countError) throw countError
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { success: false, error: 'This survey has guest answers and cannot be deleted.' },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('guest_surveys')
      .delete()
      .eq('id', id)
      .eq('org_id', org_id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ success: false, error: 'Survey not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/surveys/[id]:', error)
    return NextResponse.json({ success: false, error: clientMessage(error, 'Could not delete the survey') }, { status: 500 })
  }
}
