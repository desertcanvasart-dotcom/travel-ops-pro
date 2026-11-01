'use client'

// ============================================
// The Rates pages' own menu, and the overview cards
// ============================================
// Both from lib/nav/config.ts RATE_GROUPS (the sidebar's rate groups too),
// with each sheet's row count from /api/rates/summary. A count that could
// not be read is left blank, never shown as 0.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { MAIN_NAV, RATE_GROUPS } from '@/lib/nav/config'
import { activeHref } from '@/lib/nav/active'

type Counts = Record<string, number | null>

/** Overview and Rates check: the Rates section's own two links. */
const RATES_LINKS = MAIN_NAV.flatMap(s => s.items).filter(i => i.href === '/rates' || i.href === '/rates/check')

/** Every page the Rates menu shows: those links and every rate sheet. */
export const RATES_MENU_HREFS = [...RATES_LINKS.map(i => i.href), ...RATE_GROUPS.flatMap(g => g.items.map(i => i.href))]

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

export default function RatesCategoryMenu({ counts }: { counts: Counts }) {
  const t = useTranslations('navigation')
  const pathname = usePathname()
  const router = useRouter()
  const links = [...RATES_LINKS, ...RATE_GROUPS.flatMap(g => g.items)]
  const current = activeHref(links, pathname)

  const item = (href: string, labelKey: string, Icon: (typeof links)[number]['icon'], n?: number | null) => {
    const on = href === current
    return (
      <Link
        key={href}
        href={href}
        aria-current={on ? 'page' : undefined}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] ${on ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${on ? 'text-primary-600' : 'text-gray-500'}`} />
        <span className="truncate">{t(labelKey)}</span>
        <Count n={n} />
      </Link>
    )
  }

  return (
    <>
      <aside className="hidden md:block w-56 shrink-0 bg-white border-r border-gray-200 sticky top-0 h-[calc(100vh_-_var(--app-chrome))] overflow-y-auto print:hidden">
        <nav className="px-2 py-3 space-y-4" aria-label={t('rateCategories')}>
          <div className="space-y-0.5">
            {RATES_LINKS.map(i => item(i.href, i.href === '/rates' ? 'ratesOverview' : i.labelKey, i.icon))}
          </div>
          {RATE_GROUPS.map(g => (
            <div key={g.key}>
              <h3 className="flex items-center px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {t(g.labelKey)}
                <Count n={groupTotal(counts, g.items.map(i => i.href))} />
              </h3>
              <div className="space-y-0.5">{g.items.map(i => item(i.href, i.labelKey, i.icon, counts[i.href]))}</div>
            </div>
          ))}
        </nav>
      </aside>
      {/* Below md: one picker, nothing stacked above the page. */}
      <div className="md:hidden px-4 pt-4 print:hidden">
        <label className="block">
          <span className="sr-only">{t('rateCategories')}</span>
          <select
            value={current ?? ''}
            onChange={e => router.push(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg"
          >
            {RATES_LINKS.map(i => <option key={i.href} value={i.href}>{t(i.href === '/rates' ? 'ratesOverview' : i.labelKey)}</option>)}
            {RATE_GROUPS.map(g => (
              <optgroup key={g.key} label={t(g.labelKey)}>
                {g.items.map(i => (
                  <option key={i.href} value={i.href}>
                    {t(i.labelKey)}{typeof counts[i.href] === 'number' ? ` (${counts[i.href]})` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
    </>
  )
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
