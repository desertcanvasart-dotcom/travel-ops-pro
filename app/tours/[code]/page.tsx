'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface TourDetail {
  template_name: string
  template_code: string
  category_name: string
  destination_name: string
  duration_days: number
  duration_nights: number
  short_description: string
  long_description: string
  highlights: string[]
  variation_name: string
  variation_code: string
  tier: string
  group_type: string
  min_pax: number
  max_pax: number
  inclusions: string[]
  exclusions: string[]
  optional_extras: string[]
  guide_type: string
  guide_languages: string[]
  vehicle_type: string
  pricing: Array<{
    min_pax: number
    max_pax: number
    price_per_person: number
    single_supplement: number | null
  }>
  daily_itinerary: Array<{
    day_number: number
    day_title: string
    day_description: string
    city: string
    overnight_city: string
    breakfast_included: boolean
    lunch_included: boolean
    dinner_included: boolean
  }>
  services: Array<{
    service_category: string
    service_name: string
    quantity_type: string
    cost_per_unit: number
  }>
}

export default function TourDetailPage() {
  const params = useParams()
  const [tour, setTour] = useState<TourDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPax, setSelectedPax] = useState(2)

  useEffect(() => {
    if (params.code) {
      fetchTourDetail(params.code as string)
    }
  }, [params.code])

  const fetchTourDetail = async (code: string) => {
    try {
      const response = await fetch(`/api/tours/${code}`)
      const data = await response.json()

      if (data.success) {
        setTour(data.data)
        // Set default pax to optimal group size
        if (data.data.pricing.length > 0) {
          setSelectedPax(data.data.pricing[0].min_pax)
        }
      } else {
        setError('Tour not found')
      }
    } catch (err) {
      setError('Error loading tour details')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getSelectedPrice = () => {
    if (!tour) return null
    return tour.pricing.find(p => selectedPax >= p.min_pax && selectedPax <= p.max_pax)
  }

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

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      accommodation: '🏨',
      transportation: '🚗',
      guide: '👨‍🏫',
      entrance: '🎫',
      meal: '🍽️',
      activity: '🎭',
      transfer: '✈️'
    }
    return icons[category] || '📋'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading tour details...</p>
        </div>
      </div>
    )
  }

  if (error || !tour) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-8 shadow-lg">
          <div className="container mx-auto px-4">
            <Link href="/tours" className="text-blue-100 hover:text-white">
              ← Back to Tours
            </Link>
          </div>
        </header>
        <div className="container mx-auto px-4 py-12 text-center">
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded max-w-2xl mx-auto">
            <h2 className="text-xl font-bold text-red-900 mb-2">Tour Not Found</h2>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  const selectedPrice = getSelectedPrice()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-8 shadow-lg">
        <div className="container mx-auto px-4">
          <Link href="/tours" className="text-blue-100 hover:text-white mb-4 inline-block">
            ← Back to All Tours
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">{tour.template_name}</h1>
              <p className="text-blue-100">{tour.destination_name} • {tour.duration_days} {tour.duration_days === 1 ? 'day' : 'days'}</p>
            </div>
            <div className="text-right">
              <span className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${getTierBadge(tour.tier)}`}>
                {getTierIcon(tour.tier)} {tour.tier.charAt(0).toUpperCase() + tour.tier.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">About This Tour</h2>
              <p className="text-gray-700 mb-4">{tour.long_description || tour.short_description}</p>
              
              {tour.highlights && tour.highlights.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Highlights</h3>
                  <ul className="space-y-2">
                    {tour.highlights.map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-green-500 mt-1">✓</span>
                        <span className="text-gray-700">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Daily Itinerary */}
            {tour.daily_itinerary && tour.daily_itinerary.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Daily Itinerary</h2>
                <div className="space-y-4">
                  {tour.daily_itinerary.map((day) => (
                    <div key={day.day_number} className="border-l-4 border-blue-500 pl-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Day {day.day_number}: {day.day_title}
                      </h3>
                      <p className="text-gray-600 text-sm mb-2">{day.city}</p>
                      <p className="text-gray-700">{day.day_description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        {day.breakfast_included && <span>🍳 Breakfast</span>}
                        {day.lunch_included && <span>🍽️ Lunch</span>}
                        {day.dinner_included && <span>🌙 Dinner</span>}
                      </div>
                      {day.overnight_city && (
                        <p className="text-sm text-gray-500 mt-2">
                          🌙 Overnight in {day.overnight_city}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Inclusions & Exclusions */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Inclusions */}
                <div>
                  <h3 className="text-lg font-semibold text-green-700 mb-3">✓ Included</h3>
                  <ul className="space-y-2">
                    {tour.inclusions.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-green-500">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Exclusions */}
                <div>
                  <h3 className="text-lg font-semibold text-red-700 mb-3">✗ Not Included</h3>
                  <ul className="space-y-2">
                    {tour.exclusions.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-red-500">✗</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Optional Extras */}
              {tour.optional_extras && tour.optional_extras.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="text-lg font-semibold text-blue-700 mb-3">+ Optional Extras</h3>
                  <ul className="space-y-2">
                    {tour.optional_extras.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-blue-500">+</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Services Breakdown */}
            {tour.services && tour.services.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Services Included</h2>
                <div className="space-y-3">
                  {tour.services.map((service, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getCategoryIcon(service.service_category)}</span>
                        <div>
                          <p className="font-medium text-gray-900">{service.service_name}</p>
                          <p className="text-sm text-gray-500 capitalize">
                            {service.service_category.replace('_', ' ')} • {service.quantity_type.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">€{service.cost_per_unit.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Pricing Calculator */}
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-4">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Calculate Your Price</h3>
              
              {/* Group Size Selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Travelers
                </label>
                <select
                  value={selectedPax}
                  onChange={(e) => setSelectedPax(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  {Array.from({ length: tour.max_pax }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>
                      {num} {num === 1 ? 'person' : 'people'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Display */}
              {selectedPrice && (
                <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg mb-4">
                  <p className="text-sm text-gray-600 mb-1">Price per person</p>
                  <p className="text-4xl font-bold text-green-600">
                    €{selectedPrice.price_per_person.toFixed(0)}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">
                    Total: €{(selectedPrice.price_per_person * selectedPax).toFixed(0)}
                  </p>
                  {selectedPax === 1 && selectedPrice.single_supplement && (
                    <p className="text-xs text-gray-500 mt-2">
                      Includes single supplement of €{selectedPrice.single_supplement}
                    </p>
                  )}
                </div>
              )}

              {/* All Pricing Tiers */}
              <div className="border-t pt-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Pricing by group size:</p>
                <div className="space-y-2">
                  {tour.pricing.map((price, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {price.min_pax === price.max_pax 
                          ? `${price.min_pax} pax`
                          : `${price.min_pax}-${price.max_pax} pax`
                        }
                      </span>
                      <span className="font-medium text-gray-900">
                        €{price.price_per_person}/person
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
                Request This Tour
              </button>
            </div>

            {/* Tour Info */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Tour Information</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Category:</span>
                  <span className="font-medium text-gray-900">{tour.category_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Duration:</span>
                  <span className="font-medium text-gray-900">
                    {tour.duration_days} days
                    {tour.duration_nights > 0 && ` / ${tour.duration_nights} nights`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {tour.group_type === 'private' ? '🔒 Private' : '👥 Shared'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Guide:</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {tour.guide_type?.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Languages:</span>
                  <span className="font-medium text-gray-900">
                    {tour.guide_languages?.join(', ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Group size:</span>
                  <span className="font-medium text-gray-900">
                    {tour.min_pax}-{tour.max_pax} pax
                  </span>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold mb-2">Need Help?</h3>
              <p className="text-blue-100 text-sm mb-4">
                Contact us for custom arrangements or questions
              </p>
              <div className="space-y-2 text-sm">
                <p>📧 info@travel2egypt.org</p>
                <p>📞 +20 115 801 1600</p>
                <p>🌍 www.travel2egypt.org</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}