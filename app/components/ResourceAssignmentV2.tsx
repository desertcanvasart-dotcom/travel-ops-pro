// app/components/ResourceAssignmentV2.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Users, Truck, Hotel, UtensilsCrossed, Ship, Plane, UserCheck,
  Check, AlertCircle, Loader2, MapPin, Clock, Plus, Trash2, Calendar,
  ChevronDown, ChevronUp, X, MessageCircle, Send, Filter, Anchor
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { getTransportRateForPax, getAllVehicleTiers } from '@/lib/transport-rate-utils'
import type { VehicleRateResult } from '@/lib/transport-rate-utils'

// Types
interface Resource {
  id: string
  name: string
  phone?: string
  city?: string
  airport_location?: string
  route?: string
  hotel?: {
    id: string
    name: string
    city: string
  }
  [key: string]: any
}

interface AssignedResource {
  id: string
  itinerary_id: string
  itinerary_day_id?: string
  resource_type: string
  resource_id: string
  resource_name: string
  start_date: string
  end_date?: string
  notes?: string
  quantity: number
  cost_eur?: number
  cost_non_eur?: number
  status: string
}

interface Conflict {
  resource_id: string
  resource_name: string
  conflicting_itinerary: string
  dates: string
}

interface ResourceAssignmentV2Props {
  itineraryId: string
  startDate: string
  endDate: string
  numTravelers?: number
  clientName?: string
  tripName?: string
  onUpdate?: () => void
}

// City options for Egypt
const CITY_OPTIONS = [
  { value: 'all', label: 'All Cities' },
  { value: 'Cairo', label: 'Cairo' },
  { value: 'Giza', label: 'Giza' },
  { value: 'Luxor', label: 'Luxor' },
  { value: 'Aswan', label: 'Aswan' },
  { value: 'Alexandria', label: 'Alexandria' },
  { value: 'Hurghada', label: 'Hurghada' },
  { value: 'Sharm El Sheikh', label: 'Sharm El Sheikh' },
  { value: 'Dahab', label: 'Dahab' },
  { value: 'Marsa Alam', label: 'Marsa Alam' },
  { value: 'Siwa', label: 'Siwa' },
  { value: 'Fayoum', label: 'Fayoum' }
]

// Airport locations (using airport codes and names)
const AIRPORT_LOCATION_OPTIONS = [
  { value: 'all', label: 'All Airports' },
  { value: 'Cairo', label: 'Cairo (CAI)' },
  { value: 'Luxor', label: 'Luxor (LXR)' },
  { value: 'Aswan', label: 'Aswan (ASW)' },
  { value: 'Hurghada', label: 'Hurghada (HRG)' },
  { value: 'Sharm', label: 'Sharm El Sheikh (SSH)' },
  { value: 'Alexandria', label: 'Alexandria (HBE/ALY)' },
  { value: 'Marsa Alam', label: 'Marsa Alam (RMF)' }
]

// Cruise route options
const CRUISE_ROUTE_OPTIONS = [
  { value: 'all', label: 'All Routes' },
  { value: 'luxor_aswan', label: 'Luxor → Aswan (4 nights)' },
  { value: 'aswan_luxor', label: 'Aswan → Luxor (3 nights)' },
  { value: 'round_trip', label: 'Round Trip (7 nights)' }
]

