'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/app/contexts/AuthContext'
import { useRole, UserRole } from '@/hooks/useRole'
import NotificationBell from '@/components/NotificationBell'
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher'
import {
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  User,
  LogOut,
  Globe,
} from 'lucide-react'
import { LanguageSelector } from '@/components/LanguageSelector'
import { navigationConfig } from '@/components/nav/navigation-config'

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
}

interface NavSubItem {
  label: string
  href: string
  icon?: any
  roles?: UserRole[]
}

interface NavItem {
  label: string
  href: string
  icon: any
  roles?: UserRole[]
  children?: NavSubItem[]
}

interface NavSection {
  title: string
  key: string
  roles?: UserRole[]
  items: NavItem[]
}


// Storage key for section states
const STORAGE_KEY = 'autoura-sidebar-sections'

// Role badge colors
const ROLE_COLORS: Record<UserRole, string> = {
  owner: 'bg-amber-100 text-amber-700',
  admin: 'bg-purple-100 text-purple-700',
  manager: 'bg-blue-100 text-blue-700',
  agent: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600'
}

export default function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const { role, canAccess } = useRole()
  const t = useTranslations('navigation')
  const tRoles = useTranslations('roles')

  // Build navigation with translated labels - memoized to prevent unnecessary re-renders
  const navigation: NavSection[] = useMemo(() => navigationConfig.map(section => ({
    title: t(section.titleKey),
    key: section.key,
    roles: section.roles,
    items: section.items.map(item => ({
      label: t(item.labelKey),
      href: item.href,
      icon: item.icon,
      roles: item.roles,
      children: item.children?.map(child => ({
        label: t(child.labelKey),
        href: child.href,
        icon: child.icon,
        roles: child.roles,
      })),
    })),
  })), [t])
  
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  // Open at first: Home, Communicate (second — it was 'clientsComms', a key no
  // section has) and Sell.
  const [expandedSections, setExpandedSections] = useState<string[]>(['home', 'communication', 'sell'])
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['Contacts'])
  const [currentUrl, setCurrentUrl] = useState('')

  // Filter navigation based on user role - memoized to prevent auto-expand useEffect from running on every render
  const filteredNavigation = useMemo(() => navigation.filter(section => {
    if (!section.roles) return true
    return canAccess(section.roles)
  }).map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (!item.roles) return true
      return canAccess(item.roles)
    })
  })), [navigation, canAccess])

  // Load saved section states from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setExpandedSections(parsed.sections || ['home', 'communication', 'sell'])
        setExpandedMenus(parsed.menus || ['Contacts'])
      } catch {
        // Use defaults if parsing fails
      }
    }
  }, [])

  // Save section states to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sections: expandedSections,
      menus: expandedMenus
    }))
  }, [expandedSections, expandedMenus])

  // Get full URL on client side only
  useEffect(() => {
    setCurrentUrl(window.location.href)
  }, [pathname])

  // Auto-expand section containing active page
  useEffect(() => {
    filteredNavigation.forEach(section => {
      const hasActiveItem = section.items.some(item => 
        pathname === item.href || 
        (item.href !== '/dashboard' && pathname.startsWith(item.href)) ||
        item.children?.some(child => pathname === child.href || currentUrl.includes(child.href))
      )
      if (hasActiveItem && !expandedSections.includes(section.key)) {
        setExpandedSections(prev => [...prev, section.key])
      }
    })
  }, [pathname, currentUrl, filteredNavigation])

  // Auto-expand menu if on contacts page
  useEffect(() => {
    if (pathname === '/contacts') {
      setExpandedMenus(prev => prev.includes('Contacts') ? prev : [...prev, 'Contacts'])
    }
  }, [pathname])

  const toggleSection = (key: string) => {
    setExpandedSections(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    )
  }

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    )
  }

  // Check if a child link is active (works with query params on client)
  const isChildActive = (childHref: string): boolean => {
    if (!currentUrl) return false
    
    if (childHref === '/contacts') {
      return pathname === '/contacts' && !currentUrl.includes('type=')
    }
    
    const typeMatch = childHref.match(/type=(\w+)/)
    if (typeMatch) {
      return currentUrl.includes(`type=${typeMatch[1]}`)
    }
    
    return false
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isMobileOpen}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg"
      >
        {isMobileOpen ? (
          <X className="w-6 h-6 text-gray-700" />
        ) : (
          <Menu className="w-6 h-6 text-gray-700" />
        )}
      </button>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-screen bg-white border-r border-gray-200
          transition-all duration-300 ease-in-out flex flex-col
          ${isCollapsed ? 'w-16' : 'w-56'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo Header with Notification Bell */}
        <div className="flex items-center justify-between h-14 px-3 border-b border-gray-200 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 flex-shrink-0">
              <img
                src="/autoura-logo.png"
                alt="Autoura"
                className="w-full h-full object-contain"
              />
            </div>
            {!isCollapsed && (
              <span className="text-lg font-semibold text-primary-600">
                Autoura
              </span>
            )}
          </Link>
          
          <div className="flex items-center gap-1">
            {!isCollapsed && <NotificationBell />}
            
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
              className="hidden lg:block p-1 hover:bg-gray-100 rounded transition-colors"
            >
              <ChevronRight
                className={`w-4 h-4 text-gray-500 transition-transform ${
                  isCollapsed ? '' : 'rotate-180'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Notification Bell for collapsed state */}
        {isCollapsed && (
          <div className="flex justify-center py-2 border-b border-gray-100">
            <NotificationBell />
          </div>
        )}

        {/* Which agency am I working in. Renders nothing at all unless this
            person belongs to more than one, which is almost everybody. */}
        <WorkspaceSwitcher collapsed={isCollapsed} />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
          {filteredNavigation.map((section) => {
            const isSectionExpanded = expandedSections.includes(section.key)
            
            return (
              <div key={section.key}>
                {/* Section Header */}
                {!isCollapsed ? (
                  <button
                    onClick={() => toggleSection(section.key)}
                    className="flex items-center justify-between w-full px-2 py-1.5 mb-1 rounded-md hover:bg-gray-50 transition-colors group"
                  >
                    <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider group-hover:text-gray-600">
                      {section.title}
                    </h3>
                    <ChevronDown 
                      className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${
                        isSectionExpanded ? '' : '-rotate-90'
                      }`}
                    />
                  </button>
                ) : (
                  section.title !== 'Main' && (
                    <div className="h-px bg-gray-200 my-2 mx-2"></div>
                  )
                )}

                {/* Section Items */}
                <div className={`
                  space-y-0.5 overflow-hidden transition-all duration-200
                  ${!isCollapsed && !isSectionExpanded ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'}
                `}>
                  {section.items.map((item) => {
                    const Icon = item.icon
                    const hasChildren = item.children && item.children.length > 0
                    const isExpanded = expandedMenus.includes(item.label)
                    
                    const isOnContactsPage = pathname === '/contacts'
                    const isActive = hasChildren 
                      ? isOnContactsPage
                      : pathname === item.href || 
                        (item.href !== '/dashboard' && pathname.startsWith(item.href))

                    // For items with children (collapsible)
                    if (hasChildren && !isCollapsed) {
                      return (
                        <div key={item.label}>
                          <button
                            onClick={() => toggleMenu(item.label)}
                            className={`
                              flex items-center gap-2.5 px-2 py-1.5 rounded-md w-full
                              transition-all duration-150 text-sm
                              ${isActive
                                ? 'bg-primary-50 text-primary-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-50'
                              }
                            `}
                          >
                            <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                            <span className="text-[13px] flex-1 text-left">{item.label}</span>
                            <ChevronDown 
                              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                                isExpanded ? 'rotate-180' : ''
                              }`} 
                            />
                          </button>
                          
                          {/* Children */}
                          <div className={`
                            overflow-hidden transition-all duration-200 ease-in-out
                            ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                          `}>
                            <div className="ml-4 pl-2.5 border-l border-gray-200 mt-1 space-y-0.5">
                              {item.children!.filter(child => {
                                if (!child.roles) return true
                                return canAccess(child.roles)
                              }).map((child) => {
                                const ChildIcon = child.icon
                                const isChildItemActive = isChildActive(child.href)
                                
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    onClick={() => setIsMobileOpen(false)}
                                    className={`
                                      flex items-center gap-2 px-2 py-1.5 rounded-md
                                      transition-all duration-150 text-sm
                                      ${isChildItemActive
                                        ? 'bg-primary-50 text-primary-700 font-medium'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                      }
                                    `}
                                  >
                                    {ChildIcon && (
                                      <ChildIcon className={`w-4 h-4 flex-shrink-0 ${isChildItemActive ? 'text-primary-600' : 'text-gray-400'}`} />
                                    )}
                                    <span className="text-[12px]">{child.label}</span>
                                    {isChildItemActive && (
                                      <div className="ml-auto w-1 h-1 rounded-full bg-primary-600" />
                                    )}
                                  </Link>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Regular items
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        className={`
                          flex items-center gap-2.5 px-2 py-1.5 rounded-md
                          transition-all duration-150 text-sm
                          ${isActive
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                          }
                          ${isCollapsed ? 'justify-center' : ''}
                        `}
                        title={isCollapsed ? item.label : ''}
                      >
                        <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                        {!isCollapsed && (
                          <span className="text-[13px]">{item.label}</span>
                        )}
                        {!isCollapsed && isActive && (
                          <div className="ml-auto w-1 h-1 rounded-full bg-primary-600" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* User Profile Footer */}
        <div className="border-t border-gray-200 p-2.5 flex-shrink-0 space-y-1">
          {/* User Info with Role Badge */}
          <div
            className={`
              flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md
              ${isCollapsed ? 'justify-center' : ''}
            `}
          >
            <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-primary-600" />
            </div>
            {!isCollapsed && (
              <div className="flex-1 text-left min-w-0">
                <p className="text-[13px] font-medium text-gray-700 truncate">
                  {profile?.full_name || 'User'}
                </p>
                {role && (
                  <span className={`inline-block px-1.5 py-0.5 text-[9px] font-medium rounded ${ROLE_COLORS[role]}`}>
                    {tRoles(role)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Language Switcher */}
          <div
            className={`
              flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md
              text-gray-600 hover:bg-gray-50 transition-colors
              ${isCollapsed ? 'justify-center' : ''}
            `}
          >
            {isCollapsed ? (
              <LanguageSelector variant="compact" dropdownPosition="above" />
            ) : (
              <>
                <Globe className="w-[18px] h-[18px] flex-shrink-0 text-gray-500" />
                <div className="flex-1">
                  <LanguageSelector variant="compact" dropdownPosition="above" />
                </div>
              </>
            )}
          </div>

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className={`
              flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md
              text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors
              ${isCollapsed ? 'justify-center' : ''}
            `}
            title={isCollapsed ? t('signOut') : ''}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCollapsed && (
              <span className="text-[13px]">{t('signOut')}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 2px;
        }
        .scrollbar-thin:hover::-webkit-scrollbar-thumb {
          background: #9ca3af;
        }
      `}</style>
    </>
  )
}