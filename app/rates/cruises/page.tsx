'use client'

import { useEffect, useState } from 'react'
import { firstInvalidMessage } from '@/lib/form-guard'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  Ship, Plus, Search, Edit, Trash2, X, Check, ChevronDown, AlertCircle, CheckCircle2, Crown, Star,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import RateAuditLog from '@/app/components/RateAuditLog'
import { NO_SUPPLIER_SENTINEL } from '@/lib/suppliers/supplier-field-constants'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import RatePeriodsImportExport from '@/app/components/RatePeriodsImportExport'
import RateSeasonsEditor from '@/components/rates/RateSeasonsEditor'
import { seasonsForRow, type RateSeason } from '@/lib/rates/rate-seasons'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS_CONFIG = [
  { value: 'budget', labelKey: 'budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', labelKey: 'standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', labelKey: 'deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', labelKey: 'luxury', color: 'bg-amber-100 text-amber-700' }
]

const CITIES = ['Luxor', 'Aswan', 'Cairo']
const SHIP_CATEGORIES = ['budget', 'standard', 'deluxe', 'luxury']
const CABIN_TYPES = ['standard', 'deluxe', 'suite']
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface Supplier {
  id: string
  name: string
  type: string
  city?: string
}

interface Cruise {
  id: string
  cruise_code: string
  ship_name: string
  ship_category: 'standard' | 'deluxe' | 'luxury'
  route_name: string
  embark_city: string
  disembark_city: string
  duration_nights: number
  cabin_type: 'standard' | 'deluxe' | 'suite'
  // Legacy single-rate fields (kept for backward compatibility)
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number | null
  // Dated rate periods, each with its own rates. Supersedes the three fixed
  // season blocks below, which are kept for the bulk importer and for readers
  // that price without a travel date.
  seasons: RateSeason[] | null
  // Seasonal rates - Low Season
  low_season_start: string | null
  low_season_end: string | null
  rate_low_single_eur: number
  rate_low_double_eur: number
  rate_low_triple_eur: number
  rate_low_suite_eur: number
  rate_low_single_non_eur: number
  rate_low_double_non_eur: number
  rate_low_triple_non_eur: number
  rate_low_suite_non_eur: number
  // Seasonal rates - High Season
  high_season_start: string | null
  high_season_end: string | null
  rate_high_single_eur: number
  rate_high_double_eur: number
  rate_high_triple_eur: number
  rate_high_suite_eur: number
  rate_high_single_non_eur: number
  rate_high_double_non_eur: number
  rate_high_triple_non_eur: number
  rate_high_suite_non_eur: number
  // Seasonal rates - Peak Season
  peak_season_1_start: string | null
  peak_season_1_end: string | null
  peak_season_2_start: string | null
  peak_season_2_end: string | null
  rate_peak_single_eur: number
  rate_peak_double_eur: number
  rate_peak_triple_eur: number
  rate_peak_suite_eur: number
  rate_peak_single_non_eur: number
  rate_peak_double_non_eur: number
  rate_peak_triple_non_eur: number
  rate_peak_suite_non_eur: number
  // Rate validity
  rate_valid_from: string | null
  rate_valid_to: string | null
  // Other fields
  meals_included: string
  sightseeing_included: boolean
  description: string | null
  notes: string | null
  is_active: boolean
  tier: string | null
  is_preferred: boolean
  supplier_id: string | null
  created_at: string
}

interface Toast {
  id: string
  type: 'success' | 'error'
  message: string
}

// ============================================
// FORM DATA INTERFACE
// ============================================

