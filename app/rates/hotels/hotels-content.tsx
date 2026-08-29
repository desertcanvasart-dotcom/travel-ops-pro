'use client'

import { todayLocal } from '@/lib/today'
import { useEffect, useState, useRef } from 'react'
import CityOptions from '@/app/components/CityOptions'
import { firstInvalidMessage } from '@/lib/form-guard'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import { NO_SUPPLIER_SENTINEL } from '@/lib/suppliers/supplier-field-constants'
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  LayoutGrid,
  List,
  Table2,
  Star,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  CheckCircle2,
  Crown,
  ExternalLink,
  User,
  AtSign
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import RateAuditLog from '@/app/components/RateAuditLog'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import RatePeriodsImportExport from '@/app/components/RatePeriodsImportExport'
import RateSeasonsEditor from '@/components/rates/RateSeasonsEditor'
import { seasonsForRow, type RateSeason } from '@/lib/rates/rate-seasons'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'

// ============================================
// EGYPTIAN CITIES - Complete List
// ============================================

const TIER_OPTIONS_CONFIG = [
  { value: 'budget', labelKey: 'budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', labelKey: 'standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', labelKey: 'deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', labelKey: 'luxury', color: 'bg-amber-100 text-amber-700' }
]

const BOARD_BASIS_OPTIONS_CONFIG = [
  { value: 'RO', labelKey: 'roomOnly' },
  { value: 'BB', labelKey: 'bedBreakfast' },
  { value: 'HB', labelKey: 'halfBoard' },
  { value: 'FB', labelKey: 'fullBoard' },
  { value: 'AI', labelKey: 'allInclusive' }
]

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface Supplier {
  id: string
  name: string
  city?: string
  contact_phone?: string
  contact_email?: string
  star_rating?: number
  tier?: string
  is_preferred?: boolean
}

interface AccommodationRate {
  id: string
  service_code: string
  property_name: string
  property_type?: string
  city?: string
  board_basis?: string
  rate_currency?: string | null
  // Hotel contacts
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  reservations_email?: string
  reservations_phone?: string
  // Low Season - Per Person rates EUR
  pp_double_eur?: number
  single_supp_eur?: number
  triple_red_eur?: number
  // Low Season - Per Person rates Non-EUR
  pp_double_non_eur?: number
  single_supp_non_eur?: number
  triple_red_non_eur?: number
  // Low Season dates
  low_season_from?: string
  low_season_to?: string
  // High Season - Per Person rates EUR
  high_pp_double_eur?: number
  high_single_supp_eur?: number
  high_triple_red_eur?: number
  // High Season - Per Person rates Non-EUR
  high_pp_double_non_eur?: number
  high_single_supp_non_eur?: number
  high_triple_red_non_eur?: number
  // High Season dates
  high_season_from?: string
  high_season_to?: string
  // Peak Season - Per Person rates EUR
  peak_pp_double_eur?: number
  peak_single_supp_eur?: number
  peak_triple_red_eur?: number
  // Peak Season - Per Person rates Non-EUR
  peak_pp_double_non_eur?: number
  peak_single_supp_non_eur?: number
  peak_triple_red_non_eur?: number
  // Peak Season dates
  peak_season_from?: string
  peak_season_to?: string
  peak_season_2_from?: string
  peak_season_2_to?: string
  // Validity
  rate_valid_from?: string
  rate_valid_to?: string
  tier?: string
  supplier_name?: string
  supplier_id?: string
  supplier?: Supplier
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

type ViewMode = 'table' | 'cards' | 'compact'

// ============================================
// TOAST COMPONENT
// ============================================
function ToastNotification({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = toast.type === 'success' ? 'bg-green-50 border-green-200' :
                  toast.type === 'error' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200'
  
  const iconColor = toast.type === 'success' ? 'text-green-600' :
                    toast.type === 'error' ? 'text-red-600' :
                    'text-blue-600'
  
  const textColor = toast.type === 'success' ? 'text-green-800' :
                    toast.type === 'error' ? 'text-red-800' :
                    'text-blue-800'


  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${bgColor} animate-slide-in`}>
      {toast.type === 'success' ? (
        <CheckCircle2 className={`w-5 h-5 ${iconColor}`} />
      ) : (
        <AlertCircle className={`w-5 h-5 ${iconColor}`} />
      )}
      <span className={`text-sm font-medium ${textColor}`}>{toast.message}</span>
      <button onClick={onClose} className={`ml-2 ${iconColor} hover:opacity-70`}>
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function TierBadge({ tier, t }: { tier: string | undefined; t: (key: string) => string }) {
  const tierConfig = TIER_OPTIONS_CONFIG.find(tc => tc.value === tier) || TIER_OPTIONS_CONFIG[1]
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierConfig.color}`}>
      {t(`tiers.${tierConfig.labelKey}`)}
    </span>
  )
}

