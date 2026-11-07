'use client'

// ============================================
// The /rates overview cards
// ============================================
// Every rate sheet (lib/nav/config.ts RATE_GROUPS) with its row count from
// /api/rates/summary. A count that could not be read is left blank, never
// shown as 0.
//
// The sheets are reached from the sidebar, folded under Suppliers & Rates.
// A second menu column beside every sheet (#688) was taken out again: it
// cost the pages their width (operator, 2026-11-07).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { RATE_GROUPS } from '@/lib/nav/config'

type Counts = Record<string, number | null>

export function useRateCounts(): Counts {
  const [counts, setCounts] = useState<Counts>({})
  useEffect(() => {
    let cancelled = false
    fetch('/api/rates/summary')
      .then(res => (res.ok ? res.json() : null))
      .then(json => { if (!cancelled && json?.success) setCounts(json.data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  return counts
}

const groupTotal = (counts: Counts, hrefs: string[]) => {
  const known = hrefs.map(h => counts[h]).filter((n): n is number => typeof n === 'number')
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}

function Count({ n }: { n: number | null | undefined }) {
  if (typeof n !== 'number') return null
  return <span className="ml-auto text-[11px] tabular-nums text-gray-400">{n}</span>
}

/** /rates: the categories, each with its sheets and how many rows they hold. */
export function RatesOverview({ counts }: { counts: Counts }) {
  const t = useTranslations('navigation')
  return (
    <section className="container mx-auto px-4 lg:px-6 pt-4 print:hidden" aria-label={t('rateCategories')}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {RATE_GROUPS.map(g => {
          const Icon = g.icon
          const total = groupTotal(counts, g.items.map(i => i.href))
          return (
            <div key={g.key} className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-primary-600" />
                <span className="text-sm font-semibold text-gray-900">{t(g.labelKey)}</span>
                {typeof total === 'number' && <span className="ml-auto text-xs text-gray-500">{t('rateRows', { count: total })}</span>}
              </div>
              <ul className="space-y-0.5">
                {g.items.map(i => (
                  <li key={i.href}>
                    <Link href={i.href} className="flex items-center text-[13px] text-gray-700 hover:text-primary-700">
                      {t(i.labelKey)}
                      <Count n={counts[i.href]} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
