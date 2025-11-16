'use client'

import { useEffect, useState } from 'react'
import Navigation from '../components/Navigation'

export default function AnalyticsPage() {
  const [stats, setStats] = useState({
    totalQuotes: 0,
    quotesSent: 0,
    quotesConfirmed: 0,
    quotesCancelled: 0,
    totalRevenue: 0,
    avgQuoteValue: 0,
    conversionRate: 0,
    popularTours: [] as any[],
    quotesByStatus: { draft: 0, sent: 0, confirmed: 0, completed: 0, cancelled: 0 }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const quotesRes = await fetch('/api/itineraries')
      const quotesData = await quotesRes.json()
      
      const toursRes = await fetch('/api/tours/browse')
      const toursData = await toursRes.json()

      const quotes = quotesData.data || []
      const tours = toursData.data || []

      const sent = quotes.filter((q: any) => 
        (q.status === 'sent' || q.status === 'confirmed' || q.status === 'completed')
      ).length
      
      const confirmed = quotes.filter((q: any) => q.status === 'confirmed' || q.status === 'completed').length
      const cancelled = quotes.filter((q: any) => q.status === 'cancelled').length
      
      const totalRev = quotes
        .filter((q: any) => q.status === 'confirmed' || q.status === 'completed')
        .reduce((sum: number, q: any) => sum + (q.total_cost || 0), 0)

      setStats({
        totalQuotes: quotes.length,
        quotesSent: sent,
        quotesConfirmed: confirmed,
        quotesCancelled: cancelled,
        totalRevenue: totalRev,
        avgQuoteValue: quotes.length > 0 
          ? quotes.reduce((sum: number, q: any) => sum + (q.total_cost || 0), 0) / quotes.length
          : 0,
        conversionRate: sent > 0 ? (confirmed / sent) * 100 : 0,
        popularTours: tours.slice(0, 5),
        quotesByStatus: {
          draft: quotes.filter((q: any) => q.status === 'draft').length,
          sent: quotes.filter((q: any) => q.status === 'sent').length,
          confirmed: quotes.filter((q: any) => q.status === 'confirmed').length,
          completed: quotes.filter((q: any) => q.status === 'completed').length,
          cancelled: cancelled
        }
      })
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        <Navigation />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading analytics...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <Navigation />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Business Analytics 📊</h1>
          <p className="text-gray-600">Track your performance and growth</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Total Revenue</h3>
            <div className="text-3xl font-bold text-green-600">
              €{stats.totalRevenue.toFixed(0)}
            </div>
            <p className="text-sm text-gray-500 mt-2">From confirmed bookings</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Conversion Rate</h3>
            <div className="text-3xl font-bold text-blue-600">
              {stats.conversionRate.toFixed(1)}%
            </div>
            <p className="text-sm text-gray-500 mt-2">Sent → Confirmed</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Avg Quote Value</h3>
            <div className="text-3xl font-bold text-purple-600">
              €{stats.avgQuoteValue.toFixed(0)}
            </div>
            <p className="text-sm text-gray-500 mt-2">Per quote generated</p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-gray-600 text-sm font-medium mb-2">Total Quotes</h3>
            <div className="text-3xl font-bold text-orange-600">
              {stats.totalQuotes}
            </div>
            <p className="text-sm text-gray-500 mt-2">All time</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Quotes by Status</h2>
            <div className="space-y-4">
              {['draft', 'sent', 'confirmed', 'completed', 'cancelled'].map((status) => {
                const colors = {
                  draft: 'bg-gray-500',
                  sent: 'bg-blue-500',
                  confirmed: 'bg-green-500',
                  completed: 'bg-purple-500',
                  cancelled: 'bg-red-500'
                }
                const count = stats.quotesByStatus[status as keyof typeof stats.quotesByStatus]
                return (
                  <div key={status}>
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-600 capitalize">{status}</span>
                      <span className="font-bold">{count}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className={`${colors[status as keyof typeof colors]} h-3 rounded-full`}
                        style={{ 
                          width: `${stats.totalQuotes > 0 ? (count / stats.totalQuotes) * 100 : 0}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Popular Tours</h2>
            <div className="space-y-3">
              {stats.popularTours.slice(0, 5).map((tour, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{tour.template_name}</p>
                      <p className="text-xs text-gray-500">{tour.destination_name}</p>
                    </div>
                  </div>
                  <span className="text-green-600 font-bold">€{tour.price_from}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold mb-6">💡 Insights & Recommendations</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-bold mb-2">Performance</h3>
              <p className="text-blue-100 text-sm">
                {stats.conversionRate > 50 
                  ? '🎉 Great conversion rate! Keep it up!'
                  : stats.conversionRate > 30
                  ? '👍 Good performance. Try following up faster.'
                  : '💪 Focus on faster responses to improve conversions.'
                }
              </p>
            </div>
            <div>
              <h3 className="font-bold mb-2">Opportunity</h3>
              <p className="text-blue-100 text-sm">
                {stats.quotesByStatus.draft > 0
                  ? `📧 You have ${stats.quotesByStatus.draft} unsent quotes. Send them to increase bookings!`
                  : '✅ All quotes have been sent. Great work!'
                }
              </p>
            </div>
            <div>
              <h3 className="font-bold mb-2">Cancellations</h3>
              <p className="text-blue-100 text-sm">
                {stats.quotesCancelled === 0
                  ? '🎉 No cancellations! Excellent client satisfaction.'
                  : stats.quotesCancelled < 3
                  ? `✓ Only ${stats.quotesCancelled} cancellation${stats.quotesCancelled === 1 ? '' : 's'}. Well managed!`
                  : `⚠️ ${stats.quotesCancelled} cancellations. Review feedback and improve service.`
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
