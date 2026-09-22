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
import { randomBytes } from 'node:crypto'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { sendEmailInternal } from '@/lib/email-send'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { businessIdentity } from '@/lib/org-identity'
import { todayLocal } from '@/lib/today'

const CRON_SECRET = process.env.CRON_SECRET
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net').replace(/\/$/, '')

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

  // Itineraries that end today and represent a real trip (not a draft/cancelled).
  const { data: itineraries, error } = await db
    .from('itineraries')
    .select('id, org_id, itinerary_code, client_name, client_email, client_phone, trip_name, start_date, end_date, status')
    .eq('end_date', today)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  let created = 0
  let email = 0
  let whatsapp = 0
  let skipped = 0

  for (const it of itineraries ?? []) {
    if (['draft', 'cancelled'].includes(String(it.status ?? ''))) {
      skipped++
      continue
    }
    // Skip if this itinerary already has a survey (also guarded by the DB index).
    const { data: existing } = await db.from('guest_surveys').select('id').eq('itinerary_id', it.id).maybeSingle()
    if (existing) {
      skipped++
      continue
    }

    const token = randomBytes(24).toString('base64url')
    const trip_snapshot = {
      trip_name: it.trip_name,
      tour_code: it.itinerary_code,
      start_date: it.start_date,
      end_date: it.end_date,
      client_name: it.client_name,
    }
    const { data: inserted, error: insErr } = await db
      .from('guest_surveys')
      .insert({ org_id: it.org_id, itinerary_id: it.id, token, language: 'ja', status: 'pending', trip_snapshot })
      .select('id')
      .maybeSingle()
    if (insErr || !inserted) {
      // Unique-index race (another run created it) — skip quietly.
      skipped++
      continue
    }
    created++

    const link = `${APP_URL}/survey/${token}`
    const msg = invitation(brand.name, it.client_name ?? '', link)
    let sentEmail = false
    let sentWa = false
    if (it.client_email) {
      const r = await sendEmailInternal({ to: it.client_email, subject: msg.subject, html: msg.html })
      sentEmail = r.success
      if (sentEmail) email++
    }
    if (it.client_phone) {
      try {
        await sendWhatsAppMessage({ to: it.client_phone, body: msg.text })
        sentWa = true
        whatsapp++
      } catch {
        /* leave sent_whatsapp false; the email (if any) still went */
      }
    }
    await db
      .from('guest_surveys')
      .update({ status: 'sent', sent_email: sentEmail, sent_whatsapp: sentWa, sent_at: new Date().toISOString() })
      .eq('id', inserted.id)
  }

  return NextResponse.json({ success: true, created, email, whatsapp, skipped })
}

export const GET = withJobRun('survey-invites', () => createServerClient(), getHandler)
