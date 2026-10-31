'use client'

// ============================================
// The top bar — above every signed-in page, full width
// ============================================
// Search and jump (⌘K), the Copilot, notifications and the account menu. Its
// height is --top-bar (app/globals.css), part of --app-chrome: a full-height
// page sizes itself h-[calc(100vh_-_var(--app-chrome))] so it does not run
// off the screen.
//
// Below lg the sidebar is a drawer, and the menu button here opens it.
// Nothing that depends on the browser (the ⌘ vs Ctrl label, the role) is
// read during the first render: the server cannot know them, and guessing
// would mismatch on hydration.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Menu, X, Search, Sparkles, LogOut, User, SlidersHorizontal, Globe, ChevronDown } from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useRole, type UserRole } from '@/hooks/useRole'
import NotificationBell from '@/components/NotificationBell'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import { LanguageSelector } from '@/components/LanguageSelector'
import CommandPalette from '@/components/nav/CommandPalette'
import { navEntries, SETTINGS_HOME } from '@/lib/nav/config'

const ROLE_COLORS: Record<UserRole, string> = {
  owner: 'bg-amber-100 text-amber-700',
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  agent: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600',
}

/** The Copilot button follows the Copilot menu item's roles. */
const COPILOT = navEntries().find(e => e.item.href === '/copilot')!
const PROFILE = navEntries().find(e => e.item.href === '/settings/profile')!

interface TopBarProps {
  /** Show the drawer button (not in Settings, which has its own menu). */
  showMenuButton: boolean
  menuOpen: boolean
  onMenuToggle: () => void
}

export default function TopBar({ showMenuButton, menuOpen, onMenuToggle }: TopBarProps) {
  const t = useTranslations('topBar')
  const tNav = useTranslations('navigation')
  const { canAccess } = useRole()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcut, setShortcut] = useState('Ctrl K')

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setShortcut('⌘K')
  }, [])

  return (
    <header className="h-[var(--top-bar)] shrink-0 flex items-center gap-2 px-3 bg-white border-b border-gray-200 z-50">
      {showMenuButton && (
        <button
          onClick={onMenuToggle}
          aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
          aria-expanded={menuOpen}
          className="lg:hidden p-1.5 rounded-md hover:bg-gray-100"
        >
          {menuOpen ? <X className="w-5 h-5 text-gray-700" /> : <Menu className="w-5 h-5 text-gray-700" />}
        </button>
      )}

      <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
        <img src="/autoura-logo.png" alt="Autoura" className="w-7 h-7 object-contain" />
        <span className="hidden sm:inline text-lg font-semibold text-primary-600">Autoura</span>
      </Link>

      <div className="flex-1 flex justify-center min-w-0">
        <button
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 w-full max-w-md px-3 py-1.5 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 min-w-0"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left truncate">{t('search')}</span>
          <kbd className="hidden sm:inline text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 bg-white">{shortcut}</kbd>
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {COPILOT.roles && canAccess(COPILOT.roles) && (
          <Link
            href={COPILOT.item.href}
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-100"
            title={t('copilot')}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden md:inline">{t('copilot')}</span>
          </Link>
        )}
        <NotificationBell align="right" />
        <AccountMenu settingsLabel={tNav('settings')} profileLabel={tNav('profile')} signOutLabel={tNav('signOut')} />
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  )
}

function AccountMenu({ settingsLabel, profileLabel, signOutLabel }: { settingsLabel: string; profileLabel: string; signOutLabel: string }) {
  const t = useTranslations('topBar')
  const tRoles = useTranslations('roles')
  const { profile, signOut } = useAuth()
  const { role, canAccess } = useRole()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const canProfile = !!PROFILE.roles && canAccess(PROFILE.roles)
  const canSettings = !!SETTINGS_HOME.roles && canAccess(SETTINGS_HOME.roles)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const name = profile?.full_name || 'User'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={t('account')}
        aria-expanded={open}
        className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-md hover:bg-gray-100"
      >
        <span className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-primary-600" />
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] py-2">
          <div className="px-3 pb-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
            {role && (
              <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded ${ROLE_COLORS[role]}`}>
                {tRoles(role)}
              </span>
            )}
          </div>
          <div className="py-1">
            {canProfile && (
              <Link href={PROFILE.item.href} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                <User className="w-4 h-4 text-gray-500" /> {profileLabel}
              </Link>
            )}
            {canSettings && (
              <Link href={SETTINGS_HOME.href} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                <SlidersHorizontal className="w-4 h-4 text-gray-500" /> {settingsLabel}
              </Link>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700">
              <Globe className="w-4 h-4 text-gray-500" />
              <div className="flex-1"><LanguageSelector variant="compact" dropdownPosition="below" /></div>
            </div>
          </div>
          {/* Renders nothing unless this person belongs to several companies. */}
          <div className="relative border-t border-gray-100">
            <WorkspaceSwitcher />
          </div>
          <div className="border-t border-gray-100 pt-1">
            <button onClick={handleSignOut} className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600">
              <LogOut className="w-4 h-4" /> {signOutLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
