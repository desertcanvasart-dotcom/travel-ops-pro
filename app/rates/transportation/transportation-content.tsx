'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
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
  Building2
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import { EGYPT_CITIES } from '@/lib/constants/egypt-cities'

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
  { key: 'sedan', label: 'Sedan', defaultMin: 1, defaultMax: 2 },
  { key: 'minivan', label: 'Minivan', defaultMin: 3, defaultMax: 7 },
  { key: 'van', label: 'Van', defaultMin: 8, defaultMax: 12 },
  { key: 'minibus', label: 'Minibus', defaultMin: 13, defaultMax: 20 },
  { key: 'bus', label: 'Bus', defaultMin: 21, defaultMax: 45 },
] as const

interface FormData {
  service_code: string
  service_type: string
  city: string
  destination_city: string
  includes: string
  season: string
  rate_valid_from: string
  rate_valid_to: string
  supplier_id: string
  supplier_name: string
  notes: string
  is_active: boolean
  // Tiered rates
  sedan_rate_eur: string
  sedan_rate_non_eur: string
  minivan_rate_eur: string
  minivan_rate_non_eur: string
  van_rate_eur: string
  van_rate_non_eur: string
  minibus_rate_eur: string
  minibus_rate_non_eur: string
  bus_rate_eur: string
  bus_rate_non_eur: string
}

const initialFormData: FormData = {
  service_code: '',
  service_type: 'airport_transfer',
  city: '',
  destination_city: '',
  includes: '',
  season: '',
  rate_valid_from: new Date().toISOString().split('T')[0],
  rate_valid_to: '2099-12-31',
  supplier_id: '',
  supplier_name: '',
  notes: '',
  is_active: true,
  sedan_rate_eur: '',
  sedan_rate_non_eur: '',
  minivan_rate_eur: '',
  minivan_rate_non_eur: '',
  van_rate_eur: '',
  van_rate_non_eur: '',
  minibus_rate_eur: '',
  minibus_rate_non_eur: '',
  bus_rate_eur: '',
  bus_rate_non_eur: '',
}

const SERVICE_TYPES = [
  { value: 'airport_transfer', label: 'Airport Transfer', needsDestination: false },
  { value: 'day_tour', label: 'Day Tour', needsDestination: false },
  { value: 'multi_day', label: 'Multi-Day', needsDestination: false },
  { value: 'city_transfer', label: 'City Transfer', needsDestination: true },
  { value: 'intercity', label: 'Intercity', needsDestination: true },
  { value: 'intercity_transfer', label: 'Intercity Transfer', needsDestination: true },
  { value: 'half_day', label: 'Half Day', needsDestination: false },
  { value: 'sound_light', label: 'Sound & Light Transfer', needsDestination: false },
  { value: 'dinner_transfer', label: 'Dinner Transfer', needsDestination: false },
  { value: 'sound_light_transfer', label: 'Sound & Light Transfer', needsDestination: false },
]

