'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
// ✅ FIXED: Changed from '@/app/supabase' to '@/lib/supabase'
import { createClient } from '@/lib/supabase'
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Save,
  Calculator,
  ArrowLeft,
  Check,
  MapPin,
  Moon,
  Plane,
  Utensils,
  Wine,
  Hotel,
  Droplets,
  Banknote,
  User,
  Ticket,
  Car,
  Search
} from 'lucide-react'

// ============================================
// TYPES
// ============================================

interface Attraction {
  id: string
  activity_name: string
  city: string
  base_rate_eur: number
  base_rate_non_eur: number
}

interface DayService {
  guide: boolean
  lunch: boolean
  dinner: boolean
  hotel: boolean
  water: boolean  // Always true (standard)
  tips: boolean   // Always true (standard)
}

interface ItineraryDay {
  id: string
  day_number: number
  title: string
  city: string
  description: string
  overnight_city: string | null
  attractions: string[]  // Attraction names
  services: DayService
  flight_from?: string   // For inter-city flights
}

interface Itinerary {
  id: string
  itinerary_code: string
  client_id: string | null
  client_name: string
  client_email: string
  client_phone: string
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_adults: number
  num_children: number
  currency: string
  tier: string
  package_type: string
  status: string
  total_cost: number
  notes: string
}

// ============================================
// CONSTANTS
// ============================================

const CITIES = [
  'Cairo',
  'Giza',
  'Luxor',
  'Aswan',
  'Alexandria',
  'Hurghada',
  'Sharm El Sheikh',
  'Dahab',
  'Siwa',
  'Marsa Alam',
  'El Gouna'
]

