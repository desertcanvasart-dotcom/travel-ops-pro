// ============================================
// CRON: guest survey invites
// File: app/api/cron/survey-invites/route.ts
//
// Once a day, for every itinerary that ENDS today (the day the party lands back
// in Japan), mint a survey token and send the /survey/<token> link by email and
// WhatsApp — the Japanese invitation. Idempotent: the unique index on
// guest_surveys.itinerary_id means a re-run never double-creates, and an
// itinerary already surveyed is skipped.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { sendEmailInternal } from '@/lib/email-send'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { businessIdentity } from '@/lib/org-identity'
import { todayLocal } from '@/lib/today'
import { ensureSurvey } from '@/lib/surveys/ensure-survey'

const CRON_SECRET = process.env.CRON_SECRET
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net').replace(/\/$/, '')
/** How many days (today included) an unsent survey keeps being retried. */
const RETRY_DAYS = 3

/** The Japanese invitation. The office can reword this in the message-templates
 *  store later; kept here so the job always has a working default. */
function invitation(brandName: string, guest: string, link: string): { subject: string; text: string; html: string } {
  const subject = `【${brandName}】ご旅行アンケートのお願い`
  const text =
    `${guest || 'お客'}様\n\n` +
    `この度は${brandName}のツアーにご参加いただき、誠にありがとうございました。\n` +
    `今後のサービス向上のため、アンケートにご協力くださいますようお願い申し上げます（数分で完了します）。\n\n` +
    `▼ こちらからご回答ください\n${link}\n\n` +
    `何卒よろしくお願い申し上げます。\n${brandName}`
  const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
    .replace(link.replace(/&/g, '&amp;'), `<a href="${link}">${link}</a>`)
  return { subject, text, html }
}

async function getHandler(request: NextRequest): Promise<Response> {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const today = todayLocal()
  const brand = businessIdentity()

  // Itineraries that ended in the last RETRY_DAYS days (today included) and
  // represent a real trip. Today's trips get their first invite; a survey from
  // an earlier day that is still 'pending' is one whose send failed (or that had
  // no contact yet), so it gets another try instead of being lost.
  const since = new Date(`${today}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - (RETRY_DAYS - 1))
  const { data: itineraries, error } = await db
    .from('itineraries')
    .select('id, org_id, itinerary_code, client_name, client_email, client_phone, trip_name, start_date, end_date, status')
    .gte('end_date', since.toISOString().slice(0, 10))
    .lte('end_date', today)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  let sent = 0
  let email = 0
  let whatsapp = 0
  let failed = 0
  let skipped = 0

  for (const it of itineraries ?? []) {
    if (['draft', 'cancelled'].includes(String(it.status ?? ''))) {
      skipped++
      continue
    }
    // Get or create the survey (a sheet printed earlier may already have made
    // it). Only a survey still 'pending' gets an invite — one already sent, or
    // already submitted by the guest during the trip, is left alone.
    let survey
    try {
      survey = await ensureSurvey(db, it)
    } catch {
      skipped++
      continue
    }
    if (survey.status !== 'pending') {
      skipped++
      continue
    }
    const link = `${APP_URL}/survey/${survey.token}`
    const msg = invitation(brand.name, it.client_name ?? '', link)
    let sentEmail = false
    let sentWa = false
    if (it.client_email) {
      const r = await sendEmailInternal({ to: it.client_email, subject: msg.subject, html: msg.html })
      sentEmail = r.success
      if (sentEmail) email++
    }
    if (it.client_phone) {
      // sendWhatsAppMessage catches its own errors and returns { success } —
      // it never throws, so a try/catch here would count every failure as sent.
      const r = await sendWhatsAppMessage({ to: it.client_phone, body: msg.text })
      sentWa = r.success
      if (sentWa) whatsapp++
    }

    // Nothing went out: leave the survey 'pending' so the next run retries it
    // (within RETRY_DAYS) and the staff view shows it as not sent.
    if (!sentEmail && !sentWa) {
      failed++
      continue
    }

    const { error: updErr } = await db
      .from('guest_surveys')
      .update({ status: 'sent', sent_email: sentEmail, sent_whatsapp: sentWa, sent_at: new Date().toISOString() })
      .eq('id', survey.id)
    if (updErr) {
      // The invite went out but we could not record it; report it rather than
      // pretend. The next run would resend (still 'pending') — surface it.
      console.error(`[survey-invites] sent but could not mark survey ${survey.id}: ${updErr.message}`)
      failed++
      continue
    }
    sent++
  }

  return NextResponse.json({ success: true, sent, email, whatsapp, failed, skipped })
}

export const GET = withJobRun('survey-invites', () => createServerClient(), getHandler)
