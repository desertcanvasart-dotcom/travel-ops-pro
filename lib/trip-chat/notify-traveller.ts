// ============================================
// Telling the traveller the office replied in the trip chat
// ============================================
// The traveller is not sitting on their trip page waiting. When the office
// replies in the trip chat (the trip page's Messages tab or the unified
// inbox, both through /api/itineraries/[id]/messages), the traveller gets an
// email saying a reply is waiting, with the link to read it — the trip's
// share link.
//
// Like the booking portal's reply email (lib/portal/chat-reply.ts), it does
// NOT quote the reply: the conversation may concern a passport or a payment,
// and email is the less private channel. It is written in the client's
// language (Japanese unless their record says English).
//
// Never throws: the reply is already stored, and a mail failure must not
// lose it. Each outcome is a different thing for the operator to do:
//
//   sent          the traveller was emailed
//   grouped       covered by the email of a reply sent just before (below)
//   no-recipient  the itinerary has no client email   → add one
//   no-link       the trip has no live share link     → create one
//   no-account    no Gmail is connected               → connect one
//   failed        Gmail was asked and refused

import type { SendEmailInternalResult } from '@/lib/email-send'
import { splitTourCode } from '@/lib/itineraries/content-language'

export type TripNotifyTravellerOutcome = 'sent' | 'grouped' | 'no-recipient' | 'no-link' | 'no-account' | 'failed'

/** Replies within this long of an emailed one ride on its email. */
export const GROUP_WINDOW_MINUTES = 10

export interface ThreadRow {
  direction: string
  created_at: string
  traveller_notified?: string | null
}

/**
 * Replies sent close together make one email, not one each. A reply is
 * grouped when the traveller was emailed about an earlier reply less than
 * GROUP_WINDOW_MINUTES ago and has not written since: that email already
 * sends them to the page, which shows every reply. The window runs from the
 * last email, not the last reply, so a long back-and-forth still emails
 * every so often; and once the traveller writes back, the next reply emails
 * again. `earlier` is the thread before this reply, in any order. Pure.
 */
export function groupedWithEarlierEmail(earlier: ThreadRow[], now: Date): { grouped: boolean; emailedAt: string | null } {
  const byTime = [...earlier].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const lastEmailed = byTime.find(m => m.direction === 'outbound' && m.traveller_notified === 'sent')
  if (!lastEmailed) return { grouped: false, emailedAt: null }
  const travellerWroteSince = byTime.some(m => m.direction === 'inbound' && m.created_at > lastEmailed.created_at)
  const recent = now.getTime() - Date.parse(lastEmailed.created_at) < GROUP_WINDOW_MINUTES * 60_000
  return { grouped: recent && !travellerWroteSince, emailedAt: lastEmailed.created_at }
}

export type MailLanguage = 'en' | 'ja'

