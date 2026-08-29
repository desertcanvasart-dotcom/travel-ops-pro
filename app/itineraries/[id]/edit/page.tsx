'use client'

import { todayLocal } from '@/lib/today'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'
import dynamic from 'next/dynamic'
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
  Search,
  Trash2,
  Edit3,
  DollarSign,
  FileText,
  Receipt,
  Download,
  Eye,
  Send,
  UserCheck,
  UserX,
  Ship,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import AddExpenseFromItinerary from '@/components/AddExpenseFromItinerary'
import ServiceRatePicker from '@/components/ServiceRatePicker'
import GenerateDocumentsButton from '@/app/components/GenerateDocumentsButton'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/app/contexts/PreferencesContext'

const ItineraryMap = dynamic(() => import('@/components/ItineraryMap'), {
  ssr: false,
  loading: () => <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />,
})

// ============================================
// TYPES
// ============================================

interface Attraction {
  id: string
  activity_name: string
  city: string
  base_rate_eur: number
  base_rate_non_eur: number
  source: 'entrance' | 'activity'
}

interface DayService {
  guide: boolean
  lunch: boolean
  dinner: boolean
  hotel: boolean
  water: boolean
  tips: boolean
}

// Transport service_types that can be added as additive evening transfers
// (e.g. evening Sound & Light at Karnak alongside the day_tour).
type TransportExtra = 'sound_light' | 'dinner_transfer' | 'city_transfer'

interface ItineraryDay {
  id: string
  day_number: number
  title: string
  city: string
  description: string
  overnight_city: string | null
  attractions: string[]
  services: DayService
  flight_from?: string

  // Per-day transport rule flags (B3). All optional; the engine applies sane
  // defaults when omitted. Persisted by the 20260623_itinerary_days_transport_meta
  // migration and surfaced in the "Transport details" panel of each day card.
  is_cruise_day?: boolean
  transport_type?: 'flight' | 'ground' | null
  skip_arrival_checkin?: boolean
  extras?: TransportExtra[]
}

interface CabinAllocationItem {
  type: 'single' | 'double' | 'triple' | 'suite'
  count: number
  pax: number
  ratePerPersonPerNight: number
  costPerNight: number
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
  fx_frozen?: { base: string; rates: Record<string, number>; frozen_at: string; frozen_by: string | null; source: string } | null
  tier: string
  package_type: string
  status: string
  total_cost: number
  supplier_cost?: number | null
  margin_percent?: number | null
  notes: string
  cabin_allocation?: CabinAllocationItem[] | null
  // Provenance: when set, this itinerary was spun from a Copilot thread
  // (Concierge brief in Phase 1; WhatsApp later). NULL for manually-created
  // itineraries.
  thread_id?: string | null
  // The programme this trip was sold from. Drives the 日程表 — both the office's
  // own copy and the one the customer portal offers.
  template_id?: string | null
}

interface ItineraryService {
  id: string
  itinerary_day_id: string
  day_number?: number
  service_type: string
  service_name: string
  supplier_id?: string | null
  supplier_name?: string | null
  /** Who SOLD this service to the client (a guide), distinct from the supplier
   *  who provides it. Paid a "we pay" commission on our profit from it. */
  sold_by_supplier_id?: string | null
  quantity: number
  rate_eur: number
  rate_non_eur: number
  total_cost: number
  notes: string
  isNew?: boolean
  isDeleted?: boolean
  // Multi-currency fields
  supplier_currency?: string | null
  supplier_cost_original?: number | null
  exchange_rate_used?: number | null
}

interface Supplier {
  id: string
  name: string
  type: string
  /** Every role the supplier fills — a guide is anyone with 'guide' among them. */
  types?: string[] | null
  city?: string
  contact_phone?: string
}

// ============================================
// CONSTANTS
// ============================================

const CITIES = [
  'Cairo', 'Giza', 'Luxor', 'Aswan', 'Alexandria',
  'Hurghada', 'Sharm El Sheikh', 'Dahab', 'Siwa', 'Marsa Alam', 'El Gouna'
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
  { id: 'cruise-package', name: 'Cruise Package', icon: '⚓', desc: 'Nile Cruise only', advanced: true },
  { id: 'cruise-land', name: 'Cruise + Land', icon: '🚢', desc: 'Nile cruise combo', advanced: true },
  { id: 'shore-excursions', name: 'Shore Excursions', icon: '⚓', desc: 'Port pickup, time-limited', advanced: true }
]

const TIERS = ['budget', 'standard', 'deluxe', 'luxury']

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  { value: 'completed', label: 'Completed', color: 'bg-purple-100 text-purple-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-700' }
]

const SERVICE_TYPES = [
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'guide', label: 'Guide', icon: '👨‍🏫' },
  { value: 'entrance', label: 'Entrance Fee', icon: '🎫' },
  { value: 'meal', label: 'Meal', icon: '🍽️' },
  { value: 'accommodation', label: 'Accommodation', icon: '🏨' },
  { value: 'activity', label: 'Activity', icon: '🎭' },
  { value: 'tips', label: 'Tips', icon: '💰' },
  { value: 'supplies', label: 'Supplies', icon: '💧' },
  { value: 'service_fee', label: 'Service Fee', icon: '💼' },
]

const RATE_TABLE_TYPES = new Set(['meal', 'transportation', 'guide', 'entrance', 'activity'])

// ============================================
// HELPER FUNCTIONS
// ============================================

const getCityColor = (city: string) => CITY_COLORS[city] || CITY_COLORS['default']
const generateId = () => `new-${Math.random().toString(36).substr(2, 9)}`
const getServiceIcon = (type: string) => {
  const icons: Record<string, string> = {
    accommodation: '🏨', transportation: '🚗', guide: '👨‍🏫', entrance: '🎫',
    meal: '🍽️', activity: '🎭', service_fee: '💼', tips: '💰', supplies: '💧'
  }
  return icons[type] || '📋'
}

// ============================================
// MAIN COMPONENT
// ============================================

interface Programme {
  id: string
  template_code: string
  template_name: string | null
  duration_days: number | null
  is_active: boolean | null
}