// ============================================
// PAGINATION COMPONENT
// ============================================
function Pagination({
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  t
}: {
  currentPage: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (items: number) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const goToPage = (page: number) => {
    onPageChange(Math.max(1, Math.min(page, totalPages)))
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{t('show')}</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#647C47] bg-white"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{t('perPage')}</span>
        </div>
        <span className="text-sm text-gray-500">
          {t('showingHotels', { start: startIndex + 1, end: endIndex, total: totalItems })}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('firstPage')}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('previousPage')}
        >
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

        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('nextPage')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed"
          title={t('lastPage')}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function HotelsContent() {
  const t = useTranslations('rates.hotels')
  const tPeriods = useTranslations('rates.ratePeriods')
  const tCommon = useTranslations('rates.common')
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialog = useConfirmDialog()

  // Currency conversion
  const { currency, formatWithConversion, rateCurrency } = useCurrency()
  const formatRate = (amount: number) => formatWithConversion(amount, rateCurrency)

  const [rates, setRates] = useState<AccommodationRate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<AccommodationRate | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [filterTier, setFilterTier] = useState<string | null>(null)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const today = todayLocal()
  const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0]
  
  const [formData, setFormData] = useState({
    service_code: '',
    property_name: '',
    property_type: 'hotel',
    city: '',
    board_basis: 'BB',
    rate_currency: '',
    // Hotel contacts (NEW)
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    reservations_email: '',
    reservations_phone: '',
    // Dated rate periods, each with its own rates. The legacy low_/high_/peak_
    // fields below stay in the payload so the API can keep mirroring the first
    // period onto them for readers that have no travel date.
    seasons: [] as RateSeason[],
    // Low Season - Per Person
    pp_double_eur: 0,
    single_supp_eur: 0,
    triple_red_eur: 0,
    pp_double_non_eur: 0,
    single_supp_non_eur: 0,
    triple_red_non_eur: 0,
    low_season_from: '2025-05-01',
    low_season_to: '2025-09-30',
    // High Season - Per Person
    high_pp_double_eur: 0,
    high_single_supp_eur: 0,
    high_triple_red_eur: 0,
    high_pp_double_non_eur: 0,
    high_single_supp_non_eur: 0,
    high_triple_red_non_eur: 0,
    high_season_from: '2025-10-01',
    high_season_to: '2026-04-30',
    // Peak Season - Per Person
    peak_pp_double_eur: 0,
    peak_single_supp_eur: 0,
    peak_triple_red_eur: 0,
    peak_pp_double_non_eur: 0,
    peak_single_supp_non_eur: 0,
    peak_triple_red_non_eur: 0,
    peak_season_from: '2025-12-20',
    peak_season_to: '2026-01-05',
    peak_season_2_from: '',
    peak_season_2_to: '',
    // Validity
    rate_valid_from: today,
    rate_valid_to: nextYear,
    tier: 'standard',
    supplier_id: '',
    supplier_name: '',
    notes: '',
    is_active: true
  })

  // Toast helpers
  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // Generate service code based on city
  const generateServiceCode = (city?: string) => {
    const prefix = 'ACC'
    const cityCode = city ? city.substring(0, 3).toUpperCase() : 'XXX'
    const random = Math.random().toString(36).substring(2, 5).toUpperCase()
    return `${prefix}-${cityCode}-${random}`
  }

  // Fetch rates
  const fetchRates = async () => {
    try {
      const response = await fetch('/api/rates/hotels')
      const data = await response.json()
      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching rates:', error)
      showToast('error', t('messages.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  // Fetch hotel suppliers (companies only)
  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?type=hotel&status=active')
      const data = await response.json()
      if (data.success) {
        setSuppliers(data.data)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  useEffect(() => {
    setMounted(true)
    fetchRates()
    fetchSuppliers()
  }, [])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCity, selectedSupplier, showInactive, filterTier, itemsPerPage])

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  // Handle supplier selection - only sets supplier info, NOT hotel name
  const handleSupplierSelect = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || ''
    }))
  }

  // Handle city change - update service code if empty
  const handleCityChange = (city: string) => {
    setFormData(prev => ({
      ...prev,
      city,
      service_code: prev.service_code || generateServiceCode(city)
    }))
  }

  // Handle checkbox
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }))
  }

  // Open modal for new rate
  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: '',
      property_name: '',
      property_type: 'hotel',
      city: '',
      board_basis: 'BB',
      rate_currency: '',
      // Hotel contacts
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      reservations_email: '',
      reservations_phone: '',
      seasons: [] as RateSeason[],
      // Low Season - Per Person
      pp_double_eur: 0,
      single_supp_eur: 0,
      triple_red_eur: 0,
      pp_double_non_eur: 0,
      single_supp_non_eur: 0,
      triple_red_non_eur: 0,
      low_season_from: '2025-05-01',
      low_season_to: '2025-09-30',
      // High Season - Per Person
      high_pp_double_eur: 0,
      high_single_supp_eur: 0,
      high_triple_red_eur: 0,
      high_pp_double_non_eur: 0,
      high_single_supp_non_eur: 0,
      high_triple_red_non_eur: 0,
      high_season_from: '2025-10-01',
      high_season_to: '2026-04-30',
      // Peak Season - Per Person
      peak_pp_double_eur: 0,
      peak_single_supp_eur: 0,
      peak_triple_red_eur: 0,
      peak_pp_double_non_eur: 0,
      peak_single_supp_non_eur: 0,
      peak_triple_red_non_eur: 0,
      peak_season_from: '2025-12-20',
      peak_season_to: '2026-01-05',
      peak_season_2_from: '',
      peak_season_2_to: '',
      // Validity
      rate_valid_from: today,
      rate_valid_to: nextYear,
      tier: 'standard',
      supplier_id: '',
      supplier_name: '',
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  // Open modal for editing
  const handleEdit = (rate: AccommodationRate) => {
    setEditingRate(rate)
    
    // Try to find matching supplier by name if supplier_id not set
    let supplierId = rate.supplier_id || ''
    if (!supplierId && rate.supplier_name) {
      const matchingSupplier = suppliers.find(s => 
        s.name.toLowerCase() === rate.supplier_name?.toLowerCase()
      )
      if (matchingSupplier) {
        supplierId = matchingSupplier.id
      }
    }
    
    setFormData({
      service_code: rate.service_code || '',
      property_name: rate.property_name || '',
      property_type: rate.property_type || 'hotel',
      city: rate.city || '',
      board_basis: rate.board_basis || 'BB',
      rate_currency: rate.rate_currency || '',
      // Hotel contacts
      contact_name: rate.contact_name || '',
      contact_email: rate.contact_email || '',
      contact_phone: rate.contact_phone || '',
      reservations_email: rate.reservations_email || '',
      reservations_phone: rate.reservations_phone || '',
      // Opens with the row's periods, or its old low/high/peak windows
      // converted, so editing a pre-migration rate loses nothing.
      seasons: seasonsForRow(rate, 'accommodation'),
      // Low Season - Per Person
      pp_double_eur: rate.pp_double_eur || 0,
      single_supp_eur: rate.single_supp_eur || 0,
      triple_red_eur: rate.triple_red_eur || 0,
      pp_double_non_eur: rate.pp_double_non_eur || 0,
      single_supp_non_eur: rate.single_supp_non_eur || 0,
      triple_red_non_eur: rate.triple_red_non_eur || 0,
      low_season_from: rate.low_season_from || '2025-05-01',
      low_season_to: rate.low_season_to || '2025-09-30',
      // High Season - Per Person
      high_pp_double_eur: rate.high_pp_double_eur || 0,
      high_single_supp_eur: rate.high_single_supp_eur || 0,
      high_triple_red_eur: rate.high_triple_red_eur || 0,
      high_pp_double_non_eur: rate.high_pp_double_non_eur || 0,
      high_single_supp_non_eur: rate.high_single_supp_non_eur || 0,
      high_triple_red_non_eur: rate.high_triple_red_non_eur || 0,
      high_season_from: rate.high_season_from || '2025-10-01',
      high_season_to: rate.high_season_to || '2026-04-30',
      // Peak Season - Per Person
      peak_pp_double_eur: rate.peak_pp_double_eur || 0,
      peak_single_supp_eur: rate.peak_single_supp_eur || 0,
      peak_triple_red_eur: rate.peak_triple_red_eur || 0,
      peak_pp_double_non_eur: rate.peak_pp_double_non_eur || 0,
      peak_single_supp_non_eur: rate.peak_single_supp_non_eur || 0,
      peak_triple_red_non_eur: rate.peak_triple_red_non_eur || 0,
      peak_season_from: rate.peak_season_from || '2025-12-20',
      peak_season_to: rate.peak_season_to || '2026-01-05',
      peak_season_2_from: rate.peak_season_2_from || '',
      peak_season_2_to: rate.peak_season_2_to || '',
      // Validity
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      tier: rate.tier || 'standard',
      supplier_id: supplierId,
      supplier_name: rate.supplier_name || rate.supplier?.name || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    setShowModal(true)
  }

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // The browser knows which field is missing; it is only bad at saying so
    // inside a scrolling modal, where its own bubble can land off-screen and
    // the save button just appears dead. See lib/form-guard.ts.
    const invalid = firstInvalidMessage(e.currentTarget)
    if (invalid) {
      showToast('error', invalid)
      return
    }
    
    // Generate service code if empty
    const { rate_currency: pickedCurrency, ...restFormData } = formData
    const dataToSubmit = {
      ...restFormData,
      service_code: formData.service_code || generateServiceCode(formData.city),
      ...rateCurrencyPatch(pickedCurrency, editingRate?.rate_currency),
    }
    
    try {
      const url = editingRate 
  ? `/api/rates/hotels/${editingRate.id}`
  : '/api/rates/hotels'
      
      const method = editingRate ? 'PUT' : 'POST'
      
      console.log('Submitting form data:', dataToSubmit)
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSubmit)
      })
      
      const data = await response.json()
      console.log('API response:', data)
      
      if (!response.ok || !data.success) {
        const errorMsg = data.error || data.hint || `HTTP error ${response.status}`
        console.error('API error:', data)
        showToast('error', errorMsg)
        return
      }
      
      if (data.data) {
        showToast('success', editingRate ? t('messages.updated', { name: formData.property_name }) : t('messages.created', { name: formData.property_name }))
        setShowModal(false)
        fetchRates()
      } else {
        showToast('error', t('messages.noDataReturned'))
        console.error('No data in response:', data)
      }
    } catch (error) {
      console.error('Error saving rate:', error)
      showToast('error', t('messages.saveFailed'))
    }
  }

  // Delete rate
  const handleDelete = async (id: string, name: string) => {
    const confirmed = await dialog.confirmDelete('Hotel', 
      `Are you sure you want to delete "${name}"? This action cannot be undone.`
    )
    
    if (!confirmed) return
    
    try {
      const response = await fetch(`/api/rates/hotels/${id}`, {
      method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        showToast('success', t('messages.deleted', { name }))
        fetchRates()
      } else {
        await dialog.alert('Error', data.error || 'Failed to delete', 'warning')
      }
    } catch (error) {
      console.error('Error deleting rate:', error)
      await dialog.alert('Error', 'Failed to delete. Please try again.', 'warning')
    }
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || 
      rate.property_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.supplier?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.contact_name?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCity = selectedCity === 'all' || rate.city === selectedCity
    const matchesSupplier = selectedSupplier === 'all' || rate.supplier_id === selectedSupplier
    const matchesActive = showInactive || rate.is_active
    const matchesTier = filterTier === null || rate.tier === filterTier
  
    return matchesSearch && matchesCity && matchesSupplier && matchesActive && matchesTier
  })

  // Pagination calculations
  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  // Get unique cities from data
  const usedCities = Array.from(new Set(rates.map(r => r.city).filter(Boolean))).sort()

  // Stats
  const activeRates = rates.filter(r => r.is_active).length
  const linkedRates = rates.filter(r => r.supplier_id).length
  const avgRate = rates.length > 0 
    ? (rates.reduce((sum, r) => sum + (r.pp_double_eur || 0), 0) / rates.filter(r => (r.pp_double_eur || 0) > 0).length || 0).toFixed(0)
    : '0'

  // Prevent hydration mismatch
  // Hooks run before any early return: this page shows a spinner while it loads,
  // and a hook called after that spinner runs on the second render but not the
  // first. React counts them and throws "Rendered more hooks than during the
  // previous render" — the page died the moment its data arrived.
  const bulk = useBulkSelect()

  if (!mounted) {
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">{tCommon('loading')}</p>
        </div>
      </div>
    )
  }

  const handleBulkDelete = async () => {
    await bulkDeleteByIds([...bulk.selected], id => `/api/rates/hotels/${id}`)
    bulk.clear()
    fetchRates()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <ToastNotification key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between flex-wrap gap-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/suppliers?type=hotel"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                <Building2 className="w-4 h-4" />
                {t('hotelCompanies')}
              </Link>
              <BulkRateImportExport tableName="accommodation_rates" onImportComplete={fetchRates} />
              {/* The wide sheet above carries three fixed seasons; this one
                  carries as many dated periods as the contract has. */}
              <RatePeriodsImportExport entity="accommodation" />
              <button
                onClick={handleAddNew}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                {t('addRate')}
              </button>
              <Link
                href="/rates"
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                {t('backToRates')}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
            </div>
            <p className="text-xs text-gray-600">{t('totalRates')}</p>
            <p className="text-2xl font-bold text-gray-900">{rates.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">{t('active')}</p>
            <p className="text-2xl font-bold text-gray-900">{activeRates}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">{t('linked')}</p>
            <p className="text-2xl font-bold text-gray-900">{linkedRates}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400">💶</span>
              <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
            </div>
            <p className="text-xs text-gray-600">{t('avgPPDblLow')}</p>
            <p className="text-2xl font-bold text-gray-900">{formatRate(Number(avgRate))}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600">{t('cities')}</p>
            <p className="text-2xl font-bold text-gray-900">{usedCities.length}</p>
          </div>
        </div>

        {/* Search, Filters & View Toggle */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            
            {/* City Filter */}
            <div className="md:w-40 relative">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">{t('allCities')}</option>
                {usedCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Supplier/Company Filter */}
            <div className="md:w-48 relative">
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm appearance-none"
              >
                <option value="all">{t('allCompanies')}</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Tier Filter */}
            <div className="relative">
              <select
                value={filterTier || 'all'}
                onChange={(e) => setFilterTier(e.target.value === 'all' ? null : e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm appearance-none pr-8"
              >
                <option value="all">{t('allTiers')}</option>
                {TIER_OPTIONS_CONFIG.map(tier => (
                  <option key={tier.value} value={tier.value}>{t(`tiers.${tier.labelKey}`)}</option>
                ))}
              </select>
              <Crown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                showInactive 
                  ? 'bg-gray-100 border border-gray-300 text-gray-700' 
                  : 'bg-white border border-green-300 text-green-700'
              }`}
            >
              {showInactive ? tCommon('showAll') : tCommon('activeOnly')}
            </button>
            
            {/* View Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title={t('tableView')}
              >
                <Table2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded ${viewMode === 'cards' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title={t('cardView')}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={`p-1.5 rounded ${viewMode === 'compact' ? 'bg-white shadow text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
                title={t('compactView')}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              {tCommon('showing')} <span className="font-bold text-gray-900">{filteredRates.length}</span> {tCommon('of')} {rates.length} {t('hotels')}
            </p>
          </div>
        </div>

        {/* TABLE VIEW */}
        {viewMode === 'table' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <BulkDeleteBar count={bulk.selected.size} label="hotel rates" onDelete={handleBulkDelete} onClear={bulk.clear} />
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="select all" checked={paginatedRates.length > 0 && bulk.selected.size === paginatedRates.length} onChange={() => bulk.toggleAll(paginatedRates.map(r => r.id))} /></th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('hotel')}</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('company')}</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{tCommon('tier')}</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{tCommon('city')}</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('board')}</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('lowPPDbl')}</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('highPPDbl')}</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{tCommon('status')}</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{tCommon('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedRates.map((rate, index) => (
                    <tr key={rate.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                      <td className="px-3 py-2"><input type="checkbox" aria-label="select row" checked={bulk.has(rate.id)} onChange={() => bulk.toggle(rate.id)} /></td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{rate.property_name}</p>
                          <p className="text-xs text-gray-500 font-mono">{rate.service_code}</p>
                          {rate.contact_name && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3" /> {rate.contact_name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(rate.supplier?.name || rate.supplier_name) ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-sm text-gray-700">{rate.supplier?.name || rate.supplier_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TierBadge tier={rate.tier} t={t} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {rate.city || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          {rate.board_basis || 'BB'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-green-600">
                          {formatRate(rate.pp_double_eur || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-orange-600">
                          {formatRate(rate.high_pp_double_eur || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          rate.is_active 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {rate.is_active ? tCommon('active') : tCommon('inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(rate)}
                            className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(rate.id, rate.property_name)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedRates.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm font-medium">{t('noRatesFound')}</p>
                        <button
                          onClick={handleAddNew}
                          className="mt-3 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                        >
                          {t('addFirstHotel')}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {totalItems > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                startIndex={startIndex}
                endIndex={endIndex}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                t={t}
              />
            )}
          </div>
        )}

        {/* CARD VIEW */}
        {viewMode === 'cards' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedRates.map((rate) => (
                <div key={rate.id} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">{rate.property_name}</h3>
                        <p className="text-xs text-gray-500 font-mono">{rate.service_code}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {rate.is_active ? tCommon('active') : tCommon('inactive')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <TierBadge tier={rate.tier} t={t} />
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                        {rate.board_basis || 'BB'}
                      </span>
                      {rate.city && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                          {rate.city}
                        </span>
                      )}
                    </div>

                    {(rate.supplier?.name || rate.supplier_name) && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Building2 className="w-4 h-4" />
                        <span>{rate.supplier?.name || rate.supplier_name}</span>
                      </div>
                    )}

                    {rate.contact_name && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                        <User className="w-4 h-4" />
                        <span>{rate.contact_name}</span>
                        {rate.contact_email && (
                          <a href={`mailto:${rate.contact_email}`} className="text-primary-600 hover:underline">
                            <Mail className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {rate.contact_phone && (
                          <a href={`tel:${rate.contact_phone}`} className="text-primary-600 hover:underline">
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100">
                      <div className="text-center">
                        <p className="text-xs text-blue-600 font-medium">{t('low')}</p>
                        <p className="text-sm font-bold text-gray-700">{formatRate(rate.pp_double_eur || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-orange-600 font-medium">{t('high')}</p>
                        <p className="text-sm font-bold text-gray-700">{formatRate(rate.high_pp_double_eur || 0)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-red-600 font-medium">{t('peak')}</p>
                        <p className="text-sm font-bold text-gray-700">{formatRate(rate.peak_pp_double_eur || 0)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex border-t border-gray-200 divide-x divide-gray-200">
                    <button
                      onClick={() => handleEdit(rate)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      {tCommon('edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(rate.id, rate.property_name)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {tCommon('delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {totalItems > 0 && (
              <div className="mt-4 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={setItemsPerPage}
                  t={t}
                />
              </div>
            )}
          </>
        )}

        {/* COMPACT VIEW */}
        {viewMode === 'compact' && (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {paginatedRates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rate.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <span className="text-sm font-medium text-gray-900 truncate">{rate.property_name}</span>
                    <TierBadge tier={rate.tier} t={t} />
                    {rate.city && (
                      <span className="hidden md:inline px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{rate.city}</span>
                    )}
                    {(rate.supplier?.name || rate.supplier_name) && (
                      <span className="hidden lg:flex items-center gap-1 text-xs text-gray-500">
                        <Building2 className="w-3 h-3" />
                        {rate.supplier?.name || rate.supplier_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-green-600">{formatRate(rate.pp_double_eur || 0)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(rate)}
                        className="p-1 text-gray-400 hover:text-primary-600 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(rate.id, rate.property_name)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {totalItems > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                startIndex={startIndex}
                endIndex={endIndex}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
                t={t}
              />
            )}
          </div>
        )}
      </div>

      {/* ADD/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingRate ? t('editRate') : t('addRate')}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form noValidate onSubmit={handleSubmit} className="p-4">
              {/* SECTION 1: Hotel Information */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">1</span>
                  {t('hotelInformation')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('hotelName')} *</label>
                    <input
                      type="text"
                      name="property_name"
                      value={formData.property_name}
                      onChange={handleChange}
                      required
                      placeholder={t('placeholders.hotelName')}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{tCommon('serviceCode')}</label>
                    <input
                      type="text"
                      name="service_code"
                      value={formData.service_code}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm bg-gray-50"
                      placeholder={t('placeholders.autoGenerated')}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('companySupplier')}</label>
                    <select
                      required
                      value={formData.supplier_id}
                      onChange={(e) => handleSupplierSelect(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="" disabled>{t('selectCompanyOptional')}</option>
                      <option value={NO_SUPPLIER_SENTINEL}>{tCommon('noSupplierDirect')}</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      <Link href="/suppliers?type=hotel" className="text-primary-600 hover:underline flex items-center gap-1 inline">
                        <Plus className="w-3 h-3" /> {t('addNewCompany')}
                      </Link>
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{tCommon('city')} *</label>
                    <select
                      name="city"
                      value={formData.city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="">{tCommon('selectCity')}</option>
                      <CityOptions />
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('propertyType')} *</label>
                    <select
                      name="property_type"
                      value={formData.property_type}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="hotel">🏨 {t('propertyTypes.hotel')}</option>
                      <option value="resort">🏖️ {t('propertyTypes.resort')}</option>
                      <option value="apartment">🏢 {t('propertyTypes.apartment')}</option>
                      <option value="guesthouse">🏠 {t('propertyTypes.guesthouse')}</option>
                      <option value="cruise">🚢 {t('propertyTypes.cruise')}</option>
                      <option value="camp">⛺ {t('propertyTypes.camp')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('boardBasis')}</label>
                    <select
                      name="board_basis"
                      value={formData.board_basis}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      {BOARD_BASIS_OPTIONS_CONFIG.map(opt => (
                        <option key={opt.value} value={opt.value}>{t(`boardTypes.${opt.labelKey}`)}</option>
                      ))}
                    </select>
                  </div>
                  <RateCurrencyField
                    value={formData.rate_currency}
                    onChange={v => setFormData(prev => ({ ...prev, rate_currency: v }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>

              {/* SECTION 2: Hotel Contacts (NEW) */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  {t('hotelContacts')}
                </h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <User className="w-3 h-3 inline mr-1" />
                        {t('salesContactName')}
                      </label>
                      <input
                        type="text"
                        name="contact_name"
                        value={formData.contact_name}
                        onChange={handleChange}
                        placeholder={t('placeholders.salesContact')}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <Mail className="w-3 h-3 inline mr-1" />
                        {t('salesEmail')}
                      </label>
                      <input
                        type="email"
                        name="contact_email"
                        value={formData.contact_email}
                        onChange={handleChange}
                        placeholder={t('placeholders.salesEmail')}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <Phone className="w-3 h-3 inline mr-1" />
                        {t('salesPhone')}
                      </label>
                      <input
                        type="tel"
                        name="contact_phone"
                        value={formData.contact_phone}
                        onChange={handleChange}
                        placeholder={t('placeholders.phone')}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <AtSign className="w-3 h-3 inline mr-1" />
                        {t('reservationsEmail')}
                      </label>
                      <input
                        type="email"
                        name="reservations_email"
                        value={formData.reservations_email}
                        onChange={handleChange}
                        placeholder={t('placeholders.reservationsEmail')}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        <Phone className="w-3 h-3 inline mr-1" />
                        {t('reservationsPhone')}
                      </label>
                      <input
                        type="tel"
                        name="reservations_phone"
                        value={formData.reservations_phone}
                        onChange={handleChange}
                        placeholder={t('placeholders.phone')}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Service Tier */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">3</span>
                  {tCommon('tier')}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {TIER_OPTIONS_CONFIG.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, tier: tier.value })}
                      className={`px-4 py-2 text-sm rounded-lg border-2 font-medium transition-all ${
                        formData.tier === tier.value
                          ? tier.value === 'budget'
                            ? 'border-gray-600 bg-gray-100 text-gray-800'
                            : tier.value === 'standard'
                            ? 'border-blue-600 bg-blue-50 text-blue-800'
                            : tier.value === 'deluxe'
                            ? 'border-purple-600 bg-purple-50 text-purple-800'
                            : 'border-amber-600 bg-amber-50 text-amber-800'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {tier.value === 'luxury' && <Crown className="w-3.5 h-3.5 inline mr-1" />}
                      {t(`tiers.${tier.labelKey}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION 4: Rate periods */}
              {/* Was three fixed season blocks — low, high, peak — with four
                  date boxes between them. Contracts run to six or more dated
                  periods and the count varies by property, so the periods are
                  a list now. An existing rate opens with its old windows
                  already converted (see openEditModal). */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">4</span>
                  {tPeriods('titleWithCurrency', { currency: rateCurrency })}
                </h3>
                <RateSeasonsEditor
                  entity="accommodation"
                  seasons={formData.seasons}
                  currency={rateCurrency}
                  onChange={(seasons) => setFormData({ ...formData, seasons })}
                />
              </div>

              {/* SECTION 5: Rate Card Validity */}
              <div className="mb-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">5</span>
                  {t('rateCardValidity')}
                  <span className="text-xs font-normal text-gray-500 ml-2">{t('rateCardValidityDesc')}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('validFrom')}</label>
                    <input
                      type="date"
                      name="rate_valid_from"
                      value={formData.rate_valid_from}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('validTo')}</label>
                    <input
                      type="date"
                      name="rate_valid_to"
                      value={formData.rate_valid_to}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Notes & Status */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">{tCommon('notes')}</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  placeholder={t('placeholders.notes')}
                />
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleCheckboxChange}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">{tCommon('activeForBookings')}</span>
                </label>
              </div>

              {/* Change History */}
              {editingRate && (
                <div className="pt-3">
                  <RateAuditLog tableName="accommodation_rates" recordId={editingRate.id} />
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingRate ? tCommon('updateRate') : tCommon('createRate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
      `}</style>
    </div>
  )
}