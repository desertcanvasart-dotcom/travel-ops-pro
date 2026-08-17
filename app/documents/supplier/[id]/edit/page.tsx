'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Plus, X, MapPin, Ticket, Calculator, Building2, Route, Utensils, UserCheck } from 'lucide-react'

interface TransportRate {
  id: string
  service_code: string
  route_name: string
  service_type: string
  city: string | null
  origin_city: string | null
  destination_city: string | null
  area: string | null
  duration: string | null
  sedan_rate_eur: number | null
  minivan_rate_eur: number | null
  van_rate_eur: number | null
  minibus_rate_eur: number | null
  bus_rate_eur: number | null
  includes: string | null
  supplier_name: string | null
}

interface SelectedRoute {
  rate_id: string
  service_code: string
  route_name: string
  service_type: string
  city: string
  quantity: number
  unit_rate: number
  total_cost: number
}

interface MealRate {
  id: string
  service_code: string
  restaurant_name: string
  meal_type: string | null
  cuisine_type: string | null
  city: string | null
  base_rate_eur: number
  base_rate_non_eur: number
  tier: string | null
  supplier_name: string | null
  notes: string | null
}

interface SelectedMeal {
  rate_id: string
  service_code: string
  restaurant_name: string
  meal_type: string
  city: string
  quantity: number
  unit_rate: number
  total_cost: number
}

interface GuideRate {
  id: string
  service_code: string
  guide_language: string
  guide_type: string
  city: string | null
  tour_duration: string
  base_rate_eur: number
  base_rate_non_eur: number
  season: string | null
  supplier_id: string | null
  notes: string | null
}

interface SelectedGuide {
  rate_id: string
  service_code: string
  guide_language: string
  guide_type: string
  tour_duration: string
  city: string
  quantity: number
  unit_rate: number
  total_cost: number
}

interface EntranceFee {
  id: string
  attraction_name: string
  city: string
  eur_rate: number
  non_eur_rate: number
  is_addon: boolean
  addon_note?: string
}

interface SelectedAttraction {
  id: string
  attraction_name: string
  city: string
  eur_rate: number
  non_eur_rate: number
  quantity: number
}

interface Supplier {
  id: string
  name: string
  type: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  whatsapp?: string
  address?: string
  city?: string
  country?: string
}

