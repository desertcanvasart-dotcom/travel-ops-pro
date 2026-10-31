'use client'

// ============================================
// The Settings area
// ============================================
// Its own menu in place of the sidebar (the root layout leaves the sidebar
// out under /settings), grouped as lib/nav/config.ts SETTINGS_NAV says, and
// filtered by role the same way. Each page's breadcrumb, title, description
// and "Admins only" badge come from the same config entry as its menu link,
// so the three can never disagree.
//
// Below md the menu is ONE picker above the page. Stacking the whole menu
// there pushed the page a screen down, and clicks seemed to do nothing (a
// real report on autoura-saas).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Lock } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { SETTINGS_NAV, JUMP_ONLY_PAGES, settingsItems } from '@/lib/nav/config'
import { activeHref } from '@/lib/nav/active'
import { lastAppPage, APP_HOME } from '@/lib/nav/settings-return'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('navigation')
  const ts = useTranslations('settingsArea')
  const { canAccess } = useRole()

  // sessionStorage: read after mount, never during the first render.
  const [backHref, setBackHref] = useState(APP_HOME)
  useEffect(() => { setBackHref(lastAppPage()) }, [])

  const groups = SETTINGS_NAV
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || canAccess(i.roles)) }))
    .filter(g => g.items.length > 0)

  const all = settingsItems()
  const current = activeHref(all, pathname)
  const entry = all.find(i => i.href === current)
  // A Settings page with no menu link of its own (reached from a button).
  const jump = entry ? undefined : JUMP_ONLY_PAGES.find(p => p.href === pathname)

  const backLink = (
    <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
      <ArrowLeft className="w-4 h-4" /> {ts('backToApp')}
    </Link>
  )

  return (
    <div className="md:flex min-h-full">
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white border-r border-gray-200 sticky top-0 h-[calc(100vh_-_var(--app-chrome))] overflow-y-auto">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          {backLink}
          <p className="mt-3 text-base font-semibold text-gray-900">{ts('title')}</p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-4" aria-label={ts('title')}>
          {groups.map(g => (
            <div key={g.key}>
              <h3 className="px-2 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t(g.titleKey)}</h3>
              <div className="space-y-0.5">
                {g.items.map(item => {
                  const Icon = item.icon
                  const active = item.href === current
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px] transition-colors ${active ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-primary-600' : 'text-gray-500'}`} />
                      {t(item.labelKey)}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Below md: back link and one picker, nothing stacked. */}
        <div className="md:hidden px-4 pt-4 space-y-3">
          {backLink}
          <label className="block">
            <span className="sr-only">{ts('goTo')}</span>
            <select
              value={current ?? ''}
              onChange={e => router.push(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg"
            >
              {!current && <option value="">{ts('title')}</option>}
              {groups.map(g => (
                <optgroup key={g.key} label={t(g.titleKey)}>
                  {g.items.map(item => <option key={item.href} value={item.href}>{t(item.labelKey)}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        {(entry || jump) && (
          <div className="px-4 md:px-6 pt-4 md:pt-6">
            <p className="text-xs text-gray-500">
              {ts('title')}{entry && <> › {t(entry.groupTitleKey)}</>}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <h1 className="text-xl font-semibold text-gray-900">{t((entry ?? jump)!.labelKey)}</h1>
              {entry?.adminEdits && (
                <span title={ts('adminsEditHint')} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700">
                  <Lock className="w-3 h-3" /> {ts('adminsEdit')}
                </span>
              )}
            </div>
            {entry && <p className="text-sm text-gray-500 mt-0.5">{ts(`desc.${entry.descKey}`)}</p>}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
