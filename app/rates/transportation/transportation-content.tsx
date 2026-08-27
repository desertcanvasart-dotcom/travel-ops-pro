'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useDestinationCities } from '@/app/components/useDestinationCities'
import { useTranslations } from 'next-intl'
import RateAuditLog from '@/app/components/RateAuditLog'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import { NO_SUPPLIER_SENTINEL } from '@/lib/suppliers/supplier-field-constants'
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  LayoutGrid,
  List,
  Table2,
  Loader2
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/app/contexts/PreferencesContext'

type ViewMode = 'cards' | 'table' | 'list'

// ============================================
// TYPES
// ============================================

interface TransportationRate {
  id: string
  service_code: string
  service_type: string
  city: string
  origin_city?: string | null
  destination_city?: string | null
  duration?: string | null
  area?: string | null
  route_name?: string | null
  includes?: string | null
  rate_currency?: string | null
  // Tiered vehicle rates
  sedan_rate_eur: number | null
  sedan_rate_non_eur: number | null
  sedan_capacity_min: number
  sedan_capacity_max: number
  minivan_rate_eur: number | null
  minivan_rate_non_eur: number | null
  minivan_capacity_min: number
  minivan_capacity_max: number
  van_rate_eur: number | null
  van_rate_non_eur: number | null
  van_capacity_min: number
  van_capacity_max: number
  minibus_rate_eur: number | null
  minibus_rate_non_eur: number | null
  minibus_capacity_min: number
  minibus_capacity_max: number
  bus_rate_eur: number | null
  bus_rate_non_eur: number | null
  bus_capacity_min: number
  bus_capacity_max: number
  // Legacy fields (kept for backward compat)
  vehicle_type?: string | null
  base_rate_eur?: number | null
  base_rate_non_eur?: number | null
  capacity_min?: number | null
  capacity_max?: number | null
  // Metadata
  season: string | null
  rate_valid_from: string
  rate_valid_to: string
  supplier_id: string | null
  supplier_name: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  supplier?: { id: string; name: string; city?: string } | null
}

interface Supplier {
  id: string
  name: string
  type: string
  city?: string
  status?: string
}

const VEHICLE_TIERS = [
  { key: 'sedan', labelKey: 'sedan', defaultMin: 1, defaultMax: 2 },
  { key: 'minivan', labelKey: 'minivan', defaultMin: 3, defaultMax: 7 },
  { key: 'van', labelKey: 'van', defaultMin: 8, defaultMax: 12 },
  { key: 'minibus', labelKey: 'minibus', defaultMin: 13, defaultMax: 20 },
  { key: 'bus', labelKey: 'bus', defaultMin: 21, defaultMax: 45 },
] as const

interface FormData {
  service_code: string
  route_name: string
  service_type: string
  city: string
  destination_city: string
  includes: string
  season: string
  rate_currency: string
  rate_valid_from: string
  rate_valid_to: string
  supplier_id: string
  supplier_name: string
  notes: string
  is_active: boolean
  // Tiered rates. ONE price per vehicle: a vehicle costs what it costs
  // regardless of the traveller's passport (unlike entrance fees, which keep
  // their split). The save mirrors this value into both legacy DB columns
  // (<tier>_rate_eur and _rate_non_eur) so every consumer reads the same
  // number; the currency it is in comes from the Rate currency field.
  sedan_rate_eur: string
  minivan_rate_eur: string
  van_rate_eur: string
  minibus_rate_eur: string
  bus_rate_eur: string
  // Capacity per vehicle, per route. An agency that never uses a sedan leaves
  // its rate blank and starts the minivan at 1 — the engine then picks the
  // minivan for a couple, because it is the smallest vehicle they actually run.
  sedan_capacity_min: string
  sedan_capacity_max: string
  minivan_capacity_min: string
  minivan_capacity_max: string
  van_capacity_min: string
  van_capacity_max: string
  minibus_capacity_min: string
  minibus_capacity_max: string
  bus_capacity_min: string
  bus_capacity_max: string
}

type CapacityFields = Pick<
  FormData,
  | 'sedan_capacity_min' | 'sedan_capacity_max'
  | 'minivan_capacity_min' | 'minivan_capacity_max'
  | 'van_capacity_min' | 'van_capacity_max'
  | 'minibus_capacity_min' | 'minibus_capacity_max'
  | 'bus_capacity_min' | 'bus_capacity_max'
>

/**
 * The capacity bands to show for a rate: what the row stores, or the
 * conventional band for a row saved before these were editable.
 */
function capacityFieldsFor(rate: TransportationRate | null): CapacityFields {
  const fields: Record<string, string> = {}
  for (const tier of VEHICLE_TIERS) {
    const min = rate ? (rate[`${tier.key}_capacity_min` as keyof TransportationRate] as number | null) : null
    const max = rate ? (rate[`${tier.key}_capacity_max` as keyof TransportationRate] as number | null) : null
    fields[`${tier.key}_capacity_min`] = String(min ?? tier.defaultMin)
    fields[`${tier.key}_capacity_max`] = String(max ?? tier.defaultMax)
  }
  return fields as CapacityFields
}

