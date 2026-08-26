// ============================================
// GET / POST /api/portal/[token]/messages
// ============================================
// The traveller's conversation with the office.
//
// WHICH conversation is decided by the LINK, not by anything the caller sends.
// A booking-level (family) link reaches the booking's shared thread; a
// per-traveller (friends) link reaches only that traveller's private one. That
// is the same rule already governing whose passport and whose details a link
// can see, so a traveller who has understood one has understood the other.
//
// The first customer message in a thread gets an automatic acknowledgement
// saying when a reply is coming. It is stored as a real message, not rendered
// as UI text, so the traveller reads it in sequence and the operator can see
// exactly what was promised.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { portalVerifyCookieName } from '@/lib/booking-portal'
import { portalLinkContext } from '@/lib/portal/traveller-gate'
import {
  parseSupportOffices,
  acknowledgementJa,
  describeOfficesJa,
  isAnyOfficeOpen,
  nextOpening,
  formatInTravellerTimeJa,
} from '@/lib/portal/support-hours'
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit'
import { notifyOrgManagers } from '@/lib/notify-managers'

export const dynamic = 'force-dynamic'

/** Long enough for a real question, short enough that nobody pastes a novel
 *  into a text box that has no formatting. */
const MAX_BODY = 4000

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** What the traveller may know about a message. Never the staff member's user
 *  id — a customer has no use for it and it is not theirs to have. */
const publicShape = (m: Record<string, any>) => ({  // eslint-disable-line @typescript-eslint/no-explicit-any
  id: m.id,
  sender: m.sender,
  senderName: m.sender === 'staff' ? (m.sender_name || null) : null,
  body: m.body,
  createdAt: m.created_at,
})

// Structural rather than the concrete client type, so the helpers below can be
// handed a fake in a test. lib/cron/scheduler.ts and traveller-gate.ts use the
// same shape for the same reason.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

/** The thread this link owns, created on first use. */
async function threadForLink(
  db: Db,
  link: Record<string, any>,  // eslint-disable-line @typescript-eslint/no-explicit-any
  orgId: string
): Promise<Record<string, any> | null> {  // eslint-disable-line @typescript-eslint/no-explicit-any
  const passengerId = link.passenger_id ?? null

  const find = () => {
    const q = db.from('portal_message_threads').select('*').eq('booking_id', link.booking_id)
    return passengerId ? q.eq('passenger_id', passengerId) : q.is('passenger_id', null)
  }

  const existing = await find().maybeSingle()
  if (existing.data) return existing.data

  const { data, error } = await db
    .from('portal_message_threads')
    .insert({ org_id: orgId, booking_id: link.booking_id, passenger_id: passengerId })
    .select('*')
    .single()

  // A racing first message from two tabs loses the insert on the unique index;
  // read the winner rather than failing the traveller's message.
  if (error) {
    const retry = await find().maybeSingle()
    return retry.data ?? null
  }
  return data
}

async function officesFor(db: Db, orgId: string) {
  const { data } = await db
    .from('organizations')
    .select('support_hours')
    .eq('id', orgId)
    .maybeSingle()
  return parseSupportOffices(data?.support_hours)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  const db = admin()
  const gate = await portalLinkContext(db, {
    token,
    cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
  })
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const offices = await officesFor(db, gate.booking.org_id)

  // Reading is not writing: a thread is not created just because somebody
  // opened the page. An empty conversation is a legitimate answer.
  const passengerId = gate.link.passenger_id ?? null
  const threadQuery = db
    .from('portal_message_threads')
    .select('id')
    .eq('booking_id', gate.link.booking_id)
  const { data: thread } = await (
    passengerId ? threadQuery.eq('passenger_id', passengerId) : threadQuery.is('passenger_id', null)
  ).maybeSingle()

  let messages: Record<string, any>[] = []  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (thread) {
    const { data } = await db
      .from('portal_messages')
      .select('id, sender, sender_name, body, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })
      .limit(500)
    messages = data ?? []

    await db
      .from('portal_message_threads')
      .update({ customer_last_read_at: new Date().toISOString() })
      .eq('id', thread.id)
  }

  const now = new Date()
  const open = isAnyOfficeOpen(offices, now)
  const next = open ? null : nextOpening(offices, now)

  return NextResponse.json({
    success: true,
    messages: messages.map(publicShape),
    // One line per office, each on its own clock and working week.
    hours: describeOfficesJa(offices),
    officeOpen: open,
    // Named in the traveller's clock, because that is the one they read.
    nextOpening: next ? formatInTravellerTimeJa(next) : null,
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const limit = checkRateLimit(getClientIdentifier(request), 'portal')
  if (!limit.success) return rateLimitResponse(limit)

  const db = admin()
  const gate = await portalLinkContext(db, {
    token,
    cookieValue: request.cookies.get(portalVerifyCookieName(token))?.value,
  })
  if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status })

  const payload = await request.json().catch(() => null)
  const body = String(payload?.body ?? '').trim()
  if (!body) {
    return NextResponse.json({ error: 'メッセージを入力してください。' }, { status: 400 })
  }
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: 'メッセージが長すぎます。' }, { status: 413 })
  }

  const orgId = gate.booking.org_id
  const thread = await threadForLink(db, gate.link, orgId)
  if (!thread) {
    return NextResponse.json({ error: '送信に失敗しました。' }, { status: 500 })
  }

  const now = new Date()
  const { data: message, error } = await db
    .from('portal_messages')
    .insert({ org_id: orgId, thread_id: thread.id, sender: 'customer', body })
    .select('id, sender, sender_name, body, created_at')
    .single()

  if (error || !message) {
    console.error('[portal] message insert failed:', error?.message)
    return NextResponse.json({ error: '送信に失敗しました。' }, { status: 500 })
  }

  // The acknowledgement is once per conversation, not once per message: a
  // traveller sending three lines in a row does not need telling three times.
  const created: Record<string, any>[] = [message]  // eslint-disable-line @typescript-eslint/no-explicit-any
  const { count: priorCount } = await db
    .from('portal_messages')
    .select('id', { count: 'exact', head: true })
    .eq('thread_id', thread.id)
    .eq('sender', 'system')

  if ((priorCount ?? 0) === 0) {
    const offices = await officesFor(db, orgId)
    const { data: ack } = await db
      .from('portal_messages')
      .insert({
        org_id: orgId,
        thread_id: thread.id,
        sender: 'system',
        body: acknowledgementJa(offices, now),
      })
      .select('id, sender, sender_name, body, created_at')
      .single()
    if (ack) created.push(ack)
  }

  const last = created[created.length - 1]
  await db
    .from('portal_message_threads')
    .update({
      last_message_at: last.created_at,
      last_message_snippet: body.slice(0, 160),
      last_sender: 'customer',
      updated_at: now.toISOString(),
    })
    .eq('id', thread.id)

  // Tell the office. Best effort: a notification that fails must not lose the
  // traveller's message, which is already safely stored.
  try {
    const who = gate.booking.client_name || gate.booking.booking_code || 'お客様'
    await notifyOrgManagers(db, orgId, {
      title: 'New portal message',
      message: `${who}: ${body.slice(0, 120)}`,
      link: `/bookings/${gate.booking.id}`,
    })
  } catch (err) {
    console.warn('[portal] manager notification failed:', err)
  }

  return NextResponse.json({ success: true, messages: created.map(publicShape) })
}
