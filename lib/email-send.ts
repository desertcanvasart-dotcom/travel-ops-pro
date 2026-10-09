import { createClient } from '@supabase/supabase-js'
import { businessIdentity, orgIdentity } from '@/lib/org-identity'
import { headerSafe, safeEmailAddress, encodeEmailHeader } from '@/lib/http/safe-header'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'
import { orgGmailSenderId } from '@/lib/email/org-gmail-sender'

/**
 * In-process transactional email sender (Gmail API): an organization's mail
 * from that organization's own connected mailbox, the platform's from the
 * GMAIL_USER mailbox.
 *
 * Server-only. This is the single send path shared by the /api/send-email
 * route and every internal caller (reminders, notifications, invitations,
 * booking confirmations, scheduled sends, …).
 *
 * WHY this exists: the /api/* middleware auth gate rejects any request without
 * a user session (401 "Unauthorized"). Internal callers are server-to-server
 * and carry no session cookie, so an HTTP fetch to /api/send-email is always
 * gated. Calling sendEmailInternal() directly bypasses the HTTP round-trip and
 * the gate entirely, while /api/send-email keeps requiring auth for browser
 * callers. Mirrors the sibling app's lib/email-send.ts ("gate-reconciled").
 *
 * Returns a { success, error } result (never throws for expected failures) so
 * callers can log failures without depending on an HTTP status code.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface SendEmailAttachment {
  filename: string
  /** Base64-encoded file contents. */
  contentBase64: string
}

export interface SendEmailInternalInput {
  to: string
  subject: string
  html: string
  attachment?: SendEmailAttachment
  /**
   * The organization this mail is sent for. When given, it goes out from that
   * organization's own mailbox (lib/email/org-gmail-sender) and never from
   * another organization's; with none connected, nothing is sent. Omit it
   * only for the platform's own mail (staff notifications, ops alerts).
   */
  orgId?: string | null
  /** Prefer this member's mailbox within `orgId` (the user who clicked Send). */
  senderUserId?: string | null
}

export interface SendEmailInternalResult {
  success: boolean
  messageId?: string | null
  error?: string
  /** True when no Gmail account is connected (nothing to send from). */
  noAccount?: boolean
  /** True when the connected Gmail account's OAuth token is invalid/expired. */
  authError?: boolean
}

export async function sendEmailInternal(
  input: SendEmailInternalInput
): Promise<SendEmailInternalResult> {
  const { to, subject, html, attachment, orgId, senderUserId } = input

  if (!to) {
    return { success: false, error: 'Recipient email is required' }
  }

  try {
    // This used to send everything (reminders, confirmations, quotes, every
    // organization's mail to its customers) through the FIRST row of
    // gmail_tokens, whichever organization's mailbox that was, with a Bcc
    // to the platform's GMAIL_USER.
    const senderId = orgId
      ? await orgGmailSenderId(supabase, orgId, senderUserId ?? null)
      : await platformSenderId()

    if (!senderId) {
      return {
        success: false,
        noAccount: true,
        error: 'Gmail not connected. Please connect your Gmail account in Settings.',
      }
    }

    // Get authenticated Gmail client via centralized helper
    let gmail
    let fromAddress: string
    try {
      const auth = await getAuthenticatedGmail(senderId)
      gmail = auth.gmail
      fromAddress = auth.emailAddress
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return { success: false, authError: true, error: err.message }
      }
      throw err
    }

    // The From name: the organization's own (Settings), else the platform's.
    const fromName = orgId ? (await orgIdentity(orgId)).name : businessIdentity().name
    const from = fromHeader(fromName, fromAddress)
    const rawEmail = attachment
      ? buildEmailWithAttachment(from, to, subject, html, attachment.filename, attachment.contentBase64)
      : buildSimpleEmail(from, to, subject, html)

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawEmail },
    })

    return { success: true, messageId: response.data.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('sendEmailInternal failed:', message)
    return { success: false, error: message }
  }
}

// ============================================
// EMAIL BUILDING HELPERS
// ============================================

// RFC 2047 encodeEmailHeader lives with the other header helpers
// (lib/http/safe-header); re-exported for existing importers.
export { encodeEmailHeader }

/**
 * The platform's own mailbox, for mail no organization sends: the connected
 * account whose address is GMAIL_USER, else (legacy installs that never set
 * it) the first connected account.
 */
async function platformSenderId(): Promise<string | null> {
  const platformAddress = (process.env.GMAIL_USER || '').trim()
  if (platformAddress) {
    const { data } = await supabase
      .from('gmail_tokens')
      .select('user_id')
      .ilike('email', platformAddress)
      .limit(1)
      .maybeSingle()
    if (data?.user_id) return data.user_id
  }
  const { data } = await supabase.from('gmail_tokens').select('user_id').limit(1).maybeSingle()
  return data?.user_id ?? null
}

// From is the sending account's own address (Gmail would rewrite any other);
// there is no Bcc: the copy is in that account's Sent folder. The name is the
// operator's, not ours; blank lets the mail client show the address rather
// than name the wrong company.
function fromHeader(fromName: string, fromAddress: string): string {
  const name = headerSafe(fromName)
  const address = safeEmailAddress(fromAddress)
  if (!address) return ''
  return name ? `From: ${encodeEmailHeader(name)} <${address}>` : `From: ${address}`
}

function buildSimpleEmail(from: string, to: string, subject: string, body: string): string {
  // The HTML body is base64-encoded (Content-Transfer-Encoding: base64) so
  // multi-byte UTF-8 (Japanese) survives intact rather than being emitted as
  // raw 8-bit text under a default 7-bit assumption.
  const emailLines = [
    from,
    `To: ${safeEmailAddress(to)}`,
    `Subject: ${encodeEmailHeader(headerSafe(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body, 'utf8').toString('base64'),
  ]

  return Buffer.from(emailLines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function buildEmailWithAttachment(
  from: string,
  to: string,
  subject: string,
  body: string,
  filename: string,
  attachmentBase64: string
): string {
  const boundary = `boundary_${Date.now()}`
  // Headers are 7-bit: a Japanese client's name in the file name arrived as
  // mojibake or "noname", and a quote in it broke the header. An ASCII name
  // plus the RFC 2231 UTF-8 one every current client reads.
  const safeName = headerSafe(filename).replace(/"/g, '')
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_')
  const utf8Name = encodeURIComponent(safeName)

  const emailParts = [
    from,
    `To: ${safeEmailAddress(to)}`,
    `Subject: ${encodeEmailHeader(headerSafe(subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${asciiName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
    '',
    attachmentBase64,
    `--${boundary}--`,
  ]

  return Buffer.from(emailParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