const initialFormData: FormData = {
  service_code: '',
  route_name: '',
  service_type: 'airport_transfer',
  city: '',
  destination_city: '',
  includes: '',
  season: '',
  rate_currency: '',
  rate_valid_from: new Date().toISOString().split('T')[0],
  rate_valid_to: '2099-12-31',
  supplier_id: '',
  supplier_name: '',
  notes: '',
  is_active: true,
  sedan_rate_eur: '',
  minivan_rate_eur: '',
  van_rate_eur: '',
  minibus_rate_eur: '',
  bus_rate_eur: '',
  sedan_capacity_min: '1',
  sedan_capacity_max: '2',
  minivan_capacity_min: '3',
  minivan_capacity_max: '7',
  van_capacity_min: '8',
  van_capacity_max: '12',
  minibus_capacity_min: '13',
  minibus_capacity_max: '20',
  bus_capacity_min: '21',
  bus_capacity_max: '45',
}

// Canonical service_type taxonomy (B3, locked-in 2026-06-23).
// `needsDestination: true` = the form should ask for origin_city + destination_city
// (matches the route's isIntercityType branch — only the intercity variants).
// All others are identified by city alone. `multi_day` was previously listed here
// by mistake — that value is a tour_type, not a transport service_type, and the DB
// CHECK constraint would reject it.
const SERVICE_TYPES = [
  { value: 'airport_transfer', labelKey: 'airportTransfer', needsDestination: false },
  { value: 'airport_with_sightseeing', labelKey: 'airportWithSightseeing', needsDestination: false },
  { value: 'city_transfer', labelKey: 'cityTransfer', needsDestination: false },
  { value: 'city_tour', labelKey: 'cityTour', needsDestination: false },
  { value: 'intercity', labelKey: 'intercity', needsDestination: true },
  { value: 'intercity_with_sightseeing', labelKey: 'intercityWithSightseeing', needsDestination: true },
  { value: 'half_day', labelKey: 'halfDay', needsDestination: false },
  { value: 'day_tour', labelKey: 'dayTour', needsDestination: false },
  { value: 'extended_day_tour', labelKey: 'extendedDayTour', needsDestination: false },
  { value: 'sound_light', labelKey: 'soundLight', needsDestination: false },
  { value: 'dinner_transfer', labelKey: 'dinnerTransfer', needsDestination: false },
]


const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// HELPERS
// ============================================

function getActiveTiers(rate: TransportationRate) {
  return VEHICLE_TIERS.filter(t => {
    const eurRate = rate[`${t.key}_rate_eur` as keyof TransportationRate] as number | null
    return eurRate != null && eurRate > 0
  })
}

function getMinRate(rate: TransportationRate): number {
  const rates = VEHICLE_TIERS
    .map(t => rate[`${t.key}_rate_eur` as keyof TransportationRate] as number | null)
    .filter((r): r is number => r != null && r > 0)
  return rates.length > 0 ? Math.min(...rates) : 0
}

// ============================================
// COMPONENT
// ============================================

