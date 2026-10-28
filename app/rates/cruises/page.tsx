'use client'

import { useEffect, useState } from 'react'
import { rateCurrencyPatch, formatRateInRowCurrency } from '@/app/components/RateCurrencyField'
import { firstInvalidMessage } from '@/lib/form-guard'
import { useTranslations } from 'next-intl'
import {
  SAILING_DAYS, dayName, sailingDaysLabel, sanitizeSailingDays, cruiseRouteLabel,
  type SailingDay,
} from '@/lib/rates/cruise-sailing'
import { useTierLabel } from '@/hooks/useTierLabel'
import { useTierOptions } from '@/hooks/useTierOptions'
import { useVocabOptions } from '@/hooks/useVocabOptions'
import { defaultTierKey } from '@/lib/vocabulary'
import { useVocabLabel } from '@/hooks/useVocabLabel'
import Link from 'next/link'
import { Copy, Ship, Plus, Search, Edit, Trash2, ChevronDown, AlertCircle, CheckCircle2, Crown, Star,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import RateAuditLog from '@/app/components/RateAuditLog'
import { RateFormModal, FormSection, Field, CurrencyPicker, ValidityFields, inputClass, shortDate } from '@/components/rates/RateFormKit'
import { NO_SUPPLIER_SENTINEL } from '@/lib/suppliers/supplier-field-constants'

// Ship picker option that reveals the free-text input for a new ship.
const NEW_SHIP = '__new__'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import RatePeriodsImportExport from '@/app/components/RatePeriodsImportExport'
import RateSeasonsEditor from '@/components/rates/RateSeasonsEditor'
import RatePeriodLines, { pricedDoubles } from '@/components/rates/RatePeriodLines'
import RateSupplementsPicker from '@/components/rates/RateSupplementsPicker'
import { seasonsForRow, type RateSeason } from '@/lib/rates/rate-seasons'
import { supplementsForRow, type RateSupplement } from '@/lib/rates/supplements'
import { averageRatesByCurrency, formatRateAverages } from '@/lib/currency-totals'

// ============================================
// CONSTANTS
// ============================================

const TIER_OPTIONS_CONFIG = [
  { value: 'budget', labelKey: 'budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', labelKey: 'standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', labelKey: 'deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', labelKey: 'luxury', color: 'bg-amber-100 text-amber-700' }
]
// The four presets above carry a colour and an i18n word. A tier the agency
// added in Settings → Vocabulary has neither: brand green, its own label.
const CUSTOM_TIER_COLOR = 'bg-green-100 text-green-800'

// Embark/disembark ports: the Nile between Luxor and Aswan, Cairo for the
// long cruise, and Abu Simbel for the Lake Nasser boats.
const CITIES = ['Luxor', 'Aswan', 'Abu Simbel', 'Cairo']
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
  sailing_days?: string[] | null
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
  supplements?: RateSupplement[] | null
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
  rate_currency?: string | null
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
  rate_currency: string
  ship_name: string
  ship_category: 'standard' | 'deluxe' | 'luxury'
  route_name: string
  /** Weekday keys this sailing departs on; empty = no fixed day. */
  sailing_days: SailingDay[]
  embark_city: string
  disembark_city: string
  duration_nights: number
  cabin_type: 'standard' | 'deluxe' | 'suite'
  // Legacy rates (for display/backward compatibility)
  rate_single_eur: number
  rate_double_eur: number
  rate_triple_eur: number
  seasons: RateSeason[]
  supplements: RateSupplement[]
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
  /** The ship this rate belongs to (supplier_properties). '' = resolve by name on save. */
  property_id: string
}

// ============================================
// COMPONENTS
// ============================================

