// ============================================
// An install that has moved to another address
// ============================================
// When a company's Autoura moves (e.g. ATS: autoura.net → system.ats-hj.com),
// the old address keeps running only to forward. SITE_MOVED_TO names the new
// origin; every request is sent there, same path and query, with 308 — a
// permanent redirect that keeps the method and body, so a POST stays a POST.
// /api/version is the exception: it still answers on the old address, so a
// check can tell which copy it reached.

/** Where to send this request, or null when the install has not moved. */
export function siteMovedRedirect(pathname: string, search: string, movedTo: string | undefined): string | null {
  if (!movedTo || pathname === '/api/version') return null
  let target: URL
  try {
    target = new URL(movedTo)
  } catch {
    return null
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return null
  return `${target.protocol}//${target.host}${pathname}${search}`
}
