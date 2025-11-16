'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navigation from '../components/Navigation'

interface DashboardStats {
  totalQuotes: number
  totalTours: number
  quotesSent: number
  quotesConfirmed: number
  recentActivity: Array<{
    id: string
    action: string
    time: string
    icon: string
  }>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalQuotes: 0,
    totalTours: 0,
    quotesSent: 0,
    quotesConfirmed: 0,
    recentActivity: []
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const quotesRes = await fetch('/api/itineraries')
      const quotesData = await quotesRes.json()
      
      const toursRes = await fetch('/api/tours/browse')
      const toursData = await toursRes.json()

      const quotes = quotesData.data || []
      const tours = toursData.data || []

      setStats({
        totalQuotes: quotes.length,
        totalTours: tours.length,
        quotesSent: quotes.filter((q: any) => q.status === 'sent' || q.status === 'confirmed').length,
        quotesConfirmed: quotes.filter((q: any) => q.status === 'confirmed').length,
        recentActivity: quotes.slice(0, 5).map((q: any) => ({
          id: q.id,
          action: `Quote ${q.itinerary_code} for ${q.client_name}`,
          time: new Date(q.created_at).toLocaleString(),
          icon: '📋'
        }))
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    { href: '/whatsapp-parser', label: 'Parse WhatsApp', icon: '📱', color: 'bg-green-500 hover:bg-green-600' },
    { href: '/itineraries/new', label: 'New Quote', icon: '✨', color: 'bg-purple-500 hover:bg-purple-600' },
    { href: '/itineraries', label: 'All Quotes', icon: '📋', color: 'bg-blue-500 hover:bg-blue-600' },
    { href: '/tours', label: 'Browse Tours', icon: '🗺️', color: 'bg-orange-500 hover:bg-orange-600' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <Navigation />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Welcome Back, Islam! 👋
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your business today
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-gray-600 text-sm font-medium">Total Quotes</h3>
              <span className="text-2xl">📋</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.totalQuotes}</div>
            <p className="text-sm text-green-600 mt-2">↗ Active</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-gray-600 text-sm font-medium">Tours Available</h3>
              <span className="text-2xl">🗺️</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.totalTours}</div>
            <p className="text-sm text-blue-600 mt-2">Ready to sell</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-gray-600 text-sm font-medium">Quotes Sent</h3>
              <span className="text-2xl">📧</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.quotesSent}</div>
            <p className="text-sm text-gray-500 mt-2">
              {stats.totalQuotes > 0 
                ? `${Math.round((stats.quotesSent / stats.totalQuotes) * 100)}% sent rate`
                : '0% sent rate'
              }
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-gray-600 text-sm font-medium">Confirmed</h3>
              <span className="text-2xl">✅</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.quotesConfirmed}</div>
            <p className="text-sm text-green-600 mt-2">
              {stats.quotesSent > 0
                ? `${Math.round((stats.quotesConfirmed / stats.quotesSent) * 100)}% conversion`
                : '0% conversion'
              }
            </p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`${action.color} text-white rounded-xl shadow-lg p-6 transition-all hover:scale-105 hover:shadow-xl`}
              >
                <div className="text-4xl mb-3">{action.icon}</div>
                <h3 className="text-lg font-bold">{action.label}</h3>
                <p className="text-sm opacity-90 mt-1">Start now →</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h2>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : stats.recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentActivity.map((activity, idx) => (
                    <div key={idx} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <span className="text-2xl">{activity.icon}</span>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{activity.action}</p>
                        <p className="text-sm text-gray-500">{activity.time}</p>
                      </div>
                      <Link 
                        href={`/itineraries/${activity.id}`}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        View →
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📋</div>
                  <p className="text-gray-600 mb-4">No quotes yet</p>
                  <Link
                    href="/whatsapp-parser"
                    className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create Your First Quote
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold mb-4">Today's Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="opacity-90">Quotes Created</span>
                  <span className="font-bold text-xl">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="opacity-90">Quotes Sent</span>
                  <span className="font-bold text-xl">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="opacity-90">Bookings</span>
                  <span className="font-bold text-xl">0</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">💡 Quick Tips</h3>
              <div className="space-y-3 text-sm text-gray-700">
                <p>• Use AI parser to extract client details from WhatsApp in seconds</p>
                <p>• Browse tours catalog to find perfect matches quickly</p>
                <p>• Send quotes via WhatsApp or Email with one click</p>
                <p>• Track your conversion rates in Analytics</p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">System Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">AI Parser</span>
                  <span className="text-green-600 text-sm font-medium">✓ Online</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Tour Database</span>
                  <span className="text-green-600 text-sm font-medium">✓ Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Email Service</span>
                  <span className="text-green-600 text-sm font-medium">✓ Ready</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
