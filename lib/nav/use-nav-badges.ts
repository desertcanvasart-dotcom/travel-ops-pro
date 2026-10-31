'use client'

// ============================================
// The sidebar's counts (lib/nav/config.ts `badge`)
// ============================================
// email, whatsapp: unread messages (/api/unified/unread-counts, the numbers
// the dashboard shows too). Read after mount, every minute and when the
// window regains focus; only for someone the inboxes are for — a viewer's
// request would be refused. A failed read shows no badge, never a stale or
// made-up one.

import { useEffect, useState } from 'react'

export type NavBadges = Partial<Record<string, number>>

const EVERY_MS = 60_000

export function useNavBadges(enabled: boolean): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({})

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/unified/unread-counts')
        const json = res.ok ? await res.json() : null
        if (!cancelled) setBadges(json?.success ? json.data : {})
      } catch {
        if (!cancelled) setBadges({})
      }
    }
    load()
    const timer = setInterval(load, EVERY_MS)
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [enabled])

  return badges
}
