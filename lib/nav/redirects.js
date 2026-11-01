// ============================================
// Old addresses → their new homes
// ============================================
// One list, read by next.config.ts (redirects()) and by
// __tests__/lib/nav-redirects.test.ts, which checks that no old address still
// has a page under app/ and that every destination does. CommonJS so the
// config can require it without a build step.
//
// next.config redirects run BEFORE the middleware, so an agent asking for
// /settings is sent on to /settings/profile and never meets the
// managers-only '/settings' page gate. They are read when the dev server
// starts: restart it after changing this file.

/** The old Settings tabs (/settings?tab=x) and the page each became. */
const SETTINGS_TABS = {
  profile: '/settings/profile',
  email: '/settings/email',
  notifications: '/settings/notifications',
  preferences: '/settings/preferences',
  integrations: '/settings/accounting',
  partners: '/settings/integrations',
  organization: '/settings/company',
}

/** Pages that moved. A trailing /* moves the page's sub-pages with it;
 *  without it only the page itself moves, and its sub-pages stay. */
const MOVED = [
  ['/templates', '/settings/message-templates'],
  ['/team-members', '/settings/staff-directory'],
  ['/departments', '/settings/departments'],
  ['/users', '/settings/users'],
  ['/activity', '/settings/activity-log'],
  ['/content-library/*', '/settings/content-library/*'],
  ['/copilot-knowledge', '/settings/copilot-knowledge'],
  ['/copilot/settings', '/settings/copilot'],
  ['/rates/seasons', '/settings/seasonal-premiums'],
  // Reports (PR 2): three sibling pages became tabs of one.
  ['/analytics', '/reports?tab=analytics'],
  ['/financial-reports', '/reports?tab=finance'],
  ['/copilot-analytics', '/reports?tab=copilot'],
  // Inbox: the conversations and WhatsApp inboxes became tabs of /inbox (whose
  // own address is the Email tab's page). Their query (?conversation=…) is kept.
  ['/communications', '/inbox?channel=all'],
  ['/whatsapp-inbox', '/inbox?channel=whatsapp'],
  // Quotes: the two lists became tabs; each quote keeps /b2c|b2b/quotes/<id>.
  ['/b2c/quotes', '/quotes?tab=b2c'],
  ['/b2b/quotes', '/quotes?tab=b2b'],
  // Tasks: follow-ups became the second tab (the list and its table unchanged).
  ['/followups', '/tasks?type=follow-up'],
  // Departures: the capacity month grid became the second view.
  ['/capacity', '/departures?view=capacity'],
  // Invoices: the receivables aging became the Unpaid tab.
  ['/accounts-receivable', '/invoices?tab=unpaid'],
]

/** Where bare /settings lands. Not permanent: it is a default, not a move. */
const SETTINGS_HOME = '/settings/profile'

/**
 * The list in next.config's redirects() shape.
 * @returns {import('next/dist/lib/load-custom-routes').Redirect[]}
 */
function nextRedirects() {
  /** @type {import('next/dist/lib/load-custom-routes').Redirect[]} */
  const out = []
  for (const [tab, destination] of Object.entries(SETTINGS_TABS)) {
    out.push({ source: '/settings', has: [{ type: 'query', key: 'tab', value: tab }], destination, permanent: true })
  }
  out.push({ source: '/settings', destination: SETTINGS_HOME, permanent: false })
  for (const [from, to] of MOVED) {
    if (from.endsWith('/*')) {
      const base = from.slice(0, -2)
      const target = to.slice(0, -2)
      out.push({ source: base, destination: target, permanent: true })
      out.push({ source: `${base}/:path*`, destination: `${target}/:path*`, permanent: true })
    } else {
      out.push({ source: from, destination: to, permanent: true })
    }
  }
  return out
}

module.exports = { SETTINGS_TABS, MOVED, SETTINGS_HOME, nextRedirects }
