'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Rate {
  service_code: string
  service_type?: string
  vehicle_type?: string
  guide_language?: string
  attraction_name?: string
  city: string
  base_rate_eur: number
  base_rate_non_eur: number
}

interface RatesData {
  transportation: Rate[]
  guides: Rate[]
  entrances: Rate[]
}

export default function RatesPage() {
  const [rates, setRates] = useState<RatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/rates')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRates(data.data)
        } else {
          setError('Failed to load rates')
        }
        setLoading(false)
      })
      .catch(err => {
        setError('Error loading rates')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#DC834E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading rates...</p>
        </div>
      </div>
    )
  }

  if (error || !rates) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Failed to load rates'}</p>
          <Link href="/" className="text-[#DC834E] hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white">
      {/* Header */}
      <header className="bg-[#DC834E] text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                <span className="text-[#DC834E] text-xl font-bold">T2E</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold">Rate Management</h1>
                <p className="text-orange-100 text-sm">Current Service Rates</p>
              </div>
            </div>
            <Link 
              href="/" 
              className="bg-white text-[#DC834E] px-4 py-2 rounded-lg hover:bg-orange-50 transition-colors"
            >
              ← Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        
        {/* Transportation Rates */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">🚗 Transportation Rates</h2>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#DC834E] text-white">
                  <tr>
                    <th className="px-6 py-4 text-left">Service</th>
                    <th className="px-6 py-4 text-left">Vehicle</th>
                    <th className="px-6 py-4 text-left">City</th>
                    <th className="px-6 py-4 text-right">Euro Rate</th>
                    <th className="px-6 py-4 text-right">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.transportation.map((rate, index) => (
                    <tr key={rate.service_code} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 font-medium">{rate.service_type}</td>
                      <td className="px-6 py-4">{rate.vehicle_type}</td>
                      <td className="px-6 py-4">{rate.city}</td>
                      <td className="px-6 py-4 text-right">€{rate.base_rate_eur?.toFixed(2) || '0.00'}</td>
<td className="px-6 py-4 text-right">€{rate.base_rate_non_eur?.toFixed(2) || '0.00'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Guide Rates */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">👨‍🏫 Guide Rates</h2>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#DC834E] text-white">
                  <tr>
                    <th className="px-6 py-4 text-left">Language</th>
                    <th className="px-6 py-4 text-left">City</th>
                    <th className="px-6 py-4 text-left">Duration</th>
                    <th className="px-6 py-4 text-right">Euro Rate</th>
                    <th className="px-6 py-4 text-right">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.guides.map((rate, index) => (
                    <tr key={rate.service_code} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 font-medium">{rate.guide_language}</td>
                      <td className="px-6 py-4">{rate.city}</td>
                      <td className="px-6 py-4 capitalize">{rate.guide_language}</td>
                      <td className="px-6 py-4 text-right">€{rate.base_rate_eur?.toFixed(2) || '0.00'}</td>
<td className="px-6 py-4 text-right">€{rate.base_rate_non_eur?.toFixed(2) || '0.00'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Entrance Fees */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">🎫 Entrance Fees</h2>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#DC834E] text-white">
                  <tr>
                    <th className="px-6 py-4 text-left">Attraction</th>
                    <th className="px-6 py-4 text-left">City</th>
                    <th className="px-6 py-4 text-right">Euro Rate</th>
                    <th className="px-6 py-4 text-right">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.entrances.map((rate, index) => (
                    <tr key={rate.service_code} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 font-medium">{rate.attraction_name}</td>
                      <td className="px-6 py-4">{rate.city}</td>
                      <td className="px-6 py-4 text-right">€{rate.base_rate_eur?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 text-right">€{rate.base_rate_non_eur?.toFixed(2) || '0.00'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}