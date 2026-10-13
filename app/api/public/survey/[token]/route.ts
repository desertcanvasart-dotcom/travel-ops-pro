// ============================================
// PUBLIC GUEST SURVEY API
// File: app/api/public/survey/[token]/route.ts
//
// The customer opens /survey/<token> with no login. GET loads the trip snapshot
// and whether anyone has answered yet; POST saves one guest's answers. Reachable
// by the unguessable token alone, so it uses the service-role client scoped to
// that single survey, and POST is rate-limited.
//
// The whole party shares the link, so each POST is its own response row
// (guest_survey_responses) — it used to overwrite the previous guest's answers —
// and GET never returns anyone's answers.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sanitizeResponses } from '@/lib/surveys/guest-survey'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'
import { clientMessage } from '@/lib/api-errors'
import { MAX_RESPONSES_PER_SURVEY, responseRow } from '@/lib/surveys/survey-responses'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const db = createServerClient()
    const { data, error } = await db
      .from('guest_surveys')
      .select('language, status, trip_snapshot')
      .eq('token', token)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Could not load survey') }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'Survey not found' }, { status: 404 })
    }
    return NextResponse.json({
      success: true,
      data: {
        language: data.language,
        // Someone in the party has answered. Not who, and not what: the next
        // guest on the same link starts from a blank form.
        submitted: data.status === 'submitted',
        trip: data.trip_snapshot ?? {},
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
      .select('id, org_id, status')
      .eq('token', token)
      .maybeSingle()
    if (findErr) {
      return NextResponse.json({ success: false, error: clientMessage(findErr, 'Could not save') }, { status: 500 })
    }
    if (!survey) {
      return NextResponse.json({ success: false, error: 'Survey not found' }, { status: 404 })
    }

    // A party is a handful of people; far more answers on one link is abuse.
    const { count, error: countErr } = await db
      .from('guest_survey_responses')
      .select('id', { count: 'exact', head: true })
      .eq('survey_id', survey.id)
    if (countErr) {
      return NextResponse.json({ success: false, error: clientMessage(countErr, 'Could not save') }, { status: 500 })
    }
    if ((count ?? 0) >= MAX_RESPONSES_PER_SURVEY) {
      return NextResponse.json({ success: false, error: 'This survey cannot take more answers' }, { status: 409 })
    }

    // This guest's answers, beside (never over) the others'.
    const now = new Date().toISOString()
    const { error: saveErr } = await db.from('guest_survey_responses').insert(responseRow(survey, responses, now))
    if (saveErr) {
      return NextResponse.json({ success: false, error: clientMessage(saveErr, 'Could not save') }, { status: 500 })
    }

    // The survey is answered; submitted_at is the first answer's time.
    if (survey.status !== 'submitted') {
      const { error: markErr } = await db
        .from('guest_surveys')
        .update({ status: 'submitted', submitted_at: now, updated_at: now })
        .eq('id', survey.id)
      if (markErr) console.error(`[survey] answer saved but survey ${survey.id} not marked submitted: ${markErr.message}`)
    }
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Could not save') }, { status: 500 })
  }
}
