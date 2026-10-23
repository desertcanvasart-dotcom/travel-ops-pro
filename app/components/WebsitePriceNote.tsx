'use client'

// A website order's price is the website's (lib/pricing/website-price): the
// page says so calmly instead of the red "Incomplete price" banner. Costs
// with no rate are listed for admins and managers only — they hold the cost
// estimate; for everyone else there is nothing to fix.

import { Globe } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { QuoteGap } from '@/lib/pricing/quote-completeness'

export default function WebsitePriceNote({ gaps, canViewFinancials, dayLabel }: {
  gaps: QuoteGap[]
  canViewFinancials: boolean
  /** "Day 3: Cruise transport", in the page's own words. */
  dayLabel: (day: number, name: string) => string
}) {
  const t = useTranslations('websitePrice')
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Globe className="w-4 h-4 text-[#647C47]" />{t('title')}
      </p>
      <p className="text-sm text-gray-600 mt-1">{t('body')}</p>
      {canViewFinancials && gaps.length > 0 && (
        <>
          <p className="text-sm text-gray-600 mt-2">{t('costGaps', { count: gaps.length })}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-gray-600 list-disc pl-5">
            {gaps.map((g, i) => (
              <li key={i}>
                <span className="font-medium">{g.day ? dayLabel(g.day, g.name) : g.name}</span>
                <span className="text-gray-500"> · {g.issue}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
