'use client'

import { useState } from 'react'

export default function PricingTestPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [override, setOverride] = useState<string | null>(null)

  const testPricing = async (overrideCode: string | null = null) => {
    setLoading(true)
    setOverride(overrideCode)
    
    try {
      const response = await fetch('/api/pricing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          num_adults: 6,
          num_children: 0,
          duration_days: 1,
          tour_type: 'day_tour',
          city: 'Cairo',
          transportation_service: 'day_tour',
          override_transportation: overrideCode,
          language: 'English',
          entrance_fees_per_person: 14,
          includes_lunch: true,
          includes_dinner: false,
          outside_cairo: false,
          airport_transfers: 0,
          hotel_checkins: 0
        })
      })
      
      const data = await response.json()
      setResult(data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">🚗 Hybrid Transportation Pricing Test</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Test Scenarios</h2>
          
          <div className="space-y-3">
            <button
              onClick={() => testPricing(null)}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-left"
            >
              🤖 Auto-Select: 6 adults, Cairo Day Tour
            </button>

            <button
              onClick={() => testPricing('CAIRO-AIRPORT-MINIVAN')}
              disabled={loading}
              className="w-full bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 text-left"
            >
              🔧 Override: Use Airport Transfer Rate (€55 instead of €110)
            </button>

            <button
              onClick={() => testPricing('CAIRO-DAYTOUR-BUS')}
              disabled={loading}
              className="w-full bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 text-left"
            >
              🚌 Override: Use Bus (€200 - over capacity but testing)
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-center py-8">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Calculating...</p>
          </div>
        )}

        {result && !loading && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            {result.success ? (
              <>
                <h2 className="text-2xl font-bold mb-4">
                  Result: €{result.pricing?.price_per_person} per person
                </h2>
                <h3 className="text-xl text-gray-600 mb-6">
                  Total: €{result.pricing?.total_price}
                </h3>

                <div className="space-y-6">
                  {/* Vehicle Selection */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                    <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                      🚗 Vehicle Selection
                      {result.pricing?.vehicle?.selected?.was_overridden && (
                        <span className="text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded">Override Applied</span>
                      )}
                    </h3>
                    
                    <div className="bg-white rounded p-3 mb-3">
                      <p className="font-bold text-green-600 mb-1">✓ Selected: {result.pricing?.vehicle?.selected?.type}</p>
                      <p className="text-sm text-gray-600">
                        Code: {result.pricing?.vehicle?.selected?.service_code}<br/>
                        Capacity: {result.pricing?.vehicle?.selected?.capacity}<br/>
                        Cost: €{result.pricing?.vehicle?.selected?.cost_per_day}/day
                      </p>
                    </div>

                    {result.pricing?.vehicle?.alternatives?.length > 1 && (
                      <div>
                        <p className="text-sm font-semibold mb-2">Alternative Options:</p>
                        {result.pricing.vehicle.alternatives
                          .filter((v: any) => !v.is_selected)
                          .map((v: any) => (
                            <div key={v.service_code} className="bg-gray-50 rounded p-2 mb-1 text-sm">
                              {v.type} - {v.capacity} - €{v.cost_per_day}
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Group Costs */}
                  <div>
                    <h3 className="font-bold text-lg mb-2">Group Costs:</h3>
                    <pre className="bg-gray-100 p-4 rounded overflow-auto">
                      {JSON.stringify(result.pricing?.breakdown?.group_costs, null, 2)}
                    </pre>
                  </div>

                  {/* Per Person Costs */}
                  <div>
                    <h3 className="font-bold text-lg mb-2">Per Person Costs:</h3>
                    <pre className="bg-gray-100 p-4 rounded overflow-auto">
                      {JSON.stringify(result.pricing?.breakdown?.per_person_costs, null, 2)}
                    </pre>
                  </div>

                  {/* Full Breakdown */}
                  <details className="cursor-pointer">
                    <summary className="font-bold text-lg mb-2">Full API Response</summary>
                    <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm mt-2">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </details>
                </div>
              </>
            ) : (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                <h3 className="font-bold text-red-600 mb-2">❌ Error</h3>
                <p className="text-red-700">{result.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
