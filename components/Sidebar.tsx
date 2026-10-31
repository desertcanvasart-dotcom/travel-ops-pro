'use client'

// ============================================
// The sidebar — the daily work
// ============================================
// Renders lib/nav/config.ts MAIN_NAV; setup lives in the Settings area, and
// the top bar (components/nav/TopBar.tsx) holds search, notifications and the
// account menu. Below lg it is a drawer the top bar's menu button opens.
//
// Sections fold, and the rate groups under Suppliers & Rates fold. What is
// open is remembered per login in localStorage; the section and rate group
// holding the current page always show open. Storage is read in an effect,
// never during the first render, so the server's HTML and the browser's agree.

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { MAIN_NAV, SETTINGS_HOME, type NavItem, type NavSection } from '@/lib/nav/config'
import { activeHref } from '@/lib/nav/active'

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
  mobileOpen: boolean
  onMobileClose: () => void
}

// Before per-login state: one key for everybody, holding the OPEN sections.
const LEGACY_KEY = 'autoura-sidebar-sections'
const storageKey = (userId: string) => `autoura-sidebar:${userId}`

interface FoldState {
  /** Section keys that are open. */
  sections: string[]
  /** Rate group hrefs that are open. */
  groups: string[]
}

const DEFAULT_STATE: FoldState = { sections: MAIN_NAV.map(s => s.key), groups: [] }

function readState(userId: string): FoldState {
  try {
    const own = localStorage.getItem(storageKey(userId))
    if (own) {
      const parsed = JSON.parse(own)
      return { sections: parsed.sections ?? DEFAULT_STATE.sections, groups: parsed.groups ?? [] }
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy)
      if (Array.isArray(parsed.sections)) return { sections: parsed.sections, groups: [] }
    }
  } catch {
    // unreadable or blocked storage: defaults
  }
  return DEFAULT_STATE
}

export default function Sidebar(props: SidebarProps) {
  // useSearchParams needs a Suspense boundary or the build fails.
  return (
    <Suspense fallback={<SidebarFrame {...props} search="" />}>
      <SidebarWithSearch {...props} />
    </Suspense>
  )
}

function SidebarWithSearch(props: SidebarProps) {
  const search = useSearchParams()
  return <SidebarFrame {...props} search={search.toString()} />
}

