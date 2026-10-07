// ============================================
// TRIP-MESSAGE NOTIFY — outcome-recorded office notification
// ============================================
// When a traveller writes on the share page, the office must find out — and
// when it CAN'T find out, that must be visible, not silent: unconfigured
// push, zero subscriptions and a dead push service all look like success to
// a fire-and-forget call.
//
// Push to the org's subscribed browsers first; failing that, an email to the
// organisation's contact address; then the message row's notify_outcome
// records what actually happened, and the office chat marks a message nobody
// was told about. Never throws — a notification failure must never fail the
// traveller's message. Ported from autoura-saas (lib/trip-message-notify.ts).

import { createClient } from '@supabase/supabase-js'
import { sendPushToOrg, type PushPayload, type PushResult } from '@/lib/push'
import type { SendEmailInternalResult } from '@/lib/email-send'

export type TripNotifyOutcome =
  | 'pending'
  | 'push_sent'
  | 'email_sent'
  | 'no_recipients'
  | 'not_configured'
  | 'failed'

export interface EmailAttempt {
  attempted: boolean
  success: boolean
  /** True when the failure is a setup problem (no mailbox connected), not a delivery problem. */
  configError?: boolean
}

/**
 * The outcome table, pure and tested:
 *   push sent                       → push_sent (email never attempted)
 *   push unusable, email accepted   → email_sent
 *   nothing configured anywhere     → not_configured
 *   configured but nobody reachable → no_recipients
 *   attempts made, all failed       → failed
 */
export function decideTripNotifyOutcome(push: PushResult['outcome'], email: EmailAttempt): TripNotifyOutcome {
  if (push === 'sent') return 'push_sent'
  if (email.attempted && email.success) return 'email_sent'
  if (email.attempted && !email.success) {
    return email.configError && push === 'not_configured' ? 'not_configured' : 'failed'
  }
  // Email never attempted: no contact address on file.
  if (push === 'not_configured') return 'not_configured'
  if (push === 'no_subscriptions') return 'no_recipients'
  return 'failed'
}

export interface TripMessageNotifyInput {
  orgId: string
  itineraryId: string
  messageId: string
  senderName: string
  tripName: string
  content: string
  appUrl?: string
}

interface Db {
  from(table: string): {
    select(cols: string): { eq(c: string, v: string): { maybeSingle(): PromiseLike<{ data: unknown }> } }
    update(patch: Record<string, unknown>): { eq(c: string, v: string): PromiseLike<{ error: unknown }> }
  }
}

export interface NotifyDeps {
  push: (orgId: string, payload: PushPayload) => Promise<PushResult>
  mail: (input: { to: string; subject: string; html: string }) => Promise<SendEmailInternalResult>
  db: () => Db
}

const liveDeps = (): NotifyDeps => ({
  push: sendPushToOrg,
  // Loaded on use: lib/email-send makes its database client at import.
  mail: async input => (await import('@/lib/email-send')).sendEmailInternal(input),
  db: () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  ) as unknown as Db,
})

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Notify the office of an inbound trip message and stamp the row's notify_outcome. */
export async function notifyTripMessage(input: TripMessageNotifyInput, deps: NotifyDeps = liveDeps()): Promise<TripNotifyOutcome> {
  let outcome: TripNotifyOutcome = 'failed'
  try {
    const preview = input.content.length > 120 ? `${input.content.slice(0, 117)}…` : input.content
    const pushResult = await deps.push(input.orgId, {
      title: `${input.senderName} — ${input.tripName}`,
      body: preview,
      url: `/itineraries/${input.itineraryId}#messages`,
      tag: `trip-msg-${input.itineraryId}`,
    })

    let email: EmailAttempt = { attempted: false, success: false }
    if (pushResult.outcome !== 'sent') {
      const { data: org } = await deps.db()
        .from('organizations')
        .select('contact_email')
        .eq('id', input.orgId)
        .maybeSingle()
      const contact = (org as { contact_email?: string | null } | null)?.contact_email
      if (contact) {
        const result = await deps.mail({
          to: contact,
          subject: `New trip message — ${input.tripName}`,
          html: `
            <p><strong>${escapeHtml(input.senderName)}</strong> wrote on <strong>${escapeHtml(input.tripName)}</strong>:</p>
            <blockquote style="border-left:3px solid #647C47;margin:0;padding:4px 12px;color:#333;white-space:pre-line">${escapeHtml(input.content)}</blockquote>
            <p><a href="${input.appUrl ?? ''}/itineraries/${input.itineraryId}#messages">Open the trip to reply</a></p>
          `,
        })
        email = { attempted: true, success: result.success, configError: !!(result.noAccount || result.authError) }
      }
    }
    outcome = decideTripNotifyOutcome(pushResult.outcome, email)
  } catch (err) {
    console.error('[trip-notify] unexpected:', err)
    outcome = 'failed'
  }

  try {
    const { error } = await deps.db().from('trip_messages').update({ notify_outcome: outcome }).eq('id', input.messageId)
    if (error) console.error('[trip-notify] outcome stamp failed:', error)
  } catch (err) {
    console.error('[trip-notify] outcome stamp threw:', err)
  }
  return outcome
}