function TierBadge({ tier, t }: { tier: string | null; t: (key: string) => string }) {
  const tierLabel = useTierLabel()
  const key = tier || 'standard'
  const tierConfig = TIER_OPTIONS_CONFIG.find(tc => tc.value === key)
  // Labelled by the ROW's tier, not the config's: an agency-added tier used
  // to fall through to the 'standard' config and read as "Standard".
  const fallback = tierConfig ? t(`tiers.${tierConfig.labelKey}`) : key

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierConfig?.color ?? CUSTOM_TIER_COLOR}`}>
      {tierLabel(key, fallback)}
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
  const tierOptions = useTierOptions(key => t(`tiers.${key}`))
  // A new rate starts on the ladder's own "standard" rung — 'standard' itself
  // may not exist once the agency has reshaped its tiers.
  const defaultTier = defaultTierKey(tierOptions.map(o => o.value))
  const cruiseCabinLabel = useVocabLabel('cruise_cabin')
  const cabinOptions = useVocabOptions('cruise_cabin', CABIN_TYPES.map(c => ({ value: c, label: t(`cabinTypes.${c}`) })))
  const tPeriods = useTranslations('rates.ratePeriods')
  const tSupp = useTranslations('rates.supplements')
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
    sailing_days: [] as SailingDay[],
    duration_nights: 4,
    cabin_type: 'standard',
    // Legacy rates
    rate_single_eur: 0,
    rate_double_eur: 0,
    rate_triple_eur: 0,
    seasons: [],
    supplements: [],
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
    tier: defaultTier,
    is_preferred: false,
    supplier_id: '',
    property_id: '',
    rate_currency: ''
  })

  const [formData, setFormData] = useState<CruiseFormData>(getDefaultFormData())
  const [ships, setShips] = useState<{ id: string; name: string; category: string | null }[]>([])

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
    setFormData(prev => ({ ...prev, supplier_id: supplierId, property_id: '' }))
    void loadShips(supplierId)
  }

  // The supplier's fleet, for the ship picker. Empty for "no supplier".
  const loadShips = async (supplierId: string) => {
    if (!supplierId || supplierId === NO_SUPPLIER_SENTINEL) { setShips([]); return }
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/properties?type=ship&active_only=true`)
      const data = await res.json().catch(() => ({}))
      setShips(res.ok && data.success ? data.data : [])
    } catch { setShips([]) }
  }

  const handleShipPick = (value: string) => {
    if (value === NEW_SHIP) {
      setFormData(prev => ({ ...prev, property_id: '', ship_name: '' }))
      return
    }
    const ship = ships.find(sh => sh.id === value)
    setFormData(prev => ({
      ...prev,
      property_id: value,
      ship_name: ship?.name || prev.ship_name,
      // A ship that knows its class fills the category — but only when the
      // free-text category is one of the form's three classes.
      ...(ship?.category && ['standard', 'deluxe', 'luxury'].includes(ship.category)
        ? { ship_category: ship.category as 'standard' | 'deluxe' | 'luxury' }
        : {}),
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

  // Duplicate: open the ADD form pre-filled from this row. The identity
  // field is cleared so the save creates a new record; everything else is
  // there to change. Operator request 2026-09-02 — most rates are entered as
  // near-copies of an existing one.
  const handleClone = (cruise: Cruise) => {
    handleEdit(cruise)
    setEditingCruise(null)
    setFormData(prev => ({ ...prev, cruise_code: '' }))
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
      sailing_days: sanitizeSailingDays(cruise.sailing_days),
      duration_nights: cruise.duration_nights,
      cabin_type: cruise.cabin_type,
      // Legacy rates
      rate_single_eur: cruise.rate_single_eur || 0,
      rate_double_eur: cruise.rate_double_eur || 0,
      rate_triple_eur: cruise.rate_triple_eur || 0,
      // Opens with the ship's periods, or its old low/high/peak windows
      // converted, so editing a pre-migration cruise loses nothing.
      seasons: seasonsForRow(cruise, 'cruise'),
      supplements: supplementsForRow(cruise),
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
      rate_currency: cruise.rate_currency || '',
      is_preferred: cruise.is_preferred || false,
      supplier_id: cruise.supplier_id || '',
      property_id: (cruise as any).property_id || ''
    })
    void loadShips(cruise.supplier_id || '')
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
    const { rate_currency: pickedCurrency, ...restFormData } = formData
    const submitData = {
      ...restFormData,
      ...rateCurrencyPatch(pickedCurrency, editingCruise?.rate_currency),
      cruise_code: formData.cruise_code || generateCode(),
      // DERIVED, always. Free text here is how all four of the agency's rows
      // came to say "Aswan to Luxor" while half of them embarked in Luxor.
      route_name: `${formData.embark_city} to ${formData.disembark_city}`,
      sailing_days: sanitizeSailingDays(formData.sailing_days),
      // Set legacy rates from low season for backward compatibility
      rate_single_eur: formData.rate_low_single_eur || formData.rate_single_eur,
      rate_double_eur: formData.rate_low_double_eur || formData.rate_double_eur,
      rate_triple_eur: formData.rate_low_triple_eur || formData.rate_triple_eur || null,
      supplier_id: formData.supplier_id || null,
      property_id: formData.property_id || null,
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
    // Every priced double across every period and both passport groups —
    // not the first period's EU column alone.
    avgRate: averageRatesByCurrency(pricedDoubles(cruises, 'cruise'), d => d.amount, d => d.currency)
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
    const [ok, failed, reasons] = await bulkDeleteByIds([...bulk.selected], id => `/api/rates/cruises/${id}`)
    bulk.clear()
    fetchCruises()
    // A rate still in use is refused with its reason (lib/rates/rate-in-use);
    // the operator has to see it, not a selection that quietly stays put.
    if (failed) showToast('error', tCommon('bulkDeletePartial', { ok, failed, reason: reasons.join(' · ') }))
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
            <p className="text-xs text-gray-600">{tPeriods('avgDouble')}</p>
            <p className="text-2xl font-bold text-purple-600">{formatRateAverages(stats.avgRate, formatRate)}</p>
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
              {cabinOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
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
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">{t('table.sailingDays')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-blue-800">{t('table.tier')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-blue-800">{tPeriods('periodsColumn')}</th>
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
                      {cruiseRouteLabel(cruise)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {cruise.duration_nights}N
                      </span>
                    </td>
                    {/* The departure days, where the cabin category used to be.
                        Every row here reads "Standard" — the cabin is already
                        in the service code's suffix — while the day a sailing
                        leaves is what decides whether it fits an itinerary at
                        all (operator, 2026-09-20: "much important for a user
                        and quick access"). */}
                    <td className="px-4 py-3 text-center">
                      {sanitizeSailingDays(cruise.sailing_days).length > 0 ? (
                        <span className="inline-flex flex-wrap justify-center gap-1">
                          {sanitizeSailingDays(cruise.sailing_days).map(d => (
                            <span key={d} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[11px] font-medium">
                              {dayName(d).slice(0, 3)}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{t('table.anyDay')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TierBadge tier={cruise.tier} t={t} />
                    </td>
                    <td className="px-4 py-3">
                      {/* Every period, one line each, as entered in the form. */}
                      <RatePeriodLines row={cruise} entity="cruise" format={amount => formatRateInRowCurrency(amount, cruise, formatRate)} />
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
                        <button type="button" onClick={() => handleClone(cruise)} className="p-1 text-gray-500 hover:text-primary-600 rounded" title={tCommon('duplicate')} aria-label={tCommon('duplicate')}>
                          <Copy className="w-4 h-4" />
                        </button>
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
        <RateFormModal
          formId="cruise-rate-form"
          title={editingCruise ? t('form.editCruise') : t('form.addNewCruise')}
          code={formData.cruise_code || undefined}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          after={editingCruise ? <RateAuditLog tableName="nile_cruises" recordId={editingCruise.id} /> : undefined}
          summary={[
            formData.ship_name,
            cruiseRouteLabel(formData),
            cabinOptions.find(o => o.value === formData.cabin_type)?.label,
            tierOptions.find(o => o.value === formData.tier)?.label,
            formData.rate_valid_from && formData.rate_valid_to ? `${shortDate(formData.rate_valid_from)} – ${shortDate(formData.rate_valid_to)}` : null,
          ].filter(Boolean).join(' · ')}
          active={{ checked: formData.is_active, onChange: v => setFormData(prev => ({ ...prev, is_active: v })), label: tCommon('formActive') }}
          submitLabel={editingCruise ? t('form.updateRate') : t('form.createRate')}
          cancelLabel={t('form.cancel')}
          maxWidth="max-w-4xl"
        >
          <FormSection title={tCommon('sectionSupplier')}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field
                label={t('form.supplier')}
                required
                htmlFor="cr-supplier"
                className="md:col-span-2"
                hint={<>{t('form.supplierHelp')} <Link href="/suppliers?type=cruise" className="text-primary-600 hover:underline">{t('form.manageSuppliers')}</Link></>}
              >
                <select
                  id="cr-supplier"
                  required
                  value={formData.supplier_id}
                  onChange={(e) => handleSupplierChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>{t('form.selectSupplier')}</option>
                  <option value={NO_SUPPLIER_SENTINEL}>{tCommon('noSupplierDirect')}</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </Field>
              {/* Supplier-HAS-properties: with a supplier chosen, the ship
                  comes from that supplier's fleet (managed on the supplier
                  page). Typing a new name still works — the API creates
                  the ship under the supplier on save. */}
              {ships.length > 0 && formData.supplier_id && formData.supplier_id !== NO_SUPPLIER_SENTINEL ? (
                <Field label={t('form.shipName')} required htmlFor="cr-ship">
                  <select
                    id="cr-ship"
                    value={formData.property_id || NEW_SHIP}
                    onChange={(e) => handleShipPick(e.target.value)}
                    className={inputClass}
                  >
                    <option value={NEW_SHIP}>{t('form.newShip')}</option>
                    {ships.map(ship => (
                      <option key={ship.id} value={ship.id}>{ship.name}{ship.category ? ` (${ship.category})` : ''}</option>
                    ))}
                  </select>
                  {!formData.property_id && (
                    <input
                      id="cr-ship-name"
                      type="text"
                      name="ship_name"
                      value={formData.ship_name}
                      onChange={handleChange}
                      required
                      aria-label={t('form.shipName')}
                      className={`${inputClass} mt-2`}
                      placeholder={t('form.shipNamePlaceholder')}
                    />
                  )}
                </Field>
              ) : (
                <Field label={t('form.shipName')} required htmlFor="cr-ship-name">
                  <input
                    id="cr-ship-name"
                    type="text"
                    name="ship_name"
                    value={formData.ship_name}
                    onChange={handleChange}
                    required
                    className={inputClass}
                    placeholder={t('form.shipNamePlaceholder')}
                  />
                </Field>
              )}
              <Field label={t('form.shipCategory')} required htmlFor="cr-ship-category">
                <select
                  id="cr-ship-category"
                  name="ship_category"
                  value={formData.ship_category}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {SHIP_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{t(`shipCategories.${cat}`)}</option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={tCommon('basicInformation')}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label={t('form.embarkCity')} required htmlFor="cr-embark">
                <select
                  id="cr-embark"
                  name="embark_city"
                  value={formData.embark_city}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {CITIES.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('form.disembarkCity')} required htmlFor="cr-disembark">
                <select
                  id="cr-disembark"
                  name="disembark_city"
                  value={formData.disembark_city}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {CITIES.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('form.durationNights')} required htmlFor="cr-nights">
                <input
                  id="cr-nights"
                  type="number"
                  name="duration_nights"
                  value={formData.duration_nights}
                  onChange={handleChange}
                  min="1"
                  required
                  className={inputClass}
                />
              </Field>
            </div>

            {/* The days this sailing actually leaves on.
                A ship that departs Aswan on Mondays and Fridays cannot serve
                a Wednesday itinerary — and until now nothing in the system
                knew that, so the quote was right, the arithmetic was right,
                and the booking was impossible. Leaving it EMPTY means no
                fixed day, which is the default and checks nothing. */}
            <div className="flex min-w-0 flex-col gap-1">
              <span id="cr-sailing-days-label" className="text-xs font-medium text-gray-700">{t('form.sailingDays')}</span>
              <div role="group" aria-labelledby="cr-sailing-days-label" className="flex flex-wrap gap-1.5">
                {SAILING_DAYS.map(day => {
                  const on = formData.sailing_days.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        sailing_days: on
                          ? prev.sailing_days.filter(d => d !== day)
                          : SAILING_DAYS.filter(d => d === day || prev.sailing_days.includes(d)),
                      }))}
                      aria-pressed={on}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        on
                          ? 'bg-[#647C47] text-white border-[#647C47]'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {dayName(day).slice(0, 3)}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs leading-snug text-gray-500">
                {formData.sailing_days.length > 0
                  ? t('form.sailingDaysChosen', { days: sailingDaysLabel(formData.sailing_days) })
                  : t('form.sailingDaysHint')}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label={t('form.cabinType')} required htmlFor="cr-cabin">
                <select
                  id="cr-cabin"
                  name="cabin_type"
                  value={formData.cabin_type}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {cabinOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t('form.serviceTier')}>
            <div className="flex flex-wrap gap-2" role="group" aria-label={tCommon('tier')}>
              {tierOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={formData.tier === opt.value}
                  onClick={() => setFormData({ ...formData, tier: opt.value })}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                    formData.tier === opt.value
                      ? opt.value === 'luxury'
                        ? 'bg-amber-600 text-white'
                        : opt.value === 'deluxe'
                        ? 'bg-purple-600 text-white'
                        : opt.value === 'standard'
                        ? 'bg-blue-600 text-white'
                        : opt.value === 'budget'
                        ? 'bg-gray-600 text-white'
                        : 'bg-[#647C47] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {opt.value === 'luxury' && <Crown className="w-3.5 h-3.5" />}
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <CurrencyPicker
                id="cr-currency"
                value={formData.rate_currency}
                onChange={v => setFormData(prev => ({ ...prev, rate_currency: v }))}
                orgCurrency={rateCurrency}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_preferred}
                  onChange={(e) => setFormData({ ...formData, is_preferred: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <Star className="h-4 w-4 text-amber-600" />
                    {t('form.preferredCruise')}
                  </span>
                  <span className="text-xs text-gray-500">{t('form.preferredCruiseHelp')}</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="sightseeing_included"
                  checked={formData.sightseeing_included}
                  onChange={handleCheckbox}
                  className="h-4 w-4 rounded border-gray-300 text-[#647C47]"
                />
                <span className="text-sm text-gray-800">{t('form.sightseeingIncluded')}</span>
              </label>
            </div>
          </FormSection>

          {/* Was three fixed season blocks — low, high, peak — with the
              peak one carrying a second date box because ships often have
              two. Contracts run to six or more dated periods and the count
              varies by ship, so the periods are a list now. An existing
              cruise opens with its old windows already converted (see
              openEditModal). */}
          <FormSection title={tPeriods('titleWithCurrency', { currency: formData.rate_currency || rateCurrency })}>
            {/* Which of the agency's cruise supplements this ship prices —
                a deck, a balcony — each with a per-night price per period. */}
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-gray-700">{tSupp('title')}</p>
              <RateSupplementsPicker
                kind="cruise_supplement"
                value={formData.supplements}
                onChange={(supplements) => setFormData({ ...formData, supplements })}
              />
            </div>
            <RateSeasonsEditor
              entity="cruise"
              seasons={formData.seasons}
              supplements={formData.supplements}
              currency={rateCurrency}
              onChange={(seasons) => setFormData({ ...formData, seasons })}
            />
          </FormSection>

          <FormSection title={t('form.rateCardValidity')}>
            <p className="-mt-1 text-xs text-gray-500">{t('form.rateCardValidityHelp')}</p>
            <ValidityFields
              idPrefix="cr-valid"
              from={formData.rate_valid_from}
              to={formData.rate_valid_to}
              onChange={handleChange}
              fromLabel={t('form.validFrom')}
              toLabel={t('form.validTo')}
            />
          </FormSection>

          {/* The code stays typeable: cruise codes are named by hand here, and a
              blank one is generated on save (generateCode). */}
          <Field label={t('form.cruiseCode')} htmlFor="cr-code">
            <input id="cr-code" type="text" name="cruise_code" value={formData.cruise_code} onChange={handleChange} placeholder={t('form.cruiseCodePlaceholder')} className={`${inputClass} font-mono`} />
          </Field>

          <Field label={t('form.notes')} htmlFor="cr-notes">
            <textarea
              id="cr-notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              className={inputClass}
              placeholder={t('form.notesPlaceholder')}
            />
          </Field>
        </RateFormModal>
      )}
    </div>
  )
}