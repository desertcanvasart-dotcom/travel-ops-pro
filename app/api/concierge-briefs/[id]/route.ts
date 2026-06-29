import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

const ALLOWED_STATUSES = ['needs_review', 'in_progress', 'responded', 'archived'] as const

// GET /api/concierge-briefs/[id]
// Full brief including full_transcript (org-scoped).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Not authenticated' }, { status: auth.status })
    }
    const { supabase, org_id } = auth

    const { data, error } = await supabase
      .from('concierge_briefs')
      .select('*')
      .eq('id', id)
      .eq('org_id', org_id)
      .single()

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Brief not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in concierge-brief GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/concierge-briefs/[id]
// Triage action: update a brief's review_status (org-scoped).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error || 'Not authenticated' }, { status: auth.status })
    }
    const { supabase, org_id } = auth

    const body = await request.json()
    const reviewStatus = body.review_status

    if (!ALLOWED_STATUSES.includes(reviewStatus)) {
      return NextResponse.json(
        { success: false, error: `review_status must be one of: ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('concierge_briefs')
      .update({ review_status: reviewStatus })
      .eq('id', id)
      .eq('org_id', org_id)
      .select('id, review_status')
      .single()

    if (error || !data) {
      console.error('Error updating concierge brief:', error?.message)
      return NextResponse.json({ success: false, error: 'Failed to update brief' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in concierge-briefs PATCH:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