export interface TripReplyEmailInput {
  language: MailLanguage
  clientName: string | null
  tripName: string | null
  itineraryCode: string | null
  agency: string | null
  url: string
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The email: who replied about which trip, and where to read it. Pure, so tested. */
export function tripReplyEmail(m: TripReplyEmailInput): { subject: string; html: string } {
  const trip = m.tripName?.trim() || null
  const url = escapeHtml(m.url)
  const agency = m.agency?.trim() ? escapeHtml(m.agency.trim()) : null
  if (m.language === 'ja') {
    return {
      subject: `【${trip || 'ご旅行'}】担当者からのご返信`,
      html: `
        <p>${escapeHtml(m.clientName?.trim() || 'お客様')} 様</p>
        <p>${trip ? `「${escapeHtml(trip)}」について、` : ''}担当者よりメッセージにご返信いたしました。下記のページよりご確認ください。</p>
        <p><a href="${url}">${url}</a></p>
        ${m.itineraryCode ? `<p>旅程番号：${escapeHtml(m.itineraryCode)}</p>` : ''}
        ${agency ? `<p>${agency}</p>` : ''}
      `,
    }
  }
  return {
    subject: `${trip || 'Your trip'}: a reply from your travel team`,
    html: `
      <p>Dear ${escapeHtml(m.clientName?.trim() || 'traveller')},</p>
      <p>We have replied to your message${trip ? ` about ${escapeHtml(trip)}` : ''}. You can read it on your trip page:</p>
      <p><a href="${url}">${url}</a></p>
      ${m.itineraryCode ? `<p>Reference: ${escapeHtml(m.itineraryCode)}</p>` : ''}
      ${agency ? `<p>${agency}</p>` : ''}
    `,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export interface NotifyTravellerDeps {
  mail: (input: { to: string; subject: string; html: string }) => Promise<SendEmailInternalResult>
}

const liveDeps = (): NotifyTravellerDeps => ({
  // Loaded on use: lib/email-send makes its database client at import.
  mail: async input => (await import('@/lib/email-send')).sendEmailInternal(input),
})

const toLanguage = (v: string | null | undefined): MailLanguage => {
  const s = (v ?? '').trim().toLowerCase()
  return s === 'en' || s.startsWith('english') || s === '英語' ? 'en' : 'ja'
}

/**
 * Email the trip's client that a reply is waiting — unless a reply sent just
 * before already did (groupedWithEarlierEmail) — and record on the reply what
 * happened, so the next reply can tell. The itinerary must already be proven
 * to belong to `orgId` by the caller.
 */
export async function notifyTravellerOfTripReply(
  db: Db,
  args: { itineraryId: string; orgId: string; messageId: string; appUrl?: string; now?: Date },
  deps: NotifyTravellerDeps = liveDeps()
): Promise<{ outcome: TripNotifyTravellerOutcome; emailedAt: string | null }> {
  let result: { outcome: TripNotifyTravellerOutcome; emailedAt: string | null }
  try {
    result = await decideAndSend(db, args, deps)
  } catch (err) {
    console.warn('[trip-chat] reply email failed:', err)
    result = { outcome: 'failed', emailedAt: null }
  }
  // Best effort: before the 20261111 migration the column is missing, and
  // then replies are simply never grouped.
  try {
    const { error } = await db.from('trip_messages').update({ traveller_notified: result.outcome }).eq('id', args.messageId)
    if (error) console.warn('[trip-chat] could not record the reply email outcome:', error.message ?? error)
  } catch (err) {
    console.warn('[trip-chat] could not record the reply email outcome:', err)
  }
  return result
}

async function decideAndSend(
  db: Db,
  args: { itineraryId: string; orgId: string; messageId: string; appUrl?: string; now?: Date },
  deps: NotifyTravellerDeps
): Promise<{ outcome: TripNotifyTravellerOutcome; emailedAt: string | null }> {
  const done = (outcome: TripNotifyTravellerOutcome): { outcome: TripNotifyTravellerOutcome; emailedAt: string | null } => ({ outcome, emailedAt: null })

  // The thread so far. A failed read (the column not there yet) groups nothing.
  const { data: earlier, error: earlierError } = await db
    .from('trip_messages')
    .select('direction, created_at, traveller_notified')
    .eq('itinerary_id', args.itineraryId)
    .eq('org_id', args.orgId)
    .neq('id', args.messageId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (!earlierError) {
    const g = groupedWithEarlierEmail((earlier ?? []) as ThreadRow[], args.now ?? new Date())
    if (g.grouped) return { outcome: 'grouped', emailedAt: g.emailedAt }
  }

  const { data: trip } = await db
    .from('itineraries')
    .select('itinerary_code, trip_name, client_name, client_email, client_id')
    .eq('id', args.itineraryId)
    .eq('org_id', args.orgId)
    .maybeSingle()
  const to = trip?.client_email?.trim()
  if (!to) return done('no-recipient')

  // The newest live share link: the page that holds the conversation.
  const { data: share } = await db
    .from('itinerary_shares')
    .select('token')
    .eq('itinerary_id', args.itineraryId)
    .eq('org_id', args.orgId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!share?.token) return done('no-link')

  const [{ data: client }, { data: org }] = await Promise.all([
    trip.client_id
      ? db.from('clients').select('preferred_language').eq('id', trip.client_id).eq('org_id', args.orgId).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from('organizations').select('name').eq('id', args.orgId).maybeSingle(),
  ])

  const base = (args.appUrl || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  const email = tripReplyEmail({
    language: toLanguage(client?.preferred_language),
    clientName: trip.client_name,
    // The client's title, without the programme code the office prefixes.
    tripName: splitTourCode(trip.trip_name).title || null,
    itineraryCode: trip.itinerary_code,
    agency: org?.name ?? null,
    url: `${base}/share/${share.token}`,
  })
  const sent = await deps.mail({ to, ...email })
  if (sent?.success) return done('sent')
  return done(sent?.noAccount ? 'no-account' : 'failed')
}
