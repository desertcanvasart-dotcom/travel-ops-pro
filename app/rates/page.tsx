'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Interfaces for all service types
interface BaseRate {
  service_code: string
  city: string
  eur_rate?: number
  non_eur_rate?: number
  base_rate_eur?: number
  base_rate_non_eur?: number
  supplier_name?: string
  notes?: string
  season?: string
}

interface TransportationRate extends BaseRate {
  service_type?: string
  vehicle_type?: string
  capacity_min?: number
  capacity_max?: number
}

interface GuideRate extends BaseRate {
  guide_language?: string
  guide_type?: string
  tour_duration?: string
}

interface EntranceRate extends BaseRate {
  attraction_name?: string
  fee_type?: string
  category?: string
  child_discount_percent?: number
}

interface AccommodationRate extends BaseRate {
  property_name?: string
  property_type?: string
  star_rating?: number
  room_type?: string
  board_basis?: string
  tier?: string
  single_supplement_eur?: number
  single_supplement_non_eur?: number  
  high_season_rate_eur?: number
  high_season_rate_non_eur?: number
  low_season_rate_eur?: number
  low_season_rate_non_eur?: number
  base_rate_eur: number
  base_rate_non_eur: number
}

interface MealRate extends BaseRate {
  restaurant_name?: string
  meal_type?: string
  cuisine_type?: string
  restaurant_type?: string
  tier?: string
  meal_category?: string
  dietary_options?: string[]
  base_rate_eur?: number
  base_rate_non_eur?: number
}

interface ServiceFeeRate extends BaseRate {
  service_name?: string
  service_category?: string
  service_type?: string
  rate_type?: string
}

interface ActivityRate extends BaseRate {
  activity_name?: string
  activity_category?: string
  activity_type?: string
  duration?: string
}

interface RatesData {
  transportation: TransportationRate[]
  guides: GuideRate[]
  entrances: EntranceRate[]
  accommodation: AccommodationRate[]
  meals: MealRate[]
  serviceFees: ServiceFeeRate[]
  activities: ActivityRate[]
}

type TabType = 'transportation' | 'guides' | 'entrances' | 'accommodation' | 'meals' | 'serviceFees' | 'activities'