// Resource type configurations - using existing API endpoints
const RESOURCE_TYPES = [
  {
    key: 'guide',
    labelKey: 'guides',
    icon: Users,
    color: 'blue',
    apiEndpoint: '/api/guides',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.languages?.length ? ` (${r.languages.join(', ')})` : ''}`,
    canNotify: true,
    filterType: 'city',
    cityField: 'city'
  },
  {
    key: 'vehicle',
    labelKey: 'vehicles',
    icon: Truck,
    color: 'green',
    apiEndpoint: '/api/resources/transportation?activeOnly=true',
    nameField: 'route_name',
    phoneField: 'supplier.contact_phone',
    displayField: (r: any) => {
      // Canonical transport service_type display labels. Legacy keys
      // (intercity_transfer, sound_light_transfer, multi_day) retained so
      // any orphan row still renders with a sensible label.
      const SERVICE_LABELS: Record<string, string> = {
        'airport_transfer': 'Airport Transfer',
        'airport_with_sightseeing': 'Airport + Sightseeing',
        'city_transfer': 'City Transfer',
        'city_tour': 'City Tour',
        'intercity': 'Intercity',
        'intercity_with_sightseeing': 'Intercity + Sightseeing',
        'half_day': 'Half Day',
        'day_tour': 'Day Tour',
        'extended_day_tour': 'Extended Day Tour',
        'sound_light': 'Sound & Light',
        'dinner_transfer': 'Dinner Transfer',
        // Legacy:
        'intercity_transfer': 'Intercity Transfer',
        'sound_light_transfer': 'Sound & Light Transfer',
        'multi_day': 'Multi Day',
      }
      const label = r.route_name || SERVICE_LABELS[r.service_type] || r.service_type?.replace(/_/g, ' ') || r.service_code
      const city = r.city || ''
      const dest = r.destination_city ? ` → ${r.destination_city}` : ''
      const supplier = r.supplier?.name || r.supplier_name || ''
      return `${label} - ${city}${dest}${supplier ? ` (${supplier})` : ''}`
    },
    canNotify: true,
    filterType: 'city',
    cityField: 'city',
    isTransportRate: true
  },
  {
    key: 'hotel',
    labelKey: 'hotels',
    icon: Hotel,
    color: 'purple',
    apiEndpoint: '/api/resources/hotels',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.city ? ` - ${r.city}` : ''}${r.star_rating ? ` ⭐${r.star_rating}` : ''}`,
    canNotify: false,
    filterType: 'city',
    cityField: 'city'
  },
  {
    key: 'restaurant',
    labelKey: 'restaurants',
    icon: UtensilsCrossed,
    color: 'orange',
    apiEndpoint: '/api/resources/restaurants',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.city ? ` - ${r.city}` : ''}${r.cuisine_type ? ` (${r.cuisine_type})` : ''}`,
    canNotify: true,
    filterType: 'city',
    cityField: 'city'
  },
  {
    key: 'cruise',
    labelKey: 'nileCruises',
    icon: Ship,
    color: 'indigo',
    apiEndpoint: '/api/cruises',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => {
      const routeLabels: Record<string, string> = {
        'luxor_aswan': 'Luxor → Aswan (4n)',
        'aswan_luxor': 'Aswan → Luxor (3n)',
        'round_trip': 'Round Trip (7n)'
      }
      const routeLabel = r.route ? routeLabels[r.route] || r.route : ''
      return `${r.name}${r.ship_name ? ` - ${r.ship_name}` : ''}${routeLabel ? ` • ${routeLabel}` : ''}`
    },
    canNotify: false,
    filterType: 'route',
    routeField: 'route'
  },
  {
    key: 'airport_staff',
    labelKey: 'airportStaff',
    icon: Plane,
    color: 'cyan',
    apiEndpoint: '/api/resources/airport-staff',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.airport_location ? ` - ${r.airport_location}` : ''}${r.role ? ` (${r.role})` : ''}`,
    canNotify: true,
    filterType: 'airport',
    cityField: 'airport_location'
  },
  {
    key: 'hotel_staff',
    labelKey: 'hotelStaff',
    icon: UserCheck,
    color: 'pink',
    apiEndpoint: '/api/resources/hotel-staff',
    nameField: 'name',
    phoneField: 'phone',
    displayField: (r: any) => `${r.name}${r.hotel?.name ? ` - ${r.hotel.name}` : ''}${r.hotel?.city ? ` (${r.hotel.city})` : ''}${r.role ? ` • ${r.role}` : ''}`,
    canNotify: true,
    filterType: 'hotelCity',
    cityField: 'hotel.city'
  }
]

const COLOR_CLASSES: Record<string, { bg: string, border: string, text: string, light: string }> = {
  blue: { bg: 'bg-blue-600', border: 'border-blue-200', text: 'text-blue-600', light: 'bg-blue-50' },
  green: { bg: 'bg-green-600', border: 'border-green-200', text: 'text-green-600', light: 'bg-green-50' },
  purple: { bg: 'bg-purple-600', border: 'border-purple-200', text: 'text-purple-600', light: 'bg-purple-50' },
  orange: { bg: 'bg-orange-600', border: 'border-orange-200', text: 'text-orange-600', light: 'bg-orange-50' },
  indigo: { bg: 'bg-indigo-600', border: 'border-indigo-200', text: 'text-indigo-600', light: 'bg-indigo-50' },
  cyan: { bg: 'bg-cyan-600', border: 'border-cyan-200', text: 'text-cyan-600', light: 'bg-cyan-50' },
  pink: { bg: 'bg-pink-600', border: 'border-pink-200', text: 'text-pink-600', light: 'bg-pink-50' }
}

