import { redirect } from 'next/navigation'
import { SETTINGS_TABS, SETTINGS_HOME } from '@/lib/nav/redirects'

// ============================================
// /settings — no page of its own any more
// ============================================
// Each old tab is a page; next.config.ts sends /settings?tab=x on to it, and
// bare /settings to Profile (lib/nav/redirects.js). This is the same answer
// for anything that reaches the route without passing through those
// redirects.
export default async function SettingsIndex({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  redirect((tab && SETTINGS_TABS[tab as keyof typeof SETTINGS_TABS]) || SETTINGS_HOME)
}