export default function EditSupplierDocumentPage() {
  const t = useTranslations('supplierDocumentEdit')
  const params = useParams()
  const router = useRouter()
  const [document, setDocument] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)

  // Entrance fees state
  const [entranceFees, setEntranceFees] = useState<EntranceFee[]>([])
  const [selectedAttractions, setSelectedAttractions] = useState<SelectedAttraction[]>([])
  const [loadingFees, setLoadingFees] = useState(false)
  const [showAttractionPicker, setShowAttractionPicker] = useState(false)
  const [attractionSearch, setAttractionSearch] = useState('')
  const [selectedCity, setSelectedCity] = useState('')

  // Transport routes state
  const [transportRates, setTransportRates] = useState<TransportRate[]>([])
  const [selectedRoutes, setSelectedRoutes] = useState<SelectedRoute[]>([])
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [routeSearch, setRouteSearch] = useState('')
  const [routeCityFilter, setRouteCityFilter] = useState('')

  // Meal rates state
  const [mealRates, setMealRates] = useState<MealRate[]>([])
  const [selectedMeals, setSelectedMeals] = useState<SelectedMeal[]>([])
  const [loadingMeals, setLoadingMeals] = useState(false)
  const [mealSearch, setMealSearch] = useState('')
  const [mealCityFilter, setMealCityFilter] = useState('')

  // Guide rates state
  const [guideRates, setGuideRates] = useState<GuideRate[]>([])
  const [selectedGuides, setSelectedGuides] = useState<SelectedGuide[]>([])
  const [loadingGuides, setLoadingGuides] = useState(false)
  const [guideSearch, setGuideSearch] = useState('')
  const [guideCityFilter, setGuideCityFilter] = useState('')

  useEffect(() => {
    fetchDocument()
    fetchEntranceFees()
    fetchSuppliers()
  }, [params.id])

  const fetchDocument = async () => {
    try {
      const response = await fetch(`/api/supplier-documents/${params.id}`)
      const result = await response.json()
      if (result.success) {
        setDocument(result.data)
        // Load existing selected attractions if present
        if (result.data.selected_attractions) {
          setSelectedAttractions(result.data.selected_attractions)
        }
        // Load existing selected routes if present
        if (result.data.selected_routes) {
          setSelectedRoutes(result.data.selected_routes)
        }
        // Load existing selected meals if present
        if (result.data.selected_meals) {
          setSelectedMeals(result.data.selected_meals)
        }
        // Load existing selected guides if present
        if (result.data.selected_guides) {
          setSelectedGuides(result.data.selected_guides)
        }
        // Fetch transport rates if this is a transport voucher
        if (result.data.document_type === 'transport_voucher') {
          fetchTransportRates()
        }
        // Fetch meal rates if this is a service order
        if (result.data.document_type === 'service_order') {
          fetchMealRates()
        }
        // Fetch guide rates if this is a guide assignment
        if (result.data.document_type === 'guide_assignment') {
          fetchGuideRates()
        }
      } else {
        setError(t('documentNotFound'))
      }
    } catch (err) {
      setError(t('errorLoadingDocument'))
    } finally {
      setLoading(false)
    }
  }

  const fetchTransportRates = async () => {
    setLoadingRoutes(true)
    try {
      const response = await fetch('/api/resources/transportation?activeOnly=true')
      const data = await response.json()
      if (Array.isArray(data)) {
        setTransportRates(data.map((r: any) => ({
          id: r.id,
          service_code: r.service_code,
          route_name: r.route_name || r.service_code,
          service_type: r.service_type,
          city: r.city,
          origin_city: r.origin_city,
          destination_city: r.destination_city,
          area: r.area,
          duration: r.duration,
          sedan_rate_eur: r.sedan_rate_eur,
          minivan_rate_eur: r.minivan_rate_eur,
          van_rate_eur: r.van_rate_eur,
          minibus_rate_eur: r.minibus_rate_eur,
          bus_rate_eur: r.bus_rate_eur,
          includes: r.includes,
          supplier_name: r.supplier_name || r.supplier?.name || null
        })))
      }
    } catch (err) {
      console.error('Error fetching transport rates:', err)
    } finally {
      setLoadingRoutes(false)
    }
  }

  const fetchMealRates = async () => {
    setLoadingMeals(true)
    try {
      const response = await fetch('/api/rates/meals?active_only=true')
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setMealRates(result.data.map((r: any) => ({
          id: r.id,
          service_code: r.service_code || '',
          restaurant_name: r.restaurant_name,
          meal_type: r.meal_type,
          cuisine_type: r.cuisine_type,
          city: r.city,
          base_rate_eur: r.base_rate_eur || 0,
          base_rate_non_eur: r.base_rate_non_eur || 0,
          tier: r.tier,
          supplier_name: r.supplier_name,
          notes: r.notes
        })))
      }
    } catch (err) {
      console.error('Error fetching meal rates:', err)
    } finally {
      setLoadingMeals(false)
    }
  }

  const fetchGuideRates = async () => {
    setLoadingGuides(true)
    try {
      const response = await fetch('/api/rates/guides?active_only=true')
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setGuideRates(result.data.map((r: any) => ({
          id: r.id,
          service_code: r.service_code || '',
          guide_language: r.guide_language,
          guide_type: r.guide_type,
          city: r.city,
          tour_duration: r.tour_duration,
          base_rate_eur: r.base_rate_eur || 0,
          base_rate_non_eur: r.base_rate_non_eur || 0,
          season: r.season,
          supplier_id: r.supplier_id,
          notes: r.notes
        })))
      }
    } catch (err) {
      console.error('Error fetching guide rates:', err)
    } finally {
      setLoadingGuides(false)
    }
  }

  const fetchEntranceFees = async () => {
    setLoadingFees(true)
    try {
      const response = await fetch('/api/rates/attractions?active_only=true')
      const result = await response.json()
      if (result.success) {
        setEntranceFees(result.data || [])
      }
    } catch (err) {
      console.error('Error fetching entrance fees:', err)
    } finally {
      setLoadingFees(false)
    }
  }

  const fetchSuppliers = async () => {
    setLoadingSuppliers(true)
    try {
      const response = await fetch('/api/suppliers')
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setSuppliers(result.data)
      }
    } catch (err) {
      console.error('Error fetching suppliers:', err)
    } finally {
      setLoadingSuppliers(false)
    }
  }

  // Get relevant suppliers based on document type
  const getRelevantSuppliers = () => {
    if (!document) return suppliers

    const typeMapping: Record<string, string[]> = {
      transport_voucher: ['transport', 'local_operator', 'driver', 'dmc', 'ground_handler'],
      hotel_voucher: ['hotel', 'hotel_chain'],
      cruise_voucher: ['cruise', 'cruise_line'],
      guide_assignment: ['guide', 'dmc', 'ground_handler'],
      service_order: ['restaurant', 'activity_provider', 'attraction', 'dmc', 'ground_handler', 'tour_operator'],
      activity_voucher: ['activity_provider', 'attraction', 'dmc']
    }

    const relevantTypes = typeMapping[document.document_type] || []
    if (relevantTypes.length === 0) return suppliers

    return suppliers.filter(s => relevantTypes.includes(s.type))
  }

  // Handle supplier selection and auto-populate fields
  const handleSupplierSelect = (supplierId: string) => {
    if (!supplierId) {
      // Clear supplier fields if "No supplier" is selected
      setDocument({
        ...document,
        supplier_id: null,
        supplier_name: '',
        supplier_contact_name: '',
        supplier_contact_email: '',
        supplier_contact_phone: '',
        supplier_whatsapp: '',
        supplier_address: ''
      })
      return
    }

    const supplier = suppliers.find(s => s.id === supplierId)
    if (supplier) {
      const address = [supplier.address, supplier.city, supplier.country]
        .filter(Boolean)
        .join(', ')

      setDocument({
        ...document,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_contact_name: supplier.contact_name || '',
        supplier_contact_email: supplier.contact_email || '',
        supplier_contact_phone: supplier.contact_phone || '',
        supplier_whatsapp: supplier.whatsapp || '',
        supplier_address: address
      })
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      // Only send editable fields — exclude joined relations and read-only fields
      const {
        id: _id,
        itinerary: _itinerary,
        supplier: _supplier,
        created_at: _created,
        ...editableFields
      } = document

      const dataToSave: Record<string, any> = {
        ...editableFields,
        selected_attractions: selectedAttractions,
      }

      // Build services array based on document type
      if (document.document_type === 'transport_voucher' && selectedRoutes.length > 0) {
        dataToSave.selected_routes = selectedRoutes
        dataToSave.services = selectedRoutes.map(r => ({
          service_type: 'transportation',
          service_name: r.route_name,
          service_code: r.service_code,
          city: r.city,
          vehicle_type: document.vehicle_type,
          quantity: r.quantity,
          total_cost: r.total_cost,
          unit_rate: r.unit_rate
        }))
      } else if (document.document_type === 'service_order' && selectedMeals.length > 0) {
        dataToSave.selected_meals = selectedMeals
        dataToSave.services = selectedMeals.map(m => ({
          service_type: 'meal',
          service_name: `${m.restaurant_name}${m.meal_type ? ` - ${m.meal_type}` : ''}`,
          service_code: m.service_code,
          city: m.city,
          quantity: m.quantity,
          total_cost: m.total_cost,
          unit_rate: m.unit_rate
        }))
      } else if (document.document_type === 'guide_assignment' && selectedGuides.length > 0) {
        dataToSave.selected_guides = selectedGuides
        dataToSave.services = selectedGuides.map(g => ({
          service_type: 'guide',
          service_name: `${g.guide_language} ${GUIDE_TYPE_LABELS[g.guide_type] || g.guide_type} — ${DURATION_LABELS[g.tour_duration] || g.tour_duration}`,
          service_code: g.service_code,
          city: g.city,
          quantity: g.quantity,
          total_cost: g.total_cost,
          unit_rate: g.unit_rate
        }))
      } else {
        // Default: entrance fee services for activity_voucher
        dataToSave.services = selectedAttractions.map(a => ({
          service_name: a.attraction_name,
          service_type: 'entrance_fee',
          quantity: a.quantity,
          unit_price: a.eur_rate,
          total_price: a.eur_rate * a.quantity
        }))
      }

      const response = await fetch(`/api/supplier-documents/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      })

      if (response.ok) {
        router.push(`/documents/supplier/${params.id}`)
      } else {
        const errorData = await response.json().catch(() => null)
        console.error('Save error:', errorData)
        setError(errorData?.error || t('failedToSave'))
      }
    } catch (err) {
      console.error('Save exception:', err)
      setError(t('errorSavingDocument'))
    } finally {
      setSaving(false)
    }
  }

  // Add attraction to selected list
  const addAttraction = (fee: EntranceFee) => {
    // Check if already selected
    if (selectedAttractions.find(a => a.id === fee.id)) {
      return
    }
    
    const newAttraction: SelectedAttraction = {
      id: fee.id,
      attraction_name: fee.attraction_name,
      city: fee.city,
      eur_rate: fee.eur_rate,
      non_eur_rate: fee.non_eur_rate,
      quantity: document?.num_adults + (document?.num_children || 0) || 1
    }
    
    setSelectedAttractions(prev => [...prev, newAttraction])
    setShowAttractionPicker(false)
    setAttractionSearch('')
  }

  // Remove attraction from selected list
  const removeAttraction = (id: string) => {
    setSelectedAttractions(prev => prev.filter(a => a.id !== id))
  }

  // Update quantity for an attraction
  const updateAttractionQuantity = (id: string, quantity: number) => {
    setSelectedAttractions(prev => prev.map(a => 
      a.id === id ? { ...a, quantity: Math.max(1, quantity) } : a
    ))
  }

  // Calculate total for selected attractions
  const calculateAttractionsTotal = () => {
    return selectedAttractions.reduce((sum, a) => sum + (a.eur_rate * a.quantity), 0)
  }

  // Auto-update document total when attractions change (activity vouchers only)
  useEffect(() => {
    if (document && document.document_type === 'activity_voucher') {
      const attractionsTotal = calculateAttractionsTotal()
      if (attractionsTotal > 0) {
        setDocument((prev: any) => ({ ...prev, total_cost: attractionsTotal }))
      }
    }
  }, [selectedAttractions])

  // Get the rate for the current vehicle type from a transport rate record
  const getRateForVehicle = (rate: TransportRate, vehicleType?: string): number => {
    const vt = vehicleType || document?.vehicle_type || 'minivan'
    switch (vt) {
      case 'sedan': case 'luxury_sedan': return rate.sedan_rate_eur || 0
      case 'minivan': return rate.minivan_rate_eur || 0
      case 'van': case 'luxury_van': return rate.van_rate_eur || 0
      case 'minibus': return rate.minibus_rate_eur || 0
      case 'bus': return rate.bus_rate_eur || 0
      default: return rate.minivan_rate_eur || rate.sedan_rate_eur || 0
    }
  }

  // Add a transport route
  const addRoute = (rate: TransportRate) => {
    if (selectedRoutes.find(r => r.rate_id === rate.id)) return
    const unitRate = getRateForVehicle(rate)
    setSelectedRoutes(prev => [...prev, {
      rate_id: rate.id,
      service_code: rate.service_code,
      route_name: rate.route_name,
      service_type: rate.service_type,
      city: rate.city || rate.origin_city || '',
      quantity: 1,
      unit_rate: unitRate,
      total_cost: unitRate
    }])
  }

  // Remove a transport route
  const removeRoute = (rateId: string) => {
    setSelectedRoutes(prev => prev.filter(r => r.rate_id !== rateId))
  }

  // Update quantity for a route
  const updateRouteQuantity = (rateId: string, quantity: number) => {
    setSelectedRoutes(prev => prev.map(r =>
      r.rate_id === rateId ? { ...r, quantity: Math.max(1, quantity), total_cost: r.unit_rate * Math.max(1, quantity) } : r
    ))
  }

  const isRouteSelected = (rateId: string) => {
    return selectedRoutes.some(r => r.rate_id === rateId)
  }

  const calculateRoutesTotal = () => {
    return selectedRoutes.reduce((sum, r) => sum + r.total_cost, 0)
  }

  // Recalculate rates when vehicle type changes
  useEffect(() => {
    if (document && document.document_type === 'transport_voucher' && selectedRoutes.length > 0 && transportRates.length > 0) {
      setSelectedRoutes(prev => prev.map(r => {
        const rate = transportRates.find(tr => tr.id === r.rate_id)
        if (!rate) return r
        const unitRate = getRateForVehicle(rate)
        return { ...r, unit_rate: unitRate, total_cost: unitRate * r.quantity }
      }))
    }
  }, [document?.vehicle_type])

  // Auto-update document total when selected routes change
  useEffect(() => {
    if (document && document.document_type === 'transport_voucher' && selectedRoutes.length > 0) {
      const routesTotal = calculateRoutesTotal()
      setDocument((prev: any) => ({ ...prev, total_cost: routesTotal }))
    }
  }, [selectedRoutes])

  // Add a meal
  const addMeal = (rate: MealRate) => {
    if (selectedMeals.find(m => m.rate_id === rate.id)) return
    const totalPax = (document?.num_adults || 1) + (document?.num_children || 0)
    setSelectedMeals(prev => [...prev, {
      rate_id: rate.id,
      service_code: rate.service_code,
      restaurant_name: rate.restaurant_name,
      meal_type: rate.meal_type || '',
      city: rate.city || '',
      quantity: totalPax,
      unit_rate: rate.base_rate_eur,
      total_cost: rate.base_rate_eur * totalPax
    }])
  }

  // Remove a meal
  const removeMeal = (rateId: string) => {
    setSelectedMeals(prev => prev.filter(m => m.rate_id !== rateId))
  }

  // Update quantity for a meal
  const updateMealQuantity = (rateId: string, quantity: number) => {
    setSelectedMeals(prev => prev.map(m =>
      m.rate_id === rateId ? { ...m, quantity: Math.max(1, quantity), total_cost: m.unit_rate * Math.max(1, quantity) } : m
    ))
  }

  const calculateMealsTotal = () => {
    return selectedMeals.reduce((sum, m) => sum + m.total_cost, 0)
  }

  // Auto-update document total when selected meals change
  useEffect(() => {
    if (document && document.document_type === 'service_order' && selectedMeals.length > 0) {
      const mealsTotal = calculateMealsTotal()
      setDocument((prev: any) => ({ ...prev, total_cost: mealsTotal }))
    }
  }, [selectedMeals])

  // Add a guide (rate is per day, not per person — default quantity to 1 day)
  const addGuide = (rate: GuideRate) => {
    if (selectedGuides.find(g => g.rate_id === rate.id)) return
    setSelectedGuides(prev => [...prev, {
      rate_id: rate.id,
      service_code: rate.service_code,
      guide_language: rate.guide_language,
      guide_type: rate.guide_type,
      tour_duration: rate.tour_duration,
      city: rate.city || '',
      quantity: 1,
      unit_rate: rate.base_rate_eur,
      total_cost: rate.base_rate_eur
    }])
  }

  // Remove a guide
  const removeGuide = (rateId: string) => {
    setSelectedGuides(prev => prev.filter(g => g.rate_id !== rateId))
  }

  // Update quantity for a guide
  const updateGuideQuantity = (rateId: string, quantity: number) => {
    setSelectedGuides(prev => prev.map(g =>
      g.rate_id === rateId ? { ...g, quantity: Math.max(1, quantity), total_cost: g.unit_rate * Math.max(1, quantity) } : g
    ))
  }

  const calculateGuidesTotal = () => {
    return selectedGuides.reduce((sum, g) => sum + g.total_cost, 0)
  }

  // Auto-update document total when selected guides change
  useEffect(() => {
    if (document && document.document_type === 'guide_assignment' && selectedGuides.length > 0) {
      const guidesTotal = calculateGuidesTotal()
      setDocument((prev: any) => ({ ...prev, total_cost: guidesTotal }))
    }
  }, [selectedGuides])

  // Guide type display labels
  const GUIDE_TYPE_LABELS: Record<string, string> = {
    licensed: t('guideTypes.licensed'),
    egyptologist: t('guideTypes.egyptologist'),
    local: t('guideTypes.local'),
    specialist: t('guideTypes.specialist'),
    driver_guide: t('guideTypes.driverGuide'),
  }

  // Tour duration display labels
  const DURATION_LABELS: Record<string, string> = {
    half_day: t('durationTypes.halfDay'),
    full_day: t('durationTypes.fullDay'),
    extended: t('durationTypes.extended'),
    hourly: t('durationTypes.hourly'),
  }

  // Get unique cities from guide rates
  const guideCities = Array.from(new Set(
    guideRates.map(r => r.city || '').filter(Boolean)
  )).sort()

  // Filter guide rates for picker
  const filteredGuides = guideRates.filter(rate => {
    const matchesSearch = !guideSearch ||
      rate.guide_language.toLowerCase().includes(guideSearch.toLowerCase()) ||
      rate.guide_type.toLowerCase().includes(guideSearch.toLowerCase()) ||
      (rate.city || '').toLowerCase().includes(guideSearch.toLowerCase())
    const matchesCity = !guideCityFilter || (rate.city || '').toLowerCase() === guideCityFilter.toLowerCase()
    const notSelected = !selectedGuides.find(g => g.rate_id === rate.id)
    return matchesSearch && matchesCity && notSelected
  })

  const isGuideDocument = document?.document_type === 'guide_assignment'

  // Meal type display labels
  const MEAL_TYPE_LABELS: Record<string, string> = {
    Breakfast: t('mealTypes.breakfast'),
    Lunch: t('mealTypes.lunch'),
    Dinner: t('mealTypes.dinner'),
    Brunch: t('mealTypes.brunch'),
    'Full Board': t('mealTypes.fullBoard'),
    'Half Board': t('mealTypes.halfBoard'),
  }

  // Get unique cities from meal rates
  const mealCities = Array.from(new Set(
    mealRates.map(r => r.city || '').filter(Boolean)
  )).sort()

  // Filter meal rates for picker
  const filteredMeals = mealRates.filter(rate => {
    const matchesSearch = !mealSearch ||
      rate.restaurant_name.toLowerCase().includes(mealSearch.toLowerCase()) ||
      (rate.meal_type || '').toLowerCase().includes(mealSearch.toLowerCase())
    const matchesCity = !mealCityFilter || (rate.city || '').toLowerCase() === mealCityFilter.toLowerCase()
    const notSelected = !selectedMeals.find(m => m.rate_id === rate.id)
    return matchesSearch && matchesCity && notSelected
  })

  // Service type display labels — canonical taxonomy.
  // Legacy keys (intercity_transfer, sound_light_transfer) retained so that
  // any orphan row still renders a sensible label until cleaned up.
  const SERVICE_TYPE_LABELS: Record<string, string> = {
    airport_transfer: t('serviceTypes.airportTransfer'),
    airport_with_sightseeing: t('serviceTypes.airportWithSightseeing'),
    day_tour: t('serviceTypes.dayTour'),
    extended_day_tour: t('serviceTypes.extendedDayTour'),
    half_day: t('serviceTypes.halfDay'),
    city_transfer: t('serviceTypes.cityTransfer'),
    city_tour: t('serviceTypes.cityTour'),
    intercity: t('serviceTypes.intercity'),
    intercity_with_sightseeing: t('serviceTypes.intercityWithSightseeing'),
    sound_light: t('serviceTypes.soundLight'),
    dinner_transfer: t('serviceTypes.dinnerTransfer'),
    // Legacy:
    intercity_transfer: t('serviceTypes.intercityTransfer'),
    sound_light_transfer: t('serviceTypes.soundLightTransfer'),
  }

  // Get unique cities from transport rates
  const routeCities = Array.from(new Set(
    transportRates.map(r => r.city || r.origin_city || '').filter(Boolean)
  )).sort()

  // Filter transport rates for picker
  const filteredRates = transportRates.filter(rate => {
    const matchesSearch = !routeSearch ||
      rate.route_name.toLowerCase().includes(routeSearch.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(routeSearch.toLowerCase())
    const rateCity = rate.city || rate.origin_city || ''
    const matchesCity = !routeCityFilter || rateCity.toLowerCase() === routeCityFilter.toLowerCase()
    const notSelected = !selectedRoutes.find(r => r.rate_id === rate.id)
    return matchesSearch && matchesCity && notSelected
  })

  // Get unique cities from entrance fees
  const cities = Array.from(new Set(entranceFees.map(f => f.city))).sort()

  // Filter attractions for picker
  const filteredAttractions = entranceFees.filter(fee => {
    const matchesSearch = !attractionSearch || 
      fee.attraction_name.toLowerCase().includes(attractionSearch.toLowerCase())
    const matchesCity = !selectedCity || fee.city === selectedCity
    const notSelected = !selectedAttractions.find(a => a.id === fee.id)
    return matchesSearch && matchesCity && notSelected
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link href="/documents/supplier" className="text-primary-600">← {t('back')}</Link>
        </div>
      </div>
    )
  }

  const isEntranceFeeDocument = document.document_type === 'activity_voucher'
  const isMealDocument = document.document_type === 'service_order'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href={`/documents/supplier/${params.id}`} className="p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{t('edit')} {document.document_number}</h1>
                <p className="text-xs text-gray-500">{document.document_type?.replace('_', ' ').toUpperCase()}</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? t('saving') : t('saveChanges')}
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Main Form */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
            
            {/* Status - IMPORTANT */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('documentStatus')}</label>
                <select
                  value={document.status || 'draft'}
                  onChange={(e) => setDocument({ ...document, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="draft">{t('status.draft')}</option>
                  <option value="sent">{t('status.sent')}</option>
                  <option value="confirmed">{t('status.confirmed')}</option>
                  <option value="completed">{t('status.completed')}</option>
                  <option value="cancelled">{t('status.cancelled')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('documentType')}</label>
                <input
                  type="text"
                  value={document.document_type?.replace('_', ' ').toUpperCase() || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                />
              </div>
            </div>

            {/* Supplier Selection */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-5 h-5 text-blue-600" />
                <label className="text-sm font-semibold text-blue-900">{t('selectSupplier')}</label>
              </div>
              <select
                value={document.supplier_id || ''}
                onChange={(e) => handleSupplierSelect(e.target.value)}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loadingSuppliers}
                title={t('selectSupplier')}
              >
                <option value="">{t('selectSupplierPlaceholder')}</option>
                {getRelevantSuppliers().length > 0 && (
                  <optgroup label={t('recommendedSuppliers')}>
                    {getRelevantSuppliers().map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `(${s.city})` : ''} — {s.type.replace('_', ' ')}
                      </option>
                    ))}
                  </optgroup>
                )}
                {suppliers.filter(s => !getRelevantSuppliers().find(r => r.id === s.id)).length > 0 && (
                  <optgroup label={t('otherSuppliers')}>
                    {suppliers.filter(s => !getRelevantSuppliers().find(r => r.id === s.id)).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.city ? `(${s.city})` : ''} — {s.type.replace('_', ' ')}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="text-xs text-blue-600 mt-2">{t('selectSupplierHint')}</p>
            </div>

            {/* Supplier Info (editable) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('supplierName')}</label>
                <input
                  type="text"
                  value={document.supplier_name || ''}
                  onChange={(e) => setDocument({ ...document, supplier_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('supplierNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('contactName')}</label>
                <input
                  type="text"
                  value={document.supplier_contact_name || ''}
                  onChange={(e) => setDocument({ ...document, supplier_contact_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('contactNamePlaceholder')}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('contactEmail')}</label>
                <input
                  type="email"
                  value={document.supplier_contact_email || ''}
                  onChange={(e) => setDocument({ ...document, supplier_contact_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('contactEmailPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('contactPhone')}</label>
                <input
                  type="text"
                  value={document.supplier_contact_phone || ''}
                  onChange={(e) => setDocument({ ...document, supplier_contact_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('contactPhonePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('whatsapp')}</label>
                <input
                  type="text"
                  value={document.supplier_whatsapp || ''}
                  onChange={(e) => setDocument({ ...document, supplier_whatsapp: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder={t('whatsappPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('address')}</label>
              <input
                type="text"
                value={document.supplier_address || ''}
                onChange={(e) => setDocument({ ...document, supplier_address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder={t('addressPlaceholder')}
              />
            </div>

            <hr className="border-gray-200" />

            {/* Guest Info */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('guestName')}</label>
                <input
                  type="text"
                  value={document.client_name || ''}
                  onChange={(e) => setDocument({ ...document, client_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('adults')}</label>
                <input
                  type="number"
                  value={document.num_adults || 1}
                  onChange={(e) => setDocument({ ...document, num_adults: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('children')}</label>
                <input
                  type="number"
                  value={document.num_children || 0}
                  onChange={(e) => setDocument({ ...document, num_children: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('nationality')}</label>
                <input
                  type="text"
                  value={document.client_nationality || ''}
                  onChange={(e) => setDocument({ ...document, client_nationality: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('city')}</label>
                <input
                  type="text"
                  value={document.city || ''}
                  onChange={(e) => setDocument({ ...document, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              {document.document_type === 'hotel_voucher' || document.document_type === 'cruise_voucher' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('checkIn')}</label>
                    <input
                      type="date"
                      value={document.check_in?.split('T')[0] || ''}
                      onChange={(e) => setDocument({ ...document, check_in: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('checkOut')}</label>
                    <input
                      type="date"
                      value={document.check_out?.split('T')[0] || ''}
                      onChange={(e) => setDocument({ ...document, check_out: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('serviceDate')}</label>
                    <input
                      type="date"
                      value={document.service_date?.split('T')[0] || ''}
                      onChange={(e) => setDocument({ ...document, service_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('pickupTime')}</label>
                    <input
                      type="time"
                      value={document.pickup_time || ''}
                      onChange={(e) => setDocument({ ...document, pickup_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </>
              )}
            </div>

            {document.document_type === 'transport_voucher' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('vehicleType')}</label>
                    <select
                      value={document.vehicle_type || ''}
                      onChange={(e) => setDocument({ ...document, vehicle_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      title={t('vehicleType')}
                    >
                      <option value="">{t('vehicleTypes.select')}</option>
                      <option value="sedan">{t('vehicleTypes.sedan')}</option>
                      <option value="minivan">{t('vehicleTypes.minivan')}</option>
                      <option value="van">{t('vehicleTypes.van')}</option>
                      <option value="minibus">{t('vehicleTypes.minibus')}</option>
                      <option value="bus">{t('vehicleTypes.bus')}</option>
                      <option value="luxury_sedan">{t('vehicleTypes.luxurySedan')}</option>
                      <option value="luxury_van">{t('vehicleTypes.luxuryVan')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('driverName')}</label>
                    <input
                      type="text"
                      value={document.driver_name || ''}
                      onChange={(e) => setDocument({ ...document, driver_name: e.target.value })}
                      placeholder={t('driverNamePlaceholder')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </>
            )}

            <hr className="border-gray-200" />

            {/* Special Requests */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('specialRequests')}</label>
              <textarea
                value={document.special_requests || ''}
                onChange={(e) => setDocument({ ...document, special_requests: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder={t('specialRequestsPlaceholder')}
              />
            </div>

            {/* Internal Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('internalNotes')}</label>
              <textarea
                value={document.internal_notes || ''}
                onChange={(e) => setDocument({ ...document, internal_notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder={t('internalNotesPlaceholder')}
              />
            </div>

            <hr className="border-gray-200" />

            {/* Payment */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('currency')}</label>
                <select
                  value={document.currency || 'EUR'}
                  onChange={(e) => setDocument({ ...document, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="EGP">EGP</option>
                  <option value="GBP">GBP</option>
                  <option value="JPY">JPY</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('totalCost')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={document.total_cost || 0}
                  onChange={(e) => setDocument({ ...document, total_cost: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('paymentTerms')}</label>
                <select
                  value={document.payment_terms || ''}
                  onChange={(e) => setDocument({ ...document, payment_terms: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">{t('paymentTermsOptions.select')}</option>
                  <option value="prepaid">{t('paymentTermsOptions.prepaid')}</option>
                  <option value="credit">{t('paymentTermsOptions.credit')}</option>
                  <option value="on_service">{t('paymentTermsOptions.onService')}</option>
                  <option value="commission">{t('paymentTermsOptions.commission')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* TRANSPORT ROUTES SECTION - Only show for transport vouchers */}
          {document.document_type === 'transport_voucher' && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Route className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">{t('transportRoutes')}</h2>
                </div>
                <button
                  onClick={() => setRouteSearch('')}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {t('addRoute')}
                </button>
              </div>

              {/* Selected Routes Table */}
              {selectedRoutes.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('routeName')}</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('routeType')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('rate')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('qty')}</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('total')}</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedRoutes.map((route) => (
                        <tr key={route.rate_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{route.route_name}</p>
                            <p className="text-xs text-gray-500">{route.service_code}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                              {SERVICE_TYPE_LABELS[route.service_type] || route.service_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-gray-700">€{route.unit_rate.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={route.quantity}
                              onChange={(e) => updateRouteQuantity(route.rate_id, parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-primary-600">
                              €{route.total_cost.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => removeRoute(route.rate_id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-primary-50 border-t border-primary-200">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-700 flex items-center justify-end gap-2">
                            <Calculator className="w-4 h-4" />
                            {t('totalTransportCost')}:
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-lg font-bold text-primary-600">
                            €{calculateRoutesTotal().toFixed(2)}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                  <Route className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">{t('noRoutesSelected')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('noRoutesHint')}</p>
                </div>
              )}

              {/* Route Picker (always visible for transport vouchers) */}
              <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-3 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">{t('availableRoutes')}</h3>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t('searchRoutesPlaceholder')}
                      value={routeSearch}
                      onChange={(e) => setRouteSearch(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={routeCityFilter}
                      onChange={(e) => setRouteCityFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">{t('allCities')}</option>
                      {routeCities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                  {loadingRoutes ? (
                    <div className="p-8 text-center">
                      <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : filteredRates.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <p className="text-sm">{t('noRoutesFound')}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {/* Group by service type */}
                      {Object.entries(
                        filteredRates.reduce((acc, rate) => {
                          const type = rate.service_type
                          if (!acc[type]) acc[type] = []
                          acc[type].push(rate)
                          return acc
                        }, {} as Record<string, TransportRate[]>)
                      )
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([type, rates]) => (
                          <div key={type}>
                            <div className="bg-gray-50 px-4 py-1.5 border-b border-gray-100">
                              <span className="text-xs font-semibold text-gray-600 uppercase">
                                {SERVICE_TYPE_LABELS[type] || type.replace(/_/g, ' ')}
                              </span>
                            </div>
                            {rates.map(rate => (
                              <button
                                key={rate.id}
                                onClick={() => addRoute(rate)}
                                className="w-full px-4 py-2.5 text-left hover:bg-primary-50 transition-colors flex items-center justify-between"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{rate.route_name}</p>
                                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3 h-3" />
                                    {rate.origin_city && rate.destination_city
                                      ? `${rate.origin_city} → ${rate.destination_city}`
                                      : rate.city || '—'}
                                    {rate.area && <span className="ml-1 text-gray-400">({rate.area.replace(/_/g, ' ')})</span>}
                                  </p>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                  <p className="text-sm font-semibold text-primary-600">
                                    €{getRateForVehicle(rate).toFixed(2)}
                                  </p>
                                  {rate.supplier_name && (
                                    <p className="text-xs text-gray-400">{rate.supplier_name}</p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MEALS SECTION - Only show for service orders */}
          {isMealDocument && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">{t('meals')}</h2>
                </div>
              </div>

              {/* Selected Meals Table */}
              {selectedMeals.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('restaurantName')}</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('mealType')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('rate')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('qty')}</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('total')}</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedMeals.map((meal) => (
                        <tr key={meal.rate_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{meal.restaurant_name}</p>
                            {meal.city && <p className="text-xs text-gray-500">{meal.city}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                              {MEAL_TYPE_LABELS[meal.meal_type] || meal.meal_type || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-gray-700">{'\u20AC'}{meal.unit_rate.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={meal.quantity}
                              onChange={(e) => updateMealQuantity(meal.rate_id, parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-primary-600">
                              {'\u20AC'}{meal.total_cost.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => removeMeal(meal.rate_id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-primary-50 border-t border-primary-200">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-700 flex items-center justify-end gap-2">
                            <Calculator className="w-4 h-4" />
                            {t('totalMealCost')}:
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-lg font-bold text-primary-600">
                            {'\u20AC'}{calculateMealsTotal().toFixed(2)}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                  <Utensils className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">{t('noMealsSelected')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('noMealsHint')}</p>
                </div>
              )}

              {/* Meal Picker (always visible for service orders) */}
              <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-3 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">{t('availableMeals')}</h3>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t('searchMealsPlaceholder')}
                      value={mealSearch}
                      onChange={(e) => setMealSearch(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={mealCityFilter}
                      onChange={(e) => setMealCityFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">{t('allCities')}</option>
                      {mealCities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                  {loadingMeals ? (
                    <div className="p-8 text-center">
                      <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : filteredMeals.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <p className="text-sm">{t('noMealsFound')}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {/* Group by meal type */}
                      {Object.entries(
                        filteredMeals.reduce((acc, rate) => {
                          const type = rate.meal_type || 'Other'
                          if (!acc[type]) acc[type] = []
                          acc[type].push(rate)
                          return acc
                        }, {} as Record<string, MealRate[]>)
                      )
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([type, rates]) => (
                          <div key={type}>
                            <div className="bg-gray-50 px-4 py-1.5 border-b border-gray-100">
                              <span className="text-xs font-semibold text-gray-600 uppercase">
                                {MEAL_TYPE_LABELS[type] || type}
                              </span>
                            </div>
                            {rates.map(rate => (
                              <button
                                key={rate.id}
                                onClick={() => addMeal(rate)}
                                className="w-full px-4 py-2.5 text-left hover:bg-primary-50 transition-colors flex items-center justify-between"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">{rate.restaurant_name}</p>
                                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3 h-3" />
                                    {rate.city || '—'}
                                    {rate.cuisine_type && <span className="ml-1 text-gray-400">({rate.cuisine_type})</span>}
                                  </p>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                  <p className="text-sm font-semibold text-primary-600">
                                    {'\u20AC'}{rate.base_rate_eur.toFixed(2)}
                                  </p>
                                  {rate.supplier_name && (
                                    <p className="text-xs text-gray-400">{rate.supplier_name}</p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GUIDE RATES SECTION - Only show for guide assignments */}
          {isGuideDocument && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">{t('guides')}</h2>
                </div>
              </div>

              {/* Selected Guides Table */}
              {selectedGuides.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('guideLanguage')}</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('guideType')}</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('duration')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('ratePerDay')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('days')}</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('total')}</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedGuides.map((guide) => (
                        <tr key={guide.rate_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{guide.guide_language}</p>
                            {guide.city && <p className="text-xs text-gray-500">{guide.city}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                              {GUIDE_TYPE_LABELS[guide.guide_type] || guide.guide_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-600">
                              {DURATION_LABELS[guide.tour_duration] || guide.tour_duration.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-gray-700">{'\u20AC'}{guide.unit_rate.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={guide.quantity}
                              onChange={(e) => updateGuideQuantity(guide.rate_id, parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-primary-600">
                              {'\u20AC'}{guide.total_cost.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => removeGuide(guide.rate_id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-primary-50 border-t border-primary-200">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-700 flex items-center justify-end gap-2">
                            <Calculator className="w-4 h-4" />
                            {t('totalGuideCost')}:
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-lg font-bold text-primary-600">
                            {'\u20AC'}{calculateGuidesTotal().toFixed(2)}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                  <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">{t('noGuidesSelected')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('noGuidesHint')}</p>
                </div>
              )}

              {/* Guide Picker (always visible for guide assignments) */}
              <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
                <div className="p-3 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">{t('availableGuides')}</h3>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={t('searchGuidesPlaceholder')}
                      value={guideSearch}
                      onChange={(e) => setGuideSearch(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    />
                    <select
                      value={guideCityFilter}
                      onChange={(e) => setGuideCityFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="">{t('allCities')}</option>
                      {guideCities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                  {loadingGuides ? (
                    <div className="p-8 text-center">
                      <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : filteredGuides.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">
                      <p className="text-sm">{t('noGuidesFound')}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {/* Group by guide type */}
                      {Object.entries(
                        filteredGuides.reduce((acc, rate) => {
                          const type = rate.guide_type || 'Other'
                          if (!acc[type]) acc[type] = []
                          acc[type].push(rate)
                          return acc
                        }, {} as Record<string, GuideRate[]>)
                      )
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([type, rates]) => (
                          <div key={type}>
                            <div className="bg-gray-50 px-4 py-1.5 border-b border-gray-100">
                              <span className="text-xs font-semibold text-gray-600 uppercase">
                                {GUIDE_TYPE_LABELS[type] || type.replace(/_/g, ' ')}
                              </span>
                            </div>
                            {rates.map(rate => (
                              <button
                                key={rate.id}
                                onClick={() => addGuide(rate)}
                                className="w-full px-4 py-2.5 text-left hover:bg-primary-50 transition-colors flex items-center justify-between"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900">
                                    {rate.guide_language} — {DURATION_LABELS[rate.tour_duration] || rate.tour_duration.replace(/_/g, ' ')}
                                  </p>
                                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3 h-3" />
                                    {rate.city || '—'}
                                    {rate.season && <span className="ml-1 text-gray-400">({rate.season})</span>}
                                  </p>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                  <p className="text-sm font-semibold text-primary-600">
                                    {'\u20AC'}{rate.base_rate_eur.toFixed(2)}
                                  </p>
                                  {rate.notes && (
                                    <p className="text-xs text-gray-400 max-w-[120px] truncate">{rate.notes}</p>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ENTRANCE FEES SECTION - Only show for activity vouchers */}
          {isEntranceFeeDocument && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">{t('entranceFees')}</h2>
                </div>
                <button
                  onClick={() => setShowAttractionPicker(true)}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {t('addAttraction')}
                </button>
              </div>

              {/* Selected Attractions Table */}
              {selectedAttractions.length > 0 ? (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('attraction')}</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('city')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('rate')}</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('qty')}</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('total')}</th>
                        <th className="px-4 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedAttractions.map((attraction) => (
                        <tr key={attraction.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900">{attraction.attraction_name}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {attraction.city}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm text-gray-700">€{attraction.eur_rate.toFixed(2)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min="1"
                              value={attraction.quantity}
                              onChange={(e) => updateAttractionQuantity(attraction.id, parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-primary-600">
                              €{(attraction.eur_rate * attraction.quantity).toFixed(2)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => removeAttraction(attraction.id)}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-primary-50 border-t border-primary-200">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-700 flex items-center justify-end gap-2">
                            <Calculator className="w-4 h-4" />
                            {t('totalEntranceFees')}:
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-lg font-bold text-primary-600">
                            €{calculateAttractionsTotal().toFixed(2)}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg">
                  <Ticket className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">{t('noAttractionsSelected')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('noAttractionsHint')}</p>
                </div>
              )}

              {/* Attraction Picker Modal */}
              {showAttractionPicker && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900">{t('selectAttractions')}</h3>
                        <button
                          onClick={() => {
                            setShowAttractionPicker(false)
                            setAttractionSearch('')
                            setSelectedCity('')
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder={t('searchAttractionsPlaceholder')}
                          value={attractionSearch}
                          onChange={(e) => setAttractionSearch(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          autoFocus
                        />
                        <select
                          value={selectedCity}
                          onChange={(e) => setSelectedCity(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="">{t('allCities')}</option>
                          {cities.map(city => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="overflow-y-auto max-h-[50vh]">
                      {loadingFees ? (
                        <div className="p-8 text-center">
                          <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        </div>
                      ) : filteredAttractions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <p className="text-sm">{t('noAttractionsFound')}</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {filteredAttractions.map(fee => (
                            <button
                              key={fee.id}
                              onClick={() => addAttraction(fee)}
                              className="w-full px-4 py-3 text-left hover:bg-primary-50 transition-colors flex items-center justify-between"
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-900">{fee.attraction_name}</p>
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3" />
                                  {fee.city}
                                  {fee.is_addon && (
                                    <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">
                                      {t('addon')}
                                    </span>
                                  )}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-primary-600">€{fee.eur_rate.toFixed(2)}</p>
                                {fee.non_eur_rate > 0 && fee.non_eur_rate !== fee.eur_rate && (
                                  <p className="text-xs text-gray-400">{t('nonEU')}: €{fee.non_eur_rate.toFixed(2)}</p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="p-4 border-t border-gray-200 bg-gray-50">
                      <p className="text-xs text-gray-500 text-center">
                        {t('attractionsAvailable', { count: entranceFees.length })} • {t('attractionsSelected', { count: selectedAttractions.length })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}