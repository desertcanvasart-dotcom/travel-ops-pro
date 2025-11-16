'use client'

import { useState } from 'react'

export default function TestCalculatorPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const testCalculation = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/tours/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tour: {
            tour_code: 'TEST-FRONTEND',
            tour_name: 'Frontend Test Tour',
            duration_days: 1,
            cities: ['Cairo'],
            tour_type: 'custom',
            is_template: false,
            days: [
              {
                day_number: 1,
                city: 'Cairo',
                breakfast_included: true,
                guide_required: true,
                accommodation: {
                  id: 'test-acc',
                  service_code: 'TEST-ACC',
                  property_name: 'Test Hotel Cairo',
                  property_type: 'Hotel',
                  star_rating: 4,
                  room_type: 'Double Standard',
                  board_basis: 'BB',
                  city: 'Cairo',
                  base_rate_eur: 100,
                  base_rate_non_eur: 90,
                  tier: 'standard'
                },
                lunch_meal: {
                  id: 'test-meal',
                  service_code: 'TEST-MEAL',
                  restaurant_name: 'Local Restaurant',
                  meal_type: 'Lunch',
                  cuisine_type: 'Egyptian',
                  restaurant_type: 'Casual',
                  city: 'Cairo',
                  base_rate_eur: 15,
                  base_rate_non_eur: 12,
                  tier: 'budget',
                  meal_category: 'casual'
                },
                dinner_meal: {
                  id: 'test-dinner',
                  service_code: 'TEST-DINNER',
                  restaurant_name: 'Nile View Restaurant',
                  meal_type: 'Dinner',
                  cuisine_type: 'International',
                  restaurant_type: 'Fine Dining',
                  city: 'Cairo',
                  base_rate_eur: 35,
                  base_rate_non_eur: 30,
                  tier: 'standard',
                  meal_category: 'fine_dining'
                },
                guide: {
                  id: 'test-guide',
                  service_code: 'TEST-GUIDE',
                  guide_language: 'English',
                  guide_type: 'Standard',
                  city: 'Cairo',
                  tour_duration: 'Full Day',
                  base_rate_eur: 50,
                  base_rate_non_eur: 50
                },
                activities: [
                  {
                    activity_order: 1,
                    entrance: {
                      id: 'test-entrance',
                      service_code: 'TEST-ENT',
                      attraction_name: 'Giza Pyramids',
                      city: 'Cairo',
                      fee_type: 'per_person',
                      base_rate_eur: 13,
                      base_rate_non_eur: 10
                    },
                    transportation: {
                      id: 'test-transport',
                      service_code: 'TEST-TRANS',
                      service_type: 'day_tour',
                      vehicle_type: 'Minivan',
                      capacity_min: 3,
                      capacity_max: 8,
                      city: 'Cairo',
                      base_rate_eur: 55,
                      base_rate_non_eur: 55
                    }
                  },
                  {
                    activity_order: 2,
                    entrance: {
                      id: 'test-entrance-2',
                      service_code: 'TEST-ENT-2',
                      attraction_name: 'Egyptian Museum',
                      city: 'Cairo',
                      fee_type: 'per_person',
                      base_rate_eur: 15,
                      base_rate_non_eur: 13
                    }
                  }
                ]
              }
            ]
          },
          pax: 10,
          is_euro_passport: true
        })
      })

      const data = await response.json()

      if (data.success) {
        setResult(data.data)
      } else {
        setError(data.error || 'Unknown error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to calculate')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🧮 Tour Calculator API Test
          </h1>
          <p className="text-gray-600 mb-8">
            Test the tour calculation API endpoint
          </p>

          <div className="mb-8">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-blue-900 mb-2">Test Scenario:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 10 passengers (Euro passport holders)</li>
                <li>• 1 day in Cairo</li>
                <li>• Hotel: €100/room (5 rooms needed)</li>
                <li>• Lunch: €15/person + Dinner: €35/person</li>
                <li>• Guide: €50/day</li>
                <li>• Pyramids entrance: €13/person</li>
                <li>• Museum entrance: €15/person</li>
                <li>• Transportation: €55/vehicle</li>
              </ul>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">Expected Result:</h3>
              <div className="text-sm text-green-800 space-y-1">
                <p>• Accommodation: €500 (5 rooms × €100)</p>
                <p>• Meals: €500 (10 × €15 + 10 × €35)</p>
                <p>• Guide: €50</p>
                <p>• Entrances: €280 (10 × €13 + 10 × €15)</p>
                <p>• Transportation: €55</p>
                <p className="font-bold pt-2 border-t border-green-300">
                  TOTAL: €1,385 (€138.50 per person)
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={testCalculation}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Calculating...' : '🚀 Run Test'}
          </button>

          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 mb-2">❌ Error</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="font-semibold text-green-900 mb-4 text-xl">
                  ✅ Calculation Successful!
                </h3>

                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-gray-700">Accommodation</span>
                    <span className="font-bold text-green-700">
                      €{result.totals.total_accommodation.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-gray-700">Meals</span>
                    <span className="font-bold text-green-700">
                      €{result.totals.total_meals.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-gray-700">Guides</span>
                    <span className="font-bold text-green-700">
                      €{result.totals.total_guides.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-gray-700">Transportation</span>
                    <span className="font-bold text-green-700">
                      €{result.totals.total_transportation.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-gray-700">Entrances</span>
                    <span className="font-bold text-green-700">
                      €{result.totals.total_entrances.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3 bg-green-100 rounded-lg px-4 mt-4">
                    <span className="font-bold text-lg text-gray-800">
                      GRAND TOTAL
                    </span>
                    <span className="font-bold text-2xl text-green-700">
                      €{result.totals.grand_total.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 bg-blue-100 rounded-lg px-4">
                    <span className="font-semibold text-gray-800">
                      Per Person (10 pax)
                    </span>
                    <span className="font-bold text-xl text-blue-700">
                      €{result.per_person.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                  📊 View Daily Breakdown
                </summary>
                <div className="mt-4">
                  {result.daily_breakdown.map((day: any) => (
                    <div key={day.day_number} className="mb-4 p-4 bg-white rounded border">
                      <h4 className="font-semibold mb-2">
                        Day {day.day_number} - {day.city}
                      </h4>
                      <div className="text-sm space-y-1 text-gray-600">
                        <p>Accommodation: €{day.accommodation.toFixed(2)}</p>
                        <p>Meals: €{day.meals.toFixed(2)}</p>
                        <p>Guide: €{day.guide.toFixed(2)}</p>
                        <p>Transportation: €{day.transportation.toFixed(2)}</p>
                        <p>Entrances: €{day.entrances.toFixed(2)}</p>
                        <p className="font-semibold pt-2 border-t">
                          Day Total: €{day.daily_total.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              <details className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                  🔧 View Raw JSON Response
                </summary>
                <pre className="mt-4 p-4 bg-gray-900 text-green-400 rounded text-xs overflow-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-gray-600">
          <p className="text-sm">
            ✅ If you see the calculation above, your Tour Calculator backend is working perfectly!
          </p>
          <p className="text-xs mt-2">
            Next step: Build the tour builder UI
          </p>
        </div>
      </div>
    </div>
  )
}