interface CruiseFormData {
  cruise_code: string
  ship_name: string
  ship_category: 'standard' | 'deluxe' | 'luxury'
  route_name: string
  embark_city: string
  disembark_city: string
  duration_nights: number
  cabin_type: 'standard' | 'deluxe' | 'suite'
  // Legacy rates (for display/backward compatibility)
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number
  seasons: RateSeason[]
  // Low Season
  low_season_start: string
  low_season_end: string
  rate_low_single_eur: number
  rate_low_double_eur: number
  rate_low_triple_eur: number
  rate_low_suite_eur: number
  rate_low_single_non_eur: number
  rate_low_double_non_eur: number
  rate_low_triple_non_eur: number
  rate_low_suite_non_eur: number
  // High Season
  high_season_start: string
  high_season_end: string
  rate_high_single_eur: number
  rate_high_double_eur: number
  rate_high_triple_eur: number
  rate_high_suite_eur: number
  rate_high_single_non_eur: number
  rate_high_double_non_eur: number
  rate_high_triple_non_eur: number
  rate_high_suite_non_eur: number
  // Peak Season
  peak_season_1_start: string
  peak_season_1_end: string
  peak_season_2_start: string
  peak_season_2_end: string
  rate_peak_single_eur: number
  rate_peak_double_eur: number
  rate_peak_triple_eur: number
  rate_peak_suite_eur: number
  rate_peak_single_non_eur: number
  rate_peak_double_non_eur: number
  rate_peak_triple_non_eur: number
  rate_peak_suite_non_eur: number
  // Rate validity
  rate_valid_from: string
  rate_valid_to: string
  // Other
  meals_included: string
  sightseeing_included: boolean
  description: string
  notes: string
  is_active: boolean
  tier: string
  is_preferred: boolean
  supplier_id: string
}

// ============================================
// COMPONENTS
// ============================================

