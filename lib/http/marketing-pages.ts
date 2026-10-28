// ============================================
// A company's own install hides Autoura's sales pages
// ============================================
// One build serves both autoura.net (which sells Autoura) and a company's own
// install (e.g. ATS on system.ats-hj.com). On the install, the home page and
// the product pages are Autoura's, not the company's: its staff and customers
// should never land on them. MARKETING_PAGES=off sends each of them to /login
// (307 — the setting can be switched back), and /login already sends a
// signed-in user on to /dashboard.
//
// Only Autoura's own pages are listed. The company's customer-facing pages
// (/order, /portal, /share, /survey/, /staff) and the guides (/guide, /docs)
// keep working.

const MARKETING_PATHS = ['/about', '/integrations', '/blog', '/contact', '/signup', '/terms', '/privacy']

/** Is the marketing site switched off on this install? Unset = on. */
export function marketingPagesOff(setting: string | undefined): boolean {
  return (setting ?? '').trim().toLowerCase() === 'off'
}

/** Where to send this page, or null when it is not hidden. */
export function marketingPageRedirect(pathname: string, setting: string | undefined): string | null {
  if (!marketingPagesOff(setting)) return null
  if (pathname === '/') return '/login'
  return MARKETING_PATHS.some(p => pathname === p || pathname.startsWith(p + '/')) ? '/login' : null
}