const CITY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Cairo': { bg: 'bg-olive-100', text: 'text-olive-700', dot: 'bg-olive-500' },
  'Giza': { bg: 'bg-olive-100', text: 'text-olive-700', dot: 'bg-olive-500' },
  'Luxor': { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  'Aswan': { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Alexandria': { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  'Hurghada': { bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-500' },
  'Sharm El Sheikh': { bg: 'bg-cyan-100', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  'default': { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
}

const PACKAGE_TYPES = [
  { id: 'day-trips', name: 'Day Trips', icon: '🗓️', desc: 'No accommodation', advanced: false },
  { id: 'tours-only', name: 'Tours Only', icon: '🚐', desc: 'Client has own hotel', advanced: false },
  { id: 'land-package', name: 'Land Package', icon: '🏨', desc: 'Tours + Hotels', advanced: false },
  { id: 'full-package', name: 'Full Package', icon: '✈️', desc: 'All inclusive + Airport', advanced: true },
  { id: 'cruise-land', name: 'Cruise + Land', icon: '🚢', desc: 'Nile cruise combo', advanced: true },
  { id: 'shore-excursions', name: 'Shore Excursions', icon: '⚓', desc: 'Port pickup, time-limited', advanced: true }
]

const TIERS = ['budget', 'standard', 'deluxe', 'luxury']

// ============================================
// HELPER FUNCTIONS
// ============================================

const getCityColor = (city: string) => {
  return CITY_COLORS[city] || CITY_COLORS['default']
}

const generateId = () => Math.random().toString(36).substr(2, 9)

// ============================================
// MAIN COMPONENT
// ============================================

export default function ItineraryEditorPage() {
  const router = useRouter()
  const params = useParams()
  const itineraryId = params?.id as string
  const supabase = createClient()

  // ============================================
  // STATE
  // ============================================
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [showAdvancedPackages, setShowAdvancedPackages] = useState(false)
  const [draggedDay, setDraggedDay] = useState<string | null>(null)
  
  // Attraction picker modal
  const [showAttractionModal, setShowAttractionModal] = useState(false)
  const [attractionModalDayId, setAttractionModalDayId] = useState<string | null>(null)
  const [attractions, setAttractions] = useState<Attraction[]>([])
  const [attractionSearch, setAttractionSearch] = useState('')
  const [attractionCityFilter, setAttractionCityFilter] = useState<string | null>(null)

  // ============================================
  // LOAD DATA
  // ============================================

  useEffect(() => {
    loadItinerary()
    loadAttractions()
  }, [itineraryId])

  const loadItinerary = async () => {
    if (!itineraryId) return

    try {
      // Load itinerary
      const { data: itin, error: itinError } = await supabase
        .from('itineraries')
        .select('*')
        .eq('id', itineraryId)
        .single()

      if (itinError) throw itinError

      setItinerary(itin)

      // Load days
      const { data: daysData, error: daysError } = await supabase
        .from('itinerary_days')
        .select('*')
        .eq('itinerary_id', itineraryId)
        .order('day_number')

      if (daysError) throw daysError

      // Transform days to our format
      const transformedDays: ItineraryDay[] = (daysData || []).map(day => ({
        id: day.id,
        day_number: day.day_number,
        title: day.title || '',
        city: day.city || 'Cairo',
        description: day.description || '',
        overnight_city: day.overnight_city,
        attractions: day.attractions || [],
        services: {
          guide: day.guide_required ?? true,
          lunch: day.lunch_included ?? true,
          dinner: day.dinner_included ?? false,
          hotel: day.hotel_included ?? (day.overnight_city !== null),
          water: true,  // Always included
          tips: true    // Always included
        },
        flight_from: day.flight_from
      }))

      setDays(transformedDays)

    } catch (error) {
      console.error('Error loading itinerary:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAttractions = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_rates')
        .select('id, activity_name, city, base_rate_eur, base_rate_non_eur')
        .eq('is_active', true)
        .order('city')
        .order('activity_name')

      if (error) throw error
      setAttractions(data || [])
    } catch (error) {
      console.error('Error loading attractions:', error)
    }
  }

  // ============================================
  // DAY MANAGEMENT
  // ============================================

  const toggleDayExpanded = (dayId: string) => {
    const newExpanded = new Set(expandedDays)
    if (newExpanded.has(dayId)) {
      newExpanded.delete(dayId)
    } else {
      newExpanded.add(dayId)
    }
    setExpandedDays(newExpanded)
  }

  const updateDay = (dayId: string, updates: Partial<ItineraryDay>) => {
    setDays(prev => prev.map(day => 
      day.id === dayId ? { ...day, ...updates } : day
    ))
  }

  const updateDayService = (dayId: string, service: keyof DayService, value: boolean) => {
    setDays(prev => prev.map(day => 
      day.id === dayId 
        ? { ...day, services: { ...day.services, [service]: value } } 
        : day
    ))
  }

  const addAttraction = (dayId: string, attractionName: string) => {
    setDays(prev => prev.map(day => {
      if (day.id === dayId && !day.attractions.includes(attractionName)) {
        return { ...day, attractions: [...day.attractions, attractionName] }
      }
      return day
    }))
  }

  const removeAttraction = (dayId: string, attractionName: string) => {
    setDays(prev => prev.map(day => {
      if (day.id === dayId) {
        return { ...day, attractions: day.attractions.filter(a => a !== attractionName) }
      }
      return day
    }))
  }

  const addNewDay = () => {
    const lastDay = days[days.length - 1]
    const newDay: ItineraryDay = {
      id: generateId(),
      day_number: days.length + 1,
      title: 'New Day',
      city: lastDay?.city || 'Cairo',
      description: '',
      overnight_city: lastDay?.city || 'Cairo',
      attractions: [],
      services: {
        guide: true,
        lunch: true,
        dinner: false,
        hotel: true,
        water: true,
        tips: true
      }
    }
    setDays([...days, newDay])
    setExpandedDays(new Set([...expandedDays, newDay.id]))
    
    // Update itinerary total days
    if (itinerary) {
      setItinerary({ ...itinerary, total_days: days.length + 1 })
    }
  }

  const removeDay = (dayId: string) => {
    const newDays = days.filter(d => d.id !== dayId)
    // Renumber remaining days
    newDays.forEach((day, index) => {
      day.day_number = index + 1
    })
    setDays(newDays)
    
    // Update itinerary total days
    if (itinerary) {
      setItinerary({ ...itinerary, total_days: newDays.length })
    }
  }

  // ============================================
  // DRAG AND DROP
  // ============================================

  const handleDragStart = (dayId: string) => {
    setDraggedDay(dayId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (targetDayId: string) => {
    if (!draggedDay || draggedDay === targetDayId) {
      setDraggedDay(null)
      return
    }

    const dragIndex = days.findIndex(d => d.id === draggedDay)
    const dropIndex = days.findIndex(d => d.id === targetDayId)

    const newDays = [...days]
    const [removed] = newDays.splice(dragIndex, 1)
    newDays.splice(dropIndex, 0, removed)

    // Renumber days
    newDays.forEach((day, index) => {
      day.day_number = index + 1
    })

    setDays(newDays)
    setDraggedDay(null)
  }

  // ============================================
  // ✅ FIXED: SAVE & CALCULATE
  // ============================================

  const saveDraft = async (): Promise<boolean> => {
    if (!itinerary) return false
    setSaving(true)

    try {
      console.log('💾 Saving draft...')

      // 1. Update itinerary metadata
      const { error: itinError } = await supabase
        .from('itineraries')
        .update({
          trip_name: itinerary.trip_name,
          tier: itinerary.tier,
          package_type: itinerary.package_type,
          total_days: days.length,
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('id', itineraryId)

      if (itinError) {
        console.error('❌ Error updating itinerary:', itinError)
        throw itinError
      }

      console.log('✅ Itinerary updated')

      // 2. Update each day individually (safer than delete-all-recreate)
      for (const day of days) {
        const dayData = {
          day_number: day.day_number,
          title: day.title,
          city: day.city,
          description: day.description,
          overnight_city: day.overnight_city,
          attractions: day.attractions || [],
          guide_required: day.services?.guide ?? true,
          lunch_included: day.services?.lunch ?? true,
          dinner_included: day.services?.dinner ?? false,
          hotel_included: day.services?.hotel ?? false
        }

        // Check if this is a real UUID (existing day) or temp ID (new day)
        const isRealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(day.id)

        if (!isRealUUID) {
          // Insert new day
          console.log(`➕ Inserting new day ${day.day_number}...`)
          const { data: newDay, error: insertError } = await supabase
            .from('itinerary_days')
            .insert({
              ...dayData,
              itinerary_id: itineraryId
            })
            .select()
            .single()

          if (insertError) {
            console.error('❌ Insert error:', insertError)
            throw insertError
          }

          // Update local ID
          if (newDay) {
            day.id = newDay.id
          }
          console.log(`✅ Day ${day.day_number} inserted`)
        } else {
          // Update existing day
          console.log(`📝 Updating day ${day.day_number}...`)
          const { error: updateError } = await supabase
            .from('itinerary_days')
            .update(dayData)
            .eq('id', day.id)

          if (updateError) {
            console.error('❌ Update error:', updateError)
            throw updateError
          }
          console.log(`✅ Day ${day.day_number} updated`)
        }
      }

      console.log('🎉 Draft saved successfully!')
      return true

    } catch (error: any) {
      console.error('❌ Error saving draft:', error)
      alert(`Failed to save: ${error.message || 'Unknown error'}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  const calculatePricing = async () => {
    if (!itinerary) return
    setCalculating(true)

    try {
      // First save the current state
      console.log('💾 Saving before calculating...')
      const saveSuccess = await saveDraft()
      
      if (!saveSuccess) {
        alert('Failed to save draft. Please try again.')
        setCalculating(false)
        return
      }

      console.log('📊 Calling calculate-pricing API...')

      // Call the pricing calculation API
      const response = await fetch(`/api/itineraries/${itineraryId}/calculate-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: itinerary.tier,
          package_type: itinerary.package_type,
          days: days.map(d => ({
            day_number: d.day_number,
            city: d.city,
            attractions: d.attractions,
            services: d.services,
            overnight_city: d.overnight_city
          })),
          num_adults: itinerary.num_adults,
          num_children: itinerary.num_children,
          nationality_type: 'non-eur' // Default, could be passed from client data
        })
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('❌ Pricing API error:', result)
        throw new Error(result.error || 'Pricing calculation failed')
      }

      console.log('✅ Pricing calculated:', result)
      
      // Redirect to view page after successful calculation
      router.push(`/itineraries/${itineraryId}`)

    } catch (error: any) {
      console.error('❌ Error calculating pricing:', error)
      alert(`Failed to calculate pricing: ${error.message || 'Unknown error'}`)
    } finally {
      setCalculating(false)
    }
  }

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const citiesBreakdown = days.reduce((acc, day) => {
    acc[day.city] = (acc[day.city] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalAttractions = days.reduce((sum, day) => sum + day.attractions.length, 0)
  
  const totalLunches = days.filter(d => d.services.lunch).length
  const totalDinners = days.filter(d => d.services.dinner).length
  const totalHotelNights = days.filter(d => d.services.hotel && d.overnight_city).length

  const filteredAttractions = attractions.filter(a => {
    const matchesSearch = !attractionSearch || 
      a.activity_name.toLowerCase().includes(attractionSearch.toLowerCase())
    const matchesCity = !attractionCityFilter || a.city === attractionCityFilter
    return matchesSearch && matchesCity
  })

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-olive-600"></div>
      </div>
    )
  }

  if (!itinerary) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Itinerary not found</p>
      </div>
    )
  }

return (
  <div className="min-h-screen bg-gray-50 p-5">
    {/* ============================================ */}
    {/* HEADER */}
    {/* ============================================ */}
    <div className="bg-white rounded-xl p-5 mb-5 shadow-sm flex justify-between items-center">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-md text-xs font-semibold">
            {itinerary.status?.toUpperCase() || 'DRAFT'}
          </span>
          <h1 className="text-xl font-bold text-gray-900">{itinerary.itinerary_code}</h1>
        </div>
        <p className="text-gray-500 text-sm">
          {itinerary.client_name} • {days.length} days • {itinerary.num_adults} adults
          {itinerary.num_children > 0 && `, ${itinerary.num_children} children`}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-600 text-sm font-medium hover:bg-gray-50 flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <button
          onClick={calculatePricing}
          disabled={calculating || saving}
          className="px-5 py-2.5 bg-[#647C47] text-white rounded-lg text-sm font-semibold hover:bg-[#4a5c35] flex items-center gap-2 disabled:opacity-50"
        >
          <Calculator size={16} />
          {calculating ? 'Calculating...' : saving ? 'Saving...' : 'Calculate Pricing'}
        </button>
      </div>
    </div>

    {/* ============================================ */}
    {/* WORKFLOW STATUS BAR */}
    {/* ============================================ */}
    <div className="bg-white rounded-xl p-4 mb-5 shadow-sm flex items-center gap-2">
      {/* Step 1 - Complete */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#e8ede3] rounded-full">
        <span className="w-6 h-6 bg-[#647C47] rounded-full flex items-center justify-center text-white text-xs font-bold">
          <Check size={14} />
        </span>
        <span className="text-sm font-semibold text-[#4a5c35]">AI Generated</span>
      </div>
      <div className="w-10 h-0.5 bg-[#647C47]"></div>
      
      {/* Step 2 - Active */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#f4f7f1] rounded-full border-2 border-[#647C47]">
        <span className="w-6 h-6 bg-[#647C47] rounded-full flex items-center justify-center text-white text-xs font-bold">2</span>
        <span className="text-sm font-semibold text-[#647C47]">Edit Content</span>
      </div>
      <div className="w-10 h-0.5 bg-gray-200"></div>
      
      {/* Step 3 - Pending */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
        <span className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
        <span className="text-sm font-medium text-gray-500">Calculate Pricing</span>
      </div>
      <div className="w-10 h-0.5 bg-gray-200"></div>
      
      {/* Step 4 - Pending */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
        <span className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">4</span>
        <span className="text-sm font-medium text-gray-500">Download PDF</span>
      </div>
    </div>

    {/* ============================================ */}
    {/* PACKAGE TYPE SELECTOR */}
    {/* ============================================ */}
    <div className="bg-white rounded-xl p-5 mb-5 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Package Type</h3>
        <button
          onClick={() => setShowAdvancedPackages(!showAdvancedPackages)}
          className="text-sm text-gray-500 hover:text-[#647C47] flex items-center gap-1"
        >
          {showAdvancedPackages ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {showAdvancedPackages ? 'Hide' : 'Show'} advanced options
        </button>
      </div>
      
      {/* Main Package Options */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        {PACKAGE_TYPES.filter(p => !p.advanced).map(pkg => (
          <button
            key={pkg.id}
            onClick={() => setItinerary({ ...itinerary, package_type: pkg.id })}
            className={`p-4 rounded-xl border-2 text-center transition-all ${
              itinerary.package_type === pkg.id
                ? 'border-[#647C47] bg-[#e8ede3]'
                : 'border-gray-200 hover:border-[#b8c9a8] hover:bg-[#f4f7f1]'
            }`}
          >
            <div className="text-2xl mb-1">{pkg.icon}</div>
            <div className={`text-sm font-semibold ${itinerary.package_type === pkg.id ? 'text-[#4a5c35]' : 'text-gray-700'}`}>
              {pkg.name}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{pkg.desc}</div>
          </button>
        ))}
      </div>
      
      {/* Advanced Options */}
      {showAdvancedPackages && (
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-200">
          {PACKAGE_TYPES.filter(p => p.advanced).map(pkg => (
            <button
              key={pkg.id}
              onClick={() => setItinerary({ ...itinerary, package_type: pkg.id })}
              className={`p-4 rounded-xl border-2 text-center transition-all ${
                itinerary.package_type === pkg.id
                  ? 'border-[#647C47] bg-[#e8ede3]'
                  : 'border-gray-200 hover:border-[#b8c9a8] hover:bg-[#f4f7f1]'
              }`}
            >
              <div className="text-2xl mb-1">{pkg.icon}</div>
              <div className={`text-sm font-semibold ${itinerary.package_type === pkg.id ? 'text-[#4a5c35]' : 'text-gray-700'}`}>
                {pkg.name}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{pkg.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>

    {/* ============================================ */}
    {/* MAIN CONTENT - TWO COLUMNS */}
    {/* ============================================ */}
    <div className="grid grid-cols-[1fr_380px] gap-5">
      {/* LEFT COLUMN - Days Editor */}
      <div>
        {/* Trip Name */}
        <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
            Trip Name
          </label>
          <input
            type="text"
            value={itinerary.trip_name}
            onChange={(e) => setItinerary({ ...itinerary, trip_name: e.target.value })}
            className="w-full px-4 py-3 text-lg font-semibold border border-gray-200 rounded-lg focus:outline-none focus:border-[#647C47]"
          />
        </div>

        {/* Section Header */}
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-semibold text-gray-900">Itinerary Days</h2>
          <span className="text-xs text-gray-500">💡 Drag to reorder • Click Edit to expand</span>
        </div>

        {/* Days List */}
        {days.map((day) => (
          <div
            key={day.id}
            draggable
            onDragStart={() => handleDragStart(day.id)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(day.id)}
            className={`bg-white rounded-xl mb-3 shadow-sm border-2 transition-all ${
              draggedDay === day.id
                ? 'border-dashed border-[#647C47] rotate-1 shadow-lg'
                : 'border-transparent hover:shadow-md'
            }`}
          >
            {/* Day Header */}
            <div className="p-4 flex items-center gap-3 cursor-grab">
              <GripVertical className="text-gray-400" size={18} />
              <div className="w-9 h-9 bg-[#647C47] rounded-lg flex items-center justify-center text-white font-bold text-sm">
                {day.day_number}
              </div>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={day.title}
                  onChange={(e) => updateDay(day.id, { title: e.target.value })}
                  className="w-full border-none text-[15px] font-semibold text-gray-900 bg-transparent focus:outline-none"
                  placeholder="Day title..."
                />
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getCityColor(day.city).bg} ${getCityColor(day.city).text}`}>
                    📍 {day.city}
                  </span>
                  {day.flight_from && (
                    <span className="flex items-center gap-1">
                      <Plane size={12} /> from {day.flight_from}
                    </span>
                  )}
                  {day.overnight_city && (
                    <span className="flex items-center gap-1">
                      <Moon size={12} /> {day.overnight_city}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => toggleDayExpanded(day.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  expandedDays.has(day.id)
                    ? 'bg-[#647C47] text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {expandedDays.has(day.id) ? 'Collapse' : 'Edit'}
              </button>
            </div>

            {/* Day Content (Expanded) */}
            {expandedDays.has(day.id) && (
              <div className="p-5 border-t border-gray-200">
                {/* City Selector */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    City (affects transportation & guide rates)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CITIES.map(city => (
                      <button
                        key={city}
                        onClick={() => updateDay(day.id, { city, overnight_city: city })}
                        className={`px-3 py-2 rounded-md text-sm transition-all ${
                          day.city === city
                            ? 'bg-[#647C47] text-white'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-[#b8c9a8]'
                        }`}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    Description
                  </label>
                  <textarea
                    value={day.description}
                    onChange={(e) => updateDay(day.id, { description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#647C47] resize-y"
                    placeholder="Describe this day..."
                  />
                </div>

                {/* Attractions */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                    Attractions / Sites (affects entrance fees)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {day.attractions.map((attr, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#e8ede3] border border-[#b8c9a8] rounded-full text-sm text-[#4a5c35]"
                      >
                        <Ticket size={14} />
                        {attr}
                        <button
                          onClick={() => removeAttraction(day.id, attr)}
                          className="text-red-500 hover:text-red-700 ml-1"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => {
                        setAttractionModalDayId(day.id)
                        setAttractionCityFilter(day.city)
                        setShowAttractionModal(true)
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-dashed border-gray-300 rounded-full text-sm text-gray-500 hover:border-[#647C47] hover:text-[#647C47]"
                    >
                      <Plus size={14} />
                      Add attraction
                    </button>
                  </div>
                </div>

                {/* Services Grid */}
                <div className="grid grid-cols-6 gap-3 p-4 bg-gray-50 rounded-lg">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.services.guide}
                      onChange={(e) => updateDayService(day.id, 'guide', e.target.checked)}
                      className="w-4 h-4 accent-[#647C47]"
                    />
                    <User size={14} /> Guide
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.services.lunch}
                      onChange={(e) => updateDayService(day.id, 'lunch', e.target.checked)}
                      className="w-4 h-4 accent-[#647C47]"
                    />
                    <Utensils size={14} /> Lunch
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.services.dinner}
                      onChange={(e) => updateDayService(day.id, 'dinner', e.target.checked)}
                      className="w-4 h-4 accent-[#647C47]"
                    />
                    <Wine size={14} /> Dinner
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={day.services.hotel}
                      onChange={(e) => updateDayService(day.id, 'hotel', e.target.checked)}
                      className="w-4 h-4 accent-[#647C47]"
                      disabled={day.day_number === days.length} // Last day usually no hotel
                    />
                    <Hotel size={14} /> Hotel
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed">
                    <input type="checkbox" checked disabled className="w-4 h-4" />
                    <Droplets size={14} /> Water
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed">
                    <input type="checkbox" checked disabled className="w-4 h-4" />
                    <Banknote size={14} /> Tips
                  </label>
                </div>

                {/* Remove Day Button */}
                {days.length > 1 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => removeDay(day.id)}
                      className="text-sm text-red-500 hover:text-red-700"
                    >
                      Remove this day
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add Day Button */}
        <button
          onClick={addNewDay}
          className="w-full p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-[#647C47] hover:text-[#647C47] flex items-center justify-center gap-2"
        >
          <Plus size={18} />
          Add Another Day
        </button>
      </div>

        {/* RIGHT COLUMN - Summary & Actions */}
        <div>
          {/* Trip Summary */}
          <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Trip Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Duration</span>
                <span className="font-semibold text-gray-900">{days.length} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Travelers</span>
                <span className="font-semibold text-gray-900">
                  {itinerary.num_adults} adults
                  {itinerary.num_children > 0 && `, ${itinerary.num_children} children`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tier</span>
                <select
                  value={itinerary.tier}
                  onChange={(e) => setItinerary({ ...itinerary, tier: e.target.value })}
                  className="font-semibold text-gray-900 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs border-none focus:outline-none"
                >
                  {TIERS.map(tier => (
                    <option key={tier} value={tier}>{tier.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Package</span>
                <span className="font-semibold text-gray-900">
                  {PACKAGE_TYPES.find(p => p.id === itinerary.package_type)?.name || 'Land Package'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Start Date</span>
                <span className="font-semibold text-gray-900">{itinerary.start_date}</span>
              </div>
            </div>

            {/* Cities Breakdown */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
                Cities Involved (rates vary)
              </label>
              {Object.entries(citiesBreakdown).map(([city, count]) => (
                <div key={city} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getCityColor(city).dot}`}></span>
                    {city}
                  </span>
                  <span className="text-gray-500">{count} day{count > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Services to Calculate */}
          <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Services to Calculate</h3>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg text-sm">
                <Car size={16} className="text-blue-600" />
                <span className="flex-1 text-gray-700">Transportation</span>
                <span className="text-blue-700 font-semibold">{Object.keys(citiesBreakdown).length} cities</span>
              </div>
              <p className="text-[11px] text-gray-500 -mt-1 ml-8 mb-2">
                {Object.entries(citiesBreakdown).map(([city, count]) => `${city}: ${count} day${count > 1 ? 's' : ''}`).join(' • ')}
              </p>

              <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg text-sm">
                <User size={16} className="text-blue-600" />
                <span className="flex-1 text-gray-700">Guide Service</span>
                <span className="text-blue-700 font-semibold">{Object.keys(citiesBreakdown).length} cities</span>
              </div>

              <div className="flex items-center gap-2 p-2.5 bg-[#e8ede3] rounded-lg text-sm">
                <Ticket size={16} className="text-[#647C47]" />
                <span className="flex-1 text-gray-700">Entrance Fees</span>
                <span className="text-[#4a5c35] font-semibold">{totalAttractions} sites</span>
              </div>

              <div className="flex items-center gap-2 p-2.5 bg-[#e8ede3] rounded-lg text-sm">
                <Utensils size={16} className="text-[#647C47]" />
                <span className="flex-1 text-gray-700">Meals</span>
                <span className="text-[#4a5c35] font-semibold">
                  {totalLunches} lunch{totalLunches !== 1 ? 'es' : ''}
                  {totalDinners > 0 && `, ${totalDinners} dinner${totalDinners !== 1 ? 's' : ''}`}
                </span>
              </div>

              <div className="flex items-center gap-2 p-2.5 bg-[#e8ede3] rounded-lg text-sm">
                <Droplets size={16} className="text-[#647C47]" />
                <span className="flex-1 text-gray-700">Water Bottles</span>
                <span className="text-[#4a5c35] font-semibold">× {days.length} days</span>
              </div>

              <div className="flex items-center gap-2 p-2.5 bg-[#e8ede3] rounded-lg text-sm">
                <Banknote size={16} className="text-[#647C47]" />
                <span className="flex-1 text-gray-700">Daily Tips</span>
                <span className="text-[#4a5c35] font-semibold">× {days.length} days</span>
              </div>

              {totalHotelNights > 0 && (
                <>
                  <div className="flex items-center gap-2 p-2.5 bg-amber-100 rounded-lg text-sm">
                    <Hotel size={16} className="text-amber-600" />
                    <span className="flex-1 text-gray-700">Hotels ({itinerary.tier})</span>
                    <span className="text-amber-700 font-semibold">× {totalHotelNights} nights</span>
                  </div>
                  <p className="text-[11px] text-gray-500 -mt-1 ml-8">
                    {Object.entries(citiesBreakdown)
                      .filter(([_, count]) => count > 0)
                      .map(([city, count]) => `${city}: ${Math.max(0, count - (city === Object.keys(citiesBreakdown)[Object.keys(citiesBreakdown).length - 1] ? 1 : 0))}`)
                      .filter(s => !s.endsWith(': 0'))
                      .join(' • ')}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Action Box */}
          <div className="bg-[#f4f7f1] rounded-xl p-5 border border-[#b8c9a8]">
            <p className="text-sm text-[#4a5c35] mb-4">
              ✨ Review the content above, then calculate pricing. Rates will be pulled from your rate tables based on each city.
            </p>
            <button
              onClick={calculatePricing}
              disabled={calculating || saving}
              className="w-full py-3.5 bg-[#647C47] text-white rounded-lg text-sm font-semibold hover:bg-[#4a5c35] mb-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Calculator size={18} />
              {calculating ? 'Calculating...' : saving ? 'Saving...' : 'Calculate Pricing'}
            </button>
            <button
              onClick={saveDraft}
              disabled={saving || calculating}
              className="w-full py-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
          </div>

          {/* Tips */}
          <div className="mt-4 p-4 bg-[#e8ede3] rounded-lg border border-[#b8c9a8]">
            <h4 className="text-sm font-semibold text-[#4a5c35] mb-2">💡 Pricing Notes</h4>
            <ul className="text-xs text-[#647C47] space-y-1.5 list-disc pl-4">
              <li><strong>Standard inclusions:</strong> Water & Tips (every day)</li>
              <li>Transportation rates vary by city</li>
              <li>Guide rates differ per location</li>
              <li>Hotels pull from city-specific rates</li>
              <li>Entrance fees match each attraction</li>
              <li>Drag days to optimize route</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* ATTRACTION PICKER MODAL */}
      {/* ============================================ */}
      {showAttractionModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowAttractionModal(false)}
        >
          <div 
            className="bg-white rounded-2xl w-[550px] max-h-[80vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Add Attraction</h3>
              <button 
                onClick={() => setShowAttractionModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search attractions..."
                  value={attractionSearch}
                  onChange={(e) => setAttractionSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#647C47]"
                />
              </div>
              
              {/* City Filter */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setAttractionCityFilter(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    !attractionCityFilter
                      ? 'bg-[#647C47] text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-[#647C47]'
                  }`}
                >
                  All Cities
                </button>
                {[...new Set(attractions.map(a => a.city))].map(city => (
                  <button
                    key={city}
                    onClick={() => setAttractionCityFilter(city)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      attractionCityFilter === city
                        ? 'bg-[#647C47] text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-[#647C47]'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

              {/* Attractions List */}
              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {filteredAttractions.map(attr => {
                  const currentDay = days.find(d => d.id === attractionModalDayId)
                  const isAdded = currentDay?.attractions.includes(attr.activity_name)
                  
                  return (
                    <div
                      key={attr.id}
                      onClick={() => {
                        if (!isAdded && attractionModalDayId) {
                          addAttraction(attractionModalDayId, attr.activity_name)
                        }
                      }}
                      className={`p-3.5 rounded-lg border flex justify-between items-center transition-all ${
                        isAdded
                          ? 'border-green-300 bg-green-50 cursor-default'
                          : 'border-gray-200 hover:border-[#b8c9a8] hover:bg-[#f4f7f1] cursor-pointer'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-sm text-gray-900">
                          {attr.activity_name}
                          {isAdded && <Check size={14} className="inline ml-2 text-green-600" />}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">📍 {attr.city}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-[#647C47]">
                          €{attr.base_rate_eur} / €{attr.base_rate_non_eur}
                        </div>
                        <div className="text-[11px] text-gray-500">EUR / non-EUR</div>
                      </div>
                    </div>
                  )
                })}
                {filteredAttractions.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No attractions found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