function TierBadge({ tier, t }: { tier: string | null; t: (key: string) => string }) {
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
          <span className="text-sm text-gray-500">{t('pagination.show')}</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{t('pagination.perPage')}</span>
        </div>
        <span className="text-sm text-gray-500">
          {t('pagination.showing', { start: startIndex + 1, end: endIndex, total: totalItems })}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={t('pagination.firstPage')}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={t('pagination.previousPage')}
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
                    ? 'bg-blue-600 text-white'
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
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={t('pagination.nextPage')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={t('pagination.lastPage')}
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

export default function CruisesPage() {
  const t = useTranslations('rates.cruises')
  const tCommon = useTranslations('rates.common')
  const tPeriods = useTranslations('rates.ratePeriods')
  const dialog = useConfirmDialog()
  const { formatWithConversion, rateCurrency } = useCurrency()
  const formatRate = (amount: number) => formatWithConversion(amount, rateCurrency)

  const [cruises, setCruises] = useState<Cruise[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedCabin, setSelectedCabin] = useState('all')
  const [filterTier, setFilterTier] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingCruise, setEditingCruise] = useState<Cruise | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // Default dates for seasons
  const currentYear = new Date().getFullYear()
  const nextYear = currentYear + 1

  const getDefaultFormData = (): CruiseFormData => ({
    cruise_code: '',
    ship_name: '',
    ship_category: 'deluxe',
    route_name: '',
    embark_city: 'Luxor',
    disembark_city: 'Aswan',
    duration_nights: 4,
    cabin_type: 'standard',
    // Legacy rates
    rate_single_eur: 0,
    rate_double_eur: 0,
    rate_triple_eur: 0,
    seasons: [],
    // Low Season (May 1 - Sep 30)
    low_season_start: `${currentYear}-05-01`,
    low_season_end: `${currentYear}-09-30`,
    rate_low_single_eur: 0,
    rate_low_double_eur: 0,
    rate_low_triple_eur: 0,
    rate_low_suite_eur: 0,
    rate_low_single_non_eur: 0,
    rate_low_double_non_eur: 0,
    rate_low_triple_non_eur: 0,
    rate_low_suite_non_eur: 0,
    // High Season (Oct 1 - Apr 30)
    high_season_start: `${currentYear}-10-01`,
    high_season_end: `${nextYear}-04-30`,
    rate_high_single_eur: 0,
    rate_high_double_eur: 0,
    rate_high_triple_eur: 0,
    rate_high_suite_eur: 0,
    rate_high_single_non_eur: 0,
    rate_high_double_non_eur: 0,
    rate_high_triple_non_eur: 0,
    rate_high_suite_non_eur: 0,
    // Peak Season (Christmas/New Year, Easter)
    peak_season_1_start: `${currentYear}-12-20`,
    peak_season_1_end: `${nextYear}-01-05`,
    peak_season_2_start: '',
    peak_season_2_end: '',
    rate_peak_single_eur: 0,
    rate_peak_double_eur: 0,
    rate_peak_triple_eur: 0,
    rate_peak_suite_eur: 0,
    rate_peak_single_non_eur: 0,
    rate_peak_double_non_eur: 0,
    rate_peak_triple_non_eur: 0,
    rate_peak_suite_non_eur: 0,
    // Rate validity
    rate_valid_from: `${currentYear}-01-01`,
    rate_valid_to: `${nextYear}-12-31`,
    // Other
    meals_included: 'full_board',
    sightseeing_included: false,
    description: '',
    notes: '',
    is_active: true,
    tier: 'standard',
    is_preferred: false,
    supplier_id: ''
  })

  const [formData, setFormData] = useState<CruiseFormData>(getDefaultFormData())

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const fetchCruises = async () => {
    try {
      const response = await fetch('/api/rates/cruises')
      const data = await response.json()
      if (data.success) {
        setCruises(data.data)
      }
    } catch (error) {
      console.error('Error fetching cruises:', error)
      showToast('error', t('notifications.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?type=cruise')
      const data = await response.json()
      if (data.success) {
        setSuppliers(data.data)
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
    }
  }

  useEffect(() => {
    fetchCruises()
    fetchSuppliers()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCategory, selectedCabin, filterTier, showInactive, itemsPerPage])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData(prev => ({ ...prev, [name]: checked }))
  }

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      ship_name: supplier?.name || prev.ship_name
    }))
  }

  const generateCode = () => {
    const ship = formData.ship_name.substring(0, 8).toUpperCase().replace(/\s+/g, '')
    const nights = formData.duration_nights
    const cabin = formData.cabin_type.substring(0, 3).toUpperCase()
    return `CRUISE-${ship}-${nights}N-${cabin}`
  }

  const handleAddNew = () => {
    setEditingCruise(null)
    setFormData(getDefaultFormData())
    setShowModal(true)
  }

  const handleEdit = (cruise: Cruise) => {
    setEditingCruise(cruise)
    setFormData({
      cruise_code: cruise.cruise_code,
      ship_name: cruise.ship_name,
      ship_category: cruise.ship_category,
      route_name: cruise.route_name,
      embark_city: cruise.embark_city,
      disembark_city: cruise.disembark_city,
      duration_nights: cruise.duration_nights,
      cabin_type: cruise.cabin_type,
      // Legacy rates
      rate_single_eur: cruise.rate_single_eur || 0,
      rate_double_eur: cruise.rate_double_eur || 0,
      rate_triple_eur: cruise.rate_triple_eur || 0,
      // Opens with the ship's periods, or its old low/high/peak windows
      // converted, so editing a pre-migration cruise loses nothing.
      seasons: seasonsForRow(cruise, 'cruise'),
      // Low Season
      low_season_start: cruise.low_season_start || `${currentYear}-05-01`,
      low_season_end: cruise.low_season_end || `${currentYear}-09-30`,
      rate_low_single_eur: cruise.rate_low_single_eur || cruise.rate_single_eur || 0,
      rate_low_double_eur: cruise.rate_low_double_eur || cruise.rate_double_eur || 0,
      rate_low_triple_eur: cruise.rate_low_triple_eur || cruise.rate_triple_eur || 0,
      rate_low_suite_eur: cruise.rate_low_suite_eur || 0,
      rate_low_single_non_eur: cruise.rate_low_single_non_eur || 0,
      rate_low_double_non_eur: cruise.rate_low_double_non_eur || 0,
      rate_low_triple_non_eur: cruise.rate_low_triple_non_eur || 0,
      rate_low_suite_non_eur: cruise.rate_low_suite_non_eur || 0,
      // High Season
      high_season_start: cruise.high_season_start || `${currentYear}-10-01`,
      high_season_end: cruise.high_season_end || `${nextYear}-04-30`,
      rate_high_single_eur: cruise.rate_high_single_eur || 0,
      rate_high_double_eur: cruise.rate_high_double_eur || 0,
      rate_high_triple_eur: cruise.rate_high_triple_eur || 0,
      rate_high_suite_eur: cruise.rate_high_suite_eur || 0,
      rate_high_single_non_eur: cruise.rate_high_single_non_eur || 0,
      rate_high_double_non_eur: cruise.rate_high_double_non_eur || 0,
      rate_high_triple_non_eur: cruise.rate_high_triple_non_eur || 0,
      rate_high_suite_non_eur: cruise.rate_high_suite_non_eur || 0,
      // Peak Season
      peak_season_1_start: cruise.peak_season_1_start || `${currentYear}-12-20`,
      peak_season_1_end: cruise.peak_season_1_end || `${nextYear}-01-05`,
      peak_season_2_start: cruise.peak_season_2_start || '',
      peak_season_2_end: cruise.peak_season_2_end || '',
      rate_peak_single_eur: cruise.rate_peak_single_eur || 0,
      rate_peak_double_eur: cruise.rate_peak_double_eur || 0,
      rate_peak_triple_eur: cruise.rate_peak_triple_eur || 0,
      rate_peak_suite_eur: cruise.rate_peak_suite_eur || 0,
      rate_peak_single_non_eur: cruise.rate_peak_single_non_eur || 0,
      rate_peak_double_non_eur: cruise.rate_peak_double_non_eur || 0,
      rate_peak_triple_non_eur: cruise.rate_peak_triple_non_eur || 0,
      rate_peak_suite_non_eur: cruise.rate_peak_suite_non_eur || 0,
      // Rate validity
      rate_valid_from: cruise.rate_valid_from || `${currentYear}-01-01`,
      rate_valid_to: cruise.rate_valid_to || `${nextYear}-12-31`,
      // Other
      meals_included: cruise.meals_included || 'full_board',
      sightseeing_included: cruise.sightseeing_included,
      description: cruise.description || '',
      notes: cruise.notes || '',
      is_active: cruise.is_active,
      tier: cruise.tier || 'standard',
      is_preferred: cruise.is_preferred || false,
      supplier_id: cruise.supplier_id || ''
    })
    setShowModal(true)
  }

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
    
    // Use low season rates as the "default" legacy rates for backward compatibility
    const submitData = {
      ...formData,
      cruise_code: formData.cruise_code || generateCode(),
      route_name: formData.route_name || `${formData.embark_city} to ${formData.disembark_city}`,
      // Set legacy rates from low season for backward compatibility
      rate_single_eur: formData.rate_low_single_eur || formData.rate_single_eur,
      rate_double_eur: formData.rate_low_double_eur || formData.rate_double_eur,
      rate_triple_eur: formData.rate_low_triple_eur || formData.rate_triple_eur || null,
      supplier_id: formData.supplier_id || null,
      peak_season_2_start: formData.peak_season_2_start || null,
      peak_season_2_end: formData.peak_season_2_end || null
    }

    try {
      const url = editingCruise 
        ? `/api/rates/cruises/${editingCruise.id}`
        : '/api/rates/cruises'
      
      const response = await fetch(url, {
        method: editingCruise ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })

      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingCruise ? t('notifications.cruiseUpdated') : t('notifications.cruiseCreated'))
        setShowModal(false)
        fetchCruises()
      } else {
        showToast('error', data.error || t('notifications.failedToSave'))
      }
    } catch (error) {
      showToast('error', t('notifications.failedToSave'))
    }
  }

  const handleDelete = async (cruise: Cruise) => {
    const confirmed = await dialog.confirmDelete(t('deleteModal.title'),
      t('deleteModal.confirmMessage', { name: cruise.ship_name, code: cruise.cruise_code })
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/rates/cruises/${cruise.id}`, { method: 'DELETE' })
      const data = await response.json()

      if (data.success) {
        showToast('success', t('notifications.cruiseDeleted'))
        fetchCruises()
      } else {
        await dialog.alert('Error', data.error || t('notifications.failedToDelete'), 'warning')
      }
    } catch (error) {
      await dialog.alert('Error', t('notifications.failedToDelete'), 'warning')
    }
  }

  const filteredCruises = cruises.filter(cruise => {
    const matchesSearch = searchTerm === '' ||
      cruise.ship_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cruise.cruise_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cruise.embark_city.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = selectedCategory === 'all' || cruise.ship_category === selectedCategory
    const matchesCabin = selectedCabin === 'all' || cruise.cabin_type === selectedCabin
    const matchesActive = showInactive || cruise.is_active
    const matchesTier = filterTier === null || cruise.tier === filterTier

    return matchesSearch && matchesCategory && matchesCabin && matchesActive && matchesTier
  })

  // Pagination calculations
  const totalItems = filteredCruises.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedCruises = filteredCruises.slice(startIndex, endIndex)

  const stats = {
    total: cruises.length,
    active: cruises.filter(c => c.is_active).length,
    preferred: cruises.filter(c => c.is_preferred).length,
    ships: new Set(cruises.map(c => c.ship_name)).size,
    avgRate: cruises.length > 0 
      ? Math.round(cruises.reduce((sum, c) => sum + c.rate_double_eur, 0) / cruises.length)
      : 0
  }

  // Hooks run before any early return: this page shows a spinner while it loads,
  // and a hook called after that spinner runs on the second render but not the
  // first. React counts them and throws "Rendered more hooks than during the
  // previous render" — the page died the moment its data arrived.
  const bulk = useBulkSelect()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  const handleBulkDelete = async () => {
    await bulkDeleteByIds([...bulk.selected], id => `/api/rates/cruises/${id}`)
    bulk.clear()
    fetchCruises()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between flex-wrap gap-y-2">
            <div className="flex items-center gap-2">
              <Ship className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <BulkRateImportExport tableName="nile_cruises" onImportComplete={fetchCruises} />
              {/* The wide sheet above carries three fixed seasons; this one
                  carries as many dated periods as the contract has. */}
              <RatePeriodsImportExport entity="cruise" />
              <button
                onClick={handleAddNew}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-4 h-4" />
                {t('addCruise')}
              </button>
              <Link href="/suppliers?type=cruise" className="px-3 py-1.5 text-sm border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 font-medium">
                {t('cruiseSuppliers')}
              </Link>
              <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
                {t('nav.ratesHub')}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 lg:px-6 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{t('stats.totalRates')}</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{t('stats.active')}</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <div className="flex items-center gap-1 mb-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            </div>
            <p className="text-xs text-gray-600">{t('stats.preferred')}</p>
            <p className="text-2xl font-bold text-amber-600">{stats.preferred}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{t('stats.ships')}</p>
            <p className="text-2xl font-bold text-blue-600">{stats.ships}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{t('stats.avgDoubleRate')}</p>
            <p className="text-2xl font-bold text-purple-600">{formatRate(stats.avgRate)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md border p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={t('filters.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">{t('filters.allCategories')}</option>
              {SHIP_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{t(`shipCategories.${cat}`)}</option>
              ))}
            </select>
            <select
              value={selectedCabin}
              onChange={(e) => setSelectedCabin(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">{t('filters.allCabins')}</option>
              {CABIN_TYPES.map(type => (
                <option key={type} value={type}>{t(`cabinTypes.${type}`)}</option>
              ))}
            </select>
            <select
              value={filterTier || 'all'}
              onChange={(e) => setFilterTier(e.target.value === 'all' ? null : e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">{t('filters.allTiers')}</option>
              <option value="budget">{t('tiers.budget')}</option>
              <option value="standard">{t('tiers.standard')}</option>
              <option value="deluxe">{t('tiers.deluxe')}</option>
              <option value="luxury">{t('tiers.luxury')}</option>
            </select>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium ${
                showInactive ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-700 border border-green-200'
              }`}
            >
              {showInactive ? t('filters.showAll') : t('filters.activeOnly')}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {t('filters.showing', { count: filteredCruises.length, total: cruises.length })}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div className="overflow-x-auto">
            <BulkDeleteBar count={bulk.selected.size} label="cruises" onDelete={handleBulkDelete} onClear={bulk.clear} />
            <table className="w-full">
              <thead className="bg-blue-50 border-b border-blue-100">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="select all" checked={paginatedCruises.length > 0 && bulk.selected.size === paginatedCruises.length} onChange={() => bulk.toggleAll(paginatedCruises.map(r => r.id))} /></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">{t('table.shipCode')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">{t('table.category')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">{t('table.route')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">{t('table.nights')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">{t('table.cabin')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">{t('table.tier')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">{t('table.single')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">{t('table.double')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-blue-800">{t('table.triple')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">{t('table.status')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedCruises.map((cruise, idx) => (
                  <tr key={cruise.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                    <td className="px-3 py-2"><input type="checkbox" aria-label="select row" checked={bulk.has(cruise.id)} onChange={() => bulk.toggle(cruise.id)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {cruise.is_preferred && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                        <div>
                          <p className="text-sm font-medium text-gray-900">{cruise.ship_name}</p>
                          <p className="text-xs text-gray-500 font-mono">{cruise.cruise_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        cruise.ship_category === 'luxury' ? 'bg-amber-100 text-amber-800' :
                        cruise.ship_category === 'deluxe' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {t(`shipCategories.${cruise.ship_category}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {cruise.embark_city} → {cruise.disembark_city}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {cruise.duration_nights}N
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        cruise.cabin_type === 'suite' ? 'bg-purple-100 text-purple-800' :
                        cruise.cabin_type === 'deluxe' ? 'bg-indigo-100 text-indigo-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {t(`cabinTypes.${cruise.cabin_type}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TierBadge tier={cruise.tier} t={t} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {formatRate(cruise.rate_single_eur)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">
                      {formatRate(cruise.rate_double_eur)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-purple-600">
                      {cruise.rate_triple_eur ? formatRate(cruise.rate_triple_eur) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        cruise.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {cruise.is_active ? t('status.active') : t('status.inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => handleEdit(cruise)} className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(cruise)} className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedCruises.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-gray-500">
                      <Ship className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">{t('empty.noCruises')}</p>
                      <button onClick={handleAddNew} className="mt-2 text-sm text-blue-600 hover:underline">
                        {t('empty.addFirst')}
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
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editingCruise ? t('form.editCruise') : t('form.addNewCruise')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form noValidate onSubmit={handleSubmit} className="p-4 space-y-6">
              {/* Section 1: Supplier Selection */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.supplier')}</label>
                <select
                  required
                  value={formData.supplier_id}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                >
                  <option value="" disabled>{t('form.selectSupplier')}</option>
                  <option value={NO_SUPPLIER_SENTINEL}>{tCommon('noSupplierDirect')}</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {t('form.supplierHelp')} <Link href="/suppliers?type=cruise" className="text-blue-600 hover:underline">{t('form.manageSuppliers')}</Link>
                </p>
              </div>

              {/* Section 2: Ship Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.shipName')} *</label>
                  <input
                    type="text"
                    name="ship_name"
                    value={formData.ship_name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    placeholder={t('form.shipNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.shipCategory')} *</label>
                  <select
                    name="ship_category"
                    value={formData.ship_category}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {SHIP_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{t(`shipCategories.${cat}`)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Section 3: Route */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.embarkCity')} *</label>
                  <select
                    name="embark_city"
                    value={formData.embark_city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {CITIES.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.disembarkCity')} *</label>
                  <select
                    name="disembark_city"
                    value={formData.disembark_city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  >
                    {CITIES.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.durationNights')} *</label>
                  <input
                    type="number"
                    name="duration_nights"
                    value={formData.duration_nights}
                    onChange={handleChange}
                    min="1"
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Section 4: Cabin Type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.cabinType')} *</label>
                <select
                  name="cabin_type"
                  value={formData.cabin_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                >
                  {CABIN_TYPES.map(type => (
                    <option key={type} value={type}>{t(`cabinTypes.${type}`)}</option>
                  ))}
                </select>
              </div>

              {/* Section 5: Service Tier & Preference */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs">2</span>
                  {t('form.serviceTier')}
                </h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {TIER_OPTIONS_CONFIG.map((tier) => (
                    <button
                      key={tier.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, tier: tier.value })}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                        formData.tier === tier.value
                          ? tier.value === 'luxury'
                            ? 'bg-amber-600 text-white'
                            : tier.value === 'deluxe'
                            ? 'bg-purple-600 text-white'
                            : tier.value === 'standard'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {tier.value === 'luxury' && <Crown className="w-3.5 h-3.5" />}
                      {t(`tiers.${tier.labelKey}`)}
                    </button>
                  ))}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_preferred}
                      onChange={(e) => setFormData({ ...formData, is_preferred: e.target.checked })}
                      className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500 mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-amber-600" />
                        {t('form.preferredCruise')}
                      </span>
                      <p className="text-xs text-amber-700 mt-0.5">
                        {t('form.preferredCruiseHelp')}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Section 6: Rate periods */}
              {/* Was three fixed season blocks — low, high, peak — with the
                  peak one carrying a second date box because ships often have
                  two. Contracts run to six or more dated periods and the count
                  varies by ship, so the periods are a list now. An existing
                  cruise opens with its old windows already converted (see
                  openEditModal). */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">3</span>
                  {tPeriods('titleWithCurrency', { currency: rateCurrency })}
                </h4>
                <RateSeasonsEditor
                  entity="cruise"
                  seasons={formData.seasons}
                  currency={rateCurrency}
                  onChange={(seasons) => setFormData({ ...formData, seasons })}
                />
              </div>

              {/* Section 7: Rate Card Validity */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-gray-600 text-white flex items-center justify-center text-xs">4</span>
                  {t('form.rateCardValidity')}
                  <span className="text-xs font-normal text-gray-500">{t('form.rateCardValidityHelp')}</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.validFrom')}</label>
                    <input
                      type="date"
                      value={formData.rate_valid_from}
                      onChange={(e) => setFormData({ ...formData, rate_valid_from: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.validTo')}</label>
                    <input
                      type="date"
                      value={formData.rate_valid_to}
                      onChange={(e) => setFormData({ ...formData, rate_valid_to: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>

              {/* Section 8: Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.cruiseCode')}</label>
                  <input
                    type="text"
                    name="cruise_code"
                    value={formData.cruise_code}
                    onChange={handleChange}
                    placeholder={t('form.cruiseCodePlaceholder')}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                </div>
                <div className="flex items-end gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="sightseeing_included"
                      checked={formData.sightseeing_included}
                      onChange={handleCheckbox}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">{t('form.sightseeingIncluded')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleCheckbox}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">{t('form.active')}</span>
                  </label>
                </div>
              </div>

              {/* Section 9: Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.notes')}</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600"
                  placeholder={t('form.notesPlaceholder')}
                />
              </div>

              {/* Audit Log */}
              {editingCruise && (
                <RateAuditLog tableName="nile_cruises" recordId={editingCruise.id} />
              )}

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
                  {t('form.cancel')}
                </button>
                <button type="submit" className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2">
                  <Check className="w-4 h-4" />
                  {editingCruise ? t('form.updateRate') : t('form.createRate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}