'use client'

import { TourPricingBreakdown } from '../types'

interface PricingSidebarProps {
  pricing: TourPricingBreakdown | null
  pax: number
  isCalculating: boolean
  onRecalculate: () => void
}

export default function PricingSidebar({
  pricing,
  pax,
  isCalculating,
  onRecalculate
}: PricingSidebarProps) {
  
  if (!pricing) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 sticky top-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">
          💰 Live Pricing
        </h3>
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-gray-600">
            Start planning your tour to see pricing
          </p>
        </div>
      </div>
    )
  }

  const calculatePercentage = (amount: number) => {
    if (pricing.totals.grand_total === 0) return 0
    return (amount / pricing.totals.grand_total) * 100
  }

  return (
    <div className="bg-white rounded-lg shadow-lg sticky top-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6 rounded-t-lg">
        <h3 className="text-lg font-bold mb-2">💰 Live Pricing</h3>
        <div className="text-3xl font-bold">
          €{pricing.totals.grand_total.toFixed(2)}
        </div>
        <div className="text-green-100 text-sm mt-1">
          €{pricing.per_person.toFixed(2)} per person
        </div>
      </div>

      <div className="p-6">
        {/* Breakdown */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">🏨 Accommodation</span>
              <span className="text-xs text-gray-400">
                ({calculatePercentage(pricing.totals.total_accommodation).toFixed(0)}%)
              </span>
            </div>
            <span className="font-semibold text-gray-900">
              €{pricing.totals.total_accommodation.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">🍽️ Meals</span>
              <span className="text-xs text-gray-400">
                ({calculatePercentage(pricing.totals.total_meals).toFixed(0)}%)
              </span>
            </div>
            <span className="font-semibold text-gray-900">
              €{pricing.totals.total_meals.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">👨‍🏫 Guides</span>
              <span className="text-xs text-gray-400">
                ({calculatePercentage(pricing.totals.total_guides).toFixed(0)}%)
              </span>
            </div>
            <span className="font-semibold text-gray-900">
              €{pricing.totals.total_guides.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">🚗 Transportation</span>
              <span className="text-xs text-gray-400">
                ({calculatePercentage(pricing.totals.total_transportation).toFixed(0)}%)
              </span>
            </div>
            <span className="font-semibold text-gray-900">
              €{pricing.totals.total_transportation.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">🎫 Entrances</span>
              <span className="text-xs text-gray-400">
                ({calculatePercentage(pricing.totals.total_entrances).toFixed(0)}%)
              </span>
            </div>
            <span className="font-semibold text-gray-900">
              €{pricing.totals.total_entrances.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Daily Breakdown */}
        <div className="border-t pt-4 mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Daily Breakdown
          </h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {pricing.daily_breakdown.map((day) => (
              <div
                key={day.day_number}
                className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded"
              >
                <span className="text-gray-600">
                  Day {day.day_number} - {day.city}
                </span>
                <span className="font-semibold text-gray-900">
                  €{day.daily_total.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* PAX Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="text-xs text-blue-800 mb-1">Passengers</div>
          <div className="text-2xl font-bold text-blue-900">{pax}</div>
          <div className="text-xs text-blue-700 mt-1">
            €{pricing.per_person.toFixed(2)} per person
          </div>
        </div>

        {/* Recalculate Button */}
        <button
          onClick={onRecalculate}
          disabled={isCalculating}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
        >
          {isCalculating ? '⏳ Calculating...' : '🔄 Recalculate'}
        </button>

        {/* Quick Stats */}
        <div className="mt-4 pt-4 border-t">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-600 mb-1">Avg/Day</div>
              <div className="text-lg font-bold text-gray-900">
                €{(pricing.totals.grand_total / pricing.daily_breakdown.length).toFixed(0)}
              </div>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="text-xs text-gray-600 mb-1">Days</div>
              <div className="text-lg font-bold text-gray-900">
                {pricing.daily_breakdown.length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}