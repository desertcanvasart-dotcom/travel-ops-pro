// ============================================
// API: /api/cron/release-expired-holds — a lapsed quote frees its seats
// ============================================
// A website order holds seats on its departure until the office confirms them,
// and the hold follows its quote (departure_bookings.quote_id): setting the
// quote to Rejected or Expired, or deleting it, releases the hold in the
// database (migration 20261215). But a quote is never SET to Expired — a draft
// or sent offer past its valid-until date only reads as expired
// (lib/quotes/validity.ts) — so the hold of an offer the customer let lapse
// stayed pending, and its seats stayed taken, until someone released it by
// hand on the departure's page.
//
// This job runs once a day (lib/cron/scheduler.ts) and releases every pending
// hold whose quote is still a draft or sent with a valid-until date before
// today: status 'cancelled', with a line added to the hold's note saying why
// (lib/departures/expired-holds). Confirmed holds are seats the office sold
// and are left alone, as the trigger leaves them.
//
// "Today" is Japan's date (the office's; the website's orders are Japanese).
// The job runs at 00:20 UTC — 09:20 in Tokyo — when Japan's date and the UTC
// date the quote screens read expiry by are the same day, so a hold is never
// released while its quote still reads as valid.
//
// Each company's managers get one in-app notification listing what was
// released (lib/notify-managers), the way a website order announces itself.
//
// Auth: lib/cron/auth (fails closed).

import { NextRequest, NextResponse } from 'next/server'
import { cronAuthorized } from '@/lib/cron/auth'
import { withJobRun } from '@/lib/support/job-runs'
import { createServerClient } from '@/lib/supabase-server'
import { todayInTimeZone } from '@/lib/today'
import { notifyOrgManagers } from '@/lib/notify-managers'
import { lapsedHolds, releaseNote, type HoldQuote, type PendingHold } from '@/lib/departures/expired-holds'

export const dynamic = 'force-dynamic'

const JAPAN = 'Asia/Tokyo'
const PAGE = 1000
// Quote ids per .in() — a long list makes a URL PostgREST will not take.
const CHUNK = 200

async function getHandler(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServerClient()
  const today = todayInTimeZone(JAPAN)

  // Every pending hold that names a quote, a page at a time.
  const holds: PendingHold[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('departure_bookings')
      .select('id, org_id, departure_id, quote_id, notes')
      .eq('status', 'pending')
      .not('quote_id', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    holds.push(...((data ?? []) as PendingHold[]))
    if ((data ?? []).length < PAGE) break
  }
  if (holds.length === 0) return NextResponse.json({ ok: true, today, released: 0, failed: 0 })

  const quoteIds = [...new Set(holds.map(h => h.quote_id).filter((id): id is string => !!id))]
  const quotes: HoldQuote[] = []
  for (let i = 0; i < quoteIds.length; i += CHUNK) {
    const { data, error } = await db
      .from('tour_quotes')
      .select('id, org_id, quote_number, status, valid_until')
      .in('id', quoteIds.slice(i, i + CHUNK))
      .in('status', ['draft', 'sent'])
      .lt('valid_until', today)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    quotes.push(...((data ?? []) as HoldQuote[]))
  }

  let released = 0
  let failed = 0
  const byOrg = new Map<string, Array<{ hold: PendingHold; quote: HoldQuote }>>()
  for (const item of lapsedHolds(holds, quotes, today)) {
    const { hold, quote } = item
    // Still pending: the office may have confirmed or released it meanwhile.
    const { data, error } = await db
      .from('departure_bookings')
      .update({ status: 'cancelled', notes: releaseNote(hold.notes, quote, today), updated_at: new Date().toISOString() })
      .eq('id', hold.id)
      .eq('org_id', hold.org_id)
      .eq('status', 'pending')
      .select('id')
    if (error) {
      failed++
      console.error('[release-expired-holds] could not release hold', hold.id, error.message)
      continue
    }
    if ((data ?? []).length === 0) continue
    released++
    byOrg.set(hold.org_id, [...(byOrg.get(hold.org_id) ?? []), item])
  }

  for (const [orgId, items] of byOrg) {
    const numbers = [...new Set(items.map(i => i.quote.quote_number).filter(Boolean))].join(', ')
    const departures = new Set(items.map(i => i.hold.departure_id))
    await notifyOrgManagers(db, orgId, {
      type: 'departure_hold_released',
      title: `有効期限切れの見積の座席確保を解放しました（${items.length}件）`,
      message: `有効期限を過ぎた見積${numbers ? ` ${numbers}` : ''} の仮押さえ座席を自動で解放しました。`,
      link: departures.size === 1 ? `/departures/${[...departures][0]}` : '/departures',
      send_email: false,
    })
  }

  return NextResponse.json({ ok: true, today, released, failed })
}

export const GET = withJobRun('release-expired-holds', () => createServerClient(), getHandler)
