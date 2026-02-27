'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, ChevronDown, MapPin, Loader2 } from 'lucide-react'
import { getTransportRateForPax } from '@/lib/transport-rate-utils'

// ============================================
// TYPES
// ============================================

interface RateItem {
  id: string
  name: string
  city: string | null
  rate_eur: number
  rate_non_eur: number
  supplier_id: string | null
  supplier_name: string | null
  details: string
  vehicleType?: string
}

interface ServiceRatePickerProps {
  serviceType: 'meal' | 'transportation' | 'guide' | 'entrance' | 'activity'
  defaultCity?: string
  currentValue?: string
  paxCount?: number
  onSelectRate: (rate: {
    service_name: string
    rate_eur: number
    rate_non_eur: number
    supplier_id: string | null
    supplier_name: string | null
  }) => void
}

// ============================================
// HELPERS
// ============================================

function normalizeRates(serviceType: string, data: any[], paxCount: number): RateItem[] {
  switch (serviceType) {
    case 'meal':
      return data.map(r => ({
        id: r.id,
        name: `${r.restaurant_name}${r.meal_type ? ` - ${r.meal_type}` : ''}${r.tier ? ` (${r.tier})` : ''}`,
        city: r.city || null,
        rate_eur: r.base_rate_eur || 0,
        rate_non_eur: r.base_rate_non_eur || r.base_rate_eur || 0,
        supplier_id: r.supplier_id || null,
        supplier_name: r.supplier_name || r.supplier?.name || null,
        details: [r.cuisine_type, r.meal_type].filter(Boolean).join(' · ')
      }))

    case 'transportation':
      return data.map(r => {
        const resolved = getTransportRateForPax(r, paxCount)
        return {
          id: r.id,
          name: r.route_name || r.service_code || `${r.origin_city} → ${r.destination_city}`,
          city: r.city || r.origin_city || null,
          rate_eur: resolved?.rateEur || 0,
          rate_non_eur: resolved?.rateNonEur || 0,
          supplier_id: r.supplier_id || null,
          supplier_name: r.supplier_name || r.supplier?.name || null,
          details: [r.service_type, r.area, resolved?.vehicleType].filter(Boolean).join(' · '),
          vehicleType: resolved?.vehicleType
        }
      }).filter(r => r.rate_eur > 0)

    case 'guide':
      return data.map(r => ({
        id: r.id,
        name: `${r.guide_language || 'Guide'} ${r.guide_type || ''} - ${r.tour_duration || 'full_day'}`,
        city: r.city || null,
        rate_eur: r.base_rate_eur || 0,
        rate_non_eur: r.base_rate_non_eur || r.base_rate_eur || 0,
        supplier_id: r.supplier_id || null,
        supplier_name: r.supplier_name || r.supplier?.name || null,
        details: [r.guide_type, r.tour_duration].filter(Boolean).join(' · ')
      }))

    case 'entrance':
      return data.map(r => ({
        id: r.id,
        name: r.attraction_name,
        city: r.city || null,
        rate_eur: r.eur_rate || 0,
        rate_non_eur: r.non_eur_rate || r.eur_rate || 0,
        supplier_id: r.supplier_id || null,
        supplier_name: r.supplier_name || null,
        details: [r.category, r.is_addon ? 'Add-on' : null].filter(Boolean).join(' · ')
      }))

    case 'activity':
      return data.map(r => ({
        id: r.id,
        name: r.activity_name,
        city: r.city || null,
        rate_eur: r.base_rate_eur || 0,
        rate_non_eur: r.base_rate_non_eur || r.base_rate_eur || 0,
        supplier_id: r.supplier_id || null,
        supplier_name: r.supplier_name || r.supplier?.name || null,
        details: [r.activity_category, r.pricing_type].filter(Boolean).join(' · ')
      }))

    default:
      return []
  }
}

function getApiUrl(serviceType: string): string {
  switch (serviceType) {
    case 'meal': return '/api/rates/meals?active_only=true'
    case 'transportation': return '/api/rates/transportation'
    case 'guide': return '/api/rates/guides?active_only=true'
    case 'entrance': return '/api/rates/attractions?active_only=true'
    case 'activity': return '/api/rates/activities?active_only=true'
    default: return ''
  }
}

// ============================================
// COMPONENT
// ============================================

export default function ServiceRatePicker({
  serviceType,
  defaultCity,
  currentValue,
  paxCount = 2,
  onSelectRate
}: ServiceRatePickerProps) {
  const [rates, setRates] = useState<RateItem[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState(defaultCity || '')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch rates when service type changes
  const fetchRates = useCallback(async () => {
    const url = getApiUrl(serviceType)
    if (!url) return

    setLoading(true)
    try {
      const response = await fetch(url)
      const result = await response.json()
      const data = result.data || (Array.isArray(result) ? result : [])
      setRates(normalizeRates(serviceType, data, paxCount))
    } catch (err) {
      console.error(`Error fetching ${serviceType} rates:`, err)
      setRates([])
    } finally {
      setLoading(false)
    }
  }, [serviceType, paxCount])

  useEffect(() => {
    fetchRates()
  }, [fetchRates])

  // Reset city filter when defaultCity changes
  useEffect(() => {
    setCityFilter(defaultCity || '')
  }, [defaultCity])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Focus search when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Extract unique cities
  const cities = Array.from(new Set(rates.map(r => r.city).filter(Boolean) as string[])).sort()

  // Filter rates
  const filteredRates = rates.filter(r => {
    const matchesSearch = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.details.toLowerCase().includes(search.toLowerCase()) ||
      r.supplier_name?.toLowerCase().includes(search.toLowerCase())
    const matchesCity = !cityFilter || r.city === cityFilter
    return matchesSearch && matchesCity
  })

  const handleSelect = (rate: RateItem) => {
    onSelectRate({
      service_name: rate.name,
      rate_eur: rate.rate_eur,
      rate_non_eur: rate.rate_non_eur,
      supplier_id: rate.supplier_id,
      supplier_name: rate.supplier_name
    })
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded text-sm bg-white hover:border-[#647C47] focus:outline-none focus:border-[#647C47] text-left"
      >
        <span className={currentValue ? 'text-gray-900' : 'text-gray-400'}>
          {currentValue || 'Select rate...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search + City Filter */}
          <div className="p-2 border-b border-gray-100 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rates..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#647C47]"
              />
            </div>
            {cities.length > 1 && (
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-[#647C47]"
              >
                <option value="">All Cities</option>
                {cities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          {/* Rate List */}
          <div className="max-h-[250px] overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
              </div>
            ) : filteredRates.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">
                No rates found
              </div>
            ) : (
              filteredRates.map(rate => (
                <button
                  key={rate.id}
                  type="button"
                  onClick={() => handleSelect(rate)}
                  className="w-full px-3 py-2 text-left hover:bg-[#f5f7f2] border-b border-gray-50 last:border-0 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{rate.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {rate.city && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-500">
                            <MapPin className="w-3 h-3" />{rate.city}
                          </span>
                        )}
                        {rate.details && (
                          <span className="text-xs text-gray-400">{rate.details}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-[#647C47] whitespace-nowrap">
                      €{rate.rate_eur.toFixed(2)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {!loading && (
            <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              {filteredRates.length} rate{filteredRates.length !== 1 ? 's' : ''} available
            </div>
          )}
        </div>
      )}
    </div>
  )
}
