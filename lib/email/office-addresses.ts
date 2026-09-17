// ============================================
// Which email addresses are the office's own
// ============================================
// Operator, 2026-09-17: the office writes to customers from more than the one
// connected mailbox (the connected info@ and a colleague's hello@ on the same
// domain). Sync called a message ours only when it came from the connected
// address exactly, so every reply sent from hello@ read as the CUSTOMER
// writing — the conversation stayed "awaiting reply" and hello@ even became
// the conversation's customer address. "Set the rule": whatever mailbox is
// connected (the operator will switch to a single one later), mail from the
// office is ours.
//
// An address is the office's when it is:
//   - the connected mailbox itself
//   - on the connected mailbox's domain — unless that is a public mail
//     provider (gmail.com), where the domain says nothing about who sent it
//   - listed in Settings → Email → Office addresses
//     (organizations.office_email_addresses, migration 20261020): a full
//     address ("reservations@partner-office.com") or a domain ("ats-hj.com")
//
// Client-safe.

export const PUBLIC_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.jp', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de',
  'mail.com', 'zoho.com', 'yandex.com', 'yandex.ru', 'qq.com', '163.com', 'docomo.ne.jp', 'ezweb.ne.jp',
  'softbank.ne.jp', 'i.softbank.jp', 'nifty.com',
])

/** The bare, lower-cased address in "Name <a@b.com>" or "a@b.com". */
export function bareAddress(value: string | null | undefined): string {
  const v = String(value ?? '')
  const m = v.match(/<([^>]+)>/)
  return (m ? m[1] : v).trim().toLowerCase()
}

const domainOf = (address: string) => address.includes('@') ? address.split('@').pop()! : ''

/** A Settings entry as stored: an address, or a domain without "@". Null when it is neither. */
export function normaliseOfficeEntry(entry: string): string | null {
  const v = entry.trim().toLowerCase().replace(/^@/, '')
  if (!v) return null
  if (/^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return v
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v)) return v
  return null
}

export interface OfficeRule {
  /** Every address the rule matches exactly. */
  addresses: string[]
  /** Every domain the rule matches. */
  domains: string[]
}

export function officeRule(connectedMailboxes: readonly string[], configured: readonly string[]): OfficeRule {
  const addresses = new Set<string>()
  const domains = new Set<string>()
  for (const m of connectedMailboxes) {
    const a = bareAddress(m)
    if (!a.includes('@')) continue
    addresses.add(a)
    const d = domainOf(a)
    if (d && !PUBLIC_MAIL_DOMAINS.has(d)) domains.add(d)
  }
  for (const e of configured) {
    const n = normaliseOfficeEntry(e)
    if (!n) continue
    if (n.includes('@')) addresses.add(n)
    else domains.add(n)
  }
  return { addresses: [...addresses], domains: [...domains] }
}

export function isOfficeAddress(rule: OfficeRule, value: string | null | undefined): boolean {
  const a = bareAddress(value)
  if (!a.includes('@')) return false
  return rule.addresses.includes(a) || rule.domains.includes(domainOf(a))
}
