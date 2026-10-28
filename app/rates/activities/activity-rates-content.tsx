'use client'

import { todayLocal } from '@/lib/today'
import { useEffect, useState } from 'react'
import CityOptions from '@/app/components/CityOptions'
import { firstInvalidMessage } from '@/lib/form-guard'
import { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import { RateFormModal, FormSection, Field, MoneyInput, CurrencyPicker, ValidityFields, inputClass, shortDate } from '@/components/rates/RateFormKit'
import { formatMoney } from '@/lib/currency-totals'
import { formatRateInRowCurrency } from '@/app/components/RateCurrencyField'
import { useTranslations } from 'next-intl'
import { useVocabLabel } from '@/hooks/useVocabLabel'
import { useVocabOptions } from '@/hooks/useVocabOptions'
import { optionsFromLabels, slugifyKey } from '@/lib/vocabulary'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import RateAuditLog from '@/app/components/RateAuditLog'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import { NO_SUPPLIER_SENTINEL } from '@/lib/suppliers/supplier-field-constants'
import { Copy, Ticket,
  Plus,
  Search,
  Edit,
  Trash2,
  Check,
  MapPin,
  Clock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Table2,
  Tag,
  Users,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Ship,
  PersonStanding,
  Banknote
} from 'lucide-react'
import { useCurrency } from '@/app/contexts/PreferencesContext'

// Egyptian cities

// WORDS, kept as the built-in fallback. The pickers store the vocabulary KEY
// ('water_activities' — Settings → Vocabulary) and list the agency's
// entries; older rows hold the word and are read through slugify.
const ACTIVITY_CATEGORIES = [
  'Ancient Sites',
  'Museums',
  'Desert Safari',
  'Water Activities',
  'Cultural Experience',
  'Adventure',
  'Religious Sites',
  'Nature & Wildlife',
  'Entertainment',
  'Shopping Tours',
  'Shows & Events',
  'Nile Experience',
  'Local Transport'
]

const ACTIVITY_TYPES = [
  'Guided Tour',
  'Self-Guided',
  'Excursion',
  'Day Trip',
  'Half-Day Trip',
  'Experience',
  'Workshop',
  'Show',
  'Cruise',
  'Ride',
  'Activity'
]

const DURATIONS = [
  '30 minutes',
  '1 hour',
  '1.5 hours',
  '2 hours',
  '3 hours',
  '4 hours',
  'Half Day (4-5h)',
  'Full Day (6-8h)',
  'Extended Day (8-10h)',
  'Multi-Day'
]

// NEW: Pricing types for add-ons
const PRICING_TYPES = [
  { value: 'per_person', label: 'Per Person', description: 'Rate multiplied by number of travelers', icon: PersonStanding },
  { value: 'per_unit', label: 'Per Unit', description: 'Flat rate per boat/vehicle/ride', icon: Ship },
  { value: 'flat', label: 'Flat Rate', description: 'Single price regardless of group size', icon: Banknote },
  { value: 'tiered', label: 'Tiered (Volume Discount)', description: 'Per-person rate decreases with group size', icon: Users }
]

// A pax band for tiered pricing (mirrors lib/rates/activity-tiers.ts)
interface TierRow {
  min_pax: number
  max_pax: number
  rate_eur: number
  rate_non_eur: number | null
  label: string
}

// NEW: Common unit labels
const UNIT_LABELS = [
  'boat',
  'felucca',
  'ride',
  'quad',
  'vehicle',
  'ticket',
  'group',
  'session',
  'person'
]

interface Supplier {
  id: string
  name: string
  type: string
  city?: string
}

interface ActivityRate {
  id: string
  service_code: string
  activity_name: string
  activity_category?: string
  activity_type?: string
  duration?: string
  city?: string
  base_rate_eur: number
  base_rate_non_eur: number
  rate_currency?: string | null
  // NEW: Add-on pricing fields
  pricing_type?: 'per_person' | 'per_unit' | 'flat' | 'tiered'
  unit_label?: string
  tiers?: TierRow[] | null
  min_capacity?: number
  max_capacity?: number
  // Existing fields
  season?: string
  rate_valid_from?: string
  rate_valid_to?: string
  supplier_id?: string
  supplier_name?: string
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function ActivityRatesContent() {
  const t = useTranslations('rates.activities')
  const activityCategoryLabel = useVocabLabel('activity_category')
  const activityTypeLabel = useVocabLabel('activity_type')
  const activityDurationLabel = useVocabLabel('activity_duration')
  const activityUnitLabel = useVocabLabel('activity_unit')
  const categoryOptions = useVocabOptions('activity_category', optionsFromLabels(ACTIVITY_CATEGORIES))
  const typeOptions = useVocabOptions('activity_type', optionsFromLabels(ACTIVITY_TYPES))
  const durationOptions = useVocabOptions('activity_duration', optionsFromLabels(DURATIONS))
  const unitOptions = useVocabOptions('activity_unit', optionsFromLabels(UNIT_LABELS))
  const pricingTypeLabel = useVocabLabel('activity_pricing_type')
  const tCommon = useTranslations('rates.common')
  const searchParams = useSearchParams()
  const initialSupplierId = searchParams.get('supplier_id') || ''

  // Currency conversion
  const { currency, formatWithConversion, rateCurrency } = useCurrency()
  const formatRate = (amount: number) => formatWithConversion(amount, rateCurrency)
  // Tiered rows keep base_rate at 0 — their price lives in the bands, so the
  // list shows the cheapest per-person band instead of a misleading 0.
  const displayRate = (rate: ActivityRate) => {
    if (rate.pricing_type === 'tiered' && rate.tiers?.length) {
      const lowest = Math.min(...rate.tiers.map(t => t.rate_eur))
      return `${formatRateInRowCurrency(lowest, rate, formatRate)}+`
    }
    return formatRateInRowCurrency(rate.base_rate_eur, rate, formatRate)
  }

  const [rates, setRates] = useState<ActivityRate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState(initialSupplierId)
  const [selectedPricingType, setSelectedPricingType] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // UI State
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<ActivityRate | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'compact'>('table')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // Delete Confirmation Modal
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Notification
  const [notification, setNotification] = useState<{ 
    type: 'success' | 'error' | 'info' | 'warning'
    title: string
    message: string 
  } | null>(null)

  const showNotification = (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
    setNotification({ type, title, message })
    setTimeout(() => setNotification(null), 5000)
  }

  // Date helpers
  const today = todayLocal()
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Generate service code
  const generateServiceCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'ACT-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const [formData, setFormData] = useState({
    service_code: '',
    activity_name: '',
    activity_category: '',
    activity_type: '',
    duration: '',
    city: '',
    base_rate_eur: 0,
    base_rate_non_eur: 0,
    rate_currency: '',
    // NEW: Add-on pricing fields
    pricing_type: 'per_person' as 'per_person' | 'per_unit' | 'flat' | 'tiered',
    unit_label: '',
    tiers: [] as TierRow[],
    min_capacity: 1,
    max_capacity: 99,
    // Existing fields
    season: '',
    rate_valid_from: today,
    rate_valid_to: nextYear,
    supplier_id: '',
    supplier_name: '',
    notes: '',
    is_active: true
  })

  // Fetch rates
  const fetchRates = async () => {
    try {
      // Every rate, inactive ones too: "Show inactive" filters on this page.
      // The fetch ran once, active only, so an inactive rate could never be
      // found again to reactivate — and Total always equalled Active.
      const response = await fetch('/api/rates/activities')
      const data = await response.json()

      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching activity rates:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch suppliers (activity providers / attractions)
  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?type=activity_provider')
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

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCity, selectedCategory, selectedSupplier, selectedPricingType, showInactive, itemsPerPage])

  // The unit the single rate is quoted in, shown after the amount.
  const baseRateUnit =
    formData.pricing_type === 'per_person' ? tCommon('perPerson')
      : formData.pricing_type === 'per_unit' ? `/ ${formData.unit_label || 'unit'}`
        : formData.pricing_type === 'flat' ? '/ total'
          : undefined

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  // Tier-band handlers (pricing_type === 'tiered')
  const addTier = () => {
    setFormData(prev => {
      const last = prev.tiers[prev.tiers.length - 1]
      const min = last ? last.max_pax + 1 : 1
      return { ...prev, tiers: [...prev.tiers, { min_pax: min, max_pax: min + 3, rate_eur: 0, rate_non_eur: null, label: '' }] }
    })
  }
  const updateTier = (index: number, patch: Partial<TierRow>) => {
    setFormData(prev => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier))
    }))
  }
  const removeTier = (index: number) => {
    setFormData(prev => ({ ...prev, tiers: prev.tiers.filter((_, i) => i !== index) }))
  }

  // A tiered rate must have coherent bands BEFORE it reaches the engine: at
  // least one band, every rate positive (a 0 is an unpriced hole, not a free
  // ride), and bands ascending without overlap.
  const tierValidationError = (): string | null => {
    if (formData.pricing_type !== 'tiered') return null
    if (formData.tiers.length === 0) return 'Add at least one pricing tier.'
    const sorted = [...formData.tiers].sort((a, b) => a.max_pax - b.max_pax)
    for (const tier of sorted) {
      if (tier.min_pax < 1 || tier.max_pax < tier.min_pax) return 'Each tier needs Min Pax ≥ 1 and Max Pax ≥ Min Pax.'
      if (!(tier.rate_eur > 0)) return 'Each tier needs a rate above 0 — a blank or 0 rate is an unpriced hole.'
      if (tier.rate_non_eur !== null && !(tier.rate_non_eur > 0)) return 'Non-EUR tier rates must be above 0 (or left empty).'
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].min_pax <= sorted[i - 1].max_pax) return 'Tier pax bands must not overlap.'
    }
    return null
  }

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId)
    setFormData(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name || '',
      city: supplier?.city || prev.city
    }))
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: generateServiceCode(),
      activity_name: '',
      activity_category: '',
      activity_type: '',
      duration: '',
      city: '',
      base_rate_eur: 0,
      base_rate_non_eur: 0,
      rate_currency: '',
      pricing_type: 'per_person' as const,
      unit_label: '',
      tiers: [] as TierRow[],
      min_capacity: 1,
      max_capacity: 99,
      season: '',
      rate_valid_from: today,
      rate_valid_to: nextYear,
      supplier_id: selectedSupplier || '',
      supplier_name: '',
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  // Duplicate: open the ADD form pre-filled from this row. The identity
  // field is cleared so the save creates a new record; everything else is
  // there to change. Operator request 2026-09-02 — most rates are entered as
  // near-copies of an existing one.
  const handleClone = (rate: ActivityRate) => {
    handleEdit(rate)
    setEditingRate(null)
    setFormData(prev => ({ ...prev, service_code: '' }))
  }

  const handleEdit = (rate: ActivityRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code || '',
      activity_name: rate.activity_name || '',
      // Stored as keys since 2026-09; a row that still holds the word opens
      // under the matching key.
      activity_category: slugifyKey(rate.activity_category || ''),
      activity_type: slugifyKey(rate.activity_type || ''),
      duration: slugifyKey(rate.duration || ''),
      city: rate.city || '',
      base_rate_eur: rate.base_rate_eur || 0,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      rate_currency: rate.rate_currency || '',
      pricing_type: rate.pricing_type || 'per_person',
      unit_label: slugifyKey(rate.unit_label || ''),
      tiers: rate.tiers || [],
      min_capacity: rate.min_capacity || 1,
      max_capacity: rate.max_capacity || 99,
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || '',
      notes: rate.notes || '',
      is_active: rate.is_active
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
      showNotification('error', 'Error', invalid)
      return
    }

    const tierError = tierValidationError()
    if (tierError) {
      showNotification('error', 'Error', tierError)
      return
    }

    try {
      const url = editingRate
        ? `/api/rates/activities/${editingRate.id}`
        : '/api/rates/activities'

      const method = editingRate ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((() => {
          const { rate_currency: pickedCurrency, ...rest } = formData
          // One price. An activity costs what it costs — the EU/non-EU split
          // is real only for hotels and cruises (operator, 2026-08-30). Tiers
          // need no mirror: lib/rates/activity-tiers.ts already falls back to
          // rate_eur when rate_non_eur is null.
          return {
            ...rest,
            base_rate_non_eur: rest.base_rate_eur,
            ...rateCurrencyPatch(pickedCurrency, editingRate?.rate_currency),
          }
        })())
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        showNotification('error', 'Error', data.error || t('notifications.failedToSave'))
        return
      }

      showNotification('success', 'Success', editingRate ? t('notifications.activityUpdated') : t('notifications.activityCreated'))
      setShowModal(false)
      fetchRates()
    } catch (error) {
      console.error('Error saving rate:', error)
      showNotification('error', 'Error', t('notifications.failedToSave'))
    }
  }

  // Open delete confirmation modal
  const confirmDelete = (id: string, name: string) => {
    setDeleteModal({ show: true, id, name })
  }

  // Actually perform delete
  const handleDelete = async () => {
    if (!deleteModal) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/rates/activities/${deleteModal.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        showNotification('success', t('notifications.deleted'), t('notifications.deletedMessage', { name: deleteModal.name }))
        fetchRates()
      } else {
        showNotification('error', t('notifications.cannotDelete'), data.error || t('notifications.failedToDelete'))
      }
    } catch (error) {
      console.error('Error deleting rate:', error)
      showNotification('error', 'Error', t('notifications.failedToDelete'))
    } finally {
      setIsDeleting(false)
      setDeleteModal(null)
    }
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' ||
      rate.activity_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCity = selectedCity === '' || rate.city === selectedCity
    const matchesCategory = selectedCategory === '' || slugifyKey(rate.activity_category || '') === selectedCategory
    const matchesSupplier = selectedSupplier === '' || rate.supplier_id === selectedSupplier
    const matchesPricingType = selectedPricingType === '' || rate.pricing_type === selectedPricingType
    const matchesActive = showInactive || rate.is_active

    return matchesSearch && matchesCity && matchesCategory && matchesSupplier && matchesPricingType && matchesActive
  })

  // Pagination
  const totalPages = Math.ceil(filteredRates.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRates = filteredRates.slice(startIndex, startIndex + itemsPerPage)

  // Stats
  const activeRates = rates.filter(r => r.is_active).length
  // A tiered rate is a per-person rate by group-size band, so it counts here
  // — the tiles left it out and did not add up to Total.
  const perPersonRates = rates.filter(r => r.pricing_type === 'per_person' || r.pricing_type === 'tiered' || !r.pricing_type).length
  const perUnitRates = rates.filter(r => r.pricing_type === 'per_unit').length
  const flatRates = rates.filter(r => r.pricing_type === 'flat').length
  const uniqueCities = [...new Set(rates.map(r => r.city).filter(Boolean))].length

  // Get pricing type badge
  const getPricingTypeBadge = (pricingType: string | undefined) => {
    switch (pricingType) {
      case 'per_unit':
        return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{pricingTypeLabel('per_unit', t('perUnit'))}</span>
      case 'flat':
        return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">{pricingTypeLabel('flat', t('flatRate'))}</span>
      case 'tiered':
        return <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">{pricingTypeLabel('tiered', 'Tiered')}</span>
      default:
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">{pricingTypeLabel('per_person', t('perPerson'))}</span>
    }
  }

  // Get notification icon
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-6 h-6 text-green-500" />
      case 'error': return <XCircle className="w-6 h-6 text-red-500" />
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-500" />
      default: return <Info className="w-6 h-6 text-blue-500" />
    }
  }

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
          <p className="text-sm text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  const handleBulkDelete = async () => {
    await bulkDeleteByIds([...bulk.selected], id => `/api/rates/activities/${id}`)
    bulk.clear()
    fetchRates()
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 bg-gray-50 min-h-screen">
      
      {/* Centered Notification Modal */}
      {notification && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 transform transition-all animate-in fade-in zoom-in duration-200`}>
            <div className="flex flex-col items-center text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
                notification.type === 'success' ? 'bg-green-100' :
                notification.type === 'error' ? 'bg-red-100' :
                notification.type === 'warning' ? 'bg-amber-100' :
                'bg-blue-100'
              }`}>
                {getNotificationIcon(notification.type)}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">{notification.title}</h3>
              <p className="text-sm text-gray-600 mb-4">{notification.message}</p>
              <button
                onClick={() => setNotification(null)}
                className={`px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  notification.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                  notification.type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                  notification.type === 'warning' ? 'bg-amber-600 hover:bg-amber-700' :
                  'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {t('gotIt')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal?.show && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 transform transition-all">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('deleteModal.title')}</h3>
              <p className="text-sm text-gray-600 mb-1">
                {t('deleteModal.confirmMessage')}
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-4">
                "{deleteModal.name}"
              </p>
              <p className="text-xs text-gray-500 mb-6">
                {t('deleteModal.warningMessage')}
              </p>
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => setDeleteModal(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {t('deleteModal.cancel')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      {t('deleteModal.deleting')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      {t('deleteModal.delete')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Ticket className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {t('title')}
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
            </h1>
            <p className="text-sm text-gray-600">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BulkRateImportExport tableName="activity_rates" onImportComplete={fetchRates} />
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('addRate')}
          </button>
          <Link
            href="/suppliers?type=activity_provider"
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50"
          >
            <Users className="w-4 h-4" />
            {t('suppliers')}
          </Link>
        </div>
      </div>

      {/* Stats - Updated with pricing type breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Ticket className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rates.length}</p>
          <p className="text-xs text-gray-600">{t('stats.totalRates')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Check className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{activeRates}</p>
          <p className="text-xs text-gray-600">{t('stats.active')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <PersonStanding className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{perPersonRates}</p>
          <p className="text-xs text-gray-600">{t('stats.perPerson')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Ship className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{perUnitRates}</p>
          <p className="text-xs text-gray-600">{t('stats.perUnit')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{flatRates}</p>
          <p className="text-xs text-gray-600">{t('stats.flatRate')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{uniqueCities}</p>
          <p className="text-xs text-gray-600">{t('stats.cities')}</p>
        </div>
      </div>

      {/* Filters - Updated with pricing type filter */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
              />
            </div>
          </div>

          {/* Pricing Type Filter */}
          <select
            value={selectedPricingType}
            onChange={(e) => setSelectedPricingType(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allPricingTypes')}</option>
            <option value="per_person">{pricingTypeLabel('per_person', t('pricingTypes.per_person'))}</option>
            <option value="per_unit">{pricingTypeLabel('per_unit', t('pricingTypes.per_unit'))}</option>
            <option value="flat">{pricingTypeLabel('flat', t('pricingTypes.flat'))}</option>
            <option value="tiered">{pricingTypeLabel('tiered', 'Tiered')}</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allCategories')}</option>
            {categoryOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* City Filter */}
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allCities')}</option>
            <CityOptions />
          </select>

          {/* Active Only Toggle */}
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
              showInactive
                ? 'bg-gray-200 text-gray-700'
                : 'bg-green-100 text-green-700'
            }`}
          >
            {showInactive ? t('showAll') : t('activeOnly')}
          </button>

          {/* View Mode */}
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 ${viewMode === 'table' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Table2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`p-2 ${viewMode === 'cards' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('compact')}
              className={`p-2 ${viewMode === 'compact' ? 'bg-primary-100 text-primary-600' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            {t('pagination.showing')} <span className="font-semibold">{paginatedRates.length}</span> {t('pagination.of')}{' '}
            <span className="font-semibold">{filteredRates.length}</span> {t('pagination.rates')}
          </p>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} {t('pagination.perPage')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rates Table - Updated with pricing type column */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paginatedRates.length === 0 ? (
          <div className="p-12 text-center">
            <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('noRatesFound')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchTerm || selectedCity || selectedCategory || selectedPricingType
                ? 'Try adjusting your filters'
                : 'Get started by adding your first activity rate'}
            </p>
            <button
              onClick={handleAddNew}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus className="w-4 h-4" />
              {t('addFirstRate')}
            </button>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <BulkDeleteBar count={bulk.selected.size} label="activity rates" onDelete={handleBulkDelete} onClear={bulk.clear} />
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="select all" checked={paginatedRates.length > 0 && bulk.selected.size === paginatedRates.length} onChange={() => bulk.toggleAll(paginatedRates.map(r => r.id))} /></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('table.activity')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('table.category')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('table.city')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('table.pricing')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('table.capacity')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('table.eurRate')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('table.status')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2"><input type="checkbox" aria-label="select row" checked={bulk.has(rate.id)} onChange={() => bulk.toggle(rate.id)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Ticket className="w-4 h-4 text-purple-500" />
                        <div>
                          <span className="text-sm font-semibold text-gray-900">{rate.activity_name}</span>
                          <p className="text-xs text-gray-500">{rate.service_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {rate.activity_category ? (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                          {activityCategoryLabel(rate.activity_category, rate.activity_category)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{rate.city || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {getPricingTypeBadge(rate.pricing_type)}
                        {rate.pricing_type === 'per_unit' && rate.unit_label && (
                          <span className="text-xs text-gray-500">/{activityUnitLabel(rate.unit_label, rate.unit_label)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rate.pricing_type === 'per_unit' ? (
                        <span className="text-xs text-gray-600">
                          {rate.min_capacity}-{rate.max_capacity} pax
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">{displayRate(rate)}{rate.rate_currency && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">{rate.rate_currency}</span>}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rate.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button type="button" onClick={() => handleClone(rate)} className="p-1 text-gray-500 hover:text-primary-600 rounded" title={tCommon('duplicate')} aria-label={tCommon('duplicate')}>
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(rate)}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(rate.id, rate.activity_name)}
                          className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedRates.map((rate) => (
              <div key={rate.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-purple-500" />
                    <span className="font-semibold text-gray-900">{rate.activity_name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  {getPricingTypeBadge(rate.pricing_type)}
                  {rate.activity_category && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                      {activityCategoryLabel(rate.activity_category, rate.activity_category)}
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-sm text-gray-600 mb-3">
                  <p><span className="text-gray-400">City:</span> {rate.city || '—'}</p>
                  {rate.pricing_type === 'per_unit' && (
                    <>
                      <p><span className="text-gray-400">Unit:</span> {rate.unit_label ? activityUnitLabel(rate.unit_label, rate.unit_label) : 'unit'}</p>
                      <p><span className="text-gray-400">Capacity:</span> {rate.min_capacity}-{rate.max_capacity} pax</p>
                    </>
                  )}
                  {rate.duration && (
                    <p><span className="text-gray-400">Duration:</span> {activityDurationLabel(rate.duration, rate.duration)}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Rate</p>
                    <p className="text-lg font-bold text-green-600">{displayRate(rate)}{rate.rate_currency && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">{rate.rate_currency}</span>}</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleClone(rate)} className="p-1 text-gray-500 hover:text-primary-600 rounded" title={tCommon('duplicate')} aria-label={tCommon('duplicate')}>
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(rate)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => confirmDelete(rate.id, rate.activity_name)}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {paginatedRates.map((rate) => (
              <div key={rate.id} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <Ticket className="w-4 h-4 text-purple-500" />
                  <span className="font-medium text-gray-900">{rate.activity_name}</span>
                  <span className="text-sm text-gray-500">{rate.city || '—'}</span>
                  {getPricingTypeBadge(rate.pricing_type)}
                  {rate.activity_category && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                      {activityCategoryLabel(rate.activity_category, rate.activity_category)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-green-600">{displayRate(rate)}{rate.rate_currency && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">{rate.rate_currency}</span>}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleClone(rate)} className="p-1 text-gray-500 hover:text-primary-600 rounded" title={tCommon('duplicate')} aria-label={tCommon('duplicate')}>
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEdit(rate)} className="p-1 text-gray-400 hover:text-primary-600">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => confirmDelete(rate.id, rate.activity_name)} className="p-1 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <p className="text-sm text-gray-600">
              Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{totalPages}</span>
              <span className="text-gray-400 ml-2">({filteredRates.length} total)</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
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
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 text-sm rounded border ${
                        currentPage === pageNum
                          ? 'bg-primary-600 text-white border-primary-600'
                          : 'border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal - Updated with pricing type fields */}
      {showModal && (
        <RateFormModal
          formId="activity-rate-form"
          title={editingRate ? 'Edit Activity Rate' : 'Add Activity Rate'}
          code={formData.service_code}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          after={editingRate ? <RateAuditLog tableName="activity_rates" recordId={editingRate.id} /> : undefined}
          summary={[
            formData.activity_name || null,
            formData.city || null,
            pricingTypeLabel(formData.pricing_type, PRICING_TYPES.find(p => p.value === formData.pricing_type)?.label ?? formData.pricing_type),
            formData.pricing_type !== 'tiered' && Number(formData.base_rate_eur) > 0
              ? `${formatMoney(Number(formData.base_rate_eur), formData.rate_currency || rateCurrency)} ${baseRateUnit}`
              : null,
            formData.rate_valid_from && formData.rate_valid_to ? `${shortDate(formData.rate_valid_from)} – ${shortDate(formData.rate_valid_to)}` : null,
          ].filter(Boolean).join(' · ')}
          active={{ checked: formData.is_active, onChange: v => setFormData(prev => ({ ...prev, is_active: v })), label: tCommon('formActive') }}
          submitLabel={editingRate ? t('form.update') : t('form.create')}
          cancelLabel={t('form.cancel')}
        >
          <FormSection title="Activity Details">
            <Field label={t('form.activityName')} required htmlFor="ac-name">
              <input id="ac-name" type="text" name="activity_name" value={formData.activity_name} onChange={handleChange} required placeholder={t('form.activityNamePlaceholder')} className={inputClass} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('form.category')} htmlFor="ac-category">
                <select id="ac-category" name="activity_category" value={formData.activity_category} onChange={handleChange} className={inputClass}>
                  <option value="">{t('form.selectCategory')}</option>
                  {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={t('form.activityType')} htmlFor="ac-type">
                <select id="ac-type" name="activity_type" value={formData.activity_type} onChange={handleChange} className={inputClass}>
                  <option value="">{t('form.selectType')}</option>
                  {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={t('form.duration')} htmlFor="ac-duration">
                <select id="ac-duration" name="duration" value={formData.duration} onChange={handleChange} className={inputClass}>
                  <option value="">{t('form.selectDuration')}</option>
                  {durationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={t('form.city')} htmlFor="ac-city">
                <select id="ac-city" name="city" value={formData.city} onChange={handleChange} className={inputClass}>
                  <option value="">{t('form.selectCity')}</option>
                  <CityOptions />
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t('form.pricingType')}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('form.pricingType')}>
              {PRICING_TYPES.map((type) => {
                const Icon = type.icon
                const selected = formData.pricing_type === type.value
                return (
                  <button
                    key={type.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setFormData(prev => ({ ...prev, pricing_type: type.value as any }))}
                    className={`rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#647C47] ${
                      selected ? 'border-[#647C47] bg-[#647C47]/5 ring-1 ring-[#647C47]' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="mb-0.5 flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${selected ? 'text-[#4a5c35]' : 'text-gray-400'}`} />
                      <span className={`text-sm font-medium ${selected ? 'text-[#4a5c35]' : 'text-gray-900'}`}>
                        {pricingTypeLabel(type.value, type.label)}
                      </span>
                    </span>
                    <span className="block text-xs text-gray-500">{type.description}</span>
                  </button>
                )
              })}
            </div>

            {/* Per Unit Settings - Only show when per_unit is selected */}
            {formData.pricing_type === 'per_unit' && (
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                <p className="flex items-center gap-2 text-xs font-medium text-gray-700">
                  <Ship className="h-4 w-4 text-gray-500" />
                  Per Unit Settings (e.g., boat, ride, vehicle)
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label={t('form.unitLabel')} required htmlFor="ac-unit">
                    <select id="ac-unit" name="unit_label" value={formData.unit_label} onChange={handleChange} className={inputClass}>
                      <option value="">{t('form.selectUnit')}</option>
                      {unitOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label={t('form.minCapacity')} htmlFor="ac-min-cap">
                    <input id="ac-min-cap" type="number" name="min_capacity" value={formData.min_capacity} onChange={handleChange} min="1" className={inputClass} />
                  </Field>
                  <Field label={t('form.maxCapacity')} htmlFor="ac-max-cap">
                    <input id="ac-max-cap" type="number" name="max_capacity" value={formData.max_capacity} onChange={handleChange} min="1" className={inputClass} />
                  </Field>
                </div>
                <p className="text-xs text-gray-500">Example: Felucca ride costs 25/boat and can hold 1-6 passengers</p>
              </div>
            )}

            {/* Tiered Settings - Only show when tiered is selected */}
            {formData.pricing_type === 'tiered' && (
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                <p className="flex items-start gap-2 text-xs font-medium text-gray-700">
                  <Users className="mt-px h-4 w-4 shrink-0 text-gray-500" />
                  Volume-discount bands — per-person rate by group size. Groups larger than the last band use its rate.
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="w-full min-w-[30rem] text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-medium text-gray-600">
                      <tr>
                        <th scope="col" className="px-2 py-1.5 font-medium">Min Pax <span className="text-red-600">*</span></th>
                        <th scope="col" className="px-2 py-1.5 font-medium">Max Pax <span className="text-red-600">*</span></th>
                        <th scope="col" className="px-2 py-1.5 font-medium">
                          {t('form.eurRate')} <span className="font-normal text-gray-400">({formData.rate_currency || rateCurrency}) /pax</span> <span className="text-red-600">*</span>
                        </th>
                        <th scope="col" className="px-2 py-1.5 font-medium">Label</th>
                        <th scope="col" className="w-10 px-2 py-1.5"><span className="sr-only">Remove tier</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {formData.tiers.map((tier, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5">
                            <input
                              id={`ac-tier-${i}-min`} aria-label={`Min Pax ${i + 1}`}
                              type="number" min="1" required value={tier.min_pax || ''}
                              onChange={(e) => updateTier(i, { min_pax: parseInt(e.target.value) || 0 })}
                              className={inputClass}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              id={`ac-tier-${i}-max`} aria-label={`Max Pax ${i + 1}`}
                              type="number" min="1" required value={tier.max_pax || ''}
                              onChange={(e) => updateTier(i, { max_pax: parseInt(e.target.value) || 0 })}
                              className={inputClass}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              id={`ac-tier-${i}-rate`} aria-label={`${t('form.eurRate')} ${i + 1}`}
                              type="number" inputMode="decimal" min="0.01" step="0.01" required value={tier.rate_eur || ''}
                              onChange={(e) => updateTier(i, { rate_eur: parseFloat(e.target.value) || 0 })}
                              className={`${inputClass} tabular-nums`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              id={`ac-tier-${i}-label`} aria-label={`Label ${i + 1}`}
                              type="text" value={tier.label} placeholder={`${tier.min_pax || 1}-${tier.max_pax || '?'}`}
                              onChange={(e) => updateTier(i, { label: e.target.value })}
                              className={inputClass}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeTier(i)}
                              className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                              title="Remove tier"
                              aria-label="Remove tier"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={addTier}
                  className="flex w-fit items-center gap-1 text-sm font-medium text-[#4a5c35] hover:underline"
                >
                  <Plus className="h-4 w-4" /> Add tier
                </button>
                <p className="text-xs text-gray-500">Example: Felucca — 1-4 pax at 30/person, 5-15 pax at 20/person</p>
              </div>
            )}
          </FormSection>

          {/* Rates — for tiered pricing the rates live in the bands above */}
          {formData.pricing_type !== 'tiered' && (
            <FormSection title={t('form.pricing')}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('form.eurRate')} required htmlFor="ac-rate">
                  <MoneyInput id="ac-rate" name="base_rate_eur" value={formData.base_rate_eur} onChange={handleChange} currency={formData.rate_currency || rateCurrency} unit={baseRateUnit} required />
                </Field>
                <CurrencyPicker id="ac-currency" value={formData.rate_currency} onChange={v => setFormData(prev => ({ ...prev, rate_currency: v }))} orgCurrency={rateCurrency} />
              </div>
            </FormSection>
          )}

          {/* Link to Supplier */}
          <FormSection title={tCommon('sectionSupplier')}>
            <Field label={tCommon('linkToSupplier')} required htmlFor="ac-supplier">
              <select
                id="ac-supplier"
                required
                name="supplier_id"
                value={formData.supplier_id}
                onChange={(e) => handleSupplierChange(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>-- Select a Supplier --</option>
                <option value={NO_SUPPLIER_SENTINEL}>{tCommon('noSupplierDirect')}</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} {supplier.city ? `(${supplier.city})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </FormSection>

          <FormSection title={t('form.validityPeriod')}>
            <ValidityFields idPrefix="ac" from={formData.rate_valid_from} to={formData.rate_valid_to} onChange={handleChange} fromLabel={t('form.validFrom')} toLabel={t('form.validTo')} />
          </FormSection>

          <Field label={t('form.notes')} htmlFor="ac-notes">
            <textarea id="ac-notes" name="notes" value={formData.notes} onChange={handleChange} rows={2} placeholder={t('form.notesPlaceholder')} className={inputClass} />
          </Field>
        </RateFormModal>
      )}
    </div>
  )
}