export default function TransportationContent() {
  // City vocabulary from the destinations tables (falls back to the
  // hardcoded Egypt list until the migration is applied) — see
  // app/components/useDestinationCities.ts.
  const { cities: destinationCities } = useDestinationCities()
  const t = useTranslations('rates.transportation')
  // The banner lives at the top of a long modal; the save button is at the
  // bottom. Without this, a refusal is written where nobody is looking.
  const errorRef = useRef<HTMLDivElement | null>(null)
  const tCommon = useTranslations('rates.common')
  const tCities = useTranslations('tourBuilder.cities')
  const dialog = useConfirmDialog()

  // Helper to translate city names - falls back to original if no translation
  const translateCity = (city: string) => {
    try {
      return tCities(city as any) || city
    } catch {
      return city
    }
  }

  const { formatWithConversion, rateCurrency } = useCurrency()
  const formatRate = (amount: number) => formatWithConversion(amount, rateCurrency)

  const [rates, setRates] = useState<TransportationRate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRate, setEditingRate] = useState<TransportationRate | null>(null)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRouteDropdown, setShowRouteDropdown] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // View mode & bulk selection
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await fetch('/api/suppliers?status=active')
      if (response.ok) {
        const result = await response.json()
        const transportSuppliers = (result.data || []).filter((s: Supplier) =>
          ['transport', 'local_operator', 'driver'].includes(s.type)
        )
        setSuppliers(transportSuppliers)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }, [])

  const ratesAbortRef = useRef<AbortController | null>(null)

  const fetchRates = useCallback(async () => {
    // Cancel any in-flight fetch so a slow response for a previous filter set
    // can't overwrite results for the current filters.
    ratesAbortRef.current?.abort()
    const controller = new AbortController()
    ratesAbortRef.current = controller
    try {
      const params = new URLSearchParams()
      if (cityFilter) params.append('city', cityFilter)
      if (serviceTypeFilter) params.append('serviceType', serviceTypeFilter)
      if (supplierFilter) params.append('supplier_id', supplierFilter)
      if (!showInactive) params.append('activeOnly', 'true')

      const response = await fetch(`/api/resources/transportation?${params}`, { signal: controller.signal })
      if (response.ok) {
        const data = await response.json()
        if (controller.signal.aborted) return
        setRates(data)
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return // superseded by a newer fetch / unmount
      console.error('Error fetching transportation rates:', error)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [cityFilter, serviceTypeFilter, supplierFilter, showInactive])

  // Abort any in-flight rates fetch on unmount.
  useEffect(() => () => ratesAbortRef.current?.abort(), [])

  useEffect(() => {
    fetchRates()
    fetchSuppliers()
  }, [fetchRates, fetchSuppliers])

  useEffect(() => {
    setCurrentPage(1)
    setSelectedIds(new Set())
  }, [searchTerm, cityFilter, serviceTypeFilter, supplierFilter, showInactive, itemsPerPage])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [currentPage])

  // ============================================
  // FORM HELPERS
  // ============================================

  const needsDestinationCity = (serviceType: string) => {
    const type = SERVICE_TYPES.find(t => t.value === serviceType)
    return type?.needsDestination || false
  }

  const generateServiceCode = (city: string, serviceType: string, destinationCity?: string) => {
    if (!city) return ''
    const cityCode = city.toUpperCase().replace(/\s+/g, '-')
    const typeCode = serviceType.toUpperCase().replace(/_/g, '-')

    if (needsDestinationCity(serviceType) && destinationCity) {
      const destCode = destinationCity.toUpperCase().replace(/\s+/g, '-')
      return `${cityCode}-TO-${destCode}-${typeCode}`
    }

    return `${cityCode}-${typeCode}`
  }

  const handleCityChange = (city: string) => {
    setFormData(prev => ({
      ...prev,
      city,
      service_code: generateServiceCode(city, prev.service_type, prev.destination_city)
    }))
  }

  const handleDestinationCityChange = (destinationCity: string) => {
    setFormData(prev => ({
      ...prev,
      destination_city: destinationCity,
      service_code: generateServiceCode(prev.city, prev.service_type, destinationCity)
    }))
  }

  const handleServiceTypeChange = (serviceType: string) => {
    const needsDest = needsDestinationCity(serviceType)
    setFormData(prev => ({
      ...prev,
      service_type: serviceType,
      destination_city: needsDest ? prev.destination_city : '',
      service_code: generateServiceCode(prev.city, serviceType, needsDest ? prev.destination_city : '')
    }))
  }

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || ''
    }))
  }

  // ============================================
  // MODAL HANDLERS
  // ============================================

  const openAddModal = () => {
    setEditingRate(null)
    setFormData(initialFormData)
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (rate: TransportationRate) => {
    setEditingRate(rate)
    setError(null)
    setFormData({
      service_code: rate.service_code,
      route_name: rate.route_name || '',
      service_type: rate.service_type,
      city: rate.city,
      destination_city: rate.destination_city || '',
      includes: rate.includes || '',
      season: rate.season || '',
      rate_currency: rate.rate_currency || '',
      rate_valid_from: rate.rate_valid_from,
      rate_valid_to: rate.rate_valid_to,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || rate.supplier?.name || '',
      notes: rate.notes || '',
      is_active: rate.is_active,
      // Old rows may carry two passport prices; the form is single-price now,
      // so show the EU-column value (falling back to the other) — saving
      // collapses the row to that one number, visibly.
      sedan_rate_eur: (rate.sedan_rate_eur ?? rate.sedan_rate_non_eur)?.toString() || '',
      minivan_rate_eur: (rate.minivan_rate_eur ?? rate.minivan_rate_non_eur)?.toString() || '',
      van_rate_eur: (rate.van_rate_eur ?? rate.van_rate_non_eur)?.toString() || '',
      minibus_rate_eur: (rate.minibus_rate_eur ?? rate.minibus_rate_non_eur)?.toString() || '',
      bus_rate_eur: (rate.bus_rate_eur ?? rate.bus_rate_non_eur)?.toString() || '',
      ...capacityFieldsFor(rate),
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Every required field is checked here rather than by the browser, so the
    // reason a save did not happen is always visible and always specific.
    const refuse = (message: string) => {
      setError(message)
      setSaving(false)
      requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }

    if (!formData.supplier_id) {
      refuse('Please choose the transport company that provides this service')
      return
    }

    if (!formData.service_type) {
      refuse('Please choose a service type')
      return
    }

    if (!formData.city) {
      refuse(needsDestinationCity(formData.service_type) ? 'Please select a departure city' : 'Please select a city')
      return
    }

    if (needsDestinationCity(formData.service_type) && !formData.destination_city) {
      refuse('Please select a destination city for intercity/city transfer services')
      return
    }

    // A band that runs backwards would silently match nothing: the selector
    // looks for pax >= min && pax <= max, so 7–3 is a vehicle nobody can book.
    for (const tier of VEHICLE_TIERS) {
      const rateVal = formData[`${tier.key}_rate_eur` as keyof FormData] as string
      if (!rateVal || parseFloat(rateVal) <= 0) continue
      const min = parseInt(formData[`${tier.key}_capacity_min` as keyof FormData] as string)
      const max = parseInt(formData[`${tier.key}_capacity_max` as keyof FormData] as string)
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1) {
        refuse(`${t(tier.labelKey)}: capacity must be a number of passengers`)
        return
      }
      if (max < min) {
        refuse(`${t(tier.labelKey)}: maximum capacity cannot be below the minimum`)
        return
      }
    }

    // Check at least one tier has a rate
    const hasAnyRate = VEHICLE_TIERS.some(t => {
      const val = formData[`${t.key}_rate_eur` as keyof FormData] as string
      return val && parseFloat(val) > 0
    })
    if (!hasAnyRate) {
      refuse('Please enter a rate for at least one vehicle')
      return
    }

    try {
      const url = editingRate
        ? `/api/resources/transportation/${editingRate.id}`
        : '/api/resources/transportation'

      // Build submission with parsed numeric rates
      const submitData: Record<string, any> = {
        service_code: formData.service_code,
        route_name: formData.route_name || null,
        service_type: formData.service_type,
        city: formData.city,
        destination_city: formData.destination_city || null,
        includes: formData.includes || null,
        season: formData.season || null,
        ...rateCurrencyPatch(formData.rate_currency, editingRate?.rate_currency),
        rate_valid_from: formData.rate_valid_from,
        rate_valid_to: formData.rate_valid_to,
        supplier_id: formData.supplier_id || null,
        supplier_name: formData.supplier_name || null,
        notes: formData.notes || null,
        is_active: formData.is_active,
      }

      // Add tiered rates
      for (const tier of VEHICLE_TIERS) {
        // One price per vehicle, mirrored into both legacy passport columns
        // so nothing downstream depends on which one it reads.
        const priceVal = formData[`${tier.key}_rate_eur` as keyof FormData] as string
        const price = priceVal ? parseFloat(priceVal) : null
        submitData[`${tier.key}_rate_eur`] = price
        submitData[`${tier.key}_rate_non_eur`] = price

        const minVal = formData[`${tier.key}_capacity_min` as keyof FormData] as string
        const maxVal = formData[`${tier.key}_capacity_max` as keyof FormData] as string
        submitData[`${tier.key}_capacity_min`] = minVal ? parseInt(minVal) : null
        submitData[`${tier.key}_capacity_max`] = maxVal ? parseInt(maxVal) : null
      }

      const response = await fetch(url, {
        method: editingRate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })

      const result = await response.json()

      if (response.ok) {
        setIsModalOpen(false)
        fetchRates()
      } else {
        setError(result.error || 'Failed to save transportation rate')
      }
    } catch (error) {
      console.error('Error saving transportation rate:', error)
      setError('Failed to save transportation rate. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rate: TransportationRate) => {
    const confirmed = await dialog.confirmDelete('Transportation Rate',
      `Are you sure you want to delete "${rate.service_code}"? This action cannot be undone.`
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/resources/transportation/${rate.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        fetchRates()
        await dialog.alert('Deleted', 'Transportation rate has been deleted.', 'success')
      } else {
        await dialog.alert('Error', 'Failed to delete transportation rate. Please try again.', 'warning')
      }
    } catch (error) {
      console.error('Error deleting transportation rate:', error)
      await dialog.alert('Error', 'Failed to delete transportation rate. Please try again.', 'warning')
    }
  }

  // ============================================
  // BULK SELECTION & DELETE
  // ============================================

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedRates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedRates.map(r => r.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return

    const confirmed = await dialog.confirmDelete(
      t('deleteSelected'),
      t('bulkDeleteConfirm', { count: selectedIds.size })
    )
    if (!confirmed) return

    setBulkDeleting(true)
    let successCount = 0
    let failCount = 0

    const deletePromises = Array.from(selectedIds).map(async (id) => {
      try {
        const response = await fetch(`/api/resources/transportation/${id}`, { method: 'DELETE' })
        if (response.ok) successCount++
        else failCount++
      } catch {
        failCount++
      }
    })

    await Promise.allSettled(deletePromises)
    setBulkDeleting(false)
    setSelectedIds(new Set())

    if (failCount === 0) {
      await dialog.alert('Deleted', t('bulkDeleteSuccess', { count: successCount }), 'success')
    } else {
      await dialog.alert('Warning', t('bulkDeletePartial', { success: successCount, total: selectedIds.size, failed: failCount }), 'warning')
    }

    fetchRates()
  }

  // ============================================
  // FILTERING & PAGINATION
  // ============================================

  const filteredRates = rates.filter(rate => {
    if (!searchTerm) return true
    const search = searchTerm.toLowerCase()
    return (
      rate.service_code?.toLowerCase().includes(search) ||
      rate.city?.toLowerCase().includes(search) ||
      rate.route_name?.toLowerCase().includes(search) ||
      rate.service_type?.toLowerCase().includes(search) ||
      (rate.destination_city && rate.destination_city.toLowerCase().includes(search)) ||
      (rate.supplier_name && rate.supplier_name.toLowerCase().includes(search)) ||
      (rate.supplier?.name && rate.supplier.name.toLowerCase().includes(search))
    )
  })

  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  const goToFirstPage = () => goToPage(1)
  const goToLastPage = () => goToPage(totalPages)
  const goToPrevPage = () => goToPage(currentPage - 1)
  const goToNextPage = () => goToPage(currentPage + 1)

  // Stats
  const totalRates = rates.length
  const activeRates = rates.filter(r => r.is_active).length
  const inactiveRates = totalRates - activeRates
  const uniqueCities = [...new Set(rates.map(r => r.city))].length
  const linkedToSuppliers = rates.filter(r => r.supplier_id).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-900">{t('title')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <BulkRateImportExport tableName="transportation_rates" onImportComplete={fetchRates} />
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded-md hover:bg-[#4f6238] transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('addRate')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-500">{t('totalRates')}</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{totalRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-xs text-gray-500">{t('active')}</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{activeRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
            <span className="text-xs text-gray-500">{tCommon('inactive')}</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{inactiveRates}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500"></div>
            <span className="text-xs text-gray-500">{t('city')}</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{uniqueCities}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
            <span className="text-xs text-gray-500">{t('linked')}</span>
          </div>
          <p className="text-xl font-semibold text-gray-900 mt-1">{linkedToSuppliers}</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="relative">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            title={t('allCities')}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">{t('allCities')}</option>
            {destinationCities.map(city => (
              <option key={city} value={city}>{translateCity(city)}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
            title={t('allServiceTypes')}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">{t('allServiceTypes')}</option>
            {SERVICE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{t(type.labelKey)}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            title={t('allSuppliers')}
            className="appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-white"
          >
            <option value="">{t('allSuppliers')}</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        </div>

        <button
          type="button"
          onClick={() => setShowInactive(!showInactive)}
          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
            showInactive
              ? 'bg-gray-100 border-gray-300 text-gray-700'
              : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {showInactive ? t('hideInactive') : t('showInactive')}
        </button>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-auto">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow text-[#647C47]' : 'text-gray-500 hover:text-gray-700'}`}
            title={t('tableView')}
          >
            <Table2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('cards')}
            className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-white shadow text-[#647C47]' : 'text-gray-500 hover:text-gray-700'}`}
            title={t('cardView')}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white shadow text-[#647C47]' : 'text-gray-500 hover:text-gray-700'}`}
            title={t('listView')}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ============================================ */}
      {/* CARD VIEW */}
      {/* ============================================ */}
      {viewMode === 'cards' && (
        <>
          {paginatedRates.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
              {t('noRatesFound')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {paginatedRates.map((rate) => {
                const activeTiers = getActiveTiers(rate)
                const isIntercity = needsDestinationCity(rate.service_type)
                const supplierName = rate.supplier?.name || rate.supplier_name
                const serviceType = SERVICE_TYPES.find(st => st.value === rate.service_type)
                const serviceLabel = serviceType ? t(serviceType.labelKey) : rate.service_type

                return (
                  <div
                    key={rate.id}
                    className={`bg-white rounded-lg border ${rate.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'} hover:shadow-md transition-shadow`}
                  >
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-400">{rate.service_code}</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {rate.is_active ? t('active') : t('inactive')}
                            </span>
                          </div>
                          <h3 className="text-sm font-medium text-gray-900 mt-1 truncate">
                            {rate.route_name || serviceLabel}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                              {serviceLabel}
                            </span>
                            {isIntercity && rate.destination_city ? (
                              <span className="text-xs text-gray-500">
                                {translateCity(rate.city)} → {translateCity(rate.destination_city)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">{translateCity(rate.city)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button onClick={() => openEditModal(rate)} className="p-1 text-gray-400 hover:text-[#647C47] transition-colors" title="Edit">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(rate)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {supplierName && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Building2 className="h-3 w-3 text-gray-400" />
                          <span className="text-xs text-gray-500">{supplierName}</span>
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-2">
                      <table className="w-full">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                            <th className="text-left py-1 font-medium">{t('vehicle')}</th>
                            <th className="text-center py-1 font-medium">{t('pax')}</th>
                            <th className="text-right py-1 font-medium">{t('rateHeader', { currency: rateCurrency })}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeTiers.length > 0 ? (
                            activeTiers.map(tier => {
                              const eurRate = rate[`${tier.key}_rate_eur` as keyof TransportationRate] as number
                              const capMin = rate[`${tier.key}_capacity_min` as keyof TransportationRate] as number
                              const capMax = rate[`${tier.key}_capacity_max` as keyof TransportationRate] as number
                              return (
                                <tr key={tier.key} className="border-t border-gray-50">
                                  <td className="py-1.5 text-xs font-medium text-gray-700">{t(tier.labelKey)}</td>
                                  <td className="py-1.5 text-xs text-center text-gray-500">{capMin}-{capMax}</td>
                                  <td className="py-1.5 text-xs text-right font-medium text-gray-900">{formatRate(eurRate)}</td>
                                </tr>
                              )
                            })
                          ) : (
                            <tr>
                              <td colSpan={3} className="py-2 text-xs text-center text-gray-400">{t('noRatesConfigured')}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {rate.includes && (
                      <div className="px-4 py-2 border-t border-gray-50">
                        <p className="text-xs text-gray-500 truncate" title={rate.includes}>
                          Includes: {rate.includes}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ============================================ */}
      {/* TABLE VIEW */}
      {/* ============================================ */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left w-10">
                    <input
                      type="checkbox"
                      checked={paginatedRates.length > 0 && selectedIds.size === paginatedRates.length}
                      onChange={toggleSelectAll}
                      title={t('selectAll')}
                      className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('serviceCode')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('serviceType')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('city')}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">{t('sedan')}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">{t('minivan')}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">{t('van')}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">{t('minibus')}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">{t('bus')}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('supplier')}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">{t('status')}</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate, index) => {
                  const serviceType = SERVICE_TYPES.find(st => st.value === rate.service_type)
                  const serviceLabel = serviceType ? t(serviceType.labelKey) : rate.service_type
                  const supplierName = rate.supplier?.name || rate.supplier_name
                  const isIntercity = needsDestinationCity(rate.service_type)

                  return (
                    <tr
                      key={rate.id}
                      className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-100 transition-colors`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(rate.id)}
                          onChange={() => toggleSelection(rate.id)}
                          title={t('selectAll')}
                          className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-mono text-gray-600">{rate.service_code}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{serviceLabel}</span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700">
                        {isIntercity && rate.destination_city
                          ? `${translateCity(rate.city)} → ${translateCity(rate.destination_city)}`
                          : translateCity(rate.city)}
                      </td>
                      {VEHICLE_TIERS.map(tier => {
                        const eurRate = rate[`${tier.key}_rate_eur` as keyof TransportationRate] as number | null
                        return (
                          <td key={tier.key} className="px-3 py-2 text-right text-sm">
                            {eurRate != null && eurRate > 0 ? (
                              <span className="font-medium text-gray-900">{formatRate(eurRate)}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2">
                        {supplierName ? (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-gray-400" />
                            <span className="text-xs text-gray-600 truncate max-w-[120px]">{supplierName}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {rate.is_active ? t('active') : t('inactive')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEditModal(rate)} className="p-1 text-gray-400 hover:text-[#647C47] transition-colors" title="Edit">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(rate)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {paginatedRates.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                      <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm">{t('noRatesFound')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* LIST VIEW */}
      {/* ============================================ */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200">
            <input
              type="checkbox"
              checked={paginatedRates.length > 0 && selectedIds.size === paginatedRates.length}
              onChange={toggleSelectAll}
              title={t('selectAll')}
              className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
            />
            <span className="text-xs text-gray-500">
              {selectedIds.size > 0 ? t('selected', { count: selectedIds.size }) : t('selectAll')}
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {paginatedRates.map((rate) => {
              const activeTiers = getActiveTiers(rate)
              const serviceType = SERVICE_TYPES.find(st => st.value === rate.service_type)
              const serviceLabel = serviceType ? t(serviceType.labelKey) : rate.service_type
              const isIntercity = needsDestinationCity(rate.service_type)
              const cityDisplay = isIntercity && rate.destination_city
                ? `${translateCity(rate.city)} → ${translateCity(rate.destination_city)}`
                : translateCity(rate.city)

              return (
                <div
                  key={rate.id}
                  className={`flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors ${
                    !rate.is_active ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(rate.id)}
                      onChange={() => toggleSelection(rate.id)}
                      title={t('selectAll')}
                      className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47] flex-shrink-0"
                    />
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rate.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-xs font-mono text-gray-400 flex-shrink-0">{rate.service_code}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded flex-shrink-0">
                      {serviceLabel}
                    </span>
                    <span className="text-sm text-gray-600 truncate">{cityDisplay}</span>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                    <div className="hidden md:flex items-center gap-1 text-xs text-gray-500">
                      {activeTiers.length > 0 ? (
                        activeTiers.map((tier, idx) => {
                          const eurRate = rate[`${tier.key}_rate_eur` as keyof TransportationRate] as number
                          return (
                            <span key={tier.key}>
                              {idx > 0 && <span className="mx-0.5 text-gray-300">|</span>}
                              <span className="text-gray-400">{t(tier.labelKey)}:</span>{' '}
                              <span className="font-medium text-gray-700">{formatRate(eurRate)}</span>
                            </span>
                          )
                        })
                      ) : (
                        <span className="text-gray-300">{t('noRatesConfigured')}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditModal(rate)} className="p-1 text-gray-400 hover:text-[#647C47] transition-colors" title="Edit">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(rate)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {paginatedRates.length === 0 && (
              <div className="px-4 py-12 text-center text-gray-500">
                <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm">{t('noRatesFound')}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-40 mx-auto w-fit">
          <div className="flex items-center gap-4 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-xl">
            <span className="text-sm font-medium">
              {t('selected', { count: selectedIds.size })}
            </span>
            <div className="w-px h-5 bg-gray-600" />
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
            >
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {bulkDeleting ? t('deleting') : t('deleteSelected')}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 text-gray-400 hover:text-white transition-colors"
              title={t('deselectAll')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                title="Items per page"
                className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] bg-white"
              >
                {ITEMS_PER_PAGE_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500">per page</span>
            </div>
            <span className="text-sm text-gray-500">
              Showing {startIndex + 1}-{endIndex} of {totalItems} services
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={goToFirstPage} disabled={currentPage === 1} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed" title="First page">
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button onClick={goToPrevPage} disabled={currentPage === 1} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed" title="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={`min-w-[32px] h-8 px-2 text-sm rounded-md transition-colors ${
                      currentPage === pageNum
                        ? 'bg-[#647C47] text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button onClick={goToNextPage} disabled={currentPage === totalPages} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed" title="Next page">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={goToLastPage} disabled={currentPage === totalPages} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed" title="Last page">
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-gray-200 z-10">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingRate ? 'Edit Transportation Service' : 'Add Transportation Service'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* noValidate: the browser's own bubble points at a control that
                may be scrolled out of sight in this modal, so the submit did
                nothing and said nothing. Every rule below is checked in
                handleSubmit instead, where the message lands in the banner. */}
            <form onSubmit={handleSubmit} noValidate className="p-6 space-y-6">
              {error && (
                <div
                  ref={errorRef}
                  className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm"
                >
                  {error}
                </div>
              )}

              {/* Supplier Selection */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-cyan-600" />
                  Transport Company (Supplier) <span className="text-red-500">*</span>
                </h3>
                <select
                  required
                  value={formData.supplier_id}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  title="Select supplier"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                >
                  <option value="" disabled>Select supplier…</option>
                  <option value={NO_SUPPLIER_SENTINEL}>{tCommon('noSupplierDirect')}</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}{supplier.city ? ` (${supplier.city})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Service Info */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Service Information</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Service Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.service_type}
                      onChange={(e) => handleServiceTypeChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      {SERVICE_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{t(type.labelKey)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      Service Code
                    </label>
                    <input
                      type="text"
                      value={formData.service_code}
                      onChange={(e) => setFormData(prev => ({ ...prev, service_code: e.target.value }))}
                      placeholder="Auto-generated"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] bg-gray-50 font-mono"
                    />
                  </div>
                </div>

                {/* Route Name - Combobox with existing + suggested names */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    Route / Service Name
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.route_name}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, route_name: e.target.value }))
                        setShowRouteDropdown(true)
                      }}
                      onFocus={() => setShowRouteDropdown(true)}
                      onBlur={() => setTimeout(() => setShowRouteDropdown(false), 200)}
                      placeholder="e.g., Karnak & Luxor Temples tour transport"
                      className="w-full px-3 py-2 pr-8 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRouteDropdown(!showRouteDropdown)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  {showRouteDropdown && (() => {
                    // Collect existing route names from saved rates
                    const existingNames = [...new Set(
                      rates
                        .map(r => r.route_name)
                        .filter((n): n is string => !!n && n.trim() !== '')
                    )].sort()

                    // Build suggested names based on the selected city
                    const cityRoutes: Record<string, string[]> = {
                      'Luxor': [
                        'Karnak & Luxor Temples',
                        'Valley of the Kings & Queens',
                        'West Bank Full Day Tour',
                        'East Bank Full Day Tour',
                        'Luxor Full Day Tour (East & West Bank)',
                        'Hatshepsut Temple & Valley of the Kings',
                        'Sound & Light Show Karnak',
                        'Luxor Airport Transfer',
                        'Luxor to Hurghada Transfer',
                        'Luxor to Aswan Transfer',
                        'Luxor to Marsa Alam Transfer',
                      ],
                      'Cairo': [
                        'Pyramids & Sphinx Tour',
                        'Pyramids, Sphinx & Egyptian Museum',
                        'Old Cairo & Khan El Khalili',
                        'Islamic Cairo Walking Tour',
                        'Coptic Cairo Tour',
                        'Grand Egyptian Museum (GEM)',
                        'Saqqara & Memphis Tour',
                        'Saqqara, Memphis & Dahshur',
                        'Cairo Full Day Tour',
                        'Cairo Airport Transfer',
                        'Cairo to Alexandria Transfer',
                        'Sound & Light Show Pyramids',
                      ],
                      'Aswan': [
                        'Philae Temple & High Dam',
                        'Aswan Full Day Tour',
                        'Nubian Village Tour',
                        'Abu Simbel Day Trip',
                        'Aswan Airport Transfer',
                        'Aswan to Luxor Transfer',
                        'Aswan to Abu Simbel Transfer',
                        'Felucca Ride Transfer',
                      ],
                      'Alexandria': [
                        'Alexandria Full Day Tour',
                        'Bibliotheca Alexandrina & Citadel',
                        'Alexandria City Tour',
                        'Cairo to Alexandria Transfer',
                        'Alexandria Airport Transfer',
                      ],
                      'Hurghada': [
                        'Hurghada Airport Transfer',
                        'Hurghada to Luxor Transfer',
                        'Hurghada City Tour',
                      ],
                      'Sharm El Sheikh': [
                        'Sharm Airport Transfer',
                        'St. Catherine Day Trip',
                        'Ras Mohammed Tour',
                      ],
                    }

                    const suggested = cityRoutes[formData.city] || []

                    // Merge existing + suggested, deduplicate
                    const allOptions = [...new Set([...existingNames, ...suggested])].sort()

                    const searchText = formData.route_name.trim().toLowerCase()
                    const filtered = searchText
                      ? allOptions.filter(n => n.toLowerCase().includes(searchText))
                      : allOptions

                    if (filtered.length === 0) return null
                    return (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {existingNames.length > 0 && !searchText && (
                          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100 uppercase tracking-wide">Existing Routes</div>
                        )}
                        {filtered.filter(n => existingNames.includes(n)).map((name) => (
                          <button
                            key={`existing-${name}`}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, route_name: name }))
                              setShowRouteDropdown(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[#647C47]/10 text-gray-700 border-b border-gray-50 last:border-b-0"
                          >
                            {name}
                          </button>
                        ))}
                        {suggested.length > 0 && filtered.some(n => !existingNames.includes(n)) && !searchText && (
                          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100 uppercase tracking-wide">Suggested for {formData.city || 'selected city'}</div>
                        )}
                        {filtered.filter(n => !existingNames.includes(n)).map((name) => (
                          <button
                            key={`suggested-${name}`}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, route_name: name }))
                              setShowRouteDropdown(false)
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[#647C47]/10 text-gray-600 border-b border-gray-50 last:border-b-0"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                  <p className="text-xs text-gray-400 mt-1">Select an existing route or type a new name. Leave empty to auto-generate.</p>
                </div>

                {/* City / Route */}
                <div className={`grid gap-4 ${needsDestinationCity(formData.service_type) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">
                      {needsDestinationCity(formData.service_type) ? 'Departure City' : 'City'} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      <option value="">{t('selectDepartureCity')}</option>
                      {destinationCities.map(city => (
                        <option key={city} value={city}>{translateCity(city)}</option>
                      ))}
                    </select>
                  </div>

                  {needsDestinationCity(formData.service_type) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1.5">
                        {t('selectDestinationCity')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.destination_city}
                        onChange={(e) => handleDestinationCityChange(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      >
                        <option value="">{t('selectDestinationCity')}</option>
                        {destinationCities.filter(city => city !== formData.city).map(city => (
                          <option key={city} value={city}>{translateCity(city)}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    Includes (description)
                  </label>
                  <input
                    type="text"
                    value={formData.includes}
                    onChange={(e) => setFormData(prev => ({ ...prev, includes: e.target.value }))}
                    placeholder="e.g., Driver + AC vehicle + fuel + tolls"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                  />
                </div>
              </div>

              {/* Vehicle Tier Rates */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">
                  Vehicle Rates <span className="text-xs font-normal text-gray-400">(at least one required)</span>
                </h3>

                <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-100 text-[10px] uppercase tracking-wider text-gray-500">
                        <th className="text-left px-3 py-2 font-medium">{t('vehicle')}</th>
                        <th className="text-center px-3 py-2 font-medium">{t('capacity')}</th>
                        <th className="text-center px-3 py-2 font-medium">{t('singlePrice')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {VEHICLE_TIERS.map(tier => (
                        <tr key={tier.key} className="border-t border-gray-200">
                          <td className="px-3 py-2">
                            <span className="text-sm font-medium text-gray-700">{t(tier.labelKey)}</span>
                          </td>
                          <td className="px-3 py-2">
                            {/* Editable, because the bands are the agency's own.
                                An agency that never runs a sedan leaves its rate
                                blank and starts the minivan at 1 — and a couple
                                is then priced in the smallest vehicle they
                                actually own. */}
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                value={formData[`${tier.key}_capacity_min` as keyof FormData] as string}
                                onChange={(e) => setFormData(prev => ({ ...prev, [`${tier.key}_capacity_min`]: e.target.value }))}
                                min="1"
                                step="1"
                                aria-label={`${t(tier.labelKey)} minimum pax`}
                                className="w-12 px-1 py-1 text-xs text-center border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                              />
                              <span className="text-xs text-gray-400">–</span>
                              <input
                                type="number"
                                value={formData[`${tier.key}_capacity_max` as keyof FormData] as string}
                                onChange={(e) => setFormData(prev => ({ ...prev, [`${tier.key}_capacity_max`]: e.target.value }))}
                                min="1"
                                step="1"
                                aria-label={`${t(tier.labelKey)} maximum pax`}
                                className="w-12 px-1 py-1 text-xs text-center border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={formData[`${tier.key}_rate_eur` as keyof FormData] as string}
                              onChange={(e) => setFormData(prev => ({ ...prev, [`${tier.key}_rate_eur`]: e.target.value }))}
                              step="0.01"
                              min="0"
                              placeholder="—"
                              className="w-full px-2 py-1 text-sm text-center border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                            />
                          </td>

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400">
                  Leave the rate empty for a vehicle you do not run — it is then never used to price a trip, and the next vehicle up takes the group. Capacity is yours to set: if you carry couples in a minivan rather than a sedan, start the minivan at 1.
                </p>
              </div>

              {/* Validity & Notes */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2">Additional</h3>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Season</label>
                    <select
                      value={formData.season}
                      onChange={(e) => setFormData(prev => ({ ...prev, season: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    >
                      <option value="">All Year</option>
                      <option value="high_season">High Season</option>
                      <option value="low_season">Low Season</option>
                      <option value="peak">Peak</option>
                    </select>
                  </div>
                  <RateCurrencyField
                    value={formData.rate_currency}
                    onChange={v => setFormData(prev => ({ ...prev, rate_currency: v }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Valid From</label>
                    <input
                      type="date"
                      value={formData.rate_valid_from}
                      onChange={(e) => setFormData(prev => ({ ...prev, rate_valid_from: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1.5">Valid To</label>
                    <input
                      type="date"
                      value={formData.rate_valid_to}
                      onChange={(e) => setFormData(prev => ({ ...prev, rate_valid_to: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    placeholder="Any additional notes..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] resize-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 text-[#647C47] border-gray-300 rounded focus:ring-[#647C47]"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-600">
                    Active (available for booking)
                  </label>
                </div>
              </div>

              {/* Audit Log */}
              {editingRate && (
                <RateAuditLog tableName="transportation_rates" recordId={editingRate.id} />
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-[#647C47] text-white rounded-md hover:bg-[#4f6238] transition-colors disabled:opacity-50 min-w-[100px]"
                >
                  {saving ? 'Saving...' : editingRate ? 'Update Service' : 'Add Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
