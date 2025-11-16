'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navigation from '../components/Navigation'

interface TourOverview {
  template_code: string
  template_name: string
  category_name: string
  destination_name: string
  duration_days: number
  variation_code: string
  tier: string
  group_type: string
  min_pax: number
  max_pax: number
  price_from: number
  is_featured: boolean
}

export default function ToursBrowserPage() {
  const [tours, setTours] = useState<TourOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterTier, setFilterTier] = useState<string>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchTours()
  }, [])

  const fetchTours = async () => {
    try {
      const response = await fetch('/api/tours/browse')
      const data = await response.json()

      if (data.success) {
        setTours(data.data)
      } else {
        setError('Failed to load tours')
      }
    } catch (err) {
      setError('Error loading tours')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filteredTours = tours.filter(tour => {
    const matchesTier = filterTier === 'all' || tour.tier === filterTier
    const matchesCategory = filterCategory === 'all' || tour.category_name === filterCategory
    const matchesSearch = tour.template_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         tour.destination_name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesTier && matchesCategory && matchesSearch
  })

  const uniqueCategories = [...new Set(tours.map(t => t.category_name))]

  const getTierBadge = (tier: string) => {
    const styles = {
      budget: 'bg-green-100 text-green-800',
      standard: 'bg-blue-100 text-blue-800',
      luxury: 'bg-purple-100 text-purple-800'
    }
    return styles[tier as keyof typeof styles] || 'bg-gray-100 text-gray-800'
  }

  const getTierIcon = (tier: string) => {
    const icons = {
      budget: '💰',
      standard: '💎',
      luxury: '👑'
    }
    return icons[tier as keyof typeof icons] || '📋'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        <Navigation />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading tours...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        <Navigation />
        <div className="container mx-auto px-4 py-12 text-center">
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-red-900 mb-2">Error Loading Tours</h2>
            <p className="text-red-700">{error}</p>
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Tour Database Browser</h1>
          <p className="text-gray-600">Explore available tours and pricing</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="text-3xl font-bold text-blue-600">{tours.length}</div>
            <div className="text-gray-600 text-sm">Total Variations</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="text-3xl font-bold text-green-600">
              {new Set(tours.map(t => t.template_code)).size}
            </div>
            <div className="text-gray-600 text-sm">Tour Templates</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="text-3xl font-bold text-purple-600">{uniqueCategories.length}</div>
            <div className="text-gray-600 text-sm">Categories</div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-md text-center">
            <div className="text-3xl font-bold text-orange-600">
              €{Math.min(...tours.map(t => t.price_from || 999))}
            </div>
            <div className="text-gray-600 text-sm">Starting From</div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Tours
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or destination..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price Tier
              </label>
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option value="all">All Tiers</option>
                <option value="budget">💰 Budget</option>
                <option value="standard">💎 Standard</option>
                <option value="luxury">👑 Luxury</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option value="all">All Categories</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Showing {filteredTours.length} of {tours.length} tours
            </p>
            <button
              onClick={() => {
                setSearchQuery('')
                setFilterTier('all')
                setFilterCategory('all')
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTours.map((tour, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-bold flex-1">{tour.template_name}</h3>
                  {tour.is_featured && (
                    <span className="ml-2 text-yellow-300">⭐</span>
                  )}
                </div>
                <p className="text-blue-100 text-sm">{tour.destination_name}</p>
              </div>

              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTierBadge(tour.tier)}`}>
                    {getTierIcon(tour.tier)} {tour.tier.charAt(0).toUpperCase() + tour.tier.slice(1)}
                  </span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm">
                    {tour.group_type === 'private' ? '🔒 Private' : '👥 Shared'}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center gap-2">
                    <span>📅</span>
                    <span>{tour.duration_days} {tour.duration_days === 1 ? 'day' : 'days'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>👥</span>
                    <span>{tour.min_pax}-{tour.max_pax} passengers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>🏷️</span>
                    <span className="text-xs text-gray-500">{tour.category_name}</span>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">Starting from</p>
                      <p className="text-2xl font-bold text-green-600">
                        €{tour.price_from ? tour.price_from.toFixed(0) : 'N/A'}
                      </p>
                      <p className="text-xs text-gray-500">per person</p>
                    </div>
                    <Link 
                      href={`/tours/${tour.variation_code}`}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500">
                Code: {tour.variation_code}
              </div>
            </div>
          ))}
        </div>

        {filteredTours.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No tours found</h3>
            <p className="text-gray-600">Try adjusting your filters or search terms</p>
          </div>
        )}
      </div>
    </div>
  )
}
