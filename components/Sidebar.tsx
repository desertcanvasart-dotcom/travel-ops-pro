'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/app/contexts/AuthContext'
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Settings,
  ChevronRight,
  MessageSquare,
  FileText,
  MapPin,
  Calendar, 
  CheckSquare,
  UserPlus,
  Menu,
  X,
  User,
  Truck,
  Box,
  TrendingUp,
  Hotel,
  UtensilsCrossed,
  Plane,
  BellRing,
  Coins,
  LogOut,
  Mail,
  Ticket,
  Contact
} from 'lucide-react'

interface SidebarProps {
  isCollapsed: boolean
  setIsCollapsed: (collapsed: boolean) => void
}

interface NavItem {
  label: string
  href: string
  icon: any
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navigation: NavSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Analytics', href: '/analytics', icon: TrendingUp },
    ]
  },
  {
    title: 'Clients & Partners',
    items: [
      { label: 'All Clients', href: '/clients', icon: Users },
      { label: 'Add Client', href: '/clients/new', icon: UserPlus },
      { label: 'Contacts', href: '/contacts', icon: Contact },
      { label: 'Follow-ups', href: '/followups', icon: CheckSquare },
    ]
  },
  {
    title: 'Sales',
    items: [
      { label: 'Inbox', href: '/inbox', icon: Mail },
      { label: 'WhatsApp', href: '/settings/whatsapp', icon: MessageSquare },
      { label: 'WhatsApp Parser', href: '/whatsapp-parser', icon: MessageSquare },
      { label: 'Payments', href: '/payments', icon: DollarSign }, 
      { label: 'Calendar', href: '/calendar', icon: Calendar },
      { label: 'Itineraries', href: '/itineraries', icon: FileText },
      { label: 'Tour Builder', href: '/tour-builder', icon: MapPin },
    ]
  },
  {
    title: 'Operations',
    items: [
      { label: 'Resources', href: '/resources', icon: Box },
      { label: 'Tour Guides', href: '/guides', icon: Users },       
      { label: 'Vehicles', href: '/vehicles', icon: Truck },
      { label: 'Attractions', href: '/attractions', icon: Ticket },
      { label: 'Hotels', href: '/hotels', icon: Hotel },
      { label: 'Restaurants', href: '/restaurants', icon: UtensilsCrossed },
      { label: 'Airport Staff', href: '/airport-staff', icon: Plane },
      { label: 'Hotel Staff', href: '/hotel-staff', icon: BellRing },
      { label: 'Rates Management', href: '/rates', icon: Coins },
    ]
  },
  {
    title: 'Settings',
    items: [
      { label: 'Profile', href: '/settings/profile', icon: Settings },
      { label: 'Email', href: '/settings/email', icon: Mail },
    ]
  }
]

export default function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const { profile, signOut } = useAuth()

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
        {/* Logo Header */}
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
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:block p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <ChevronRight
              className={`w-4 h-4 text-gray-500 transition-transform ${
                isCollapsed ? '' : 'rotate-180'
              }`}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
          {navigation.map((section) => (
            <div key={section.title}>
              {!isCollapsed && (
                <div className="px-2 mb-1.5">
                  <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {section.title}
                  </h3>
                </div>
              )}

              {isCollapsed && section.title !== 'Main' && (
                <div className="h-px bg-gray-200 my-2 mx-2"></div>
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || 
                    (item.href !== '/dashboard' && pathname.startsWith(item.href))

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
          ))}
        </nav>

        {/* User Profile Footer with Sign Out */}
        <div className="border-t border-gray-200 p-2.5 flex-shrink-0 space-y-1">
          {/* User Info */}
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
                <p className="text-[10px] text-gray-500 truncate">
                  {profile?.role?.toUpperCase() || 'AUTOURA'}
                </p>
              </div>
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
            title={isCollapsed ? 'Sign out' : ''}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
            {!isCollapsed && (
              <span className="text-[13px]">Sign out</span>
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