// ============================================
// The raw message a compose sends (or saves as a draft)
// ============================================
// One builder for /api/gmail/send and /api/gmail/drafts, so a draft and the
// email it becomes are the same message. Headers go in cleaned of CR/LF
// (lib/http/safe-header): a newline in To, Cc or Subject would add a header.
// The subject is an RFC 2047 encoded-word, the body base64, attachment names
// ASCII + RFC 2231.

import { headerSafe, encodeEmailHeader } from '@/lib/http/safe-header'
import { threadingLines, type ThreadingHeaders } from '@/lib/email/reply-threading'

export interface ComposeAttachment {
  filename: string
  mimeType: string
  data: string // base64
}

export interface ComposeMessage {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body: string
  attachments?: ComposeAttachment[]
  threading?: ThreadingHeaders
}

// "Name <a@b.c>" or "a@b.c": the address part.
const ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/

function addressOf(entry: string): string {
  const angle = entry.match(/<([^<>]+)>\s*$/)
  return (angle ? angle[1] : entry).trim()
}

/**
 * Recipients from what a compose field holds: a string with commas or
 * semicolons, or an array. Each kept as typed ("Name <a@b.c>" stays), cleaned
 * of control characters, duplicates (by address, case-insensitive) dropped.
 * `invalid` lists what is not an address, so the caller can refuse it rather
 * than send to part of the list.
 */
export function parseRecipients(value: unknown): { list: string[]; invalid: string[] } {
  const raw: string[] = Array.isArray(value)
    ? value.flatMap(v => String(v ?? '').split(/[,;]/))
    : typeof value === 'string' ? value.split(/[,;]/) : []
  const list: string[] = []
  const invalid: string[] = []
  const seen = new Set<string>()
  for (const part of raw) {
    const entry = headerSafe(part)
    if (!entry) continue
    const address = addressOf(entry)
    if (!ADDRESS.test(address)) {
      invalid.push(entry)
      continue
    }
    const key = address.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push(entry)
  }
  return { list, invalid }
}

/** Lower-cased addresses only, for comparing recipients. */
export function addressesOf(list: string[]): string[] {
  return list.map(e => addressOf(e).toLowerCase())
}

/** The message as Gmail's `raw`: RFC 2822, base64url. */
export function buildRawMessage(m: ComposeMessage): string {
  const head = [
    // A draft may not have a recipient yet.
    ...(m.to.length ? [`To: ${m.to.map(headerSafe).join(', ')}`] : []),
    ...(m.cc?.length ? [`Cc: ${m.cc.map(headerSafe).join(', ')}`] : []),
    // Gmail drops the Bcc header from what recipients get and delivers to it.
    ...(m.bcc?.length ? [`Bcc: ${m.bcc.map(headerSafe).join(', ')}`] : []),
    `Subject: ${encodeEmailHeader(headerSafe(m.subject))}`,
    ...threadingLines(m.threading ?? {}),
    'MIME-Version: 1.0',
  ]

  let lines: string[]
  if (m.attachments && m.attachments.length > 0) {
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`
    lines = [
      ...head,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(m.body).toString('base64'),
    ]
    for (const attachment of m.attachments) {
      const safeName = headerSafe(attachment.filename).replace(/"/g, '')
      const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_')
      lines.push(
        `--${boundary}`,
        `Content-Type: ${headerSafe(attachment.mimeType)}; name="${asciiName}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        '',
        attachment.data
      )
    }
    lines.push(`--${boundary}--`)
  } else {
    lines = [
      ...head,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(m.body).toString('base64'),
    ]
  }

  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
