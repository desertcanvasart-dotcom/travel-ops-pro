'use client'

// ============================================
// Tabs held in the address
// ============================================
// One page made of what used to be sibling pages (lib/nav/config.ts
// TABBED_PAGES). The open tab is a query value (?tab=, ?view=, ?channel=,
// ?type=), so a tab can be linked, bookmarked and survives a reload.
//
// Each tab carries the roles of the page it came from: a tab the viewer may
// not see is not offered, and asking for it by URL opens the first tab they
// may see. Only the open tab renders — its view, and its data fetches, mount
// on demand. The caller's page wraps this in <Suspense> (useSearchParams).
// The strip is --tab-strip high (app/globals.css), for full-height views.

import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRole } from '@/hooks/useRole'
import type { TabbedPage } from '@/lib/nav/config'

export default function UrlTabs({ page, render }: { page: TabbedPage; render: (value: string) => React.ReactNode }) {
  const t = useTranslations('navigation')
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const { role, canAccess } = useRole()

  const visible = page.tabs.filter(tab => !tab.roles || canAccess(tab.roles))
  const requested = search.get(page.param)
  const active = visible.find(tab => tab.value === requested) ?? visible[0]

  const hrefFor = (value: string) => {
    const params = new URLSearchParams(search.toString())
    params.set(page.param, value)
    return `${pathname}?${params.toString()}`
  }

  // A tab this viewer may not see, or none named: say which one is open.
  useEffect(() => {
    if (role && active && requested !== active.value) router.replace(hrefFor(active.value), { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, active?.value, requested])

  // The role is fetched after mount; until then nothing is known to be allowed.
  if (!role || !active) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-[#647C47] animate-spin" />
      </div>
    )
  }

  return (
    <>
      {visible.length > 1 && (
        <div className="h-[var(--tab-strip)] bg-white border-b border-gray-200 px-4 md:px-6">
          <nav className="flex gap-6 h-full overflow-x-auto" role="tablist">
            {visible.map(tab => {
              const Icon = tab.icon
              const on = tab.value === active.value
              return (
                <button
                  key={tab.value}
                  role="tab"
                  aria-selected={on}
                  onClick={() => router.push(hrefFor(tab.value), { scroll: false })}
                  className={`flex items-center gap-2 h-full border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    on ? 'border-[#647C47] text-[#647C47]' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t(tab.labelKey)}
                </button>
              )
            })}
          </nav>
        </div>
      )}
      {render(active.value)}
    </>
  )
}
