// ============================================
// PUBLIC GUEST SURVEY API
// File: app/api/public/survey/[token]/route.ts
//
// The customer opens /survey/<token> with no login. GET loads the trip snapshot
// and whether it was already submitted; POST saves their answers. Reachable by
// the unguessable token alone, so it uses the service-role client scoped to that
// single row, and POST is rate-limited.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sanitizeResponses } from '@/lib/surveys/guest-survey'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'
import { clientMessage } from '@/lib/api-errors'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const db = createServerClient()
    const { data, error } = await db
      .from('guest_surveys')
      .select('language, status, trip_snapshot, responses')
      .eq('token', token)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Could not load survey') }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'Survey not found' }, { status: 404 })
    }
    const submitted = data.status === 'submitted'
    return NextResponse.json({
      success: true,
      data: {
        language: data.language,
        submitted,
        trip: data.trip_snapshot ?? {},
        // Only echo answers back once submitted (so a returning customer sees
        // what they sent); an un-submitted survey starts blank.
        responses: submitted ? data.responses : undefined,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Could not load survey') }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const identifier = getClientIdentifier(request)
    const limit = checkRateLimit(`survey-submit:${identifier}`, 'api')
    if (!limit.success) return rateLimitResponse(limit)

    const { token } = await params
    const body = await request.json().catch(() => ({}))
    const responses = sanitizeResponses(body)

    const db = createServerClient()
    const { data: survey, error: findErr } = await db
      .from('guest_surveys')
      .select('id, status')
      .eq('token', token)
      .maybeSingle()
    if (findErr) {
      return NextResponse.json({ success: false, error: clientMessage(findErr, 'Could not save') }, { status: 500 })
    }
    if (!survey) {
      return NextResponse.json({ success: false, error: 'Survey not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const update: Record<string, unknown> = { responses, status: 'submitted', updated_at: now }
    // Set submitted_at once; a later edit keeps the original timestamp.
    if (survey.status !== 'submitted') update.submitted_at = now

    const { error: saveErr } = await db.from('guest_surveys').update(update).eq('token', token)
    if (saveErr) {
      return NextResponse.json({ success: false, error: clientMessage(saveErr, 'Could not save') }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Could not save') }, { status: 500 })
  }
}