export default function RatesPage() {
  const [rates, setRates] = useState<RatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [activeTab, setActiveTab] = useState<TabType>('transportation')
  
  const [selectedMealTier, setSelectedMealTier] = useState('all')
  const [selectedMealCategory, setSelectedMealCategory] = useState('all')
  const [selectedTier, setSelectedTier] = useState('all')
  const [selectedPropertyType, setSelectedPropertyType] = useState('all')
  const [showSeasonalPricing, setShowSeasonalPricing] = useState(false)

  useEffect(() => {
    const fetchAllRates = async () => {
      try {
        const [
          transportationRes,
          guidesRes,
          entrancesRes,
          accommodationRes,
          mealsRes
        ] = await Promise.all([
          fetch('/api/rates?type=transportation'),
          fetch('/api/rates?type=guide'),
          fetch('/api/rates?type=entrance'),
          fetch('/api/rates?type=accommodation'),
          fetch('/api/rates?type=meal')
        ])

        const [
          transportationData,
          guidesData,
          entrancesData,
          accommodationData,
          mealsData
        ] = await Promise.all([
          transportationRes.json(),
          guidesRes.json(),
          entrancesRes.json(),
          accommodationRes.json(),
          mealsRes.json()
        ])

        const combinedData: RatesData = {
          transportation: transportationData.success ? transportationData.data : [],
          guides: guidesData.success ? guidesData.data : [],
          entrances: entrancesData.success ? entrancesData.data : [],
          accommodation: accommodationData.success ? accommodationData.data : [],
          meals: mealsData.success ? mealsData.data : [],
          serviceFees: [],
          activities: []
        }

        setRates(combinedData)
        setLoading(false)
      } catch (err) {
        console.error('Error loading rates:', err)
        setError('Error loading rates')
        setLoading(false)
      }
    }

    fetchAllRates()
  }, [])

  const getUniqueCategoriesFromEntrances = () => {
    if (!rates) return []
    return Array.from(new Set(rates.entrances.map(r => r.category).filter(Boolean))).sort()
  }

  const getUniqueMealTiers = () => {
    if (!rates) return []
    return Array.from(new Set(rates.meals.map(r => r.tier).filter(Boolean))).sort()
  }
  
  const getUniqueMealCategories = () => {
    if (!rates) return []
    return Array.from(new Set(rates.meals.map(r => r.meal_category).filter(Boolean))).sort()
  }

  const getUniqueTiersFromAccommodation = () => {
    if (!rates) return []
    return Array.from(new Set(rates.accommodation.map(r => r.tier).filter(Boolean))).sort()
  }

  const getUniquePropertyTypes = () => {
    if (!rates) return []
    return Array.from(new Set(rates.accommodation.map(r => r.property_type).filter(Boolean))).sort()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading rates...</p>
        </div>
      </div>
    )
  }

  if (error || !rates) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-6 rounded-lg shadow-md">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-red-500 text-xl">⚠️</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
          <p className="text-sm text-red-600 mb-3">{error || 'Failed to load rates'}</p>
          <Link href="/" className="inline-block px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    )
  }

  const allCities = Array.from(new Set([
    ...rates.transportation.map(r => r.city),
    ...rates.guides.map(r => r.city),
    ...rates.entrances.map(r => r.city),
    ...rates.accommodation.map(r => r.city),
    ...rates.meals.map(r => r.city),
    ...rates.serviceFees.map(r => r.city),
    ...rates.activities.map(r => r.city)
  ])).sort()

  const filterRates = <T extends BaseRate>(rateArray: T[]): T[] => {
    return rateArray.filter(rate => {
      const matchesSearch = searchTerm === '' || 
        Object.values(rate).some(value => 
          value && value.toString().toLowerCase().includes(searchTerm.toLowerCase())
        )
      
      const matchesCity = selectedCity === 'all' || rate.city === selectedCity
      
      const matchesCategory = activeTab !== 'entrances' || 
        selectedCategory === 'all' || 
        (rate as any).category === selectedCategory

      const matchesTier = activeTab !== 'accommodation' || 
        selectedTier === 'all' || 
        (rate as any).tier === selectedTier

      const matchesPropertyType = activeTab !== 'accommodation' ||
        selectedPropertyType === 'all' ||
        (rate as any).property_type === selectedPropertyType
      
      return matchesSearch && matchesCity && matchesCategory && matchesTier && matchesPropertyType
    })
  }

  const filteredRates = {
    transportation: filterRates(rates.transportation),
    guides: filterRates(rates.guides),
    entrances: filterRates(rates.entrances),
    accommodation: filterRates(rates.accommodation),
    meals: filterRates(rates.meals),
    serviceFees: filterRates(rates.serviceFees),
    activities: filterRates(rates.activities)
  }

  const exportToCSV = () => {
    const currentRates = filteredRates[activeTab]
    let csvContent = ''
    
    if (activeTab === 'transportation') {
      csvContent = 'Service Type,Vehicle,City,Capacity,Euro Rate,Non-Euro Rate,Supplier,Notes\n'
      currentRates.forEach((rate: any) => {
        const capacity = rate.capacity_min && rate.capacity_max ? `${rate.capacity_min}-${rate.capacity_max}` : ''
        csvContent += `${rate.service_type || ''},${rate.vehicle_type || ''},${rate.city},${capacity},${rate.eur_rate},${rate.non_eur_rate},${rate.supplier_name || ''},"${(rate.notes || '').replace(/"/g, '""')}"\n`
      })
    } else if (activeTab === 'guides') {
      csvContent = 'Language,Type,City,Duration,Euro Rate,Non-Euro Rate,Notes\n'
      currentRates.forEach((rate: any) => {
        csvContent += `${rate.guide_language || ''},${rate.guide_type || ''},${rate.city},${rate.tour_duration || ''},${rate.eur_rate},${rate.non_eur_rate},"${(rate.notes || '').replace(/"/g, '""')}"\n`
      })
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `autoura_${activeTab}_rates_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const printPage = () => {
    window.print()
  }

  const getQuickStats = () => {
    const currentRates = filteredRates[activeTab]
    if (currentRates.length === 0) return

    const total = currentRates.reduce((sum, rate) => sum + (Number(rate.eur_rate) || 0), 0)
    const average = total / currentRates.length
    const min = Math.min(...currentRates.map(r => Number(r.eur_rate) || 0))
    const max = Math.max(...currentRates.map(r => Number(r.eur_rate) || 0))

    alert(`📊 ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Stats:\n\n` +
          `• Average Rate: €${isFinite(average) ? average.toFixed(2) : '0.00'}\n` +
          `• Lowest Rate: €${isFinite(min) ? min.toFixed(2) : '0.00'}\n` +
          `• Highest Rate: €${isFinite(max) ? max.toFixed(2) : '0.00'}\n` +
          `• Total Services: ${currentRates.length}`)
  }

  const totalServices = rates.transportation.length + rates.guides.length + rates.entrances.length + 
                        rates.accommodation.length + rates.meals.length + rates.serviceFees.length + rates.activities.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 print:shadow-none">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-600 text-sm font-bold">A</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Rate Management</h1>
                <p className="text-xs text-gray-600">Autoura • {new Date().toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={exportToCSV}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors print:hidden font-medium"
              >
                📊 Export
              </button>
              <button 
                onClick={printPage}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors print:hidden font-medium"
              >
                🖨️ Print
              </button>
              <Link 
                href="/" 
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors print:hidden font-medium"
              >
                ← Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Statistics Dashboard */}
      <div className="container mx-auto px-4 lg:px-6 py-6 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🎯</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <p className="text-xs text-gray-600">Total Services</p>
            <p className="text-2xl font-bold text-gray-900">{totalServices}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">📂</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Categories</p>
            <p className="text-2xl font-bold text-gray-900">7</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🏙️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">Cities</p>
            <p className="text-2xl font-bold text-gray-900">{allCities.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">👁️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600">Current View</p>
            <p className="text-2xl font-bold text-gray-900">{filteredRates[activeTab].length}</p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="container mx-auto px-4 lg:px-6 print:hidden">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by any field..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-40">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              >
                <option value="all">All Cities</option>
                {allCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            {activeTab === 'entrances' && (
              <div className="md:w-40">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                >
                  <option value="all">All Categories</option>
                  {getUniqueCategoriesFromEntrances().map(cat => (
                    <option key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeTab === 'accommodation' && (
              <>
                <div className="md:w-40">
                  <select
                    value={selectedTier}
                    onChange={(e) => setSelectedTier(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  >
                    <option value="all">All Tiers</option>
                    {getUniqueTiersFromAccommodation().map(tier => (
                      <option key={tier} value={tier}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:w-40">
                  <select
                    value={selectedPropertyType}
                    onChange={(e) => setSelectedPropertyType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  >
                    <option value="all">All Types</option>
                    {getUniquePropertyTypes().map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-xs text-gray-600">
              Showing <span className="font-bold text-gray-900">{filteredRates[activeTab].length}</span> of {rates[activeTab].length} {activeTab} rates
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedCity('all')
                  setSelectedCategory('all')
                  setSelectedTier('all')
                  setSelectedPropertyType('all')
                }}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors font-medium"
              >
                🔄 Clear
              </button>
              
              <button
                onClick={getQuickStats}
                className="px-2 py-1 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors font-medium"
                disabled={filteredRates[activeTab].length === 0}
              >
                📊 Stats
              </button>

              {activeTab === 'accommodation' && (
                <button
                  onClick={() => setShowSeasonalPricing(!showSeasonalPricing)}
                  className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors font-medium"
                >
                  {showSeasonalPricing ? '📅 Base' : '🔄 Seasonal'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="container mx-auto px-4 lg:px-6 print:hidden">
        <div className="bg-white rounded-t-lg shadow-md border border-gray-200">
          <div className="flex overflow-x-auto border-b border-gray-200">
            <button
              onClick={() => setActiveTab('transportation')}
              className={`px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'transportation'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🚗 Transportation ({filteredRates.transportation.length})
            </button>
            <button
              onClick={() => setActiveTab('guides')}
              className={`px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'guides'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              👨‍🏫 Guides ({filteredRates.guides.length})
            </button>
            <button
              onClick={() => setActiveTab('entrances')}
              className={`px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'entrances'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🎫 Entrances ({filteredRates.entrances.length})
            </button>
            <button
              onClick={() => setActiveTab('accommodation')}
              className={`px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'accommodation'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🏨 Hotels ({filteredRates.accommodation.length})
            </button>
            <button
              onClick={() => setActiveTab('meals')}
              className={`px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'meals'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🍽️ Meals ({filteredRates.meals.length})
            </button>
            <button
              onClick={() => setActiveTab('serviceFees')}
              className={`px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'serviceFees'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              💼 Services ({filteredRates.serviceFees.length})
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              className={`px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'activities'
                  ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50'
                  : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
              }`}
            >
              🎭 Activities ({filteredRates.activities.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Tables */}
      <main className="container mx-auto px-4 lg:px-6 pb-6">
        <div className="bg-white rounded-b-lg shadow-md border border-gray-200 overflow-hidden print:shadow-none print:rounded-none">
          <div className="overflow-x-auto">
            
            {/* Transportation Table */}
            {activeTab === 'transportation' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Service</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Vehicle</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Capacity</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Euro Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Non-Euro Rate</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRates.transportation.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.service_type}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rate.vehicle_type}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {rate.capacity_min && rate.capacity_max ? 
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700">{rate.capacity_min}-{rate.capacity_max}</span> : 
                          <span className="text-gray-400">-</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">€{Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-primary-600">€{Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{rate.supplier_name || '-'}</td>
                    </tr>
                  ))}
                  {filteredRates.transportation.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🚗</span>
                          <p className="text-sm font-medium">No transportation services found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Similar compact redesigns for other tables... */}
            {/* I'll show 2 more as examples */}

            {/* Guides Table */}
            {activeTab === 'guides' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Language</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Duration</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Euro Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Non-Euro Rate</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRates.guides.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.guide_language}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{rate.guide_type}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700">
                          {rate.tour_duration?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">€{Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-primary-600">€{Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{rate.notes || '-'}</td>
                    </tr>
                  ))}
                  {filteredRates.guides.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">👨‍🏫</span>
                          <p className="text-sm font-medium">No guide services found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Entrances Table */}
            {activeTab === 'entrances' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Attraction</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Adult EUR</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Child EUR</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Adult Non-EUR</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Child Non-EUR</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRates.entrances.map((rate, index) => {
                    const childEurRate = rate.child_discount_percent 
                      ? (Number(rate.base_rate_eur || rate.eur_rate || 0) * (1 - (rate.child_discount_percent || 0) / 100)).toFixed(2)
                      : Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)
                    const childNonEurRate = rate.child_discount_percent
                      ? (Number(rate.base_rate_non_eur || rate.non_eur_rate || 0) * (1 - (rate.child_discount_percent || 0) / 100)).toFixed(2)
                      : Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)
                    
                    return (
                      <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.attraction_name}</td>
                        <td className="px-4 py-3">
                          {rate.category && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                              {rate.category}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {rate.city}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                          €{Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-green-500">
                            {rate.fee_type === 'free' ? 'FREE' : `€${childEurRate}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-bold text-primary-600">
                            {rate.fee_type === 'free' ? 'FREE' : `€${Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-primary-500">
                            {rate.fee_type === 'free' ? 'FREE' : `€${childNonEurRate}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{rate.notes || '-'}</td>
                      </tr>
                    )
                  })}
                  {filteredRates.entrances.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🎫</span>
                          <p className="text-sm font-medium">No entrance fees found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Accommodation Table */}
            {activeTab === 'accommodation' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Property</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Tier</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Stars</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Room</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Board</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    {showSeasonalPricing ? (
                      <>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">High EUR</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Low EUR</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">High Non-EUR</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Low Non-EUR</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Base EUR</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Base Non-EUR</th>
                      </>
                    )}
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Single Supp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRates.accommodation.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.property_name}</td>
                      <td className="px-4 py-3">
                        {rate.tier && (
                          <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                            {rate.tier}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.property_type}</td>
                      <td className="px-4 py-3 text-center text-xs">
                        <span className="text-yellow-500">{'⭐'.repeat(rate.star_rating || 0)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.room_type}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.board_basis}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      {showSeasonalPricing ? (
                        <>
                          <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                            €{(rate.high_season_rate_eur ?? rate.base_rate_eur).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-green-500">
                            €{(rate.low_season_rate_eur ?? rate.base_rate_eur).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-primary-600">
                            €{(rate.high_season_rate_non_eur ?? rate.base_rate_non_eur).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-primary-500">
                            €{(rate.low_season_rate_non_eur ?? rate.base_rate_non_eur).toFixed(2)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                            €{Number(rate.base_rate_eur).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-primary-600">
                            €{Number(rate.base_rate_non_eur).toFixed(2)}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-right text-xs text-gray-600">
                        {typeof rate.single_supplement_eur === 'number' ? `€${rate.single_supplement_eur.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredRates.accommodation.length === 0 && (
                    <tr>
                      <td colSpan={showSeasonalPricing ? 12 : 10} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🏨</span>
                          <p className="text-sm font-medium">No accommodation found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Meals Table */}
            {activeTab === 'meals' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Restaurant</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Meal Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Cuisine</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Euro Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRates.meals.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.restaurant_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.meal_type}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.cuisine_type}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.restaurant_type}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">€{Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-primary-600">€{Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredRates.meals.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🍽️</span>
                          <p className="text-sm font-medium">No meal options found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Service Fees Table */}
            {activeTab === 'serviceFees' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Service Name</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Rate Type</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Euro Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRates.serviceFees.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.service_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.service_category}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.service_type}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-700">
                          {rate.rate_type?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">€{Number(rate.eur_rate).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-primary-600">€{Number(rate.non_eur_rate).toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredRates.serviceFees.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">💼</span>
                          <p className="text-sm font-medium">No service fees found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Activities Table */}
            {activeTab === 'activities' && (
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Activity</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Duration</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Euro Rate</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRates.activities.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rate.activity_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.activity_category}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{rate.activity_type}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-700">
                          {rate.duration}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-green-600">€{Number(rate.eur_rate).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-primary-600">€{Number(rate.non_eur_rate).toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredRates.activities.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-3xl text-gray-400">🎭</span>
                          <p className="text-sm font-medium">No activities found</p>
                        </div>
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
          <div className="text-center border-b-2 border-primary-600 pb-4 mb-6">
            <h1 className="text-4xl font-bold text-primary-600">Autoura</h1>
            <h2 className="text-2xl text-gray-700 mt-2">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Service Rates</h2>
            <p className="text-sm text-gray-500 mt-2">Generated on {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-gray-500 print:hidden">
          <p>© 2024 Autoura Operations System</p>
        </div>
      </main>
    </div>
  )
}