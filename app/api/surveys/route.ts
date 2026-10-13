// ============================================
// SURVEYS API (staff)
// File: app/api/surveys/route.ts
//
// Lists the org's guest surveys, newest first, a page at a time (?page=, 50 to
// a page — it used to stop silently at 300), each with every guest's answers
// (guest_survey_responses: one row per guest, 20261216). Also says whether the
// org surveys its guests at all: only an org with the guest questionnaire
// template (lib/documents/org-templates) gets surveys, and for any other the
// list is empty for good, not "yet".
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'
import { orgHasDocumentTemplate } from '@/lib/documents/org-templates'
import {
  SURVEY_PAGE_SIZE, attachResponses, surveyPageParam, type StoredSurveyResponse,
} from '@/lib/surveys/survey-responses'

export async function GET(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, org_id } = auth
    if (!supabase || !org_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const page = surveyPageParam(new URL(request.url).searchParams.get('page'))
    const from = (page - 1) * SURVEY_PAGE_SIZE

    const { data, error, count } = await supabase
      .from('guest_surveys')
      .select('id, token, status, trip_snapshot, sent_email, sent_whatsapp, sent_at, submitted_at, created_at', { count: 'exact' })
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .range(from, from + SURVEY_PAGE_SIZE - 1)
    if (error) {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Could not load surveys') }, { status: 500 })
    }
    const surveys = data ?? []

    let responses: StoredSurveyResponse[] = []
    if (surveys.length > 0) {
      const { data: rows, error: respErr } = await supabase
        .from('guest_survey_responses')
        .select('id, survey_id, respondent_name, answers, submitted_at')
        .eq('org_id', org_id)
        .in('survey_id', surveys.map(s => s.id))
      if (respErr) {
        return NextResponse.json({ success: false, error: clientMessage(respErr, 'Could not load surveys') }, { status: 500 })
      }
      responses = (rows ?? []) as StoredSurveyResponse[]
    }

    // A failed read says nothing (null) rather than "not enabled".
    let enabled: boolean | null = null
    try {
      enabled = await orgHasDocumentTemplate(supabase, org_id, 'ats-questionnaire')
    } catch (e) {
      console.error('[surveys] could not read document templates:', e)
    }

    return NextResponse.json({
      success: true,
      data: attachResponses(surveys, responses),
      total: count ?? surveys.length,
      page,
      pageSize: SURVEY_PAGE_SIZE,
      enabled,
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Could not load surveys') }, { status: 500 })
  }
}
