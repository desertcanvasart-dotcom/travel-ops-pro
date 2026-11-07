'use client'

// ============================================
// The Rates pages: an in-page category menu beside each sheet
// ============================================
// Rates, Rates check and every rate sheet (lib/nav/config.ts RATE_GROUPS),
// with row counts. This is the ONE list of rate sheets: the sidebar links to
// Rates and stops there (operator, 2026-11-07 — both listed all sixteen).
// Extras lives under /rates/extras but is a Products page, so it is shown
// without this menu.

import { usePathname } from 'next/navigation'
import RatesCategoryMenu, { RATES_MENU_HREFS, useRateCounts } from '@/components/rates/RatesCategoryMenu'
import { RateCountsContext } from '@/components/rates/rate-counts-context'

export default function RatesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const counts = useRateCounts()
  if (!RATES_MENU_HREFS.includes(pathname)) return <>{children}</>
  return (
    <RateCountsContext.Provider value={counts}>
      <div className="md:flex min-h-full">
        <RatesCategoryMenu counts={counts} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </RateCountsContext.Provider>
  )
}
