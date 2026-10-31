// ============================================
// Can this role open that page? — asked of the side menu
// ============================================
// The dashboard links to pages across the app (stat cards, Quick Actions,
// "View all"). A link to a page the role cannot open is a dead end, so the
// dashboard asks the menus (lib/nav/config.ts: the sidebar, the Settings
// area and the ⌘K-only pages) — the one place that says who sees each page —
// rather than keeping its own list that would drift from it. An item's roles
// are its own, else its section's; neither means everyone. The owner passes
// every gate (roleAllows).
//
// A link to a sub-page (/itineraries/new, /clients/<id>) is answered by the
// deepest menu item whose path contains it. A path the menu does not know at
// all answers no: fail closed, like roleAllows.

import { navEntries } from '@/lib/nav/config'
import { roleAllows } from '@/lib/auth/roles'

interface MenuEntry { path: string; roles: readonly string[] | null }

export function menuEntries(): MenuEntry[] {
  return navEntries().map(e => ({ path: e.item.href.split(/[?#]/)[0], roles: e.roles }))
}

/** The menu's roles for the page at `href`, or undefined if the menu has no
 *  such page. null roles = everyone. */
export function menuRolesFor(href: string): readonly string[] | null | undefined {
  const path = href.split(/[?#]/)[0]
  let best: MenuEntry | undefined
  for (const e of menuEntries()) {
    const contains = path === e.path || path.startsWith(e.path + '/')
    if (contains && (!best || e.path.length > best.path.length)) best = e
  }
  return best ? best.roles : undefined
}

/** Does the menu let `role` open `href`? */
export function canOpenFromMenu(role: string | null | undefined, href: string): boolean {
  const roles = menuRolesFor(href)
  if (roles === undefined) return false
  if (roles === null) return roleAllows(role, ['admin', 'manager', 'agent', 'viewer'])
  return roleAllows(role, roles)
}
