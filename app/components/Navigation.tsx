'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'

export default function Navigation() {
  const pathname = usePathname()
  const { user, profile, signOut } = useAuth()

  const isActive = (path: string) => {
    return pathname === path ? 'bg-blue-700' : 'hover:bg-blue-700'
  }

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-white text-blue-600 rounded-lg flex items-center justify-center font-bold text-lg">
                T2E
              </div>
              <span className="text-xl font-bold hidden lg:block">Travel2Egypt</span>
            </Link>

            <div className="flex space-x-1">
              <Link
                href="/dashboard"
                className={`px-4 py-2 rounded-lg transition-colors ${isActive('/dashboard')}`}
              >
                📊 Dashboard
              </Link>
              <Link
                href="/whatsapp-parser"
                className={`px-4 py-2 rounded-lg transition-colors ${isActive('/whatsapp-parser')}`}
              >
                💬 Parse WhatsApp
              </Link>
              <Link
                href="/tour-builder"
                className={`px-4 py-2 rounded-lg transition-colors ${isActive('/tour-builder')}`}
              >
                🏗️ Tour Builder
              </Link>
              <Link
                href="/itineraries"
                className={`px-4 py-2 rounded-lg transition-colors ${isActive('/itineraries')}`}
              >
                📋 All Quotes
              </Link>
              <Link
                href="/tours"
                className={`px-4 py-2 rounded-lg transition-colors ${isActive('/tours')}`}
              >
                🗺️ Tours
              </Link>
              <Link
                href="/rates"
                className={`px-4 py-2 rounded-lg transition-colors ${isActive('/rates')}`}
              >
                💰 Rates
              </Link>
              <Link
                href="/analytics"
                className={`px-4 py-2 rounded-lg transition-colors ${isActive('/analytics')}`}
              >
                📈 Analytics
              </Link>
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <div className="hidden lg:block text-right">
              <div className="font-medium">{profile?.full_name || user?.email}</div>
              <div className="text-xs text-blue-200 capitalize">{profile?.role || 'agent'}</div>
            </div>
            
            <button
              onClick={() => signOut()}
              className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span>🚪</span>
              <span className="hidden lg:block">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}