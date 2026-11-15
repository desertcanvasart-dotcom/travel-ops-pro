// ============================================
// The website's order emails → quotes, with no click
// ============================================
// Operator, 2026-10-02: the ATS website's form "comes as a request" by email;
// every answer must reach "the correct email, the correct program", the
// customer linked to it, and the operation start "as per the existing
// pipeline". The customer never leaves the website — so the email is the
// connection.
//
// After the scheduled Gmail sync stores new mail (app/api/cron/gmail-sync),
// each new inbound message is looked at ONCE (email_messages.order_checked_at):
//
//   not an order               → checked, nothing else (no AI, no cost)
//   an order (lib/intake/tup-mail.ts, or the canonical form document)
//     → claimed in web_order_intakes (unique per message: never twice)
//     → the same customer, code and date already made a quote: 'duplicate',
//       linked to that quote
//   a question asked through the form (問合せ内容 not 申込み)
//     → checked, nothing else: it is answered as an email (operator, 2026-10-23)
//     → else the shared pipeline (lib/intake/process-order.ts): programme by
//       website page then code, client by email (found or created), ONE
//       priced quote, a pending seat hold on the date's departure, and — at
//       the website's price — the itinerary converted from it
//         - done: 'quote_created', managers notified with the itinerary
//           (the quote when there is none)
//         - not (unknown programme, a rate hole, an unreadable form):
//           'needs_attention' with the reason, managers notified with a link
//           that opens the order on /intake/order to finish by hand
//
// The conversation is marked 'web_order' for the lead detector
// (lib/email/email-leads.ts): the website's notifications are not a lead
// for the AI to judge — the order made the client already. Per message, not
// per conversation: the notifications share a subject, so Gmail threads
// different customers' orders together.
import type { SupabaseClient } from '@supabase/supabase-js'
import { looksLikeTourUpOrder, parseTourUpOrder, isApplicationOrder, type TourUpOrder } from '@/lib/intake/tour-up-order'
import { emailOrderText } from '@/lib/intake/tup-mail'
import { processTourUpOrder } from '@/lib/intake/process-order'
import { notifyOrgManagers } from '@/lib/notify-managers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

export type WebOrderOutcome = 'quote_created' | 'needs_attention' | 'duplicate' | 'not_an_order' | 'question' | 'already_taken' | 'error'

export interface WebOrderResult {
  messageId: string
  outcome: WebOrderOutcome
  intakeId?: string
  quoteId?: string
  itineraryId?: string
  reason?: string
}

/** A duplicate is the same customer, code and date within this many days. */
const DUPLICATE_WINDOW_DAYS = 14

/** Where the operator finishes an order the pipeline could not. */
export const intakeLink = (intakeId: string) => `/intake/order?intake=${intakeId}`

const customerName = (o: TourUpOrder) =>
  (o.lead.lastNameKanji || o.lead.firstNameKanji
    ? `${o.lead.lastNameKanji ?? ''} ${o.lead.firstNameKanji ?? ''}`
    : `${o.lead.lastNameRomaji} ${o.lead.firstNameRomaji}`).trim() || null

/**
 * Take in every new inbound message that is a website order. Returns what
 * happened to each order (messages that are not orders are only marked).
 * `process` is injectable for tests.
 */
