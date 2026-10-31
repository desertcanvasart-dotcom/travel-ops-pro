// ============================================
// Settings › "Back to app"
// ============================================
// The Settings area replaces the sidebar, so it needs its own way out: back
// to the last page opened OUTSIDE Settings. The root layout remembers each
// such page in sessionStorage (per tab, gone when the tab closes); the
// Settings menu reads it, falling back to the dashboard. Storage can throw
// (private mode, blocked site data) — then the fallback is all there is.

import { safeReturnPath } from '@/lib/nav/return-to'

const KEY = 'autoura-last-app-page'
export const APP_HOME = '/dashboard'

export const isSettingsPath = (pathname: string) => pathname === '/settings' || pathname.startsWith('/settings/')

/** Remember `path` (with its query) as the page to go back to. */
export function rememberAppPage(path: string): void {
  try {
    if (!isSettingsPath(path.split('?')[0])) sessionStorage.setItem(KEY, path)
  } catch {
    // no storage: Back to app goes to the dashboard
  }
}

/** The page to go back to: the last one outside Settings, or the dashboard. */
export function lastAppPage(): string {
  try {
    return safeReturnPath(sessionStorage.getItem(KEY)) ?? APP_HOME
  } catch {
    return APP_HOME
  }
}