export default function ItineraryEditorPage() {
  const { rateSymbol } = useCurrency()
  const t = useTranslations('itineraries.edit')
  const tCommon = useTranslations('common')
  const dialog = useConfirmDialog()
  const [repricing, setRepricing] = useState(false)

  // The ONLY way a confirmed file's FX moves — explicit and logged. The
  // client price is untouched; costs and margin are restated at today's
  // rates from each line's preserved original.
  const handleRepriceFx = async () => {
    if (!itinerary) return
    const ok = await dialog.confirm({
      title: t('fxReprice.confirmTitle'),
      message: t('fxReprice.confirmMessage'),
      variant: 'warning',
      confirmText: t('fxReprice.confirmButton'),
    })
    if (!ok) return
    setRepricing(true)
    try {
      const res = await fetch(`/api/itineraries/${itinerary.id}/reprice-fx`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        await dialog.alert(tCommon('error'), data.error || t('fxReprice.failed'), 'warning')
        return
      }
      const r = data.repriced
      await dialog.alert(
        t('fxReprice.doneTitle'),
        t('fxReprice.doneMessage', {
          lines: r.lines_changed,
          oldCost: String(r.supplier_cost.old),
          newCost: String(r.supplier_cost.new),
        }),
        'success'
      )
      window.location.reload()
    } finally {
      setRepricing(false)
    }
  }
  const router = useRouter()
  const params = useParams()
  const itineraryId = params?.id as string
  const supabase = createClient()
  const currentLocale = useLocale() // 'en' or 'ja'
  const [activeLanguage, setActiveLanguage] = useState(currentLocale)

  // ============================================
  // STATE
  // ============================================
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  // Day IDs whose Transport details panel is expanded (B3 rule flags).
  const [expandedTransportPanels, setExpandedTransportPanels] = useState<Set<string>>(new Set())
  const [showAdvancedPackages, setShowAdvancedPackages] = useState(false)
  const [draggedDay, setDraggedDay] = useState<string | null>(null)
  
  // Services & Pricing State
  const [services, setServices] = useState<ItineraryService[]>([])
  const [showServicesSection, setShowServicesSection] = useState(true)
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [servicesChanged, setServicesChanged] = useState(false)
  
  // Status & Invoice State
  const [existingInvoice, setExistingInvoice] = useState<{id: string, invoice_number: string} | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  
  // Attraction picker modal
  const [showAttractionModal, setShowAttractionModal] = useState(false)
  const [attractionModalDayId, setAttractionModalDayId] = useState<string | null>(null)
  const [attractions, setAttractions] = useState<Attraction[]>([])
  const [attractionSearch, setAttractionSearch] = useState('')
  const [attractionCityFilter, setAttractionCityFilter] = useState<string | null>(null)

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  // The programmes a trip can be linked to. Linking one is what lets the
  // customer portal show the office's own 日程表 instead of a second rendering
  // of the day list — see app/portal/[token]/page.tsx.
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [supplierSearch, setSupplierSearch] = useState('')

  // Track base (English) service data for language-aware saving
  const [baseServiceData, setBaseServiceData] = useState<Record<string, { service_name: string; notes: string }>>({})

  // ============================================
  // LOAD DATA
  // ============================================

  // Sync activeLanguage with locale provider (may change after mount)
  useEffect(() => {
    setActiveLanguage(currentLocale)
  }, [currentLocale])

  useEffect(() => {
    loadItinerary()
    loadAttractions()
    loadSuppliers()
    loadProgrammes()
  }, [itineraryId, activeLanguage])

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
          water: true,
          tips: true
        },
        flight_from: day.flight_from,
        // B3 transport-rule flags — read with safe defaults so the page works
        // before/after the 20260623_itinerary_days_transport_meta migration runs.
        is_cruise_day: day.is_cruise_day ?? false,
        transport_type: day.transport_type ?? null,
        skip_arrival_checkin: day.skip_arrival_checkin ?? false,
        extras: Array.isArray(day.extras) ? day.extras : [],
      }))

      setDays(transformedDays)

      // Load services for each day
      if (daysData && daysData.length > 0) {
        const dayIds = daysData.map(d => d.id)
        const { data: servicesData, error: servicesError } = await supabase
          .from('itinerary_services')
          .select('*')
          .in('itinerary_day_id', dayIds)
          .order('id')

        if (servicesError) {
          console.error('Error loading services:', servicesError)
        } else {
          // Store base (English) service data for reference
          const baseData: Record<string, { service_name: string; notes: string }> = {}
          for (const s of (servicesData || [])) {
            baseData[s.id] = { service_name: s.service_name, notes: s.notes || '' }
          }
          setBaseServiceData(baseData)

          // Add day_number to each service for display
          let servicesWithDayNumber = (servicesData || []).map(service => {
            const day = daysData.find(d => d.id === service.itinerary_day_id)
            return { ...service, day_number: day?.day_number || 1 }
          })

          // If language is not English, merge service versions
          if (activeLanguage !== 'en') {
            const serviceIds = servicesWithDayNumber.filter(s => s.id && !s.id.startsWith('new-')).map(s => s.id)
            if (serviceIds.length > 0) {
              const { data: serviceVersions } = await supabase
                .from('itinerary_service_versions')
                .select('itinerary_service_id, service_name, notes')
                .in('itinerary_service_id', serviceIds)
                .eq('language', activeLanguage)

              if (serviceVersions && serviceVersions.length > 0) {
                const versionMap: Record<string, { service_name?: string; notes?: string }> = {}
                for (const sv of serviceVersions) {
                  versionMap[sv.itinerary_service_id] = {
                    service_name: sv.service_name,
                    notes: sv.notes
                  }
                }
                servicesWithDayNumber = servicesWithDayNumber.map(service => {
                  const version = versionMap[service.id]
                  if (version) {
                    return {
                      ...service,
                      service_name: version.service_name || service.service_name,
                      notes: version.notes ?? service.notes
                    }
                  }
                  return service
                })
              }
            }
          }

          setServices(servicesWithDayNumber)
        }
      }

    } catch (error) {
      console.error('Error loading itinerary:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadProgrammes = async () => {
    try {
      // Through the API rather than the browser's supabase client: RLS keeps
      // tour_templates out of reach of a client-side read, and `slim=1` fetches
      // 5KB instead of every programme's full day-by-day.
      const res = await fetch('/api/tours/templates?slim=1')
      if (!res.ok) return
      const json = await res.json()
      setProgrammes(Array.isArray(json.data) ? json.data : [])
    } catch (error) {
      // A picker that cannot load is not a reason to fail the editor.
      console.error('Could not load programmes:', error)
    }
  }

  const loadAttractions = async () => {
    try {
      // Load both entrance fees and activities in parallel
      const [entranceRes, activityRes] = await Promise.all([
        supabase
          .from('entrance_fees')
          .select('id, attraction_name, city, eur_rate, non_eur_rate')
          .neq('is_active', false)
          .order('city')
          .order('attraction_name'),
        supabase
          .from('activity_rates')
          .select('id, activity_name, city, base_rate_eur, base_rate_non_eur')
          .eq('is_active', true)
          .order('city')
          .order('activity_name')
      ])

      if (entranceRes.error) console.error('Error loading entrance fees:', entranceRes.error)
      if (activityRes.error) console.error('Error loading activities:', activityRes.error)

      // Normalize entrance fees to the shared Attraction shape
      const entranceFees: Attraction[] = (entranceRes.data || []).map((ef: any) => ({
        id: ef.id,
        activity_name: ef.attraction_name,
        city: ef.city,
        base_rate_eur: ef.eur_rate || 0,
        base_rate_non_eur: ef.non_eur_rate || 0,
        source: 'entrance' as const,
      }))

      const activities: Attraction[] = (activityRes.data || []).map((a: any) => ({
        ...a,
        source: 'activity' as const,
      }))

      // Combine: entrance fees first, then activities
      const combined = [...entranceFees, ...activities].sort((a, b) => {
        const cityCompare = a.city.localeCompare(b.city)
        if (cityCompare !== 0) return cityCompare
        return a.activity_name.localeCompare(b.activity_name)
      })

      setAttractions(combined)
    } catch (error) {
      console.error('Error loading attractions:', error)
    }
  }

  const loadSuppliers = async () => {
    try {
      console.log('Loading suppliers...')
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, type, types, city, contact_phone')
        .order('type')
        .order('name')

      if (error) {
        console.error('Error loading suppliers:', error)
        return
      }
      
      console.log('Loaded suppliers:', data?.length || 0)
      setSuppliers(data || [])
    } catch (error) {
      console.error('Error loading suppliers:', error)
    }
  }

  // Helper to get relevant suppliers for a service type
  const getSuppliersForServiceType = (serviceType: string) => {
    const typeMapping: Record<string, string[]> = {
      transportation: ['transport', 'driver', 'dmc', 'ground_handler'],
      guide: ['guide', 'dmc', 'ground_handler'],
      accommodation: ['hotel'],
      entrance: ['activity_provider', 'attraction', 'dmc'],
      activity: ['activity_provider', 'attraction', 'dmc'],
      meal: ['restaurant', 'dmc', 'ground_handler'],
      cruise: ['cruise', 'cruise_line'],
      tips: ['dmc', 'ground_handler'],
      supplies: ['dmc', 'ground_handler'],
      service_fee: ['dmc', 'ground_handler', 'tour_operator']
    }
    
    const relevantTypes = typeMapping[serviceType] || []
    if (relevantTypes.length === 0) return suppliers
    
    return suppliers.filter(s => relevantTypes.includes(s.type))
  }

  // Memoized per-service-type supplier split for the dropdown. The unmemoized
  // version filtered the full supplier list four times per service row on every
  // render (O(suppliers²) per keystroke while editing a service).
  const supplierOptionsByType = useMemo(() => {
    const cache = new Map<string, { recommended: Supplier[]; others: Supplier[] }>()
    return (serviceType: string) => {
      let entry = cache.get(serviceType)
      if (!entry) {
        const recommended = getSuppliersForServiceType(serviceType)
        const recommendedIds = new Set(recommended.map(s => s.id))
        entry = { recommended, others: suppliers.filter(s => !recommendedIds.has(s.id)) }
        cache.set(serviceType, entry)
      }
      return entry
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers])

  /** The programme this trip is linked to, for the length check below. */
  const linkedProgramme = useMemo(
    () => programmes.find(p => p.id === itinerary?.template_id) ?? null,
    [programmes, itinerary?.template_id]
  )

  const checkExistingInvoice = async () => {
    try {
      const response = await fetch(`/api/invoices?itineraryId=${itineraryId}`)
      if (response.ok) {
        const invoices = await response.json()
        if (invoices && invoices.length > 0) {
          setExistingInvoice({ id: invoices[0].id, invoice_number: invoices[0].invoice_number })
        }
      }
    } catch (error) {
      console.error('Error checking existing invoice:', error)
    }
  }

  const updateStatus = async (newStatus: string) => {
    if (!itinerary) return
    setUpdatingStatus(true)

    try {
      // Use API endpoint to trigger auto-booking creation when status changes to "confirmed"
      const response = await fetch(`/api/itineraries/${itineraryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update status')
      }

      setItinerary({ ...itinerary, status: newStatus })
    } catch (error) {
      console.error('Error updating status:', error)
      await dialog.alert(tCommon('error'), t('failedToUpdateStatus'), 'warning')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Load invoice on mount
  useEffect(() => {
    if (itineraryId) {
      checkExistingInvoice()
    }
  }, [itineraryId])

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
    setDays(prev => prev.map(day => day.id === dayId ? { ...day, ...updates } : day))
  }

  const updateDayService = (dayId: string, service: keyof DayService, value: boolean) => {
    setDays(prev => prev.map(day =>
      day.id === dayId ? { ...day, services: { ...day.services, [service]: value } } : day
    ))
  }

  // Toggle guide for ALL days at once
  const setGuideForAllDays = (includeGuide: boolean) => {
    setDays(prev => prev.map(day => ({
      ...day,
      services: { ...day.services, guide: includeGuide }
    })))
  }

  // Determine current guide status: true if ALL days include guide
  const allDaysHaveGuide = days.length > 0 && days.every(d => d.services.guide)
  const noDaysHaveGuide = days.length > 0 && days.every(d => !d.services.guide)

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
      title: t('newDay'),
      city: lastDay?.city || 'Cairo',
      description: '',
      overnight_city: lastDay?.city || 'Cairo',
      attractions: [],
      services: { guide: true, lunch: true, dinner: false, hotel: true, water: true, tips: true }
    }
    setDays([...days, newDay])
    setExpandedDays(new Set([...expandedDays, newDay.id]))
    if (itinerary) setItinerary({ ...itinerary, total_days: days.length + 1 })
  }

  const removeDay = (dayId: string) => {
    const newDays = days.filter(d => d.id !== dayId)
    newDays.forEach((day, index) => { day.day_number = index + 1 })
    setDays(newDays)
    if (itinerary) setItinerary({ ...itinerary, total_days: newDays.length })
  }

  // ============================================
  // SERVICE MANAGEMENT
  // ============================================

  const updateService = (serviceId: string, updates: Partial<ItineraryService>) => {
    setServices(prev => prev.map(s => s.id === serviceId ? { ...s, ...updates } : s))
    setServicesChanged(true)
  }

  const addNewService = (dayId: string, dayNumber: number) => {
    const newService: ItineraryService = {
      id: generateId(),
      itinerary_day_id: dayId,
      day_number: dayNumber,
      service_type: 'activity',
      service_name: t('newService'),
      supplier_id: null,
      supplier_name: null,
      sold_by_supplier_id: null,
      quantity: 1,
      rate_eur: 0,
      rate_non_eur: 0,
      total_cost: 0,
      notes: '',
      isNew: true
    }
    setServices([...services, newService])
    setEditingServiceId(newService.id)
    setServicesChanged(true)
  }

  const deleteService = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId)
    if (service?.isNew) {
      // If it's a new service that hasn't been saved, just remove it
      setServices(services.filter(s => s.id !== serviceId))
    } else {
      // Mark existing service as deleted
      setServices(prev => prev.map(s => s.id === serviceId ? { ...s, isDeleted: true } : s))
    }
    setServicesChanged(true)
  }

  const calculateServiceTotal = (service: ItineraryService) => {
    const rate = service.rate_non_eur || service.rate_eur || 0
    return service.quantity * rate
  }

  // ============================================
  // DRAG AND DROP
  // ============================================

  const handleDragStart = (dayId: string) => setDraggedDay(dayId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

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
    newDays.forEach((day, index) => { day.day_number = index + 1 })
    setDays(newDays)
    setDraggedDay(null)
  }

  // ============================================
  // SAVE & CALCULATE
  // ============================================

  const saveDraft = async (): Promise<boolean> => {
    if (!itinerary) return false
    setSaving(true)

    try {
      console.log('💾 Saving draft...')

      // 1. Update itinerary metadata.
      // Column semantics (must match generate-itinerary): supplier_cost =
      // what we pay suppliers (Σ service total_cost); total_cost = the
      // CLIENT price (supplier + margin). This save previously wrote the
      // supplier sum into total_cost, so a B2C quote or invoice created
      // after an edit-save either double-margined or billed cost with no
      // margin depending on which writer ran last.
      const supplierCost = services
        .filter(s => !s.isDeleted)
        .reduce((sum, s) => sum + (s.total_cost || 0), 0)
      const marginPct = Number(itinerary.margin_percent) || 0
      const clientTotal = Math.round(supplierCost * (1 + marginPct / 100) * 100) / 100

      const { error: itinError } = await supabase
        .from('itineraries')
        .update({
          trip_name: itinerary.trip_name,
          tier: itinerary.tier,
          package_type: itinerary.package_type,
          total_days: days.length,
          total_cost: clientTotal,
          supplier_cost: supplierCost,
          profit: clientTotal - supplierCost,
          status: itinerary.status, // Preserve the current status
          cabin_allocation: itinerary.cabin_allocation || null,
          template_id: itinerary.template_id || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', itineraryId)

      if (itinError) throw itinError
      // Keep local state in sync so the invoice button bills the fresh client total
      setItinerary(prev => prev ? { ...prev, total_cost: clientTotal, supplier_cost: supplierCost } : prev)
      console.log('✅ Itinerary updated')

      // 2. Save the days — batched. This save used to make one round trip per
      // row, from the BROWSER, so its latency scaled with the size of the trip:
      // a 12-day, 40-service save was 50+ sequential round trips over the
      // internet. New days go in one bulk insert; updates carry different
      // payloads per row, so they run concurrently instead.
      const dayPayload = (day: (typeof days)[number]) => ({
        day_number: day.day_number,
        title: day.title,
        city: day.city,
        description: day.description,
        overnight_city: day.overnight_city,
        attractions: day.attractions || [],
        guide_required: day.services?.guide ?? true,
        lunch_included: day.services?.lunch ?? true,
        dinner_included: day.services?.dinner ?? false,
        hotel_included: day.services?.hotel ?? false,
        // B3 transport-rule flags (persisted by the
        // 20260623_itinerary_days_transport_meta migration).
        is_cruise_day: day.is_cruise_day ?? false,
        transport_type: day.transport_type ?? null,
        skip_arrival_checkin: day.skip_arrival_checkin ?? false,
        extras: day.extras ?? [],
      })

      const isRealUUID = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

      const newDays = days.filter(d => !isRealUUID(d.id))
      const existingDays = days.filter(d => isRealUUID(d.id))

      if (newDays.length > 0) {
        const { data: insertedDays, error: insertError } = await supabase
          .from('itinerary_days')
          .insert(newDays.map(d => ({ ...dayPayload(d), itinerary_id: itineraryId })))
          .select()

        if (insertError) throw insertError
        // Matched by day_number, not by array position: the services below
        // resolve their day ids through these objects, and a positional
        // mismatch would silently attach services to the wrong day.
        for (const day of newDays) {
          const inserted = insertedDays?.find(r => r.day_number === day.day_number)
          if (inserted) day.id = inserted.id
        }
        console.log(`✅ ${newDays.length} day(s) inserted`)
      }

      if (existingDays.length > 0) {
        const dayResults = await Promise.all(
          existingDays.map(day =>
            supabase.from('itinerary_days').update(dayPayload(day)).eq('id', day.id)
          )
        )
        const dayFailure = dayResults.find(r => r.error)
        if (dayFailure?.error) throw dayFailure.error
        console.log(`✅ ${existingDays.length} day(s) updated`)
      }

      // 3. Save services if changed
      if (servicesChanged) {
        console.log('💾 Saving services...', { activeLanguage, baseServiceDataKeys: Object.keys(baseServiceData) })
        
        // Delete services marked for deletion — one round trip, not one per row.
        const toDelete = services.filter(s => s.isDeleted && !s.isNew)
        if (toDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('itinerary_services')
            .delete()
            .in('id', toDelete.map(s => s.id))
          if (deleteError) console.error('Error deleting services:', deleteError)
          else console.log(`🗑️ Deleted ${toDelete.length} service(s)`)
        }

        // Insert new services in one batch. Row order in the insert is the
        // iteration order of `insertable`, and PostgREST returns inserted rows
        // in that same order — which is how each state object gets its new id
        // back. On a batch failure, fall back to row-by-row so one bad row
        // costs one service, as it always did.
        const toInsert = services.filter(s => s.isNew && !s.isDeleted)
        const insertable = toInsert
          .map(service => {
            const { isNew, isDeleted, day_number, ...serviceData } = service
            const day = days.find(d => d.day_number === day_number)
            return day ? { service, row: { ...serviceData, itinerary_day_id: day.id } } : null
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)

        if (insertable.length > 0) {
          let inserted: Array<Record<string, any>> | null = null
          const { data: bulk, error: bulkError } = await supabase
            .from('itinerary_services')
            .insert(insertable.map(x => x.row))
            .select()

          if (!bulkError) {
            inserted = bulk
          } else {
            console.error('Bulk service insert failed, retrying per row:', bulkError)
            inserted = []
            for (const { row } of insertable) {
              const { data: one, error } = await supabase
                .from('itinerary_services')
                .insert(row)
                .select()
                .single()
              if (error) console.error('Error inserting service:', error)
              inserted.push(one ?? null as never)
            }
          }

          const versionRows = []
          for (let i = 0; i < insertable.length; i++) {
            const newService = inserted?.[i]
            if (!newService) continue
            const { service, row } = insertable[i]
            service.id = newService.id
            service.isNew = false
            if (activeLanguage !== 'en') {
              versionRows.push({
                itinerary_service_id: newService.id,
                language: activeLanguage,
                service_name: row.service_name,
                notes: row.notes,
              })
            }
          }
          console.log(`✅ ${insertable.length} service(s) inserted`)

          if (versionRows.length > 0) {
            const { error: versionError } = await supabase
              .from('itinerary_service_versions')
              .insert(versionRows)
            if (versionError) console.error('Error creating service versions:', versionError)
            else console.log(`✅ ${versionRows.length} service version(s) created (${activeLanguage})`)
          }
        }

        // Update existing services
        const toUpdate = services.filter(s => !s.isNew && !s.isDeleted)

        // For non-English saves, fetch fresh base data from DB to avoid stale state
        let freshBaseData: Record<string, { service_name: string; notes: string }> = {}
        if (activeLanguage !== 'en' && toUpdate.length > 0) {
          const updateIds = toUpdate.map(s => s.id).filter(id => !id.startsWith('new-'))
          if (updateIds.length > 0) {
            const { data: baseRecords } = await supabase
              .from('itinerary_services')
              .select('id, service_name, notes')
              .in('id', updateIds)

            if (baseRecords) {
              for (const rec of baseRecords) {
                freshBaseData[rec.id] = { service_name: rec.service_name, notes: rec.notes || '' }
              }
            }
          }
          console.log('🌐 Fresh base data fetched for', Object.keys(freshBaseData).length, 'services, activeLanguage:', activeLanguage)
        }

        // Every update carries a different payload, so they cannot be one
        // statement — but nothing about them is sequential. They used to run
        // one after another, which is where most of a large save's wall-clock
        // went; the browser now issues them concurrently.
        if (activeLanguage !== 'en') {
          // One query answers "which versions already exist?" for the whole
          // save, instead of one SELECT per service.
          const { data: existingVersions } = await supabase
            .from('itinerary_service_versions')
            .select('id, itinerary_service_id')
            .in('itinerary_service_id', toUpdate.map(su => su.id).filter(vid => !vid.startsWith('new-')))
            .eq('language', activeLanguage)
          const versionIdByService = new Map(
            (existingVersions ?? []).map(v => [v.itinerary_service_id, v.id])
          )

          const versionInserts: Array<Record<string, unknown>> = []
          const updates: Array<PromiseLike<{ error: unknown }>> = []

          for (const service of toUpdate) {
            const { isNew, isDeleted, day_number, ...serviceData } = service
            const translatedName = serviceData.service_name
            const translatedNotes = serviceData.notes
            const base = freshBaseData[service.id]

            // Restore English values for main record so we don't overwrite them
            if (base) {
              serviceData.service_name = base.service_name
              serviceData.notes = base.notes
            }

            updates.push(
              supabase.from('itinerary_services').update(serviceData).eq('id', service.id)
            )

            const versionId = versionIdByService.get(service.id)
            if (versionId) {
              updates.push(
                supabase
                  .from('itinerary_service_versions')
                  .update({
                    service_name: translatedName,
                    notes: translatedNotes,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', versionId)
              )
            } else {
              versionInserts.push({
                itinerary_service_id: service.id,
                language: activeLanguage,
                service_name: translatedName,
                notes: translatedNotes,
              })
            }
          }

          const results = await Promise.all(updates)
          for (const r of results) if (r.error) console.error('Error updating service:', r.error)

          if (versionInserts.length > 0) {
            const { error: versionError } = await supabase
              .from('itinerary_service_versions')
              .insert(versionInserts)
            if (versionError) console.error('Error creating service versions:', versionError)
          }
          console.log(`✅ ${toUpdate.length} service(s) saved (${activeLanguage})`)
        } else {
          const results = await Promise.all(
            toUpdate.map(service => {
              const { isNew, isDeleted, day_number, ...serviceData } = service
              return supabase.from('itinerary_services').update(serviceData).eq('id', service.id)
            })
          )
          for (const r of results) if (r.error) console.error('Error updating service:', r.error)
          console.log(`✅ ${toUpdate.length} service(s) updated`)
        }

        // Clean up deleted services from state
        setServices(services.filter(s => !s.isDeleted))
        setServicesChanged(false)
      }

      console.log('🎉 Draft saved successfully!')
      return true

    } catch (error: any) {
      console.error('❌ Error saving draft:', error)
      await dialog.alert(tCommon('error'), t('failedToSave', { error: error.message || tCommon('unknownError') }), 'warning')
      return false
    } finally {
      setSaving(false)
    }
  }

  const calculatePricing = async () => {
    if (!itinerary) return
    setCalculating(true)

    try {
      console.log('💾 Saving before calculating...')
      const saveSuccess = await saveDraft()
      
      if (!saveSuccess) {
        await dialog.alert(tCommon('error'), t('failedToSaveDraft'), 'warning')
        setCalculating(false)
        return
      }

      // Pricing is now done in the pricing grid — the single source of truth.
      // The old calculate-pricing route (a parallel engine that read B2C tables
      // and fabricated a €15 entrance fallback) has been retired. Open the grid
      // loaded with this itinerary so the operator prices it against real rates.
      console.log('📊 Opening pricing grid for this itinerary...')
      router.push(`/pricing-grid?itinerary=${itineraryId}`)

    } catch (error: any) {
      console.error('❌ Error opening grid pricing:', error)
      await dialog.alert(tCommon('error'), t('failedToCalculatePricing', { error: error.message || tCommon('unknownError') }), 'warning')
    } finally {
      setCalculating(false)
    }
  }

  // ============================================
  // COMPUTED VALUES
  // ============================================

  // Memoized: this 2000+ line component re-renders on every keystroke in any
  // service field, so unmemoized derived values were recomputed each time.
  const citiesBreakdown = useMemo(() => days.reduce((acc, day) => {
    acc[day.city] = (acc[day.city] || 0) + 1
    return acc
  }, {} as Record<string, number>), [days])

  const totalAttractions = useMemo(() => days.reduce((sum, day) => sum + day.attractions.length, 0), [days])
  const totalLunches = useMemo(() => days.filter(d => d.services.lunch).length, [days])
  const totalDinners = useMemo(() => days.filter(d => d.services.dinner).length, [days])
  const totalHotelNights = useMemo(() => days.filter(d => d.services.hotel && d.overnight_city).length, [days])

  const filteredAttractions = useMemo(() => attractions.filter(a => {
    const matchesSearch = !attractionSearch || a.activity_name.toLowerCase().includes(attractionSearch.toLowerCase())
    const matchesCity = !attractionCityFilter || a.city === attractionCityFilter
    return matchesSearch && matchesCity
  }), [attractions, attractionSearch, attractionCityFilter])

  const servicesByDay = useMemo(() => {
    const byDayId = new Map<string, ItineraryService[]>()
    for (const s of services) {
      if (s.isDeleted) continue
      const list = byDayId.get(s.itinerary_day_id)
      if (list) list.push(s)
      else byDayId.set(s.itinerary_day_id, [s])
    }
    return days.map(day => ({ day, services: byDayId.get(day.id) || [] }))
  }, [days, services])

  const totalServicesCost = useMemo(() => services
    .filter(s => !s.isDeleted)
    .reduce((sum, s) => sum + (s.total_cost || 0), 0), [services])

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
        <p className="text-gray-500">{t('itineraryNotFound')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-5">
      {/* HEADER - Responsive design */}
      <div className="bg-white rounded-xl p-4 mb-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Left: Back, Status, Code, Client */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => router.push(`/itineraries/${itineraryId}`)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              title={t('backToView')}
            >
              <ArrowLeft size={18} className="text-gray-600" />
            </button>

            {/* Status Dropdown */}
            <select
              value={itinerary.status || 'draft'}
              onChange={(e) => updateStatus(e.target.value)}
              disabled={updatingStatus}
              title={tCommon('status')}
              aria-label={tCommon('status')}
              className={`px-2 py-1 rounded-md text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#647C47] flex-shrink-0 ${
                STATUS_OPTIONS.find(s => s.value === itinerary.status)?.color || 'bg-gray-100 text-gray-700'
              }`}
            >
              {STATUS_OPTIONS.map(status => (
                <option key={status.value} value={status.value}>{t(`status.${status.value}`)}</option>
              ))}
            </select>

            {/* Itinerary Code */}
            <h1 className="text-base lg:text-lg font-bold text-gray-900 whitespace-nowrap">{itinerary.itinerary_code}</h1>

            {/* Provenance: link back to the originating Copilot thread (Phase 1
                wires Concierge briefs; WhatsApp threads will populate the same
                column in a later phase). NULL for manually-created itineraries. */}
            {itinerary.thread_id && (
              <Link
                href={`/copilot?thread=${itinerary.thread_id}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs font-medium hover:bg-purple-200 transition-colors whitespace-nowrap"
                title={t('sourceConversation')}
              >
                <Sparkles className="w-3 h-3" />
                {t('sourceConversation')}
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}

            {/* Separator - hidden on small screens */}
            <span className="text-gray-300 hidden lg:inline">|</span>

            {/* Client Info - hidden on small screens, truncated on medium */}
            <span className="text-gray-600 text-sm hidden lg:inline truncate">
              {itinerary.client_name} • {t('daysCount', { count: days.length })} • {t('adultsCount', { count: itinerary.num_adults })}
              {itinerary.num_children > 0 && ` • ${t('childrenCount', { count: itinerary.num_children })}`}
            </span>
          </div>

          {/* Right: Action Buttons - wraps on smaller screens */}
          <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
            {/* View Mode Button */}
            <Link
              href={`/itineraries/${itineraryId}`}
              className="p-2 xl:px-3 xl:py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-1.5"
              title={tCommon('view')}
            >
              <Eye size={14} />
              <span className="hidden xl:inline">{tCommon('view')}</span>
            </Link>

            {/* Operational buttons - hidden when confirmed (use booking page instead) */}
            {itinerary.status !== 'confirmed' && (
              <>
                {/* Invoice Button */}
                {existingInvoice ? (
                  <Link
                    href={`/invoices/${existingInvoice.id}`}
                    className="p-2 xl:px-3 xl:py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1.5"
                    title={existingInvoice.invoice_number}
                  >
                    <Receipt size={14} />
                    <span className="hidden 2xl:inline">{existingInvoice.invoice_number}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const response = await fetch('/api/invoices', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          itinerary_id: itinerary.id,
                          client_name: itinerary.client_name,
                          client_email: itinerary.client_email,
                          line_items: [{
                            description: `${itinerary.trip_name} - ${itinerary.itinerary_code}`,
                            quantity: 1,
                            unit_price: itinerary.total_cost,
                            amount: itinerary.total_cost
                          }],
                          subtotal: itinerary.total_cost,
                          total_amount: itinerary.total_cost,
                          currency: itinerary.currency || 'EUR',
                          issue_date: todayLocal(),
                          due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                        })
                      })
                      if (response.ok) {
                        const invoice = await response.json()
                        router.push(`/invoices/${invoice.id}`)
                      }
                    }}
                    className="p-2 xl:px-3 xl:py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 flex items-center gap-1.5"
                    title={t('invoice')}
                  >
                    <Receipt size={14} />
                    <span className="hidden 2xl:inline">{t('invoice')}</span>
                  </button>
                )}

                {/* Documents Dropdown */}
                <GenerateDocumentsButton
                  itineraryId={itinerary.id}
                  itineraryCode={itinerary.itinerary_code}
                />

                {/* Contract Link */}
                <Link
                  href={`/documents/contract/${itinerary.id}`}
                  className="p-2 xl:px-3 xl:py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-1.5"
                  title={t('contract')}
                >
                  <FileText size={14} />
                  <span className="hidden 2xl:inline">{t('contract')}</span>
                </Link>

                {/* Add Expense */}
                <AddExpenseFromItinerary
                  itineraryId={itinerary.id}
                  itineraryCode={itinerary.itinerary_code}
                  clientName={itinerary.client_name}
                />
              </>
            )}

            {/* Calculate Pricing */}
            <button
              type="button"
              onClick={calculatePricing}
              disabled={calculating || saving}
              className="px-2.5 py-1.5 xl:px-3 bg-[#647C47] text-white rounded-lg text-sm font-semibold hover:bg-[#4a5c35] flex items-center gap-1.5 disabled:opacity-50"
            >
              <Calculator size={14} />
              <span className="hidden sm:inline">{calculating ? t('calculating') : t('calculate')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* BOOKING BANNER - shown when itinerary is confirmed */}
      {itinerary.status === 'confirmed' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-800">{t('confirmedBookingBanner.title')}</h3>
                <p className="text-sm text-green-600">{t('confirmedBookingBanner.description')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {itinerary.fx_frozen && (
                <span
                  className="text-xs text-green-700 bg-green-100 px-2.5 py-1.5 rounded-lg"
                  title={t('fxReprice.frozenHint')}
                >
                  {t('fxReprice.frozenAt', { date: new Date(itinerary.fx_frozen.frozen_at).toLocaleDateString() })}
                </span>
              )}
              {itinerary.fx_frozen && (
                <button
                  onClick={handleRepriceFx}
                  disabled={repricing}
                  className="px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 disabled:opacity-50"
                >
                  {repricing ? t('fxReprice.working') : t('fxReprice.button')}
                </button>
              )}
              <Link
                href={`/bookings?search=${encodeURIComponent(itinerary.itinerary_code)}`}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2"
              >
                {t('confirmedBookingBanner.goToBooking')}
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* WORKFLOW STATUS BAR */}
      <div className="bg-white rounded-xl p-4 mb-5 shadow-sm flex items-center gap-2">
        <div className="flex items-center gap-2 px-4 py-2 bg-[#e8ede3] rounded-full">
          <span className="w-6 h-6 bg-[#647C47] rounded-full flex items-center justify-center text-white text-xs font-bold">
            <Check size={14} />
          </span>
          <span className="text-sm font-semibold text-[#4a5c35]">{t('aiGenerated')}</span>
        </div>
        <div className="w-10 h-0.5 bg-[#647C47]"></div>
        <div className="flex items-center gap-2 px-4 py-2 bg-[#f4f7f1] rounded-full border-2 border-[#647C47]">
          <span className="w-6 h-6 bg-[#647C47] rounded-full flex items-center justify-center text-white text-xs font-bold">2</span>
          <span className="text-sm font-semibold text-[#647C47]">{t('editContent')}</span>
        </div>
        <div className="w-10 h-0.5 bg-gray-200"></div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
          <span className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
          <span className="text-sm font-medium text-gray-500">{t('calculatePricing')}</span>
        </div>
        <div className="w-10 h-0.5 bg-gray-200"></div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
          <span className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">4</span>
          <span className="text-sm font-medium text-gray-500">{t('downloadPDF')}</span>
        </div>
      </div>

      {/* PACKAGE TYPE SELECTOR */}
      <div className="bg-white rounded-xl p-5 mb-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('packageType')}</h3>
          <button
            onClick={() => setShowAdvancedPackages(!showAdvancedPackages)}
            className="text-sm text-gray-500 hover:text-[#647C47] flex items-center gap-1"
          >
            {showAdvancedPackages ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {showAdvancedPackages ? t('hide') : t('show')} {t('advancedOptions')}
          </button>
        </div>
        
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
                {t(`packageTypes.${pkg.id}.name`)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{t(`packageTypes.${pkg.id}.desc`)}</div>
            </button>
          ))}
        </div>
        
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
                  {t(`packageTypes.${pkg.id}.name`)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{t(`packageTypes.${pkg.id}.desc`)}</div>
              </button>
            ))}
          </div>
        )}

        {/* GUIDE TOGGLE */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900">{t('guideService') || 'Guide Service'}:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setGuideForAllDays(true)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  allDaysHaveGuide
                    ? 'bg-[#647C47] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-[#e8ede3] hover:text-[#4a5c35]'
                }`}
              >
                <UserCheck size={16} />
                {t('includeGuide') || 'Include Guide'}
              </button>
              <button
                onClick={() => setGuideForAllDays(false)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  noDaysHaveGuide
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'
                }`}
              >
                <UserX size={16} />
                {t('excludeGuide') || 'Exclude Guide'}
              </button>
            </div>
            {!allDaysHaveGuide && !noDaysHaveGuide && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">{t('mixedGuide') || 'Mixed (per-day)'}</span>
            )}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT - TWO COLUMNS */}
      <div className="grid grid-cols-[1fr_380px] gap-5">
        {/* LEFT COLUMN - Days Editor */}
        <div>
          {/* Trip Name */}
          <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              {t('tripName')}
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
            <h2 className="text-base font-semibold text-gray-900">{t('itineraryDays')}</h2>
            <span className="text-xs text-gray-500">💡 {t('dragToReorder')}</span>
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
                    placeholder={t('dayTitlePlaceholder')}
                  />
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${getCityColor(day.city).bg} ${getCityColor(day.city).text}`}>
                      📍 {day.city}
                    </span>
                    {day.flight_from && <span className="flex items-center gap-1"><Plane size={12} /> {t('from')} {day.flight_from}</span>}
                    {day.overnight_city && <span className="flex items-center gap-1"><Moon size={12} /> {day.overnight_city}</span>}
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
                  {expandedDays.has(day.id) ? t('collapse') : tCommon('edit')}
                </button>
              </div>

              {/* Day Content (Expanded) */}
              {expandedDays.has(day.id) && (
                <div className="p-5 border-t border-gray-200">
                  {/* City Selector */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                      {t('city')}
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
                      {t('description')}
                    </label>
                    <textarea
                      value={day.description}
                      onChange={(e) => updateDay(day.id, { description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#647C47] resize-y"
                      placeholder={t('describeDayPlaceholder')}
                    />
                  </div>

                  {/* Attractions */}
                  <div className="mb-4">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
                      {t('attractionsSites')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {day.attractions.map((attr, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#e8ede3] border border-[#b8c9a8] rounded-full text-sm text-[#4a5c35]"
                        >
                          <Ticket size={14} />
                          {attr}
                          <button onClick={() => removeAttraction(day.id, attr)} className="text-red-500 hover:text-red-700 ml-1">
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
                        {t('addAttraction')}
                      </button>
                    </div>
                  </div>

                  {/* Services Grid */}
                  <div className="grid grid-cols-6 gap-3 p-4 bg-gray-50 rounded-lg">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={day.services.guide} onChange={(e) => updateDayService(day.id, 'guide', e.target.checked)} className="w-4 h-4 accent-[#647C47]" />
                      <User size={14} /> {t('guide')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={day.services.lunch} onChange={(e) => updateDayService(day.id, 'lunch', e.target.checked)} className="w-4 h-4 accent-[#647C47]" />
                      <Utensils size={14} /> {t('lunch')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={day.services.dinner} onChange={(e) => updateDayService(day.id, 'dinner', e.target.checked)} className="w-4 h-4 accent-[#647C47]" />
                      <Wine size={14} /> {t('dinner')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={day.services.hotel} onChange={(e) => updateDayService(day.id, 'hotel', e.target.checked)} className="w-4 h-4 accent-[#647C47]" disabled={day.day_number === days.length} />
                      <Hotel size={14} /> {t('hotel')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed">
                      <input type="checkbox" checked disabled className="w-4 h-4" />
                      <Droplets size={14} /> {t('water')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-400 cursor-not-allowed">
                      <input type="checkbox" checked disabled className="w-4 h-4" />
                      <Banknote size={14} /> {t('tips')}
                    </label>
                  </div>

                  {/* Transport details (B3 per-day rule flags). Collapsed by */}
                  {/* default; opt in per day when a custom rule applies. */}
                  <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedTransportPanels(prev => {
                          const next = new Set(prev)
                          next.has(day.id) ? next.delete(day.id) : next.add(day.id)
                          return next
                        })
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm text-gray-700"
                    >
                      <span className="flex items-center gap-2">
                        <Car size={14} />
                        <span className="font-medium">Transport details</span>
                        {/* Quick summary of the flags that aren't default. */}
                        {(day.is_cruise_day || day.transport_type === 'flight' || day.skip_arrival_checkin || (day.extras && day.extras.length > 0)) && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-[#647C47]">
                            {day.is_cruise_day && <Ship size={12} />}
                            {day.transport_type === 'flight' && <Plane size={12} />}
                            {day.skip_arrival_checkin && <span className="text-[10px]">no-checkin</span>}
                            {day.extras && day.extras.length > 0 && <span className="text-[10px]">+{day.extras.length}</span>}
                          </span>
                        )}
                      </span>
                      <ChevronDown size={14} className={`transition-transform ${expandedTransportPanels.has(day.id) ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedTransportPanels.has(day.id) && (
                      <div className="p-3 space-y-3 text-sm">
                        {/* Cruise day */}
                        <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!day.is_cruise_day}
                            onChange={e => updateDay(day.id, { is_cruise_day: e.target.checked })}
                            className="w-4 h-4 accent-[#647C47]"
                          />
                          <Ship size={14} />
                          <span>Cruise day (cruise package covers ground transport)</span>
                        </label>
                        {/* Travel method — only relevant when the day involves a city change. */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">City change travel method</div>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name={`transport-type-${day.id}`}
                                checked={!day.transport_type || day.transport_type === 'ground'}
                                onChange={() => updateDay(day.id, { transport_type: 'ground' })}
                                className="w-3.5 h-3.5 accent-[#647C47]"
                              />
                              <Car size={12} /> Ground
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name={`transport-type-${day.id}`}
                                checked={day.transport_type === 'flight'}
                                onChange={() => updateDay(day.id, { transport_type: 'flight' })}
                                className="w-3.5 h-3.5 accent-[#647C47]"
                              />
                              <Plane size={12} /> Flight (= two airport transfers)
                            </label>
                          </div>
                        </div>
                        {/* Skip arrival check-in — only meaningful on the arrival day. */}
                        {day.day_number === 1 && (
                          <label className="flex items-center gap-2 text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!day.skip_arrival_checkin}
                              onChange={e => updateDay(day.id, { skip_arrival_checkin: e.target.checked })}
                              className="w-4 h-4 accent-[#647C47]"
                            />
                            <span>Skip hotel check-in (airport → tour → hotel as one bundled line)</span>
                          </label>
                        )}
                        {/* Extras — additive evening transfers. */}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Evening extras</div>
                          <div className="flex flex-wrap gap-3">
                            {(['sound_light', 'dinner_transfer', 'city_transfer'] as TransportExtra[]).map(extraType => {
                              const checked = !!day.extras?.includes(extraType)
                              return (
                                <label key={extraType} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      const current = day.extras || []
                                      const next = e.target.checked
                                        ? [...current, extraType]
                                        : current.filter(x => x !== extraType)
                                      updateDay(day.id, { extras: next })
                                    }}
                                    className="w-3.5 h-3.5 accent-[#647C47]"
                                  />
                                  <span className="text-xs">{extraType.replace(/_/g, ' ')}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {days.length > 1 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <button onClick={() => removeDay(day.id)} className="text-sm text-red-500 hover:text-red-700">
                        {t('removeThisDay')}
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
            className="w-full p-4 bg-white border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-[#647C47] hover:text-[#647C47] flex items-center justify-center gap-2 mb-5"
          >
            <Plus size={18} />
            {t('addAnotherDay')}
          </button>

          {/* ============================================ */}
          {/* SERVICES & PRICING SECTION */}
          {/* ============================================ */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowServicesSection(!showServicesSection)}
              className="w-full px-5 py-4 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
                  <DollarSign className="text-white" size={20} />
                </div>
                <div className="text-left">
                  <h3 className="text-base font-semibold text-gray-900">{t('servicesPricing')}</h3>
                  <p className="text-xs text-gray-500">
                    {t('servicesCountTotal', { count: services.filter(s => !s.isDeleted).length, currency: itinerary.currency, total: totalServicesCost.toFixed(2) })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {servicesChanged && (
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                    {t('unsavedChanges')}
                  </span>
                )}
                {showServicesSection ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </div>
            </button>

            {showServicesSection && (
              <div className="p-5">
                {services.filter(s => !s.isDeleted).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm mb-2">{t('noServicesAddedYet')}</p>
                    <p className="text-xs">{t('clickCalculatePricingHint')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {servicesByDay.map(({ day, services: dayServices }) => (
                      <div key={day.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 bg-[#647C47] rounded flex items-center justify-center text-white text-xs font-bold">
                              {day.day_number}
                            </span>
                            <span className="font-medium text-gray-900 text-sm">{day.title}</span>
                            <span className={`px-2 py-0.5 rounded text-xs ${getCityColor(day.city).bg} ${getCityColor(day.city).text}`}>
                              {day.city}
                            </span>
                          </div>
                          <button
                            onClick={() => addNewService(day.id, day.day_number)}
                            className="text-xs text-[#647C47] hover:text-[#4a5c35] font-medium flex items-center gap-1"
                          >
                            <Plus size={14} /> {t('addService')}
                          </button>
                        </div>

                        {dayServices.length > 0 ? (
                          <div className="divide-y divide-gray-100">
                            {dayServices.map(service => (
                              <div
                                key={service.id}
                                className={`px-4 py-3 ${
                                  editingServiceId === service.id ? 'bg-amber-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                {editingServiceId === service.id ? (
                                  // Edit Mode - Three rows for clear layout
                                  <div className="space-y-3">
                                    {/* Row 1: Type and Name */}
                                    <div className="flex items-center gap-2">
                                      <span className="text-lg w-8">{getServiceIcon(service.service_type)}</span>
                                      <select
                                        value={service.service_type}
                                        onChange={(e) => updateService(service.id, { service_type: e.target.value })}
                                        className="w-36 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#647C47]"
                                      >
                                        {SERVICE_TYPES.map(type => (
                                          <option key={type.value} value={type.value}>{t(`serviceTypes.${type.value}`)}</option>
                                        ))}
                                      </select>
                                      <input
                                        type="text"
                                        value={service.service_name}
                                        onChange={(e) => updateService(service.id, { service_name: e.target.value })}
                                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#647C47]"
                                        placeholder={t('serviceNamePlaceholder')}
                                      />
                                    </div>
                                    
                                    {/* Row 2: Rate Picker for rate-backed types, Supplier Dropdown for others */}
                                    <div className="flex items-center gap-2 pl-3">
                                      {RATE_TABLE_TYPES.has(service.service_type) ? (
                                        <>
                                          <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                                            📊 {t('selectRate')}:
                                          </label>
                                          <ServiceRatePicker
                                            serviceType={service.service_type as 'meal' | 'transportation' | 'guide' | 'entrance' | 'activity'}
                                            defaultCity={day.city}
                                            currentValue={service.service_name}
                                            paxCount={(itinerary?.num_adults || 1) + (itinerary?.num_children || 0)}
                                            onSelectRate={(rate) => {
                                              updateService(service.id, {
                                                service_name: rate.service_name,
                                                rate_eur: rate.rate_eur,
                                                rate_non_eur: rate.rate_non_eur,
                                                supplier_id: rate.supplier_id,
                                                supplier_name: rate.supplier_name,
                                                total_cost: service.quantity * (rate.rate_non_eur || rate.rate_eur || 0)
                                              })
                                            }}
                                          />
                                        </>
                                      ) : (
                                        <>
                                          <label className="text-xs font-medium text-gray-600 whitespace-nowrap">
                                            📦 {t('supplier')}:
                                          </label>
                                          <select
                                            value={service.supplier_id || ''}
                                            onChange={(e) => {
                                              const supplierId = e.target.value || null
                                              const supplier = suppliers.find(s => s.id === supplierId)
                                              updateService(service.id, {
                                                supplier_id: supplierId,
                                                supplier_name: supplier?.name || null
                                              })
                                            }}
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#647C47] bg-white"
                                          >
                                            <option value="">{t('noSupplierOptional')}</option>
                                            {supplierOptionsByType(service.service_type).recommended.length > 0 && (
                                              <optgroup label={t('recommendedFor', { type: service.service_type })}>
                                                {supplierOptionsByType(service.service_type).recommended.map(s => (
                                                  <option key={s.id} value={s.id}>
                                                    {s.name} {s.city ? `(${s.city})` : ''} - {s.type}
                                                  </option>
                                                ))}
                                              </optgroup>
                                            )}
                                            {supplierOptionsByType(service.service_type).others.length > 0 && (
                                              <optgroup label={t('allOtherSuppliers')}>
                                                {supplierOptionsByType(service.service_type).others.map(s => (
                                                  <option key={s.id} value={s.id}>
                                                    {s.name} {s.city ? `(${s.city})` : ''} - {s.type}
                                                  </option>
                                                ))}
                                              </optgroup>
                                            )}
                                          </select>
                                        </>
                                      )}
                                    </div>

                                    {/* Row 2b: Sold by — the guide who sold this, paid from our profit on it */}
                                    <div className="flex items-center gap-2 pl-3">
                                      <label className="text-xs font-medium text-gray-600 whitespace-nowrap" title={t('soldByHint')}>
                                        🧭 {t('soldBy')}:
                                      </label>
                                      <select
                                        value={service.sold_by_supplier_id || ''}
                                        onChange={(e) => updateService(service.id, { sold_by_supplier_id: e.target.value || null })}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#647C47] bg-white"
                                      >
                                        <option value="">{t('soldByNone')}</option>
                                        {suppliers
                                          .filter(sp => sp.type === 'guide' || (sp.types || []).includes('guide'))
                                          .map(sp => (
                                            <option key={sp.id} value={sp.id}>{sp.name}{sp.city ? ` (${sp.city})` : ''}</option>
                                          ))}
                                      </select>
                                    </div>

                                    {/* Row 3: Qty, Rate, Total, Actions */}
                                    <div className="flex items-center gap-3 pl-3">
                                      <div className="flex items-center gap-1">
                                        <label className="text-xs text-gray-500">{t('qty')}:</label>
                                        <input
                                          type="number"
                                          value={service.quantity}
                                          onChange={(e) => {
                                            const qty = parseInt(e.target.value) || 1
                                            const total = qty * (service.rate_non_eur || service.rate_eur || 0)
                                            updateService(service.id, { quantity: qty, total_cost: total })
                                          }}
                                          className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:border-[#647C47]"
                                          min="1"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <label className="text-xs text-gray-500">{t('rate')}:</label>
                                        <input
                                          type="number"
                                          value={service.rate_non_eur || service.rate_eur || 0}
                                          onChange={(e) => {
                                            const rate = parseFloat(e.target.value) || 0
                                            updateService(service.id, { 
                                              rate_non_eur: rate, 
                                              rate_eur: rate,
                                              total_cost: service.quantity * rate 
                                            })
                                          }}
                                          className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:border-[#647C47]"
                                          step="0.01"
                                          placeholder="0.00"
                                        />
                                      </div>
                                      <div className="flex-1"></div>
                                      <div className="text-right">
                                        <div className="font-semibold text-gray-900 text-lg">
                                          {itinerary.currency} {service.total_cost?.toFixed(2) || '0.00'}
                                        </div>
                                        {/* Show original supplier cost when currency differs */}
                                        {service.supplier_currency && service.supplier_currency !== itinerary.currency && service.supplier_cost_original != null && (
                                          <p className="text-[10px] text-gray-400">
                                            {service.supplier_currency} {service.supplier_cost_original.toFixed(2)} @ {service.exchange_rate_used?.toFixed(2) || '—'}
                                          </p>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => setEditingServiceId(null)}
                                        className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 flex items-center gap-1"
                                        title={t('doneEditing')}
                                      >
                                        <Check size={14} /> {t('done')}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  // View Mode
                                  <div className="flex items-center gap-3">
                                    <span className="text-lg">{getServiceIcon(service.service_type)}</span>
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                                      <p className="text-xs text-gray-500">
                                        <span className="capitalize">{service.service_type.replace('_', ' ')}</span>
                                        {service.quantity > 1 && ` • ${t('qty')}: ${service.quantity}`}
                                        {service.supplier_name && (
                                          <span className="ml-2 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">
                                            📦 {service.supplier_name}
                                          </span>
                                        )}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <span className="text-sm font-semibold text-gray-900">
                                          {itinerary.currency} {service.total_cost?.toFixed(2) || '0.00'}
                                        </span>
                                        {/* Show original supplier cost when currency differs */}
                                        {service.supplier_currency && service.supplier_currency !== itinerary.currency && service.supplier_cost_original != null && (
                                          <p className="text-[10px] text-gray-400" title={`Exchange rate: ${service.exchange_rate_used?.toFixed(4) || 'N/A'}`}>
                                            {service.supplier_currency} {service.supplier_cost_original.toFixed(2)} @ {service.exchange_rate_used?.toFixed(2) || '—'}
                                          </p>
                                        )}
                                      </div>
                                      <button
                                        onClick={() => setEditingServiceId(service.id)}
                                        className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded"
                                        title={tCommon('edit')}
                                      >
                                        <Edit3 size={14} />
                                      </button>
                                      <button
                                        onClick={() => deleteService(service.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                        title={tCommon('delete')}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-6 text-center text-gray-400 text-sm">
                            {t('noServicesForThisDay')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Total Cost Bar */}
                <div className="mt-5 p-4 bg-[#e8ede3] rounded-lg flex items-center justify-between">
                  <span className="font-semibold text-[#4a5c35]">{t('totalCost')}</span>
                  <span className="text-xl font-bold text-[#4a5c35]">
                    {itinerary.currency} {totalServicesCost.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - Summary & Actions */}
        <div>
          {/* Trip Summary */}
          <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('tripSummary')}</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('duration')}</span>
                <span className="font-semibold text-gray-900">{t('daysCount', { count: days.length })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('travelers')}</span>
                <span className="font-semibold text-gray-900">
                  {t('adultsCount', { count: itinerary.num_adults })}
                  {itinerary.num_children > 0 && `, ${t('childrenCount', { count: itinerary.num_children })}`}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('tier')}</span>
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
                <span className="text-gray-500">{t('package')}</span>
                <span className="font-semibold text-gray-900">
                  {PACKAGE_TYPES.find(p => p.id === itinerary.package_type) ? t(`packageTypes.${itinerary.package_type}.name`) : t('packageTypes.land-package.name')}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('startDate')}</span>
                <span className="font-semibold text-gray-900">{itinerary.start_date}</span>
              </div>
            </div>

            {/* Cities Breakdown */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-3">
                {t('citiesInvolved')}
              </label>
              {Object.entries(citiesBreakdown).map(([city, count]) => (
                <div key={city} className="flex items-center justify-between py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${getCityColor(city).dot}`}></span>
                    {city}
                  </span>
                  <span className="text-gray-500">{t('daysCount', { count })}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PROGRAMME LINK — what the customer's 日程表 is generated from */}
          <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('programme')}</h3>
            <p className="text-xs text-gray-500 mb-3">{t('programmeHint')}</p>
            <select
              value={itinerary.template_id || ''}
              onChange={(e) => setItinerary({ ...itinerary, template_id: e.target.value || null })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#647C47]"
            >
              <option value="">{t('programmeNone')}</option>
              {programmes.map(p => (
                <option key={p.id} value={p.id}>
                  {p.template_code}
                  {p.duration_days ? ` — ${t('daysCount', { count: p.duration_days })}` : ''}
                </option>
              ))}
            </select>

            {/* A programme of a different length produces a document whose day
                rows do not match the trip that was sold. Worth saying out loud
                rather than discovering on the customer's copy. */}
            {linkedProgramme?.duration_days != null && linkedProgramme.duration_days !== days.length && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t('programmeLengthMismatch', {
                  programmeDays: linkedProgramme.duration_days,
                  tripDays: days.length,
                })}
              </p>
            )}

            {itinerary.template_id ? (
              <a
                href={`/api/documents/program-itinerary?itinerary_id=${itineraryId}&format=html`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm text-[#647C47] hover:text-[#4a5c35] font-medium"
              >
                <FileText size={14} />
                {t('programmePreview')}
              </a>
            ) : (
              <p className="mt-3 text-xs text-gray-500">{t('programmeUnlinkedNote')}</p>
            )}
          </div>

          {/* Route Map */}
          {days.length > 0 && (
            <ItineraryMap
              days={days.map((d) => ({
                day_number: d.day_number,
                title: d.title,
                city: d.city,
                overnight_city: d.overnight_city,
              }))}
              defaultExpanded={true}
              height={300}
            />
          )}

          {/* Cabin Allocation (for cruise packages) */}
          {itinerary.cabin_allocation && itinerary.cabin_allocation.length > 0 && (
            <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <span>🛏️</span> Cabin Allocation
              </h3>
              <div className="space-y-2">
                {itinerary.cabin_allocation.map((cabin, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 px-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-blue-800 capitalize">
                        {cabin.count}× {cabin.type}
                      </span>
                      <span className="text-xs text-blue-600">
                        ({cabin.pax} pax)
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-blue-800">
                        ${cabin.ratePerPersonPerNight}/pp/night
                      </div>
                      <div className="text-xs text-blue-600">
                        ${cabin.costPerNight}/night total
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-gray-200 mt-2">
                  <span className="text-xs font-semibold text-gray-600">Total per night</span>
                  <span className="text-sm font-bold text-gray-900">
                    ${itinerary.cabin_allocation.reduce((sum, c) => sum + c.costPerNight, 0).toFixed(2)}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 mt-3">
                Auto-selected cheapest option. Recalculate pricing to update cabin allocation.
              </p>
            </div>
          )}

          {/* Action Box */}
          <div className="bg-[#f4f7f1] rounded-xl p-5 border border-[#b8c9a8]">
            <p className="text-sm text-[#4a5c35] mb-4">
              ✨ {t('editContentHint')}
            </p>
            <button
              onClick={saveDraft}
              disabled={saving || calculating}
              className="w-full py-3 bg-[#647C47] text-white rounded-lg text-sm font-semibold hover:bg-[#4a5c35] mb-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? t('saving') : t('saveChanges')}
            </button>
            <button
              onClick={calculatePricing}
              disabled={calculating || saving}
              className="w-full py-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Calculator size={16} />
              {calculating ? t('calculating') : t('recalculateFromRates')}
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
              {t('recalculatingHint')}
            </p>
          </div>

          {/* Tips */}
          <div className="mt-4 p-4 bg-[#e8ede3] rounded-lg border border-[#b8c9a8]">
            <h4 className="text-sm font-semibold text-[#4a5c35] mb-2">💡 {t('tips')}</h4>
            <ul className="text-xs text-[#647C47] space-y-1.5 list-disc pl-4">
              <li>{t('tip1')}</li>
              <li>{t('tip2')}</li>
              <li>{t('tip3')}</li>
              <li>{t('tip4')}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ATTRACTION PICKER MODAL */}
      {showAttractionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAttractionModal(false)}>
          <div className="bg-white rounded-2xl w-[550px] max-h-[80vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{t('addAttraction')}</h3>
              <button onClick={() => setShowAttractionModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder={t('searchAttractionsPlaceholder')}
                  value={attractionSearch}
                  onChange={(e) => setAttractionSearch(e.target.value)}
                  className="w-full pl-3 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#647C47]"
                />
              </div>
              
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => setAttractionCityFilter(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    !attractionCityFilter ? 'bg-[#647C47] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#647C47]'
                  }`}
                >
                  {t('allCities')}
                </button>
                {[...new Set(attractions.map(a => a.city))].map(city => (
                  <button
                    key={city}
                    onClick={() => setAttractionCityFilter(city)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      attractionCityFilter === city ? 'bg-[#647C47] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[#647C47]'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

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
                        isAdded ? 'border-green-300 bg-green-50 cursor-default' : 'border-gray-200 hover:border-[#b8c9a8] hover:bg-[#f4f7f1] cursor-pointer'
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                          {attr.activity_name}
                          {isAdded && <Check size={14} className="inline text-green-600" />}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            attr.source === 'entrance' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {attr.source === 'entrance' ? t('entranceFee') : t('activity')}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">📍 {attr.city}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-[#647C47]">{rateSymbol}{attr.base_rate_eur} / {rateSymbol}{attr.base_rate_non_eur}</div>
                        <div className="text-[11px] text-gray-500">{t('eurNonEur')}</div>
                      </div>
                    </div>
                  )
                })}
                {filteredAttractions.length === 0 && <p className="text-center text-gray-500 py-8">{t('noAttractionsFound')}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}