// ============================================
// Autoura's own notification mail — never inbox correspondence
// ============================================
// Staff notifications (the rate-change digest, assignments, reminders —
// lib/notifications), invitations and ops alerts go out from the company's
// connected mailbox (lib/email-send). The mailbox sync then read each one as
// "the office wrote here" and stored it as a conversation: one per staff
// recipient, five new rows per digest. On ATS 62 of 71 open inbox
// conversations were these (2026-11-07); deleting them could never keep up,
// and it read as "delete does not work".
//
// They are marked when sent (X-Autoura-Notification + Auto-Submitted) and the
// sync never stores a thread made only of them. Mail sent before the marker
// existed is recognised by the subject prefix sendNotificationEmail has always
// used, outbound only — a customer cannot make their mail look like ours.
//
// Pure.

export const OWN_NOTIFICATION_HEADER = 'X-Autoura-Notification'

/** The extra MIME header lines a marked send carries. */
export const OWN_NOTIFICATION_HEADER_LINES = [
  `${OWN_NOTIFICATION_HEADER}: 1`,
  // RFC 3834: machine-generated; well-behaved auto-responders stay quiet.
  'Auto-Submitted: auto-generated',
]

/** The subject prefix lib/notifications sendNotificationEmail puts on every notification. */
export const NOTIFICATION_SUBJECT_PREFIX = '[Autoura] '

/**
 * Is this message one of Autoura's own notifications? Only an OUTBOUND
 * message (from the connected mailbox) can be.
 */
export function isOwnNotificationMail(m: {
  outbound: boolean
  headers: Record<string, string>
  subject?: string | null
}): boolean {
  if (!m.outbound) return false
  const marked = Object.keys(m.headers).some(k => k.toLowerCase() === OWN_NOTIFICATION_HEADER.toLowerCase())
  if (marked) return true
  return String(m.subject ?? '').startsWith(NOTIFICATION_SUBJECT_PREFIX)
}
