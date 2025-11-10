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
  guide_type?: string
  tour_duration?: string
  capacity_min?: number
  capacity_max?: number
  supplier_name?: string
  notes?: string
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
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [activeTab, setActiveTab] = useState<'transportation' | 'guides' | 'entrances'>('transportation')

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

  // Get all unique cities
  const allCities = Array.from(new Set([
    ...rates.transportation.map(r => r.city),
    ...rates.guides.map(r => r.city),
    ...rates.entrances.map(r => r.city)
  ])).sort()

  // Filter function
  const filterRates = (rateArray: Rate[]) => {
    return rateArray.filter(rate => {
      const matchesSearch = searchTerm === '' || 
        (rate.service_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         rate.vehicle_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         rate.guide_language?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         rate.attraction_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         rate.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
         rate.notes?.toLowerCase().includes(searchTerm.toLowerCase()))
      
      const matchesCity = selectedCity === 'all' || rate.city === selectedCity
      
      return matchesSearch && matchesCity
    })
  }

  const filteredRates = {
    transportation: filterRates(rates.transportation),
    guides: filterRates(rates.guides),
    entrances: filterRates(rates.entrances)
  }

  const exportToCSV = () => {
    const currentRates = filteredRates[activeTab]
    
    // Create CSV headers based on tab
    let headers: string[] = []
    let csvContent = ''
    
    if (activeTab === 'transportation') {
      headers = ['Service Type', 'Vehicle', 'City', 'Capacity', 'Euro Rate', 'Non-Euro Rate', 'Supplier', 'Notes']
      csvContent = headers.join(',') + '\n'
      currentRates.forEach(rate => {
        const capacity = rate.capacity_min && rate.capacity_max ? `${rate.capacity_min}-${rate.capacity_max}` : ''
        const row = [
          rate.service_type || '',
          rate.vehicle_type || '',
          rate.city,
          capacity,
          rate.base_rate_eur,
          rate.base_rate_non_eur,
          rate.supplier_name || '',
          (rate.notes || '').replace(/,/g, ';')
        ]
        csvContent += row.join(',') + '\n'
      })
    } else if (activeTab === 'guides') {
      headers = ['Language', 'Type', 'City', 'Duration', 'Euro Rate', 'Non-Euro Rate', 'Notes']
      csvContent = headers.join(',') + '\n'
      currentRates.forEach(rate => {
        const row = [
          rate.guide_language || '',
          rate.guide_type || '',
          rate.city,
          rate.tour_duration || '',
          rate.base_rate_eur,
          rate.base_rate_non_eur,
          (rate.notes || '').replace(/,/g, ';')
        ]
        csvContent += row.join(',') + '\n'
      })
    } else {
      headers = ['Attraction', 'City', 'Euro Rate', 'Non-Euro Rate', 'Notes']
      csvContent = headers.join(',') + '\n'
      currentRates.forEach(rate => {
        const row = [
          rate.attraction_name || '',
          rate.city,
          rate.base_rate_eur,
          rate.base_rate_non_eur,
          (rate.notes || '').replace(/,/g, ';')
        ]
        csvContent += row.join(',') + '\n'
      })
    }

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${activeTab}_rates_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const printPage = () => {
    window.print()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white">
      {/* Header */}
      <header className="bg-[#DC834E] text-white py-6 shadow-lg print:shadow-none">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                <span className="text-[#DC834E] text-xl font-bold">T2E</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold">Rate Management</h1>
                <p className="text-orange-100 text-sm">Travel2Egypt Current Service Rates</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={exportToCSV}
                className="bg-white text-[#DC834E] px-4 py-2 rounded-lg hover:bg-orange-50 transition-colors text-sm print:hidden"
              >
                📊 Export CSV
              </button>
              <button 
                onClick={printPage}
                className="bg-white text-[#DC834E] px-4 py-2 rounded-lg hover:bg-orange-50 transition-colors text-sm print:hidden"
              >
                🖨️ Print
              </button>
              <Link 
                href="/" 
                className="bg-white text-[#DC834E] px-4 py-2 rounded-lg hover:bg-orange-50 transition-colors text-sm print:hidden"
              >
                ← Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="container mx-auto px-4 py-6 print:hidden">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔍 Search Services
              </label>
              <input
                type="text"
                placeholder="Search by service, vehicle, attraction, supplier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#DC834E] focus:border-transparent"
              />
            </div>
            <div className="md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🏙️ Filter by City
              </label>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#DC834E] focus:border-transparent"
              >
                <option value="all">All Cities</option>
                {allCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Results Count */}
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredRates[activeTab].length} of {rates[activeTab].length} {activeTab} rates
            {searchTerm && ` for "${searchTerm}"`}
            {selectedCity !== 'all' && ` in ${selectedCity}`}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="container mx-auto px-4 print:hidden">
        <div className="bg-white rounded-t-xl shadow-lg">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('transportation')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'transportation'
                  ? 'text-[#DC834E] border-b-2 border-[#DC834E] bg-orange-50'
                  : 'text-gray-600 hover:text-[#DC834E]'
              }`}
            >
              🚗 Transportation ({filteredRates.transportation.length})
            </button>
            <button
              onClick={() => setActiveTab('guides')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'guides'
                  ? 'text-[#DC834E] border-b-2 border-[#DC834E] bg-orange-50'
                  : 'text-gray-600 hover:text-[#DC834E]'
              }`}
            >
              👨‍🏫 Guides ({filteredRates.guides.length})
            </button>
            <button
              onClick={() => setActiveTab('entrances')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'entrances'
                  ? 'text-[#DC834E] border-b-2 border-[#DC834E] bg-orange-50'
                  : 'text-gray-600 hover:text-[#DC834E]'
              }`}
            >
              🎫 Entrances ({filteredRates.entrances.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 pb-8">
        <div className="bg-white rounded-b-xl shadow-lg overflow-hidden print:shadow-none">
          <div className="overflow-x-auto">
            {/* Transportation Table */}
            {activeTab === 'transportation' && (
              <table className="w-full">
                <thead className="bg-[#DC834E] text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Service</th>
                    <th className="px-6 py-4 text-left font-semibold">Vehicle</th>
                    <th className="px-6 py-4 text-left font-semibold">City</th>
                    <th className="px-6 py-4 text-center font-semibold">Capacity</th>
                    <th className="px-6 py-4 text-right font-semibold">Euro Rate</th>
                    <th className="px-6 py-4 text-right font-semibold">Non-Euro Rate</th>
                    <th className="px-6 py-4 text-left font-semibold">Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.transportation.map((rate, index) => (
                    <tr key={rate.service_code} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 font-medium">{rate.service_type}</td>
                      <td className="px-6 py-4">{rate.vehicle_type}</td>
                      <td className="px-6 py-4">{rate.city}</td>
                      <td className="px-6 py-4 text-center">
                        {rate.capacity_min && rate.capacity_max ? `${rate.capacity_min}-${rate.capacity_max}` : ''}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold">€{rate.base_rate_eur?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 text-right font-semibold">€{rate.base_rate_non_eur?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{rate.supplier_name}</td>
                    </tr>
                  ))}
                  {filteredRates.transportation.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        No transportation services found matching your criteria
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Guides Table */}
            {activeTab === 'guides' && (
              <table className="w-full">
                <thead className="bg-[#DC834E] text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Language</th>
                    <th className="px-6 py-4 text-left font-semibold">Type</th>
                    <th className="px-6 py-4 text-left font-semibold">City</th>
                    <th className="px-6 py-4 text-left font-semibold">Duration</th>
                    <th className="px-6 py-4 text-right font-semibold">Euro Rate</th>
                    <th className="px-6 py-4 text-right font-semibold">Non-Euro Rate</th>
                    <th className="px-6 py-4 text-left font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.guides.map((rate, index) => (
                    <tr key={rate.service_code} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 font-medium">{rate.guide_language}</td>
                      <td className="px-6 py-4">{rate.guide_type}</td>
                      <td className="px-6 py-4">{rate.city}</td>
                      <td className="px-6 py-4 capitalize">{rate.tour_duration?.replace('_', ' ')}</td>
                      <td className="px-6 py-4 text-right font-semibold">€{rate.base_rate_eur?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 text-right font-semibold">€{rate.base_rate_non_eur?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{rate.notes}</td>
                    </tr>
                  ))}
                  {filteredRates.guides.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        No guide services found matching your criteria
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Entrances Table */}
            {activeTab === 'entrances' && (
              <table className="w-full">
                <thead className="bg-[#DC834E] text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Attraction</th>
                    <th className="px-6 py-4 text-left font-semibold">City</th>
                    <th className="px-6 py-4 text-right font-semibold">Euro Rate</th>
                    <th className="px-6 py-4 text-right font-semibold">Non-Euro Rate</th>
                    <th className="px-6 py-4 text-left font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.entrances.map((rate, index) => (
                    <tr key={rate.service_code} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="px-6 py-4 font-medium">{rate.attraction_name}</td>
                      <td className="px-6 py-4">{rate.city}</td>
                      <td className="px-6 py-4 text-right font-semibold">€{rate.base_rate_eur?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 text-right font-semibold">€{rate.base_rate_non_eur?.toFixed(2) || '0.00'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{rate.notes}</td>
                    </tr>
                  ))}
                  {filteredRates.entrances.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No entrance fees found matching your criteria
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block mb-4">
          <div className="text-center border-b-2 border-[#DC834E] pb-4 mb-6">
            <h1 className="text-3xl font-bold text-[#DC834E]">Travel2Egypt</h1>
            <h2 className="text-xl text-gray-700 mt-2">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Rates</h2>
            <p className="text-sm text-gray-500 mt-1">Generated on {new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </main>
    </div>
  )
}