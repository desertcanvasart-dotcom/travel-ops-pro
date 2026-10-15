// ============================================
// A newsletter's "List-Unsubscribe" header → how to unsubscribe
// ============================================
// RFC 2369: one or more <…> entries, an https link and/or a mailto. The link
// is opened in the person's own browser — the server never fetches a URL a
// sender put in an email (it would let any sender make the server call an
// address of their choosing). A mailto is sent from the mailbox, after asking.

export interface UnsubscribeOption {
  url: string | null
  mailto: { to: string; subject: string; body: string } | null
}

export function parseListUnsubscribe(header: string | null | undefined): UnsubscribeOption | null {
  if (!header) return null
  const entries = [...String(header).matchAll(/<([^<>]+)>/g)].map(m => m[1].trim())
  let url: string | null = null
  let mailto: UnsubscribeOption['mailto'] = null
  for (const entry of entries) {
    if (!url && /^https:\/\//i.test(entry)) {
      try { url = new URL(entry).toString() } catch { /* not a URL */ }
    } else if (!mailto && /^mailto:/i.test(entry)) {
      const [addr, query = ''] = entry.slice(7).split('?')
      const params = new URLSearchParams(query)
      const to = decodeURIComponent(addr).trim()
      if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) {
        mailto = { to, subject: params.get('subject') || 'unsubscribe', body: params.get('body') || 'unsubscribe' }
      }
    }
  }
  return url || mailto ? { url, mailto } : null
}
