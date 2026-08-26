// ============================================
// GET / POST /api/bookings/[id]/portal-messages
// ============================================
// The office side of the traveller's conversation.
//
// A booking can hold more than one conversation: the shared thread reached by
// a family link, and one private thread per traveller in friends mode. They
// are listed separately and never merged — merging them would show a friend's
// private question to the whole party, which is the one thing the per-traveller
// links exist to prevent.
//
// Replying emails the traveller. They are not sitting on the page waiting;
// without the email the reply is written into a void. Delivery is best effort:
// a mail failure must not lose a reply that is already stored.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, getCurrentUserId, noOrgResponse, requireRole } from '@/lib/auth/current-org'
import { sendEmailInternal } from '@/lib/email-send'

export const dynamic = 'force-dynamic'

const MAX_BODY = 4000

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** The booking, proven to be in this org. An id from the URL is not authority. */
async function ownedBooking(orgId: string, bookingId: string) {
  const { data } = await admin()
    .from('bookings')
    .select('id, org_id, booking_code, trip_name, client_name, client_email')
    .eq('id', bookingId)
    .eq('org_id', orgId)
    .maybeSingle()
  return data
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireRole(['admin', 'manager', 'agent'])
    if (denied) return denied

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const booking = await ownedBooking(orgId, id)
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const db = admin()
    const { data: threads } = await db
      .from('portal_message_threads')
      .select('id, passenger_id, last_message_at, last_sender, staff_last_read_at')
      .eq('booking_id', id)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (!threads?.length) return NextResponse.json({ success: true, threads: [] })

    const { data: passengers } = await db
      .from('booking_passengers')
      .select('id, first_name, last_name, family_name_kanji, given_name_kanji, email')
      .eq('booking_id', id)
    const byId = new Map((passengers ?? []).map(p => [p.id, p]))

    const { data: messages } = await db
      .from('portal_messages')
      .select('id, thread_id, sender, sender_name, body, created_at')
      .in('thread_id', threads.map(t => t.id))
      .order('created_at', { ascending: true })

    const grouped = new Map<string, typeof messages>()
    for (const m of messages ?? []) {
      const list = grouped.get(m.thread_id) ?? []
      list.push(m)
      grouped.set(m.thread_id, list)
    }

    return NextResponse.json({
      success: true,
      threads: threads.map(t => {
        const pax = t.passenger_id ? byId.get(t.passenger_id) : null
        const list = grouped.get(t.id) ?? []
        return {
          id: t.id,
          // NULL passenger = the booking's shared conversation.
          scope: t.passenger_id ? 'traveller' : 'booking',
          travellerName: pax
            ? [pax.family_name_kanji, pax.given_name_kanji].filter(Boolean).join(' ')
              || [pax.last_name, pax.first_name].filter(Boolean).join(' ')
              || null
            : null,
          // Unread is derived, never stored as a count.
          unread: (list ?? []).some(
            m => m.sender === 'customer' &&
              (!t.staff_last_read_at || m.created_at > t.staff_last_read_at)
          ),
          messages: (list ?? []).map(m => ({
            id: m.id,
            sender: m.sender,
            senderName: m.sender_name,
            body: m.body,
            createdAt: m.created_at,
          })),
        }
      }),
    })
  } catch (error) {
    console.error('Error in portal-messages GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireRole(['admin', 'manager', 'agent'])
    if (denied) return denied

    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { id } = await params
    const booking = await ownedBooking(orgId, id)
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const payload = await request.json().catch(() => null)
    const threadId = String(payload?.threadId ?? '')
    const body = String(payload?.body ?? '').trim()
    const markReadOnly = payload?.markRead === true

    const db = admin()

    // Scoped by booking_id as well as id — a thread id alone is not authority.
    const { data: thread } = await db
      .from('portal_message_threads')
      .select('id, booking_id, passenger_id')
      .eq('id', threadId)
      .eq('booking_id', id)
      .maybeSingle()
    if (!thread) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

    const now = new Date().toISOString()

    if (markReadOnly) {
      await db.from('portal_message_threads')
        .update({ staff_last_read_at: now }).eq('id', thread.id)
      return NextResponse.json({ success: true })
    }

    if (!body) return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    if (body.length > MAX_BODY) return NextResponse.json({ error: 'Message is too long' }, { status: 413 })

    const userId = await getCurrentUserId()
    const { data: member } = await db
      .from('team_members')
      .select('name')
      .eq('user_id', userId)
      .maybeSingle()

    const { data: message, error } = await db
      .from('portal_messages')
      .insert({
        org_id: orgId,
        thread_id: thread.id,
        sender: 'staff',
        sender_user_id: userId,
        sender_name: member?.name || null,
        body,
      })
      .select('id, sender, sender_name, body, created_at')
      .single()

    if (error || !message) {
      console.error('[portal-messages] insert failed:', error?.message)
      return NextResponse.json({ error: 'Could not send message' }, { status: 500 })
    }

    await db.from('portal_message_threads').update({
      last_message_at: message.created_at,
      last_message_snippet: body.slice(0, 160),
      last_sender: 'staff',
      staff_last_read_at: now,
      updated_at: now,
    }).eq('id', thread.id)

    // Tell the traveller. A private thread emails that traveller; the shared
    // thread emails the booking's contact.
    let emailed = false
    try {
      let to = booking.client_email as string | null
      if (thread.passenger_id) {
        const { data: pax } = await db
          .from('booking_passengers')
          .select('email')
          .eq('id', thread.passenger_id)
          .maybeSingle()
        to = pax?.email || to
      }

      const { data: link } = await db
        .from('booking_portal_links')
        .select('token')
        .eq('booking_id', id)
        .is('revoked_at', null)
        .limit(1)
        .maybeSingle()

      if (to && link?.token) {
        const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
        const url = `${base}/portal/${link.token}`
        const result = await sendEmailInternal({
          to,
          subject: `【${booking.trip_name || 'ご旅行'}】担当者からのご返信`,
          // Deliberately does NOT quote the reply: the message may concern a
          // passport or a payment, and email is the less private channel of
          // the two. It says a reply is waiting and where to read it.
          html: `
            <p>${booking.client_name || 'お客様'} 様</p>
            <p>担当者よりご返信いたしました。下記のページよりご確認ください。</p>
            <p><a href="${url}">${url}</a></p>
            <p>ご予約番号：${booking.booking_code || '-'}</p>
          `,
        })
        emailed = Boolean(result?.success)
      }
    } catch (err) {
      console.warn('[portal-messages] reply email failed:', err)
    }

    return NextResponse.json({
      success: true,
      emailed,
      message: {
        id: message.id,
        sender: message.sender,
        senderName: message.sender_name,
        body: message.body,
        createdAt: message.created_at,
      },
    })
  } catch (error) {
    console.error('Error in portal-messages POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