// Using centralized EGYPT_CITIES from lib/constants/egypt-cities.ts

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
  const t = useTranslations('rates.transportation')
  const tCommon = useTranslations('rates.common')
  const dialog = useConfirmDialog()

  const { formatWithConversion } = useCurrency()
  const formatRate = (eurAmount: number) => formatWithConversion(eurAmount, 'EUR')

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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchSuppliers = useCallback(async () => {
    try {
      const response = await fetch('/api/suppliers?status=active')
      if (response.ok) {
        const result = await response.json()
        const transportSuppliers = (result.data || []).filter((s: Supplier) =>
          ['transport_company', 'transport', 'driver'].includes(s.type)
        )
        setSuppliers(transportSuppliers)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }, [])

  const fetchRates = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (cityFilter) params.append('city', cityFilter)
      if (serviceTypeFilter) params.append('serviceType', serviceTypeFilter)
      if (supplierFilter) params.append('supplier_id', supplierFilter)
      if (!showInactive) params.append('activeOnly', 'true')

      const response = await fetch(`/api/resources/transportation?${params}`)
      if (response.ok) {
        const data = await response.json()
        setRates(data)
      }
    } catch (error) {
      console.error('Error fetching transportation rates:', error)
    } finally {
      setLoading(false)
    }
  }, [cityFilter, serviceTypeFilter, supplierFilter, showInactive])

  useEffect(() => {
    fetchRates()
    fetchSuppliers()
  }, [fetchRates, fetchSuppliers])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, cityFilter, serviceTypeFilter, supplierFilter, showInactive, itemsPerPage])

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
      service_type: rate.service_type,
      city: rate.city,
      destination_city: rate.destination_city || '',
      includes: rate.includes || '',
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from,
      rate_valid_to: rate.rate_valid_to,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || rate.supplier?.name || '',
      notes: rate.notes || '',
      is_active: rate.is_active,
      sedan_rate_eur: rate.sedan_rate_eur?.toString() || '',
      sedan_rate_non_eur: rate.sedan_rate_non_eur?.toString() || '',
      minivan_rate_eur: rate.minivan_rate_eur?.toString() || '',
      minivan_rate_non_eur: rate.minivan_rate_non_eur?.toString() || '',
      van_rate_eur: rate.van_rate_eur?.toString() || '',
      van_rate_non_eur: rate.van_rate_non_eur?.toString() || '',
      minibus_rate_eur: rate.minibus_rate_eur?.toString() || '',
      minibus_rate_non_eur: rate.minibus_rate_non_eur?.toString() || '',
      bus_rate_eur: rate.bus_rate_eur?.toString() || '',
      bus_rate_non_eur: rate.bus_rate_non_eur?.toString() || '',
    })
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (!formData.city) {
      setError('Please select a city')
      setSaving(false)
      return
    }

    if (needsDestinationCity(formData.service_type) && !formData.destination_city) {
      setError('Please select a destination city for intercity/city transfer services')
      setSaving(false)
      return
    }

    // Check at least one tier has a rate
    const hasAnyRate = VEHICLE_TIERS.some(t => {
      const val = formData[`${t.key}_rate_eur` as keyof FormData] as string
      return val && parseFloat(val) > 0
    })
    if (!hasAnyRate) {
      setError('Please enter at least one vehicle tier rate')
      setSaving(false)
      return
    }

    try {
      const url = editingRate
        ? `/api/resources/transportation/${editingRate.id}`
        : '/api/resources/transportation'

      // Build submission with parsed numeric rates
      const submitData: Record<string, any> = {
        service_code: formData.service_code,
        service_type: formData.service_type,
        city: formData.city,
        destination_city: formData.destination_city || null,
        includes: formData.includes || null,
        season: formData.season || null,
        rate_valid_from: formData.rate_valid_from,
        rate_valid_to: formData.rate_valid_to,
        supplier_id: formData.supplier_id || null,
        supplier_name: formData.supplier_name || null,
        notes: formData.notes || null,
        is_active: formData.is_active,
      }

      // Add tiered rates
      for (const tier of VEHICLE_TIERS) {
        const eurVal = formData[`${tier.key}_rate_eur` as keyof FormData] as string
        const nonEurVal = formData[`${tier.key}_rate_non_eur` as keyof FormData] as string
        submitData[`${tier.key}_rate_eur`] = eurVal ? parseFloat(eurVal) : null
        submitData[`${tier.key}_rate_non_eur`] = nonEurVal ? parseFloat(nonEurVal) : null
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Car className="h-5 w-5 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-900">{t('title')}</h1>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#647C47] text-white text-sm rounded-md hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('addRate')}
        </button>
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
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
            {EGYPT_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
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
              <option key={type.value} value={type.value}>{type.label}</option>
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
      </div>

      {/* Card Grid */}
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
            const serviceLabel = SERVICE_TYPES.find(t => t.value === rate.service_type)?.label || rate.service_type

            return (
              <div
                key={rate.id}
                className={`bg-white rounded-lg border ${rate.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'} hover:shadow-md transition-shadow`}
              >
                {/* Card Header */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">{rate.service_code}</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {rate.is_active ? 'Active' : 'Inactive'}
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
                            {rate.city} → {rate.destination_city}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">{rate.city}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => openEditModal(rate)}
                        className="p-1 text-gray-400 hover:text-[#647C47] transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(rate)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
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

                {/* Vehicle Tiers Table */}
                <div className="px-4 py-2">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-gray-400">
                        <th className="text-left py-1 font-medium">Vehicle</th>
                        <th className="text-center py-1 font-medium">Pax</th>
                        <th className="text-right py-1 font-medium">EUR Rate</th>
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
                              <td className="py-1.5 text-xs font-medium text-gray-700">{tier.label}</td>
                              <td className="py-1.5 text-xs text-center text-gray-500">{capMin}-{capMax}</td>
                              <td className="py-1.5 text-xs text-right font-medium text-gray-900">{formatRate(eurRate)}</td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={3} className="py-2 text-xs text-center text-gray-400">No rates configured</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Card Footer */}
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

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              {/* Supplier Selection */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-700 border-b pb-2 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-cyan-600" />
                  Transport Company (Supplier)
                </h3>
                <select
                  value={formData.supplier_id}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  title="Select supplier"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                >
                  <option value="">Select supplier (optional)</option>
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
                        <option key={type.value} value={type.value}>{type.label}</option>
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
                      <option value="">Select City</option>
                      {EGYPT_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>

                  {needsDestinationCity(formData.service_type) && (
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1.5">
                        Destination City <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.destination_city}
                        onChange={(e) => handleDestinationCityChange(e.target.value)}
                        required
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47]"
                      >
                        <option value="">Select Destination</option>
                        {EGYPT_CITIES.filter(city => city !== formData.city).map(city => (
                          <option key={city} value={city}>{city}</option>
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
                        <th className="text-left px-3 py-2 font-medium">Vehicle</th>
                        <th className="text-center px-3 py-2 font-medium">Capacity</th>
                        <th className="text-center px-3 py-2 font-medium">EUR Rate</th>
                        <th className="text-center px-3 py-2 font-medium">Non-EUR Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {VEHICLE_TIERS.map(tier => (
                        <tr key={tier.key} className="border-t border-gray-200">
                          <td className="px-3 py-2">
                            <span className="text-sm font-medium text-gray-700">{tier.label}</span>
                            <span className="text-xs text-gray-400 ml-1">({tier.defaultMin}-{tier.defaultMax} pax)</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-xs text-gray-500">{tier.defaultMin}-{tier.defaultMax}</span>
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
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={formData[`${tier.key}_rate_non_eur` as keyof FormData] as string}
                              onChange={(e) => setFormData(prev => ({ ...prev, [`${tier.key}_rate_non_eur`]: e.target.value }))}
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
                <p className="text-xs text-gray-400">Leave empty for vehicle types not available for this service.</p>
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
