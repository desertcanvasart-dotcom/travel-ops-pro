// ============================================
// Mail the office's own website sends on a traveller's behalf
// ============================================
// A website form ("Itinerary request") emails the office FROM an office
// address (concierge@ on the company's own domain) TO an office address
// (info@ / hello@), with the traveller in Reply-To ("Reply to this email to
// reach the traveller").
//
// Sync decided direction from the From alone, so every such request read as
// the office writing to itself: it was filed as outbound with the office as
// the customer, lead detection called it 'office', and a reply went back to
// the office. The enquiry never reached anyone.
//
// The rule: when the From is the office, every recipient is the office (or
// there is none), and the Reply-To names someone outside the office, that
// person is the sender. Anything else (a colleague forwarding mail by hand,
// staff writing to a client, an internal note) is unchanged.
//
// Pure, and safe to use in the browser. Ported from autoura-saas #812.

import { bareAddress, isOfficeAddress, type OfficeRule } from './office-addresses'

/**
 * Every address in a header ("A <a@x.com>, \"Doe, J\" <j@y.com>, k@z.com"),
 * lower-cased, in order. Commas inside quotes or <> do not split.
 */
export function headerAddresses(value: string | null | undefined): string[] {
  return headerEntries(value).map(p => bareAddress(p)).filter(a => a.includes('@'))
}

/** A header's entries as written ("Jane <j@x.com>"); commas inside quotes or <> do not split. */
function headerEntries(value: string | null | undefined): string[] {
  const v = String(value ?? '')
  if (!v.trim()) return []
  const pieces: string[] = []
  let cur = '', quoted = false, angle = false
  for (const ch of v) {
    if (ch === '"') quoted = !quoted
    else if (ch === '<' && !quoted) angle = true
    else if (ch === '>' && !quoted) angle = false
    if (ch === ',' && !quoted && !angle) { pieces.push(cur); cur = '' } else cur += ch
  }
  pieces.push(cur)
  return pieces.map(p => p.trim()).filter(Boolean)
}

export interface SenderHeaders {
  from?: string | null
  to?: string | null
  cc?: string | null
  replyTo?: string | null
}

/** The outside person a form relayed this message for, or null when it was not relayed. */
export function relayedSender(office: OfficeRule, h: SenderHeaders): string | null {
  const from = headerAddresses(h.from)[0]
  if (!from || !isOfficeAddress(office, from)) return null

  const recipients = [...headerAddresses(h.to), ...headerAddresses(h.cc)]
  if (recipients.some(a => !isOfficeAddress(office, a))) return null

  return headerAddresses(h.replyTo).find(a => !isOfficeAddress(office, a)) ?? null
}

export interface EffectiveSender {
  direction: 'inbound' | 'outbound'
  /** The address to file the message under as its sender ('' when none). */
  email: string
  /** True when a form on the office's website wrote on this person's behalf. */
  relayed: boolean
}

/** Who really wrote this message, and which way it goes. */
export function effectiveSender(office: OfficeRule, h: SenderHeaders): EffectiveSender {
  const relayed = relayedSender(office, h)
  if (relayed) return { direction: 'inbound', email: relayed, relayed: true }
  const from = headerAddresses(h.from)[0] ?? ''
  if (!h.from) return { direction: 'inbound', email: from, relayed: false }
  return { direction: isOfficeAddress(office, from) ? 'outbound' : 'inbound', email: from, relayed: false }
}

/**
 * The traveller's Reply-To entry ("Jane Doe <jane@x.com>"), for filing the
 * message as from them so the name shows and a reply goes to them.
 */
export function relayedFromHeader(office: OfficeRule, replyTo: string | null | undefined): string {
  return headerEntries(replyTo).find(p => bareAddress(p).includes('@') && !isOfficeAddress(office, p)) ?? ''
}

/**
 * Who really wrote a Gmail message, from its headers. Ours when the sender is
 * the office (lib/email/office-addresses: the connected mailbox, its domain,
 * or an address listed in Settings); the traveller's when a form on the
 * office's own website relayed it (above). `fromHeader` is the header to file
 * it under: the From as written, or the traveller's Reply-To entry, so their
 * name shows and a reply goes to them.
 */
export function messageSender(
  headers: ReadonlyArray<{ name?: string | null; value?: string | null }>,
  rule: OfficeRule,
): EffectiveSender & { fromHeader: string } {
  const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
  const sender = effectiveSender(rule, { from: get('From'), to: get('To'), cc: get('Cc'), replyTo: get('Reply-To') })
  const fromHeader = sender.relayed ? (relayedFromHeader(rule, get('Reply-To')) || sender.email) : get('From')
  return { ...sender, fromHeader }
}
