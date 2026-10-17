// ============================================
// Can this role open that page? — asked of the side menu
// ============================================
// The dashboard links to pages across the app (stat cards, Quick Actions,
// "View all"). A link to a page the role cannot open is a dead end, so the
// dashboard asks the menu (components/nav/navigation-config.ts) — the one
// place that says who sees each page — rather than keeping its own list that
// would drift from it. An item's roles are its own, else its section's;
// neither means everyone. The owner passes every gate (roleAllows).
//
// A link to a sub-page (/itineraries/new, /clients/<id>) is answered by the
// deepest menu item whose path contains it. A path the menu does not know at
// all answers no: fail closed, like roleAllows.

import { navigationConfig, type NavConfig } from '@/components/nav/navigation-config'
import { roleAllows } from '@/lib/auth/roles'

interface MenuEntry { path: string; roles: readonly string[] | null }

export function menuEntries(config: readonly NavConfig[] = navigationConfig): MenuEntry[] {
  const out: MenuEntry[] = []
  for (const section of config) {
    for (const item of section.items) {
      const roles = item.roles ?? section.roles ?? null
      out.push({ path: item.href.split('#')[0], roles })
      for (const child of item.children || []) {
        out.push({ path: child.href.split('#')[0], roles: child.roles ?? roles })
      }
    }
  }
  return out
}

/** The menu's roles for the page at `href`, or undefined if the menu has no
 *  such page. null roles = everyone. */
export function menuRolesFor(href: string, config: readonly NavConfig[] = navigationConfig): readonly string[] | null | undefined {
  const path = href.split(/[?#]/)[0]
  let best: MenuEntry | undefined
  for (const e of menuEntries(config)) {
    const contains = path === e.path || path.startsWith(e.path + '/')
    if (contains && (!best || e.path.length > best.path.length)) best = e
  }
  return best ? best.roles : undefined
}

/** Does the menu let `role` open `href`? */
export function canOpenFromMenu(role: string | null | undefined, href: string, config: readonly NavConfig[] = navigationConfig): boolean {
  const roles = menuRolesFor(href, config)
  if (roles === undefined) return false
  if (roles === null) return roleAllows(role, ['admin', 'manager', 'agent', 'viewer'])
  return roleAllows(role, roles)
}