function SidebarFrame({ isCollapsed, setIsCollapsed, mobileOpen, onMobileClose, search }: SidebarProps & { search: string }) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { canAccess } = useRole()
  const t = useTranslations('navigation')
  const tTop = useTranslations('topBar')

  const [fold, setFold] = useState<FoldState>(DEFAULT_STATE)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    setFold(readState(user.id))
    setLoadedFor(user.id)
  }, [user?.id])

  useEffect(() => {
    if (!loadedFor || loadedFor !== user?.id) return
    try {
      localStorage.setItem(storageKey(loadedFor), JSON.stringify(fold))
    } catch {
      // no storage: the fold state lasts this visit only
    }
  }, [fold, loadedFor, user?.id])

  const visible = (roles?: NavItem['roles']) => !roles || canAccess(roles)

  const sections: NavSection[] = MAIN_NAV
    .filter(s => visible(s.roles))
    .map(s => ({
      ...s,
      items: s.items
        .filter(i => visible(i.roles))
        .map(i => (i.children ? { ...i, children: i.children.filter(c => visible(c.roles)) } : i))
        .filter(i => !i.children || i.children.length > 0),
    }))
    .filter(s => s.items.length > 0)

  const links = sections.flatMap(s => s.items.flatMap(i => i.children ?? [i]))
  const current = activeHref(links, pathname, search)
  const currentSection = sections.find(s => s.items.some(i => (i.children ?? [i]).some(l => l.href === current)))?.key
  const currentGroup = sections.flatMap(s => s.items).find(i => i.children?.some(c => c.href === current))?.href

  const toggle = (list: keyof FoldState, key: string) =>
    setFold(prev => ({ ...prev, [list]: prev[list].includes(key) ? prev[list].filter(k => k !== key) : [...prev[list], key] }))

  const linkClass = (active: boolean) => `
    flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-all duration-150 text-sm
    ${active ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}
    ${isCollapsed ? 'lg:justify-center' : ''}
  `

  const renderLink = (item: NavItem, small = false) => {
    const Icon = item.icon
    const active = item.href === current
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onMobileClose}
        className={linkClass(active)}
        title={isCollapsed ? t(item.labelKey) : undefined}
        aria-current={active ? 'page' : undefined}
      >
        <Icon className={`${small ? 'w-4 h-4' : 'w-[18px] h-[18px]'} flex-shrink-0 ${active ? 'text-primary-600' : 'text-gray-500'}`} />
        <span className={`${small ? 'text-[12px]' : 'text-[13px]'} ${isCollapsed ? 'lg:hidden' : ''}`}>{t(item.labelKey)}</span>
      </Link>
    )
  }

  return (
    <>
      {mobileOpen && <div className="lg:hidden fixed inset-0 top-[var(--app-chrome)] bg-black/50 z-40" onClick={onMobileClose} />}

      <aside
        className={`
          fixed lg:static top-[var(--app-chrome)] bottom-0 left-0 z-40 lg:z-auto
          bg-white border-r border-gray-200 flex flex-col shrink-0
          transition-all duration-300 ease-in-out w-56
          ${isCollapsed ? 'lg:w-16' : 'lg:w-56'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin">
          {sections.map(section => {
            const open = section.untitled || isCollapsed || fold.sections.includes(section.key) || section.key === currentSection
            return (
              <div key={section.key}>
                {!section.untitled && (isCollapsed ? (
                  <>
                    <div className="hidden lg:block h-px bg-gray-200 my-2 mx-2" />
                    <SectionHeader className="lg:hidden" title={t(section.titleKey)} open={open} onClick={() => toggle('sections', section.key)} />
                  </>
                ) : (
                  <SectionHeader title={t(section.titleKey)} open={open} onClick={() => toggle('sections', section.key)} />
                ))}
                {open && (
                  <div className="space-y-0.5">
                    {section.items.map(item => {
                      if (!item.children) return renderLink(item)
                      // A rate group: a fold, not a link — except collapsed
                      // to icons, where it opens its Rates hub tab.
                      if (isCollapsed) {
                        return (
                          <div key={item.href}>
                            <div className="hidden lg:block">{renderLink(item)}</div>
                            <div className="lg:hidden"><RateGroup item={item} open={fold.groups.includes(item.href) || item.href === currentGroup} onToggle={() => toggle('groups', item.href)} label={t(item.labelKey)} renderLink={renderLink} /></div>
                          </div>
                        )
                      }
                      return (
                        <RateGroup
                          key={item.href}
                          item={item}
                          open={fold.groups.includes(item.href) || item.href === currentGroup}
                          onToggle={() => toggle('groups', item.href)}
                          label={t(item.labelKey)}
                          renderLink={renderLink}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-gray-200 p-2 flex-shrink-0 space-y-0.5">
          {visible(SETTINGS_HOME.roles) && renderLink(SETTINGS_HOME)}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? tTop('expand') : tTop('collapse')}
            aria-expanded={!isCollapsed}
            className="hidden lg:flex items-center justify-center w-full py-1.5 rounded-md text-gray-400 hover:bg-gray-50"
          >
            <ChevronRight className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </aside>

      <style jsx global>{`
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
        .scrollbar-thin:hover::-webkit-scrollbar-thumb { background: #9ca3af; }
      `}</style>
    </>
  )
}

function SectionHeader({ title, open, onClick, className = '' }: { title: string; open: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`flex items-center justify-between w-full px-2 py-1.5 mt-2 mb-0.5 rounded-md hover:bg-gray-50 transition-colors group ${className}`}
    >
      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider group-hover:text-gray-600">{title}</h3>
      <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
    </button>
  )
}

function RateGroup({ item, open, onToggle, label, renderLink }: {
  item: NavItem
  open: boolean
  onToggle: () => void
  label: string
  renderLink: (item: NavItem, small?: boolean) => React.ReactNode
}) {
  const Icon = item.icon
  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-2.5 px-2 py-1.5 rounded-md w-full text-sm text-gray-700 hover:bg-gray-50"
      >
        <Icon className="w-[18px] h-[18px] flex-shrink-0 text-gray-500" />
        <span className="text-[13px] flex-1 text-left">{label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-4 pl-2.5 border-l border-gray-200 mt-0.5 space-y-0.5">
          {item.children!.map(child => renderLink(child, true))}
        </div>
      )}
    </div>
  )
}