export async function processNewWebOrders(
  db: Db,
  opts: { limit?: number; process?: typeof processTourUpOrder } = {},
): Promise<WebOrderResult[]> {
  const runPipeline = opts.process ?? processTourUpOrder
  const { data: pending, error } = await db.from('email_messages')
    .select('id, org_id, message_id, conversation_id, subject, body_text, body_html, sent_at')
    .is('order_checked_at', null)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: true })
    .limit(opts.limit ?? 50)
  if (error) throw error

  const results: WebOrderResult[] = []

  for (const msg of (pending ?? []) as Array<{
    id: string; org_id: string | null; message_id: string; conversation_id: string | null; subject: string | null
    body_text: string | null; body_html: string | null; sent_at: string
  }>) {
    const checked = () => db.from('email_messages').update({ order_checked_at: new Date().toISOString() }).eq('id', msg.id)
    try {
      const text = emailOrderText(msg.body_text, msg.body_html)
      if (!looksLikeTourUpOrder(text)) { await checked(); continue }

      // The organisation: the mailbox's — stamped on the message by the sync
      // from the connection it came through (email_messages.org_id, 20261204).
      // It was the mailbox owner's OLDEST membership, so a person in both
      // companies had the other company's orders filed under the first.
      const orgId = msg.org_id
      if (!orgId) {
        // Left unchecked: the next run tries again once the mailbox has an org.
        console.error('[web-order] no organisation for message', msg.id)
        results.push({ messageId: msg.id, outcome: 'error', reason: 'No organisation for this mailbox' })
        continue
      }

      const order = parseTourUpOrder(text)

      // A question through the form is mail to answer, like any other: no
      // order, no quote, and the lead detector still reads it.
      if (order && !isApplicationOrder(order)) {
        await checked()
        results.push({ messageId: msg.id, outcome: 'question' })
        continue
      }

      // Not a lead for the AI: the order makes the client.
      if (msg.conversation_id) {
        await db.from('email_conversations')
          .update({ lead_checked_at: new Date().toISOString(), lead_check: 'web_order' })
          .eq('id', msg.conversation_id)
          .eq('org_id', orgId)
          .is('lead_checked_at', null)
      }

      // The shared steps (claim, duplicate, pipeline, notice) — the same
      // ones the hosted form's orders take (takeInWebOrder, below).
      const taken = await takeInWebOrder(db, {
        orgId, order, text, receivedAt: msg.sent_at, subject: msg.subject,
        emailMessageId: msg.id, conversationId: msg.conversation_id, via: 'email', process: runPipeline,
      })
      await checked()
      results.push({ messageId: msg.id, ...taken })
    } catch (e) {
      // Left unchecked: retried next run (the claim keeps it from doubling).
      console.error('[web-order] message', msg.id, e)
      results.push({ messageId: msg.id, outcome: 'error', reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return results
}

/** Where an order came in: the website's notification email, or our own
 *  hosted form (/order) that the website's buttons point at. */
export type WebOrderVia = 'email' | 'form'

const VIA_LABEL: Record<WebOrderVia, string> = {
  email: 'ウェブサイトの注文メールより',
  form: 'ウェブ注文フォームより',
}

export interface TakeInResult {
  outcome: Exclude<WebOrderOutcome, 'not_an_order' | 'question'>
  intakeId?: string
  quoteId?: string
  quoteNumber?: string
  itineraryId?: string
  reason?: string
}

/**
 * ONE website order, from either door, through the same steps: claimed in
 * web_order_intakes (unique per email message; a form order has none), the
 * same customer, code and date in the last fortnight = a duplicate, else the
 * shared pipeline (lib/intake/process-order.ts) — and the managers told what
 * came of it. `order` null = the email could not be read.
 */
export async function takeInWebOrder(
  db: Db,
  opts: {
    orgId: string
    order: TourUpOrder | null
    text: string
    receivedAt: string
    subject: string | null
    emailMessageId?: string | null
    conversationId?: string | null
    via: WebOrderVia
    process?: typeof processTourUpOrder
  },
): Promise<TakeInResult> {
  const { orgId, order, text, via } = opts
  const runPipeline = opts.process ?? processTourUpOrder
  const viaLabel = VIA_LABEL[via]

  // Claim first: a crash after the quote must not make a second one next
  // run — the unique email_message_id refuses it.
  const { data: claim, error: claimErr } = await db.from('web_order_intakes').insert({
    org_id: orgId,
    email_message_id: opts.emailMessageId ?? null,
    conversation_id: opts.conversationId ?? null,
    received_at: opts.receivedAt,
    subject: opts.subject,
    outcome: 'needs_attention',
    reason: 'Processing',
    tour_code: order?.tourCode ?? null,
    travel_date: order?.departureDate1 ?? null,
    customer_email: order?.email || null,
    customer_name: order ? customerName(order) : null,
    order_text: text,
    order_data: order,
  }).select('id').single()
  if (claimErr || !claim) {
    if (via === 'form') console.error('[web-order] form order could not be recorded:', claimErr)
    return { outcome: via === 'email' ? 'already_taken' : 'error', reason: claimErr?.message }
  }
  const intakeId = claim.id as string
  const settle = (patch: Record<string, unknown>) => db.from('web_order_intakes').update(patch).eq('id', intakeId)

  const summary = order
    ? `${order.productKind === 'optional' ? '[オプショナル] ' : ''}${order.tourCode} / ${order.departureDate1} / 大人${order.adults}人${order.children ? ` 子供${order.children}人` : ''}${order.infants ? ` 幼児${order.infants}人` : ''} / ${customerName(order) ?? ''} <${order.email}>`
    : (opts.subject ?? '')

  if (!order) {
    const reason = 'The form could not be read (tour code or date missing).'
    await settle({ reason })
    await notifyOrgManagers(db as never, orgId, {
      type: 'order_received',
      title: '要対応のウェブ注文（読み取り不可）',
      message: `${viaLabel}。内容を読み取れませんでした。リンク先で確認してください。${summary}`,
      link: intakeLink(intakeId),
    })
    return { outcome: 'needs_attention', intakeId, reason }
  }

  // The same order sent twice is one order.
  const since = new Date(Date.parse(opts.receivedAt) - DUPLICATE_WINDOW_DAYS * 86_400_000).toISOString()
  const { data: earlier } = order.email
    ? await db.from('web_order_intakes')
      .select('id, quote_id, client_id')
      .eq('org_id', orgId)
      .eq('outcome', 'quote_created')
      .eq('tour_code', order.tourCode)
      .eq('travel_date', order.departureDate1)
      .ilike('customer_email', order.email)
      .gte('received_at', since)
      .limit(1)
    : { data: [] }
  const first = (earlier ?? [])[0] as { id: string; quote_id: string | null; client_id: string | null } | undefined
  if (first) {
    await settle({ outcome: 'duplicate', reason: `Same order as intake ${first.id}`, quote_id: first.quote_id, client_id: first.client_id, resolved_at: new Date().toISOString() })
    return { outcome: 'duplicate', intakeId, quoteId: first.quote_id ?? undefined }
  }

  let result: Awaited<ReturnType<typeof processTourUpOrder>> | null = null
  let thrown: string | null = null
  try {
    result = await runPipeline(db as unknown as SupabaseClient, { orgId, userId: null, order, dryRun: false })
  } catch (e) {
    thrown = e instanceof Error ? e.message : String(e)
    console.error('[web-order] pipeline threw:', e)
  }

  const quote = result?.body.quote
  if (result?.body.success && quote) {
    const client = result.body.client as { id: string } | null | undefined
    const itinerary = result.body.itinerary as { id: string; code: string } | null | undefined
    await settle({
      outcome: 'quote_created',
      reason: null,
      client_id: client?.id ?? null,
      quote_id: quote.id,
      departure_booking_id: result.body.departureBooking?.id ?? null,
      resolved_at: new Date().toISOString(),
    })
    await notifyOrgManagers(db as never, orgId, {
      type: 'order_received',
      title: itinerary ? `ウェブ注文 ${itinerary.code}: ${order.tourCode}` : `ウェブ注文 ${quote.quote_number}: ${order.tourCode}`,
      // A party larger than the seats left got no seat hold: say so.
      message: `${viaLabel}自動作成。${result.body.departureFull ? `座席は未確保（出発の空き ${result.body.departureFull.free} 席に対し ${result.body.departureFull.requested} 名）。` : ''}${summary}`,
      link: itinerary ? `/itineraries/${itinerary.id}` : `/b2b/quotes/${quote.id}`,
    })
    return { outcome: 'quote_created', intakeId, quoteId: quote.id, quoteNumber: quote.quote_number, itineraryId: itinerary?.id }
  }

  const reason = (result?.body.error as string | undefined) ?? thrown ?? 'Internal error'
  await settle({ reason, client_id: (result?.body.client as { id?: string } | null | undefined)?.id ?? null })
  await notifyOrgManagers(db as never, orgId, {
    type: 'order_received',
    title: `要対応のウェブ注文: ${order.tourCode}`,
    message: `${viaLabel}。自動処理できませんでした（${reason}）。リンク先で内容を確認し、取り込んでください。${summary}`,
    link: intakeLink(intakeId),
  })
  return { outcome: 'needs_attention', intakeId, reason }
}
