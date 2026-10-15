// ============================================
// Address suggestions: one list from several sources
// ============================================
// The same address can be a client, an email correspondent and a supplier
// contact at once: it is suggested once, under its most specific source and
// the best name any source has. Matches at the start of the address or name
// come before matches inside it.

export type RecipientSource = 'client' | 'partner' | 'supplier' | 'team' | 'email'

export interface RecipientSuggestion {
  email: string
  name: string
  source: RecipientSource
}

// Which source names the person best: a client record over a mail header.
const SOURCE_ORDER: RecipientSource[] = ['client', 'partner', 'supplier', 'team', 'email']
const ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/

export function rankRecipients(found: RecipientSuggestion[], query: string, limit: number): RecipientSuggestion[] {
  const q = query.trim().toLowerCase()
  const byAddress = new Map<string, RecipientSuggestion>()
  for (const s of found) {
    const email = String(s.email ?? '').trim()
    if (!ADDRESS.test(email)) continue
    const key = email.toLowerCase()
    const name = String(s.name ?? '').trim()
    const have = byAddress.get(key)
    if (!have) {
      byAddress.set(key, { email, name, source: s.source })
      continue
    }
    if (SOURCE_ORDER.indexOf(s.source) < SOURCE_ORDER.indexOf(have.source)) {
      byAddress.set(key, { email: have.email, name: name || have.name, source: s.source })
    } else if (!have.name && name) {
      have.name = name
    }
  }

  const score = (s: RecipientSuggestion) => {
    const email = s.email.toLowerCase()
    const name = s.name.toLowerCase()
    const starts = email.startsWith(q) || name.startsWith(q) || name.split(/\s+/).some(w => w.startsWith(q))
    return (starts ? 0 : 10) + SOURCE_ORDER.indexOf(s.source)
  }
  return [...byAddress.values()]
    .sort((a, b) => score(a) - score(b) || a.email.localeCompare(b.email))
    .slice(0, limit)
}

/** "Name <a@b.c>", or the bare address when there is no name. */
export function formatRecipient(s: Pick<RecipientSuggestion, 'email' | 'name'>): string {
  const name = s.name.replace(/[<>",;]/g, '').trim()
  return name ? `${name} <${s.email}>` : s.email
}
