// ============================================
// Which menu item is the current page?
// ============================================
// Several items can point at one page with different query values
// (/invoices and /invoices?tab=unpaid), so "is this link active" cannot be
// answered link by link — it has to pick the most specific item:
//
//   1. same path, and every query value the link names is in the address
//      (the link naming the most values wins: ?tab=unpaid beats bare /invoices)
//   2. otherwise the longest link path the address sits under
//      (/clients/abc → Clients)
//   3. otherwise an item's `match` paths (an old page that redirects here)
//
// Links with a #hash never match: they are fold toggles, not pages.

export interface Matchable {
  href: string
  match?: string[]
}

const under = (path: string, base: string) => path === base || path.startsWith(base + '/')

/** The href of the item the address belongs to, or null. */
export function activeHref(items: readonly Matchable[], pathname: string, search: string | URLSearchParams = ''): string | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  let best: { href: string; score: number } | null = null
  const consider = (href: string, score: number) => {
    if (!best || score > best.score) best = { href, score }
  }

  for (const item of items) {
    if (item.href.includes('#')) continue
    const [path, query = ''] = item.href.split('?')
    const wanted = [...new URLSearchParams(query).entries()]

    if (path === pathname && wanted.every(([k, v]) => params.get(k) === v)) {
      consider(item.href, 3_000_000 + wanted.length)
    } else if (wanted.length === 0 && path !== '/' && under(pathname, path)) {
      consider(item.href, 2_000_000 + path.length)
    }
    for (const m of item.match ?? []) {
      if (under(pathname, m)) consider(item.href, 1_000_000 + m.length)
    }
  }
  return best ? (best as { href: string }).href : null
}
