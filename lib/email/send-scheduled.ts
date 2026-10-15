// ============================================
// Send the scheduled emails that are due
// ============================================
// Run every minute by the in-process scheduler (send-scheduled-emails). Each
// due row is CLAIMED first (scheduled → sending, a conditional update), so a
// row is sent by one run only; then its Gmail draft is sent with drafts.send,
// which sends the draft as it now stands — edits made in Drafts after
// scheduling go out too.
//
// A failure Gmail may get over (rate limit, a 5xx, the network) is tried again
// five minutes later, three times in all. Anything else — the draft deleted or
// already sent by hand, the mailbox disconnected — fails at once, and the
// person who scheduled it is told in the app.

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

interface DraftSender {
  users: { drafts: { send: (p: { userId: string; requestBody: { id: string } }) => Promise<{ data: { id?: string | null; threadId?: string | null } }> } }
}

export interface ScheduledRow {
  id: string
  org_id: string
  created_by: string | null
  mailbox_user_id: string
  draft_id: string
  subject: string | null
  to_summary: string | null
  attempts: number
}

export interface SendScheduledDeps {
  db: Db
  gmailFor: (mailboxUserId: string) => Promise<DraftSender>
  notify: (input: { user_id: string; title: string; message: string }) => Promise<unknown>
  now?: Date
}

export const MAX_ATTEMPTS = 3
const RETRY_AFTER_MS = 5 * 60 * 1000

function retryable(err: unknown): boolean {
  const e = err as { code?: number | string; status?: number; response?: { status?: number } }
  const status = Number(e?.response?.status ?? e?.status ?? e?.code)
  if (status === 429 || (status >= 500 && status < 600)) return true
  return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(String(e?.code))
}

function reason(err: unknown): string {
  const e = err as { response?: { status?: number }; message?: string }
  if (e?.response?.status === 404) return 'The draft no longer exists (sent or deleted in Drafts).'
  return (e?.message || 'Unknown error').slice(0, 500)
}

export async function sendDueScheduledEmails(deps: SendScheduledDeps): Promise<{ sent: number; retried: number; failed: number }> {
  const now = deps.now ?? new Date()
  const { data: due, error } = await deps.db
    .from('scheduled_emails')
    .select('id, org_id, created_by, mailbox_user_id, draft_id, subject, to_summary, attempts')
    .eq('status', 'scheduled')
    .lte('send_at', now.toISOString())
    .order('send_at', { ascending: true })
    .limit(50)
  if (error) throw error

  let sent = 0, retried = 0, failed = 0
  for (const row of (due ?? []) as ScheduledRow[]) {
    // Claim: only the run that flips it from scheduled sends it.
    const { data: claimed } = await deps.db
      .from('scheduled_emails')
      .update({ status: 'sending', attempts: row.attempts + 1, updated_at: now.toISOString() })
      .eq('id', row.id)
      .eq('status', 'scheduled')
      .select('id')
    if (!claimed || claimed.length === 0) continue

    try {
      const gmail = await deps.gmailFor(row.mailbox_user_id)
      const { data } = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: row.draft_id } })
      await deps.db.from('scheduled_emails').update({
        status: 'sent', sent_message_id: data.id ?? null, sent_at: new Date().toISOString(),
        error: null, updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      sent++
    } catch (err) {
      const again = retryable(err) && row.attempts + 1 < MAX_ATTEMPTS
      await deps.db.from('scheduled_emails').update(again
        ? { status: 'scheduled', send_at: new Date(now.getTime() + RETRY_AFTER_MS).toISOString(), error: reason(err), updated_at: new Date().toISOString() }
        : { status: 'failed', error: reason(err), updated_at: new Date().toISOString() },
      ).eq('id', row.id)
      if (again) {
        retried++
      } else {
        failed++
        if (row.created_by) {
          await deps.notify({
            user_id: row.created_by,
            title: 'A scheduled email was not sent',
            message: `"${row.subject || '(no subject)'}"${row.to_summary ? ` to ${row.to_summary}` : ''}: ${reason(err)} It is still in Drafts.`,
          }).catch(() => {})
        }
      }
    }
  }
  return { sent, retried, failed }
}
