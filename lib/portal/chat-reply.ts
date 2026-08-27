// ============================================
// One implementation of "the office replies"
// ============================================
// There are two places staff can answer a traveller: the panel on the booking
// page, and the unified inbox. Both must store the message the same way, keep
// the thread summary in step, and — the part that is easy to forget — actually
// TELL the traveller, who is not sitting on the page waiting.
//
// A second copy of that would drift, and the half that drifts is always the
// notification, because a missing email looks exactly like success.

import { sendEmailInternal } from '@/lib/email-send'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export const MAX_MESSAGE_LENGTH = 4000

/**
 * Why the traveller was, or was not, told.
 *
 * A bare boolean could not tell "we chose not to send" from "we tried and it
 * broke", which made the outcome untestable anywhere without a live Gmail
 * connection and unexplainable to the operator when it was false. Each value
 * is a different thing to do about it:
 *
 *   sent          the notification went out
 *   no-account    no Gmail is connected to this system  → connect one
 *   no-recipient  nobody has an address on this booking → add one
 *   no-link       the booking has no live portal link   → mint one
 *   no-booking    the thread points at a booking that is gone
 *   failed        Gmail was asked and refused
 *
 * Only `sent` means the traveller knows. The reply itself is stored either
 * way — a mail failure must never lose a reply.
 */
export type NotifyOutcome =
  | 'sent'
  | 'no-account'
  | 'no-recipient'
  | 'no-link'
  | 'no-booking'
  | 'failed'

export interface StaffReplyResult {
  ok: boolean
  error?: string
  status?: number
  emailed?: boolean
  /** Why, in the `emailed === false` case. See NotifyOutcome. */
  notified?: NotifyOutcome
  message?: {
    id: string
    sender: string
    senderName: string | null
    body: string
    createdAt: string
  }
}

/**
 * Store a staff reply on a thread and notify the traveller.
 *
 * The thread must already be proven to belong to the caller's org — this does
 * not check that, because the two callers prove it differently (one by
 * booking, one by thread) and a function that silently re-checks invites the
 * caller to stop.
 */
export async function sendStaffReply(
  db: Db,
  args: {
    thread: { id: string; booking_id: string; passenger_id: string | null }
    orgId: string
    userId: string | null
    body: string
    appUrl?: string
  }
): Promise<StaffReplyResult> {
  const body = args.body.trim()
  if (!body) return { ok: false, error: 'Message is required', status: 400 }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: 'Message is too long', status: 413 }
  }

  const { data: member } = await db
    .from('team_members')
    .select('name')
    .eq('user_id', args.userId)
    .maybeSingle()

  const { data: message, error } = await db
    .from('portal_messages')
    .insert({
      org_id: args.orgId,
      thread_id: args.thread.id,
      sender: 'staff',
      sender_user_id: args.userId,
      sender_name: member?.name || null,
      body,
    })
    .select('id, sender, sender_name, body, created_at')
    .single()

  if (error || !message) {
    console.error('[portal-chat] reply insert failed:', error?.message)
    return { ok: false, error: 'Could not send message', status: 500 }
  }

  const now = new Date().toISOString()
  await db.from('portal_message_threads').update({
    last_message_at: message.created_at,
    last_message_snippet: body.slice(0, 160),
    last_sender: 'staff',
    // Answering is reading.
    staff_last_read_at: now,
    updated_at: now,
  }).eq('id', args.thread.id)

  const notified = await notifyTraveller(db, args, message.created_at)

  return {
    ok: true,
    emailed: notified === 'sent',
    notified,
    message: {
      id: message.id,
      sender: message.sender,
      senderName: message.sender_name,
      body: message.body,
      createdAt: message.created_at,
    },
  }
}

/** Best effort: a mail failure must not lose a reply that is already stored. */
async function notifyTraveller(
  db: Db,
  args: { thread: { booking_id: string; passenger_id: string | null }; appUrl?: string },
  _at: string
): Promise<NotifyOutcome> {
  try {
    const { data: booking } = await db
      .from('bookings')
      .select('booking_code, trip_name, client_name, client_email')
      .eq('id', args.thread.booking_id)
      .maybeSingle()
    if (!booking) return 'no-booking'

    // A private thread reaches that traveller; the shared one reaches the
    // booking's contact.
    let to: string | null = booking.client_email ?? null
    if (args.thread.passenger_id) {
      const { data: pax } = await db
        .from('booking_passengers')
        .select('email')
        .eq('id', args.thread.passenger_id)
        .maybeSingle()
      to = pax?.email || to
    }
    if (!to) return 'no-recipient'

    // Prefer the traveller's own link when the thread is theirs, so the email
    // lands them on the page that actually holds their conversation.
    const links = db
      .from('booking_portal_links')
      .select('token, passenger_id')
      .eq('booking_id', args.thread.booking_id)
      .is('revoked_at', null)
    const { data: candidates } = await links
    const chosen = (candidates ?? []).find(
      (l: { passenger_id: string | null }) => l.passenger_id === args.thread.passenger_id
    ) ?? (candidates ?? [])[0]
    if (!chosen?.token) return 'no-link'

    const base = (args.appUrl || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const url = `${base}/portal/${chosen.token}`

    const result = await sendEmailInternal({
      to,
      subject: `【${booking.trip_name || 'ご旅行'}】担当者からのご返信`,
      // Deliberately does NOT quote the reply. The conversation may concern a
      // passport or a payment, and email is the less private of the two
      // channels — it says a reply is waiting and where to read it.
      html: `
        <p>${booking.client_name || 'お客様'} 様</p>
        <p>担当者よりご返信いたしました。下記のページよりご確認ください。</p>
        <p><a href="${url}">${url}</a></p>
        <p>ご予約番号：${booking.booking_code || '-'}</p>
      `,
    })
    if (result?.success) return 'sent'
    // `noAccount` is the system having no Gmail at all, which is a setup
    // condition rather than a failure of this reply — worth telling apart, so
    // the operator is pointed at Settings instead of at a broken send.
    return result?.noAccount ? 'no-account' : 'failed'
  } catch (err) {
    console.warn('[portal-chat] reply email failed:', err)
    return 'failed'
  }
}
