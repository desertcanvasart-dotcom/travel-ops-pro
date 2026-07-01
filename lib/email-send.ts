import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedGmail, GmailAuthError } from '@/lib/gmail'

/**
 * In-process transactional email sender (Gmail API via the first connected
 * OAuth account).
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
  const { to, subject, html, attachment } = input

  if (!to) {
    return { success: false, error: 'Recipient email is required' }
  }

  try {
    // Get first connected Gmail account (system-level sending)
    const { data: tokenRecord } = await supabase
      .from('gmail_tokens')
      .select('user_id')
      .limit(1)
      .single()

    if (!tokenRecord) {
      return {
        success: false,
        noAccount: true,
        error: 'Gmail not connected. Please connect your Gmail account in Settings.',
      }
    }

    // Get authenticated Gmail client via centralized helper
    let gmail
    try {
      const auth = await getAuthenticatedGmail(tokenRecord.user_id)
      gmail = auth.gmail
    } catch (err) {
      if (err instanceof GmailAuthError) {
        return { success: false, authError: true, error: err.message }
      }
      throw err
    }

    const rawEmail = attachment
      ? buildEmailWithAttachment(to, subject, html, attachment.filename, attachment.contentBase64)
      : buildSimpleEmail(to, subject, html)

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

// RFC 2047 encoded-word for a header value (e.g. a Japanese Subject). Email
// headers must be 7-bit ASCII; a raw non-ASCII Subject mojibakes in many
// clients. ASCII subjects are passed through unchanged.
function encodeEmailHeader(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function buildSimpleEmail(to: string, subject: string, body: string): string {
  const fromAddress = process.env.GMAIL_USER || 'info@travel2egypt.org'
  const fromName = 'Islam Mohamed - Travel2Egypt.org'

  // The HTML body is base64-encoded (Content-Transfer-Encoding: base64) so
  // multi-byte UTF-8 (Japanese) survives intact rather than being emitted as
  // raw 8-bit text under a default 7-bit assumption.
  const emailLines = [
    `From: ${fromName} <${fromAddress}>`,
    `To: ${to}`,
    `Bcc: ${fromAddress}`,
    `Subject: ${encodeEmailHeader(subject)}`,
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
  to: string,
  subject: string,
  body: string,
  filename: string,
  attachmentBase64: string
): string {
  const fromAddress = process.env.GMAIL_USER || 'info@travel2egypt.org'
  const fromName = 'Islam Mohamed - Travel2Egypt.org'
  const boundary = `boundary_${Date.now()}`

  const emailParts = [
    `From: ${fromName} <${fromAddress}>`,
    `To: ${to}`,
    `Bcc: ${fromAddress}`,
    `Subject: ${encodeEmailHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
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
