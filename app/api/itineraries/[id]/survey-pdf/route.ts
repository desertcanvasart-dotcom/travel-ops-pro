// ============================================
// GET /api/itineraries/[id]/survey-pdf
// File: app/api/itineraries/[id]/survey-pdf/route.ts
//
// The printable guest questionnaire for one booking, with a QR that opens that
// booking's /survey/<token>. Get-or-creates the survey (status stays 'pending',
// so the end-of-trip cron still sends the invite) and stamps the QR onto the
// ATS template.
// ============================================

import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'
import { ensureSurvey } from '@/lib/surveys/ensure-survey'
import { stampSurveyQr } from '@/lib/surveys/survey-pdf'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net').replace(/\/$/, '')

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await orgAuth()
    if (auth.error) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const { supabase, org_id } = auth
    if (!supabase || !org_id) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const { id } = await params
    const { data: itinerary, error } = await supabase
      .from('itineraries')
      .select('id, org_id, itinerary_code, client_name, trip_name, start_date, end_date')
      .eq('id', id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (error) return NextResponse.json({ success: false, error: clientMessage(error, 'Could not load itinerary') }, { status: 500 })
    if (!itinerary) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

    const survey = await ensureSurvey(supabase, itinerary)
    const surveyUrl = `${APP_URL}/survey/${survey.token}`

    const template = await readFile(path.join(process.cwd(), 'public/survey/ats-questionnaire-template.pdf'))
    const bytes = await stampSurveyQr(template, surveyUrl)

    const filename = `survey-${itinerary.itinerary_code || itinerary.id}.pdf`
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: clientMessage(error, 'Could not generate survey PDF') }, { status: 500 })
  }
}
