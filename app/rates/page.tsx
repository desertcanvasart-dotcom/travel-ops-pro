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

// ✅ Updated per instructions
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
  base_rate_eur?: number      // Make optional with ?
  base_rate_non_eur?: number  // Make optional with ?
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

  // ✅ New state variables (Step 2)
  const [selectedTier, setSelectedTier] = useState('all')
  const [selectedPropertyType, setSelectedPropertyType] = useState('all')
  const [showSeasonalPricing, setShowSeasonalPricing] = useState(false)

useEffect(() => {
  const fetchAllRates = async () => {
    try {
      // Fetch all rate types in parallel using the new API
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

      // Combine all data in the expected format
      const combinedData: RatesData = {
        transportation: transportationData.success ? transportationData.data : [],
        guides: guidesData.success ? guidesData.data : [],
        entrances: entrancesData.success ? entrancesData.data : [],
        accommodation: accommodationData.success ? accommodationData.data : [],
        meals: mealsData.success ? mealsData.data : [],
        serviceFees: [], // Empty for now - add if you have this table
        activities: []   // Empty for now - add if you have this table
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

  // ✅ New helpers (Step 3)
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading rates...</p>
          <p className="text-gray-400 text-sm mt-2">Please wait while we fetch your data</p>
        </div>
      </div>
    )
  }

  if (error || !rates) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-500 text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Oops! Something went wrong</h2>
          <p className="text-red-600 mb-4">{error || 'Failed to load rates'}</p>
          <Link href="/" className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    )
  }

  // Get all unique cities from all service types
  const allCities = Array.from(new Set([
    ...rates.transportation.map(r => r.city),
    ...rates.guides.map(r => r.city),
    ...rates.entrances.map(r => r.city),
    ...rates.accommodation.map(r => r.city),
    ...rates.meals.map(r => r.city),
    ...rates.serviceFees.map(r => r.city),
    ...rates.activities.map(r => r.city)
  ])).sort()

  // Generic filter function with category + tier + property type (Step 4)
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

  // Export CSV (kept, with a small accommodation tweak to export base rates safely)
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
    } else if (activeTab === 'entrances') {
      csvContent = 'Attraction,Category,City,Adult Euro,Child Euro,Adult Non-Euro,Child Non-Euro,Discount %,Notes\n'
      currentRates.forEach((rate: any) => {
        const childEur = rate.child_discount_percent 
          ? (rate.eur_rate * (1 - rate.child_discount_percent / 100)).toFixed(2)
          : Number(rate.eur_rate).toFixed(2)
        const childNonEur = rate.child_discount_percent
          ? (rate.non_eur_rate * (1 - rate.child_discount_percent / 100)).toFixed(2)
          : Number(rate.non_eur_rate).toFixed(2)
        
        csvContent += `${rate.attraction_name || ''},${rate.category || ''},${rate.city},${rate.eur_rate},${childEur},${rate.non_eur_rate},${childNonEur},${rate.child_discount_percent || 0}%,"${(rate.notes || '').replace(/"/g, '""')}"\n`
      })
    } else if (activeTab === 'accommodation') {
      // ✅ export base rates + tier safely (enhanced)
      csvContent = 'Property,Tier,Type,Stars,Room Type,Board,City,Base EUR,Base Non-EUR,High EUR,Low EUR,High Non-EUR,Low Non-EUR,Single Supp EUR,Supplier,Notes\n'
      currentRates.forEach((rate: any) => {
        csvContent += `${rate.property_name || ''},${rate.tier || ''},${rate.property_type || ''},${rate.star_rating || ''},${rate.room_type || ''},${rate.board_basis || ''},${rate.city},${rate.base_rate_eur ?? ''},${rate.base_rate_non_eur ?? ''},${rate.high_season_rate_eur ?? ''},${rate.low_season_rate_eur ?? ''},${rate.high_season_rate_non_eur ?? ''},${rate.low_season_rate_non_eur ?? ''},${rate.single_supplement_eur ?? ''},${rate.supplier_name || ''},"${(rate.notes || '').replace(/"/g, '""')}"\n`
      })
    } else if (activeTab === 'meals') {
      csvContent = 'Restaurant,Meal Type,Cuisine,Type,City,Euro Rate,Non-Euro Rate,Supplier,Notes\n'
      currentRates.forEach((rate: any) => {
        csvContent += `${rate.restaurant_name || ''},${rate.meal_type || ''},${rate.cuisine_type || ''},${rate.restaurant_type || ''},${rate.city},${rate.eur_rate},${rate.non_eur_rate},${rate.supplier_name || ''},"${(rate.notes || '').replace(/"/g, '""')}"\n`
      })
    } else if (activeTab === 'serviceFees') {
      csvContent = 'Service,Category,Type,City,Rate Type,Euro Rate,Non-Euro Rate,Supplier,Notes\n'
      currentRates.forEach((rate: any) => {
        csvContent += `${rate.service_name || ''},${rate.service_category || ''},${rate.service_type || ''},${rate.city},${rate.rate_type || ''},${rate.eur_rate},${rate.non_eur_rate},${rate.supplier_name || ''},"${(rate.notes || '').replace(/"/g, '""')}"\n`
      })
    } else if (activeTab === 'activities') {
      csvContent = 'Activity,Category,Type,Duration,City,Euro Rate,Non-Euro Rate,Supplier,Notes\n'
      currentRates.forEach((rate: any) => {
        csvContent += `${rate.activity_name || ''},${rate.activity_category || ''},${rate.activity_type || ''},${rate.duration || ''},${rate.city},${rate.eur_rate},${rate.non_eur_rate},${rate.supplier_name || ''},"${(rate.notes || '').replace(/"/g, '""')}"\n`
      })
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `travel2egypt_${activeTab}_rates_${new Date().toISOString().split('T')[0]}.csv`)
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-8 shadow-lg print:shadow-none">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg">
                <span className="text-blue-600 text-xl font-bold">T2E</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold">Rate Management System</h1>
                <p className="text-blue-100 text-sm">Travel2Egypt • Current Service Rates • {new Date().toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={exportToCSV}
                className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium shadow-md print:hidden flex items-center gap-2"
              >
                <span>📊</span>
                Export CSV
              </button>
              <button 
                onClick={printPage}
                className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium shadow-md print:hidden flex items-center gap-2"
              >
                <span>🖨️</span>
                Print
              </button>
              <Link 
                href="/" 
                className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium shadow-md print:hidden flex items-center gap-2"
              >
                <span>←</span>
                Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Statistics Dashboard */}
      <div className="container mx-auto px-4 py-8 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl shadow-lg transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Total Services</p>
                <p className="text-3xl font-bold">{totalServices}</p>
                <p className="text-blue-100 text-xs">Across All Categories</p>
              </div>
              <div className="w-14 h-14 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-3xl">🎯</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-xl shadow-lg transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm font-medium">Service Types</p>
                <p className="text-3xl font-bold">7</p>
                <p className="text-green-100 text-xs">Categories Available</p>
              </div>
              <div className="w-14 h-14 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-3xl">📂</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-xl shadow-lg transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Destinations</p>
                <p className="text-3xl font-bold">{allCities.length}</p>
                <p className="text-purple-100 text-xs">Cities Covered</p>
              </div>
              <div className="w-14 h-14 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-3xl">🏙️</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-6 rounded-xl shadow-lg transform hover:scale-105 transition-transform">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-sm font-medium">Current View</p>
                <p className="text-3xl font-bold">{filteredRates[activeTab].length}</p>
                <p className="text-orange-100 text-xs capitalize">{activeTab} Results</p>
              </div>
              <div className="w-14 h-14 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-3xl">👁️</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="container mx-auto px-4 print:hidden">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🔍 Search Services
              </label>
              <input
                type="text"
                placeholder="Search by any field..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
              />
            </div>
            <div className="md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                🏙️ Filter by City
              </label>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
              >
                <option value="all">All Cities</option>
                {allCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            {activeTab === 'entrances' && (
              <div className="md:w-48">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🏛️ Filter by Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
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

            {/* ✅ Step 5: Accommodation extra filters */}
            {activeTab === 'accommodation' && (
              <>
                <div className="md:w-48">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    💎 Filter by Tier
                  </label>
                  <select
                    value={selectedTier}
                    onChange={(e) => setSelectedTier(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
                  >
                    <option value="all">All Tiers</option>
                    {getUniqueTiersFromAccommodation().map(tier => (
                      <option key={tier} value={tier}>
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:w-48">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🏨 Property Type
                  </label>
                  <select
                    value={selectedPropertyType}
                    onChange={(e) => setSelectedPropertyType(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent text-sm"
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
          
          <div className="mt-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="text-sm text-gray-600">
              Showing <span className="font-bold text-blue-600 text-lg">{filteredRates[activeTab].length}</span> of {rates[activeTab].length} {activeTab} rates
              {searchTerm && ` matching "${searchTerm}"`}
              {selectedCity !== 'all' && ` in ${selectedCity}`}
              {activeTab === 'entrances' && selectedCategory !== 'all' && ` - ${selectedCategory}`}
              {activeTab === 'accommodation' && selectedTier !== 'all' && ` · Tier ${selectedTier}`}
              {activeTab === 'accommodation' && selectedPropertyType !== 'all' && ` · ${selectedPropertyType}`}
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
                className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium flex items-center gap-1"
              >
                <span>🔄</span>
                Clear Filters
              </button>
              
              <button
                onClick={getQuickStats}
                className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center gap-1"
                disabled={filteredRates[activeTab].length === 0}
              >
                <span>📊</span>
                Quick Stats
              </button>

              {/* ✅ Step 7: Seasonal pricing toggle */}
              {activeTab === 'accommodation' && (
                <button
                  onClick={() => setShowSeasonalPricing(!showSeasonalPricing)}
                  className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium flex items-center gap-1"
                >
                  <span>{showSeasonalPricing ? '📅' : '🔄'}</span>
                  {showSeasonalPricing ? 'Base Rates' : 'Seasonal Rates'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="container mx-auto px-4 print:hidden">
        <div className="bg-white rounded-t-xl shadow-lg">
          <div className="flex overflow-x-auto border-b border-gray-200">
            <button
              onClick={() => setActiveTab('transportation')}
              className={`px-6 py-4 font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'transportation'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>🚗</span>
              Transportation ({filteredRates.transportation.length})
            </button>
            <button
              onClick={() => setActiveTab('guides')}
              className={`px-6 py-4 font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'guides'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>👨‍🏫</span>
              Guides ({filteredRates.guides.length})
            </button>
            <button
              onClick={() => setActiveTab('entrances')}
              className={`px-6 py-4 font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'entrances'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>🎫</span>
              Entrances ({filteredRates.entrances.length})
            </button>
            <button
              onClick={() => setActiveTab('accommodation')}
              className={`px-6 py-4 font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'accommodation'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>🏨</span>
              Hotels ({filteredRates.accommodation.length})
            </button>
            <button
              onClick={() => setActiveTab('meals')}
              className={`px-6 py-4 font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'meals'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>🍽️</span>
              Meals ({filteredRates.meals.length})
            </button>
            <button
              onClick={() => setActiveTab('serviceFees')}
              className={`px-6 py-4 font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'serviceFees'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>💼</span>
              Services ({filteredRates.serviceFees.length})
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              className={`px-6 py-4 font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'activities'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              <span>🎭</span>
              Activities ({filteredRates.activities.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Tables */}
      <main className="container mx-auto px-4 pb-8">
        <div className="bg-white rounded-b-xl shadow-lg overflow-hidden print:shadow-none print:rounded-none">
          <div className="overflow-x-auto">
            
              {/* Transportation Table */}
{activeTab === 'transportation' && (
  <table className="w-full">
    <thead className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
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
        <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50 transition-colors`}>
          <td className="px-6 py-4 font-medium text-gray-900">{rate.service_type}</td>
          <td className="px-6 py-4 text-gray-700">{rate.vehicle_type}</td>
          <td className="px-6 py-4">
            <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
              {rate.city}
            </span>
          </td>
          <td className="px-6 py-4 text-center text-sm">
            {rate.capacity_min && rate.capacity_max ? 
              <span className="px-2 py-1 bg-gray-100 rounded">{rate.capacity_min}-{rate.capacity_max}</span> : 
              <span className="text-gray-400">-</span>
            }
          </td>
          <td className="px-6 py-4 text-right font-bold text-green-600">€{Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)}</td>
          <td className="px-6 py-4 text-right font-bold text-blue-600">€{Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)}</td>
          <td className="px-6 py-4 text-sm text-gray-600">{rate.supplier_name || '-'}</td>
        </tr>
      ))}
      {filteredRates.transportation.length === 0 && (
        <tr>
          <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
            <div className="flex flex-col items-center gap-3">
              <span className="text-4xl">🚗</span>
              <p className="text-lg font-medium">No transportation services found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  </table>
)}
            {/* Guides Table */}
{activeTab === 'guides' && (
  <table className="w-full">
    <thead className="bg-gradient-to-r from-green-500 to-green-600 text-white">
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
        <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-green-50 transition-colors`}>
          <td className="px-6 py-4 font-medium text-gray-900">{rate.guide_language}</td>
          <td className="px-6 py-4 text-gray-700">{rate.guide_type}</td>
          <td className="px-6 py-4">
            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
              {rate.city}
            </span>
          </td>
          <td className="px-6 py-4 capitalize text-sm">
            <span className="px-2 py-1 bg-gray-100 rounded">
              {rate.tour_duration?.replace('_', ' ')}
            </span>
          </td>
          <td className="px-6 py-4 text-right font-bold text-green-600">€{Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)}</td>
          <td className="px-6 py-4 text-right font-bold text-blue-600">€{Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)}</td>
          <td className="px-6 py-4 text-sm text-gray-600">{rate.notes || '-'}</td>
        </tr>
      ))}
      {filteredRates.guides.length === 0 && (
        <tr>
          <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
            <div className="flex flex-col items-center gap-3">
              <span className="text-4xl">👨‍🏫</span>
              <p className="text-lg font-medium">No guide services found</p>
              <p className="text-sm">Try adjusting your filters</p>
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
    <thead className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
      <tr>
        <th className="px-6 py-4 text-left font-semibold">Attraction</th>
        <th className="px-6 py-4 text-left font-semibold">Category</th>
        <th className="px-6 py-4 text-left font-semibold">City</th>
        <th className="px-6 py-4 text-right font-semibold">Adult EUR</th>
        <th className="px-6 py-4 text-right font-semibold">Child EUR</th>
        <th className="px-6 py-4 text-right font-semibold">Adult Non-EUR</th>
        <th className="px-6 py-4 text-right font-semibold">Child Non-EUR</th>
        <th className="px-6 py-4 text-left font-semibold">Notes</th>
      </tr>
    </thead>
    <tbody>
      {filteredRates.entrances.map((rate, index) => {
        const childEurRate = rate.child_discount_percent 
          ? (Number(rate.base_rate_eur || rate.eur_rate || 0) * (1 - (rate.child_discount_percent || 0) / 100)).toFixed(2)
          : Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)
        const childNonEurRate = rate.child_discount_percent
          ? (Number(rate.base_rate_non_eur || rate.non_eur_rate || 0) * (1 - (rate.child_discount_percent || 0) / 100)).toFixed(2)
          : Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)
        
        const getCategoryColor = (category?: string) => {
          const colors: Record<string, string> = {
            pyramid: 'bg-amber-100 text-amber-800',
            temple: 'bg-purple-100 text-purple-800',
            museum: 'bg-blue-100 text-blue-800',
            tomb: 'bg-gray-100 text-gray-800',
            fortress: 'bg-red-100 text-red-800',
            monument: 'bg-green-100 text-green-800',
            mosque: 'bg-teal-100 text-teal-800',
            market: 'bg-orange-100 text-orange-800',
            library: 'bg-indigo-100 text-indigo-800',
            quarry: 'bg-stone-100 text-stone-800',
            aquarium: 'bg-cyan-100 text-cyan-800',
            monastery: 'bg-rose-100 text-rose-800'
          }
          return colors[category || ''] || 'bg-gray-100 text-gray-800'
        }
        
        const getCategoryEmoji = (category?: string) => {
          const emojis: Record<string, string> = {
            pyramid: '🔺',
            temple: '🏛️',
            museum: '🏺',
            tomb: '⚰️',
            fortress: '🏰',
            monument: '🗿',
            mosque: '🕌',
            market: '🏪',
            library: '📚',
            quarry: '⛏️',
            aquarium: '🐠',
            monastery: '⛪'
          }
          return emojis[category || ''] || '🏛️'
        }
        
        return (
          <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-purple-50 transition-colors`}>
            <td className="px-6 py-4 font-medium text-gray-900">{rate.attraction_name}</td>
            <td className="px-6 py-4">
              {rate.category && (
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(rate.category)}`}>
                  <span>{getCategoryEmoji(rate.category)}</span>
                  {rate.category}
                </span>
              )}
            </td>
            <td className="px-6 py-4">
              <span className="inline-block px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                {rate.city}
              </span>
            </td>
            <td className="px-6 py-4 text-right font-bold text-green-600">
              €{Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)}
            </td>
            <td className="px-6 py-4 text-right">
              <span className="font-semibold text-green-500 text-sm">
                {rate.fee_type === 'free' ? 'FREE' : (
                  <>
                    €{childEurRate}
                    {rate.child_discount_percent && rate.child_discount_percent > 0 && (
                      <span className="ml-1 text-xs text-gray-500">(-{rate.child_discount_percent}%)</span>
                    )}
                  </>
                )}
              </span>
            </td>
            <td className="px-6 py-4 text-right">
              <span className="font-bold text-blue-600">
                {rate.fee_type === 'free' ? 'FREE' : `€${Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)}`}
              </span>
            </td>
            <td className="px-6 py-4 text-right">
              <span className="font-semibold text-blue-500 text-sm">
                {rate.fee_type === 'free' ? 'FREE' : (
                  <>
                    €{childNonEurRate}
                    {rate.child_discount_percent && rate.child_discount_percent > 0 && (
                      <span className="ml-1 text-xs text-gray-500">(-{rate.child_discount_percent}%)</span>
                    )}
                  </>
                )}
              </span>
            </td>
            <td className="px-6 py-4 text-sm text-gray-600">{rate.notes || '-'}</td>
          </tr>
        )
      })}
      {filteredRates.entrances.length === 0 && (
        <tr>
          <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
            <div className="flex flex-col items-center gap-3">
              <span className="text-4xl">🎫</span>
              <p className="text-lg font-medium">No entrance fees found</p>
              <p className="text-sm">Try adjusting your filters</p>
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
    <thead className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
      <tr>
        <th className="px-6 py-4 text-left font-semibold">Restaurant</th>
        <th className="px-6 py-4 text-left font-semibold">Meal Type</th>
        <th className="px-6 py-4 text-left font-semibold">Cuisine</th>
        <th className="px-6 py-4 text-left font-semibold">Type</th>
        <th className="px-6 py-4 text-left font-semibold">City</th>
        <th className="px-6 py-4 text-right font-semibold">Euro Rate</th>
        <th className="px-6 py-4 text-right font-semibold">Non-Euro Rate</th>
        <th className="px-6 py-4 text-left font-semibold">Notes</th>
      </tr>
    </thead>
    <tbody>
      {filteredRates.meals.map((rate, index) => (
        <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-orange-50 transition-colors`}>
          <td className="px-6 py-4 font-medium text-gray-900">{rate.restaurant_name}</td>
          <td className="px-6 py-4 text-gray-700">{rate.meal_type}</td>
          <td className="px-6 py-4 text-gray-700">{rate.cuisine_type}</td>
          <td className="px-6 py-4 text-gray-700">{rate.restaurant_type}</td>
          <td className="px-6 py-4">
            <span className="inline-block px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium">
              {rate.city}
            </span>
          </td>
          <td className="px-6 py-4 text-right font-bold text-green-600">
            €{Number(rate.base_rate_eur || rate.eur_rate || 0).toFixed(2)}
          </td>
          <td className="px-6 py-4 text-right font-bold text-blue-600">
            €{Number(rate.base_rate_non_eur || rate.non_eur_rate || 0).toFixed(2)}
          </td>
          <td className="px-6 py-4 text-sm text-gray-600">{rate.notes || '-'}</td>
        </tr>
      ))}
      {filteredRates.meals.length === 0 && (
        <tr>
          <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
            <div className="flex flex-col items-center gap-3">
              <span className="text-4xl">🍽️</span>
              <p className="text-lg font-medium">No meal options found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          </td>
        </tr>
      )}
    </tbody>
  </table>
)}
            {/* ✅ Enhanced Accommodation Table (Step 8) */}
            {activeTab === 'accommodation' && (
              <table className="w-full">
                <thead className="bg-gradient-to-r from-pink-500 to-pink-600 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Property</th>
                    <th className="px-6 py-4 text-left font-semibold">Tier</th>
                    <th className="px-6 py-4 text-left font-semibold">Type</th>
                    <th className="px-6 py-4 text-center font-semibold">Stars</th>
                    <th className="px-6 py-4 text-left font-semibold">Room</th>
                    <th className="px-6 py-4 text-left font-semibold">Board</th>
                    <th className="px-6 py-4 text-left font-semibold">City</th>
                    {showSeasonalPricing ? (
                      <>
                        <th className="px-6 py-4 text-right font-semibold">High Season EUR</th>
                        <th className="px-6 py-4 text-right font-semibold">Low Season EUR</th>
                        <th className="px-6 py-4 text-right font-semibold">High Season Non-EUR</th>
                        <th className="px-6 py-4 text-right font-semibold">Low Season Non-EUR</th>
                      </>
                    ) : (
                      <>
                        <th className="px-6 py-4 text-right font-semibold">Base EUR</th>
                        <th className="px-6 py-4 text-right font-semibold">Base Non-EUR</th>
                      </>
                    )}
                    <th className="px-6 py-4 text-right font-semibold">Single Supp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.accommodation.map((rate, index) => {
                    const getTierColor = (tier?: string) => {
                      const colors: Record<string, string> = {
                        budget: 'bg-green-100 text-green-800',
                        standard: 'bg-blue-100 text-blue-800',
                        luxury: 'bg-purple-100 text-purple-800'
                      }
                      return colors[tier || ''] || 'bg-gray-100 text-gray-800'
                    }
                    
                    const getTierEmoji = (tier?: string) => {
                      const emojis: Record<string, string> = {
                        budget: '💰',
                        standard: '⭐',
                        luxury: '💎'
                      }
                      return emojis[tier || ''] || '🏨'
                    }
                    
                    return (
                      <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-pink-50 transition-colors`}>
                        <td className="px-6 py-4 font-medium text-gray-900">{rate.property_name}</td>
                        <td className="px-6 py-4">
                          {rate.tier && (
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getTierColor(rate.tier)}`}>
                              <span>{getTierEmoji(rate.tier)}</span>
                              {rate.tier}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-700 text-sm">{rate.property_type}</td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-yellow-500">{'⭐'.repeat(rate.star_rating || 0)}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{rate.room_type}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                            {rate.board_basis}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-block px-2 py-1 bg-pink-100 text-pink-800 rounded-full text-xs font-medium">
                            {rate.city}
                          </span>
                        </td>
                        {showSeasonalPricing ? (
                          <>
                            <td className="px-6 py-4 text-right font-bold text-green-600">
                              €{(rate.high_season_rate_eur ?? rate.base_rate_eur).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right font-semibold text-green-500">
                              €{(rate.low_season_rate_eur ?? rate.base_rate_eur).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-blue-600">
                              €{(rate.high_season_rate_non_eur ?? rate.base_rate_non_eur).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right font-semibold text-blue-500">
                              €{(rate.low_season_rate_non_eur ?? rate.base_rate_non_eur).toFixed(2)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-4 text-right font-bold text-green-600">
                              €{Number(rate.base_rate_eur).toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-blue-600">
                              €{Number(rate.base_rate_non_eur).toFixed(2)}
                            </td>
                          </>
                        )}
                        <td className="px-6 py-4 text-right text-sm text-gray-600">
                          {typeof rate.single_supplement_eur === 'number' ? `€${rate.single_supplement_eur.toFixed(2)}` : '-'}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredRates.accommodation.length === 0 && (
                    <tr>
                      <td colSpan={showSeasonalPricing ? 12 : 10} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-4xl">🏨</span>
                          <p className="text-lg font-medium">No accommodation found</p>
                          <p className="text-sm">Try adjusting your filters</p>
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
                <thead className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Restaurant</th>
                    <th className="px-6 py-4 text-left font-semibold">Meal Type</th>
                    <th className="px-6 py-4 text-left font-semibold">Cuisine</th>
                    <th className="px-6 py-4 text-left font-semibold">Type</th>
                    <th className="px-6 py-4 text-left font-semibold">City</th>
                    <th className="px-6 py-4 text-right font-semibold">Euro Rate</th>
                    <th className="px-6 py-4 text-right font-semibold">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.meals.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-amber-50 transition-colors`}>
                      <td className="px-6 py-4 font-medium text-gray-900">{rate.restaurant_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{rate.meal_type}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{rate.cuisine_type}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{rate.restaurant_type}</td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-600">€{Number(rate.eur_rate).toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-bold text-blue-600">€{Number(rate.non_eur_rate).toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredRates.meals.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-4xl">🍽️</span>
                          <p className="text-lg font-medium">No meal options found</p>
                          <p className="text-sm">Try adjusting your filters</p>
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
                <thead className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Service Name</th>
                    <th className="px-6 py-4 text-left font-semibold">Category</th>
                    <th className="px-6 py-4 text-left font-semibold">Type</th>
                    <th className="px-6 py-4 text-left font-semibold">City</th>
                    <th className="px-6 py-4 text-left font-semibold">Rate Type</th>
                    <th className="px-6 py-4 text-right font-semibold">Euro Rate</th>
                    <th className="px-6 py-4 text-right font-semibold">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.serviceFees.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-indigo-50 transition-colors`}>
                      <td className="px-6 py-4 font-medium text-gray-900">{rate.service_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{rate.service_category}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{rate.service_type}</td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                          {rate.rate_type?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-600">€{Number(rate.eur_rate).toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-bold text-blue-600">€{Number(rate.non_eur_rate).toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredRates.serviceFees.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-4xl">💼</span>
                          <p className="text-lg font-medium">No service fees found</p>
                          <p className="text-sm">Try adjusting your filters</p>
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
                <thead className="bg-gradient-to-r from-teal-500 to-teal-600 text-white">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Activity</th>
                    <th className="px-6 py-4 text-left font-semibold">Category</th>
                    <th className="px-6 py-4 text-left font-semibold">Type</th>
                    <th className="px-6 py-4 text-left font-semibold">Duration</th>
                    <th className="px-6 py-4 text-left font-semibold">City</th>
                    <th className="px-6 py-4 text-right font-semibold">Euro Rate</th>
                    <th className="px-6 py-4 text-right font-semibold">Non-Euro Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.activities.map((rate, index) => (
                    <tr key={rate.service_code} className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-teal-50 transition-colors`}>
                      <td className="px-6 py-4 font-medium text-gray-900">{rate.activity_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{rate.activity_category}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{rate.activity_type}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-2 py-1 bg-gray-100 rounded">
                          {rate.duration}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2 py-1 bg-teal-100 text-teal-800 rounded-full text-xs font-medium">
                          {rate.city}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-600">€{Number(rate.eur_rate).toFixed(2)}</td>
                      <td className="px-6 py-4 text-right font-bold text-blue-600">€{Number(rate.non_eur_rate).toFixed(2)}</td>
                    </tr>
                  ))}
                  {filteredRates.activities.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center gap-3">
                          <span className="text-4xl">🎭</span>
                          <p className="text-lg font-medium">No activities found</p>
                          <p className="text-sm">Try adjusting your filters</p>
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
          <div className="text-center border-b-2 border-blue-600 pb-4 mb-6">
            <h1 className="text-4xl font-bold text-blue-600">Travel2Egypt</h1>
            <h2 className="text-2xl text-gray-700 mt-2">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Service Rates</h2>
            <p className="text-sm text-gray-500 mt-2">Generated on {new Date().toLocaleDateString()} • www.travel2egypt.com</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500 print:hidden">
          <p>© 2024 Travel2Egypt Operations System • Built with Next.js & Supabase</p>
        </div>
      </main>
    </div>
  )
}