export default function ResourceAssignmentV2({
  itineraryId,
  startDate,
  endDate,
  numTravelers,
  clientName,
  tripName,
  onUpdate
}: ResourceAssignmentV2Props) {
  const t = useTranslations('resourceAssignment')
  const dialog = useConfirmDialog()
  const [activeTab, setActiveTab] = useState('guide')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Filter states for modal
  const [modalCityFilter, setModalCityFilter] = useState('all')
  const [modalRouteFilter, setModalRouteFilter] = useState('all')
  const [modalAirportFilter, setModalAirportFilter] = useState('all')
  
  // Available resources from each table
  const [availableResources, setAvailableResources] = useState<Record<string, Resource[]>>({})
  
  // Assigned resources for this itinerary
  const [assignedResources, setAssignedResources] = useState<AssignedResource[]>([])
  
  // Conflicts
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  
  // Add resource modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addFormData, setAddFormData] = useState({
    resource_id: '',
    start_date: startDate,
    end_date: endDate,
    notes: '',
    quantity: 1,
    // Vehicle-specific (only used when activeTab === 'vehicle')
    vehicle_tier: '' as string,
    cost_eur: null as number | null,
    cost_non_eur: null as number | null,
  })

  // Vehicle tier selection state
  const [selectedRateTiers, setSelectedRateTiers] = useState<VehicleRateResult[]>([])
  const [autoSelectedTier, setAutoSelectedTier] = useState<VehicleRateResult | null>(null)

  // WhatsApp sending state
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null)
  const [whatsAppSent, setWhatsAppSent] = useState<Set<string>>(new Set())

  // Reset filters when modal opens or tab changes
  const resetModalFilters = () => {
    setModalCityFilter('all')
    setModalRouteFilter('all')
    setModalAirportFilter('all')
  }

  // Fetch all data on mount
  useEffect(() => {
    fetchAllData()
  }, [itineraryId, startDate, endDate])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchAvailableResources(),
        fetchAssignedResources(),
        fetchConflicts()
      ])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }
  const fetchAvailableResources = async () => {
    const resources: Record<string, Resource[]> = {}
    
    for (const type of RESOURCE_TYPES) {
      try {
        const response = await fetch(`${type.apiEndpoint}?is_active=true`)
        
        // Handle 404 or other errors gracefully
        if (!response.ok) {
          console.log(`Resource API not available: ${type.apiEndpoint}`)
          resources[type.key] = []
          continue
        }
        
        const data = await response.json()
        resources[type.key] = Array.isArray(data) ? data : (data.data || [])
      } catch (error) {
        console.log(`Error fetching ${type.key}:`, error)
        resources[type.key] = []
      }
    }
    
    setAvailableResources(resources)
  }

  const fetchAssignedResources = async () => {
    try {
      const response = await fetch(`/api/itinerary-resources?itinerary_id=${itineraryId}`)
      const data = await response.json()
      
      if (data.success) {
        setAssignedResources(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching assigned resources:', error)
    }
  }

  const fetchConflicts = async () => {
    try {
      const response = await fetch(`/api/itinerary-resources/conflicts?itinerary_id=${itineraryId}`)
      const data = await response.json()
      
      if (data.success) {
        setConflicts(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching conflicts:', error)
    }
  }

  // Get filtered resources for the modal dropdown
  const getFilteredResourcesForModal = (): Resource[] => {
    const resources = availableResources[activeTab] || []
    const typeConfig = RESOURCE_TYPES.find(t => t.key === activeTab)
    
    if (!typeConfig) return resources
    
    // Filter based on resource type
    switch (typeConfig.filterType) {
      case 'city':
        // For guides, vehicles, hotels, restaurants
        if (modalCityFilter === 'all') return resources
        if (modalCityFilter === 'none') {
          return resources.filter(r => !r[typeConfig.cityField || 'city'])
        }
        return resources.filter(r => {
          const city = r[typeConfig.cityField || 'city']
          return city?.toLowerCase().includes(modalCityFilter.toLowerCase())
        })
      
      case 'airport':
        // For airport staff - filter by airport_location
        if (modalAirportFilter === 'all') return resources
        return resources.filter(r => {
          const location = r.airport_location?.toLowerCase() || ''
          return location.includes(modalAirportFilter.toLowerCase())
        })
      
      case 'hotelCity':
        // For hotel staff - filter by hotel.city
        if (modalCityFilter === 'all') return resources
        return resources.filter(r => {
          const hotelCity = r.hotel?.city?.toLowerCase() || ''
          return hotelCity.includes(modalCityFilter.toLowerCase())
        })
      
      case 'route':
        // For cruises - filter by route
        if (modalRouteFilter === 'all') return resources
        return resources.filter(r => r.route === modalRouteFilter)
      
      default:
        return resources
    }
  }

  // Get unique values for filter dropdowns
  const getUniqueAirportLocations = (): string[] => {
    const resources = availableResources['airport_staff'] || []
    const locations = new Set<string>()
    resources.forEach(r => {
      if (r.airport_location) locations.add(r.airport_location)
    })
    return Array.from(locations).sort()
  }

  const getUniqueHotelCities = (): string[] => {
    const resources = availableResources['hotel_staff'] || []
    const cities = new Set<string>()
    resources.forEach(r => {
      if (r.hotel?.city) cities.add(r.hotel.city)
    })
    return Array.from(cities).sort()
  }

  const getUniqueCruiseRoutes = (): string[] => {
    const resources = availableResources['cruise'] || []
    const routes = new Set<string>()
    resources.forEach(r => {
      if (r.route) routes.add(r.route)
    })
    return Array.from(routes)
  }

  const getUniqueCities = (type: string): string[] => {
    const resources = availableResources[type] || []
    const typeConfig = RESOURCE_TYPES.find(t => t.key === type)
    const cityField = typeConfig?.cityField || 'city'
    
    const cities = new Set<string>()
    resources.forEach(r => {
      const city = r[cityField]
      if (city) cities.add(city)
    })
    return Array.from(cities).sort()
  }

  // Handle vehicle (transportation rate) selection with auto tier logic
  const handleVehicleResourceSelection = (resourceId: string) => {
    const rate = (availableResources['vehicle'] || []).find(r => r.id === resourceId)
    if (!rate) {
      setSelectedRateTiers([])
      setAutoSelectedTier(null)
      setAddFormData(prev => ({
        ...prev,
        resource_id: resourceId,
        vehicle_tier: '',
        cost_eur: null,
        cost_non_eur: null,
      }))
      return
    }

    const allTiers = getAllVehicleTiers(rate)
    setSelectedRateTiers(allTiers)

    const pax = numTravelers || 1
    const recommended = getTransportRateForPax(rate, pax)
    setAutoSelectedTier(recommended)

    if (recommended) {
      setAddFormData(prev => ({
        ...prev,
        resource_id: resourceId,
        vehicle_tier: recommended.tier,
        cost_eur: recommended.rateEur,
        cost_non_eur: recommended.rateNonEur,
      }))
    } else {
      setAddFormData(prev => ({
        ...prev,
        resource_id: resourceId,
        vehicle_tier: allTiers.length > 0 ? allTiers[0].tier : '',
        cost_eur: allTiers.length > 0 ? allTiers[0].rateEur : null,
        cost_non_eur: allTiers.length > 0 ? allTiers[0].rateNonEur : null,
      }))
    }
  }

  const handleAddResource = async () => {
    if (!addFormData.resource_id) {
      await dialog.alert('Missing Selection', 'Please select a resource', 'warning')
      return
    }

    setSaving(true)
    try {
      const activeType = RESOURCE_TYPES.find(t => t.key === activeTab)
      const filteredResources = getFilteredResourcesForModal()
      const selectedResource = filteredResources.find(r => r.id === addFormData.resource_id)

      // Build resource name with location info
      let resourceName = selectedResource?.[activeType?.nameField || 'name'] || 'Unknown'

      // Add location context to the name
      if (activeTab === 'vehicle' && selectedResource) {
        // For vehicles (transportation rates): "Airport Transfer - Aswan · Sedan (Abdulrahman)"
        // Canonical transport service_type display labels. Legacy keys
        // (intercity_transfer, sound_light_transfer, multi_day) retained so
        // any orphan row still renders with a sensible label.
        const SERVICE_LABELS: Record<string, string> = {
          'airport_transfer': 'Airport Transfer',
          'airport_with_sightseeing': 'Airport + Sightseeing',
          'city_transfer': 'City Transfer',
          'city_tour': 'City Tour',
          'intercity': 'Intercity',
          'intercity_with_sightseeing': 'Intercity + Sightseeing',
          'half_day': 'Half Day',
          'day_tour': 'Day Tour',
          'extended_day_tour': 'Extended Day Tour',
          'sound_light': 'Sound & Light',
          'dinner_transfer': 'Dinner Transfer',
          // Legacy:
          'intercity_transfer': 'Intercity Transfer',
          'sound_light_transfer': 'Sound & Light Transfer',
          'multi_day': 'Multi Day',
        }
        const serviceLabel = selectedResource.route_name ||
          SERVICE_LABELS[selectedResource.service_type] ||
          selectedResource.service_type?.replace(/_/g, ' ') ||
          selectedResource.service_code
        const city = selectedResource.city || ''
        const dest = selectedResource.destination_city ? ` → ${selectedResource.destination_city}` : ''
        const tierLabel = addFormData.vehicle_tier
          ? addFormData.vehicle_tier.charAt(0).toUpperCase() + addFormData.vehicle_tier.slice(1)
          : ''
        const supplier = selectedResource.supplier?.name || selectedResource.supplier_name || ''

        resourceName = `${serviceLabel} - ${city}${dest}`
        if (tierLabel) resourceName += ` · ${tierLabel}`
        if (supplier) resourceName += ` (${supplier})`
      } else if (activeTab === 'airport_staff' && selectedResource?.airport_location) {
        resourceName += ` (${selectedResource.airport_location})`
      } else if (activeTab === 'hotel_staff' && selectedResource?.hotel?.name) {
        resourceName += ` - ${selectedResource.hotel.name}`
      } else if (activeTab === 'cruise' && selectedResource?.route) {
        const routeLabels: Record<string, string> = {
          'luxor_aswan': 'Luxor → Aswan',
          'aswan_luxor': 'Aswan → Luxor',
          'round_trip': 'Round Trip'
        }
        resourceName += ` (${routeLabels[selectedResource.route] || selectedResource.route})`
      } else if (selectedResource?.city && ['guide', 'hotel', 'restaurant'].includes(activeTab)) {
        resourceName += ` (${selectedResource.city})`
      }

      // Build notes — prepend tier metadata for vehicles
      const notesPayload = activeTab === 'vehicle' && addFormData.vehicle_tier
        ? `[tier:${addFormData.vehicle_tier}]${addFormData.notes ? ' ' + addFormData.notes : ''}`
        : addFormData.notes

      const response = await fetch('/api/itinerary-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary_id: itineraryId,
          resource_type: activeTab,
          resource_id: addFormData.resource_id,
          resource_name: resourceName,
          start_date: addFormData.start_date,
          end_date: addFormData.end_date,
          notes: notesPayload,
          quantity: addFormData.quantity,
          cost_eur: activeTab === 'vehicle' ? addFormData.cost_eur : undefined,
          cost_non_eur: activeTab === 'vehicle' ? addFormData.cost_non_eur : undefined,
          status: 'confirmed'
        })
      })

      const data = await response.json()

      if (data.success) {
        await fetchAssignedResources()
        await fetchConflicts()
        setShowAddModal(false)
        resetAddForm()
        if (onUpdate) onUpdate()
      } else {
        await dialog.alert('Error', data.error || 'Failed to add resource', 'warning')
      }
    } catch (error) {
      console.error('Error adding resource:', error)
      await dialog.alert('Error', 'Failed to add resource', 'warning')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveResource = async (resourceId: string) => {
    const confirmed = await dialog.confirm({
      message: 'Remove this resource assignment?',
      variant: 'danger',
      confirmText: 'Remove',
      cancelText: 'Cancel'
    })
    if (!confirmed) return

    try {
      const response = await fetch(`/api/itinerary-resources?id=${resourceId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        await fetchAssignedResources()
        await fetchConflicts()
        if (onUpdate) onUpdate()
      } else {
        await dialog.alert('Error', data.error || 'Failed to remove resource', 'warning')
      }
    } catch (error) {
      console.error('Error removing resource:', error)
      await dialog.alert('Error', 'Failed to remove resource', 'warning')
    }
  }

  // WhatsApp notification handler
  const handleSendWhatsApp = async (resource: AssignedResource) => {
    const typeConfig = RESOURCE_TYPES.find(t => t.key === resource.resource_type)
    if (!typeConfig?.canNotify) return

    setSendingWhatsApp(resource.id)
    
    try {
      let endpoint = ''
      let body: any = {}

      if (resource.resource_type === 'guide') {
        endpoint = '/api/whatsapp/notify-guide'
        body = { 
          itineraryId, 
          guideId: resource.resource_id 
        }
      } else if (['restaurant', 'airport_staff', 'hotel_staff'].includes(resource.resource_type)) {
        endpoint = '/api/whatsapp/notify-resource'
        body = {
          itineraryId,
          resourceId: resource.resource_id,
          resourceType: resource.resource_type,
          resourceName: resource.resource_name,
          startDate: resource.start_date,
          endDate: resource.end_date,
          notes: resource.notes
        }
      } else {
        console.log('No WhatsApp endpoint for resource type:', resource.resource_type)
        return
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (data.success) {
        setWhatsAppSent(prev => new Set([...prev, resource.id]))
        setTimeout(() => {
          setWhatsAppSent(prev => {
            const newSet = new Set(prev)
            newSet.delete(resource.id)
            return newSet
          })
        }, 3000)
      } else {
        await dialog.alert('Error', data.error || 'Failed to send WhatsApp notification', 'warning')
      }
    } catch (error) {
      console.error('Error sending WhatsApp:', error)
      await dialog.alert('Error', 'Failed to send WhatsApp notification', 'warning')
    } finally {
      setSendingWhatsApp(null)
    }
  }

  const resetAddForm = () => {
    setAddFormData({
      resource_id: '',
      start_date: startDate,
      end_date: endDate,
      notes: '',
      quantity: 1,
      vehicle_tier: '',
      cost_eur: null,
      cost_non_eur: null,
    })
    setSelectedRateTiers([])
    setAutoSelectedTier(null)
    resetModalFilters()
  }

  const getResourcesForType = (type: string) => {
    return assignedResources.filter(r => r.resource_type === type)
  }

  const getConflictsForType = (type: string) => {
    return conflicts.filter(c => 
      assignedResources.some(r => r.resource_type === type && r.resource_id === c.resource_id)
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <span className="ml-3 text-gray-600">{t('loadingResources')}</span>
        </div>
      </div>
    )
  }

  const activeTypeConfig = RESOURCE_TYPES.find(t => t.key === activeTab)!
  const activeColor = COLOR_CLASSES[activeTypeConfig.color]
  const activeResources = getResourcesForType(activeTab)
  const activeConflicts = getConflictsForType(activeTab)
  const filteredAvailableResources = getFilteredResourcesForModal()
  const allAvailableForType = availableResources[activeTab] || []

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{t('resourceAssignment')}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatDate(startDate)} - {formatDate(endDate)} • {numTravelers} {t('travelers')}
          </p>
        </div>
        {conflicts.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm">
            <AlertCircle className="w-4 h-4" />
            <span className="font-medium">{conflicts.length} {t('conflict', { count: conflicts.length })}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <div className="flex min-w-max">
          {RESOURCE_TYPES.map((type) => {
            const Icon = type.icon
            const count = getResourcesForType(type.key).length
            const hasConflict = getConflictsForType(type.key).length > 0
            const isActive = activeTab === type.key
            const colorClass = COLOR_CLASSES[type.color]

            return (
              <button
                type="button"
                key={type.key}
                onClick={() => setActiveTab(type.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? `${colorClass.text} border-current`
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t(type.labelKey)}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                    isActive ? colorClass.light + ' ' + colorClass.text : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
                {hasConflict && (
                  <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Conflicts Warning */}
        {activeConflicts.length > 0 && (
          <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800">{t('schedulingConflictsDetected')}</p>
                <ul className="mt-2 text-sm text-orange-700 space-y-1">
                  {activeConflicts.map((conflict, idx) => (
                    <li key={idx}>
                      <strong>{conflict.resource_name}</strong> {t('isAlsoBookedFor', { itinerary: conflict.conflicting_itinerary, dates: conflict.dates })}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Assigned Resources List */}
        {activeResources.length > 0 ? (
          <div className="space-y-3 mb-4">
            {activeResources.map((resource) => {
              const typeConfig = RESOURCE_TYPES.find(t => t.key === resource.resource_type)
              const canNotify = typeConfig?.canNotify || false
              const isSending = sendingWhatsApp === resource.id
              const wasSent = whatsAppSent.has(resource.id)
              
              return (
                <div 
                  key={resource.id}
                  className={`p-4 rounded-lg border ${activeColor.border} ${activeColor.light}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{resource.resource_name}</span>
                        {resource.quantity > 1 && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                            ×{resource.quantity}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          resource.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          resource.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {resource.status}
                        </span>
                        {resource.resource_type === 'vehicle' && resource.cost_eur != null && resource.cost_eur > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                            EUR {resource.cost_eur.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(resource.start_date)}
                          {resource.end_date && resource.end_date !== resource.start_date && (
                            <> - {formatDate(resource.end_date)}</>
                          )}
                        </span>
                        {resource.notes && (
                          <span className="text-gray-500 truncate max-w-xs">• {resource.notes}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* WhatsApp Button */}
                      {canNotify && (
                        <button
                          type="button"
                          onClick={() => handleSendWhatsApp(resource)}
                          disabled={isSending}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            wasSent
                              ? 'bg-green-100 text-green-700'
                              : 'bg-[#25D366] text-white hover:bg-[#20BD5A]'
                          } disabled:opacity-50`}
                          title={t('sendWhatsAppNotification')}
                        >
                          {isSending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : wasSent ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <MessageCircle className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">
                            {isSending ? t('sending') : wasSent ? t('sent') : t('notify')}
                          </span>
                        </button>
                      )}

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveResource(resource.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={t('remove')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 mb-4">
            <activeTypeConfig.icon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>{t('noResourcesAssignedYet', { type: t(activeTypeConfig.labelKey).toLowerCase() })}</p>
          </div>
        )}

        {/* Add Button */}
        <button
          type="button"
          onClick={() => {
            resetAddForm()
            setShowAddModal(true)
          }}
          className={`w-full py-3 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${activeColor.border} ${activeColor.text} hover:${activeColor.light}`}
        >
          <Plus className="w-4 h-4" />
          {t('addResource', { type: t(activeTypeConfig.labelKey).slice(0, -1) })}
        </button>

        {/* Available count */}
        <p className="text-xs text-gray-500 mt-2 text-center">
          {t('resourcesAvailable', { count: allAvailableForType.length, type: t(activeTypeConfig.labelKey).toLowerCase() })}
        </p>
      </div>

      {/* Add Resource Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('addResource', { type: t(activeTypeConfig.labelKey).slice(0, -1) })}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
                title={t('close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              
              {/* ===== FILTER SECTION ===== */}

              {/* City Filter - for guides, vehicles, hotels, restaurants */}
              {activeTypeConfig.filterType === 'city' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <MapPin className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    {t('filterByCity')}
                  </label>
                  <select
                    value={modalCityFilter}
                    onChange={(e) => {
                      setModalCityFilter(e.target.value)
                      setAddFormData({ ...addFormData, resource_id: '' })
                    }}
                    title={t('filterByCity')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  >
                    <option value="all">{t('allCities')} ({allAvailableForType.length})</option>
                    <option value="none">{t('noCityAssigned')} ({allAvailableForType.filter(r => !r[activeTypeConfig.cityField || 'city']).length})</option>
                     {getUniqueCities(activeTab).map((city) => {
                      const count = allAvailableForType.filter(r => r[activeTypeConfig.cityField || 'city'] === city).length
                      return (
                        <option key={city} value={city}>
                          {city} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* Airport Location Filter - for airport staff */}
              {activeTypeConfig.filterType === 'airport' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Plane className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    {t('filterByAirport')}
                  </label>
                  <select
                    value={modalAirportFilter}
                    onChange={(e) => {
                      setModalAirportFilter(e.target.value)
                      setAddFormData({ ...addFormData, resource_id: '' })
                    }}
                    title={t('filterByAirport')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  >
                    <option value="all">{t('allAirports')} ({allAvailableForType.length})</option>
                    {getUniqueAirportLocations().map((location) => {
                      const count = allAvailableForType.filter(r => r.airport_location === location).length
                      return (
                        <option key={location} value={location}>
                          {location} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* Hotel City Filter - for hotel staff */}
              {activeTypeConfig.filterType === 'hotelCity' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Hotel className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    {t('filterByHotelCity')}
                  </label>
                  <select
                    value={modalCityFilter}
                    onChange={(e) => {
                      setModalCityFilter(e.target.value)
                      setAddFormData({ ...addFormData, resource_id: '' })
                    }}
                    title={t('filterByHotelCity')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  >
                    <option value="all">{t('allCities')} ({allAvailableForType.length})</option>
                    {getUniqueHotelCities().map((city) => {
                      const count = allAvailableForType.filter(r => r.hotel?.city === city).length
                      return (
                        <option key={city} value={city}>
                          {city} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* Route Filter - for cruises */}
              {activeTypeConfig.filterType === 'route' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Anchor className="w-4 h-4 inline mr-1.5 text-gray-400" />
                    {t('filterByRoute')}
                  </label>
                  <select
                    value={modalRouteFilter}
                    onChange={(e) => {
                      setModalRouteFilter(e.target.value)
                      setAddFormData({ ...addFormData, resource_id: '' })
                    }}
                    title={t('filterByRoute')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  >
                    <option value="all">{t('allRoutes')} ({allAvailableForType.length})</option>
                    {CRUISE_ROUTE_OPTIONS.filter(r => r.value !== 'all' && getUniqueCruiseRoutes().includes(r.value)).map((route) => {
                      const count = allAvailableForType.filter(r => r.route === route.value).length
                      return (
                        <option key={route.value} value={route.value}>
                          {route.label} ({count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )}

              {/* ===== RESOURCE SELECTION ===== */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('selectResource', { type: t(activeTypeConfig.labelKey).slice(0, -1) })} *
                </label>
                <select
                  value={addFormData.resource_id}
                  onChange={(e) => {
                    if (activeTab === 'vehicle') {
                      handleVehicleResourceSelection(e.target.value)
                    } else {
                      setAddFormData({ ...addFormData, resource_id: e.target.value })
                    }
                  }}
                  title={t('selectResource', { type: t(activeTypeConfig.labelKey).slice(0, -1) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                >
                  <option value="">{t('choose')}</option>
                  {filteredAvailableResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {activeTypeConfig.displayField(resource)}
                    </option>
                  ))}
                </select>
                {filteredAvailableResources.length === 0 && (
                  <p className="text-sm text-orange-600 mt-2">
                    {t('noResourcesFoundForFilter', { type: t(activeTypeConfig.labelKey).toLowerCase() })}
                  </p>
                )}
                {(modalCityFilter !== 'all' || modalAirportFilter !== 'all' || modalRouteFilter !== 'all') && filteredAvailableResources.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t('showingOfTotal', { showing: filteredAvailableResources.length, total: allAvailableForType.length })}
                  </p>
                )}
              </div>

              {/* ===== VEHICLE TIER SELECTION ===== */}
              {activeTab === 'vehicle' && addFormData.resource_id && selectedRateTiers.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Truck className="w-4 h-4 inline mr-1.5 text-green-600" />
                    {t('vehicleTier')}
                    {numTravelers && (
                      <span className="text-xs text-gray-500 ml-2">
                        ({t('autoSelectedForPax', { count: numTravelers })})
                      </span>
                    )}
                  </label>
                  <select
                    value={addFormData.vehicle_tier}
                    onChange={(e) => {
                      const tier = selectedRateTiers.find(t => t.tier === e.target.value)
                      if (tier) {
                        setAddFormData(prev => ({
                          ...prev,
                          vehicle_tier: tier.tier,
                          cost_eur: tier.rateEur,
                          cost_non_eur: tier.rateNonEur,
                        }))
                      }
                    }}
                    title={t('vehicleTier')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent bg-white"
                  >
                    {selectedRateTiers.map((tier) => (
                      <option key={tier.tier} value={tier.tier}>
                        {tier.vehicleType} — EUR {tier.rateEur.toFixed(2)} ({tier.capacityMin}-{tier.capacityMax} pax)
                        {tier.tier === autoSelectedTier?.tier ? ' \u2713 Recommended' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Rate display */}
                  {addFormData.cost_eur != null && (
                    <div className="mt-2 flex items-center gap-4 text-sm">
                      <span className="text-green-700 font-medium">
                        EUR {addFormData.cost_eur.toFixed(2)}
                      </span>
                      {addFormData.cost_non_eur != null && addFormData.cost_non_eur !== addFormData.cost_eur && (
                        <span className="text-gray-500">
                          / Non-EUR {addFormData.cost_non_eur.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('startDate')}
                  </label>
                  <input
                    type="date"
                    value={addFormData.start_date}
                    onChange={(e) => setAddFormData({ ...addFormData, start_date: e.target.value })}
                    min={startDate}
                    max={endDate}
                    title={t('startDate')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('endDate')}
                  </label>
                  <input
                    type="date"
                    value={addFormData.end_date}
                    onChange={(e) => setAddFormData({ ...addFormData, end_date: e.target.value })}
                    min={addFormData.start_date}
                    max={endDate}
                    title={t('endDate')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Quantity (for hotels/vehicles) */}
              {['hotel', 'vehicle'].includes(activeTab) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('quantity')} {activeTab === 'hotel' ? t('rooms') : t('vehiclesCount')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={addFormData.quantity}
                    onChange={(e) => setAddFormData({ ...addFormData, quantity: parseInt(e.target.value) || 1 })}
                    title={t('quantity')}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('notes')}
                </label>
                <textarea
                  rows={2}
                  value={addFormData.notes}
                  onChange={(e) => setAddFormData({ ...addFormData, notes: e.target.value })}
                  placeholder={t('notesPlaceholder')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleAddResource}
                disabled={saving || !addFormData.resource_id}
                className={`px-6 py-2 text-white rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${activeColor.bg} hover:opacity-90`}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('adding')}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {t('addResource', { type: t(activeTypeConfig.labelKey).slice(0, -1) })}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}