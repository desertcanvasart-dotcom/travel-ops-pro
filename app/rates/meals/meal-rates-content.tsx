'use client'

import { todayLocal } from '@/lib/today'
import { useEffect, useState } from 'react'
import CityOptions from '@/app/components/CityOptions'
import { firstInvalidMessage } from '@/lib/form-guard'
import { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import { RateFormModal, FormSection, Field, MoneyInput, CurrencyPicker, ValidityFields, SwitchField, inputClass, shortDate } from '@/components/rates/RateFormKit'
import { formatRateInRowCurrency } from '@/app/components/RateCurrencyField'
import { useTranslations } from 'next-intl'
import { useTierLabel } from '@/hooks/useTierLabel'
import { useTierOptions } from '@/hooks/useTierOptions'
import { useVocabOptions } from '@/hooks/useVocabOptions'
import { defaultTierKey, optionsFromLabels, slugifyKey } from '@/lib/vocabulary'
import { useVocabLabel } from '@/hooks/useVocabLabel'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import RateAuditLog from '@/app/components/RateAuditLog'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import { NO_SUPPLIER_SENTINEL } from '@/lib/suppliers/supplier-field-constants'
import { Copy, Utensils,
  Plus,
  Search,
  Edit,
  Trash2,
  Check,
  MapPin,
  Users,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Table2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Star
} from 'lucide-react'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import { averageRatesByCurrency, formatMoney, formatRateAverages } from '@/lib/currency-totals'

// Egyptian cities

// These four lists are WORDS, and the form used to store the word itself
// ('Lunch', 'Fine Dining'). Since 2026-09 the pickers store the vocabulary
// KEY ('lunch', 'fine_dining' — Settings → Vocabulary) and list the agency's
// entries; the words below are the built-in fallback until the vocabulary
// loads. Rows written before then still hold the word: readers slugify, and
// migration 20261004 rewrote the stored ones.
const MEAL_TYPES = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Brunch',
  'Snack',
  'Full Board',
  'Half Board'
]

const CUISINE_TYPES = [
  'Egyptian',
  'Mediterranean',
  'Italian',
  'Middle Eastern',
  'Asian',
  'International',
  'Seafood',
  'Lebanese',
  'Turkish',
  'Indian'
]

const RESTAURANT_TYPES = [
  'Fine Dining',
  'Casual Dining',
  'Buffet',
  'Local Restaurant',
  'Hotel Restaurant',
  'Cruise Restaurant',
  'Street Food',
  'Café'
]

const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Halal',
  'Gluten-Free',
  'Dairy-Free',
  'Nut-Free',
  'Kosher'
]

// The PRESETS' badge colours and fallback words. The tiers a form offers come
// from Settings → Vocabulary (useTierOptions); an agency-added tier has no
// preset colour and takes CUSTOM_TIER_COLOR.
const TIERS = [
  { value: 'budget', label: 'Budget', color: 'bg-gray-100 text-gray-700' },
  { value: 'standard', label: 'Standard', color: 'bg-blue-100 text-blue-700' },
  { value: 'deluxe', label: 'Deluxe', color: 'bg-purple-100 text-purple-700' },
  { value: 'luxury', label: 'Luxury', color: 'bg-amber-100 text-amber-700' }
]
const CUSTOM_TIER_COLOR = 'bg-green-100 text-green-800'
const presetTierLabel = (key: string) => TIERS.find(x => x.value === key)?.label ?? key

interface Supplier {
  id: string
  name: string
  type: string
  city?: string
}

interface MealRate {
  id: string
  service_code: string
  restaurant_name: string
  meal_type?: string
  cuisine_type?: string
  restaurant_type?: string
  city?: string
  base_rate_eur: number
  base_rate_non_eur: number
  rate_currency?: string | null
  season?: string
  rate_valid_from?: string
  rate_valid_to?: string
  supplier_id?: string
  supplier_name?: string
  tier?: string
  meal_category?: string
  dietary_options?: string[]
  per_person_rate?: boolean
  notes?: string
  is_active: boolean
  is_preferred?: boolean
  created_at?: string
  updated_at?: string
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function MealRatesContent() {
  const t = useTranslations('rates.meals')
  const tCommon = useTranslations('rates.common')
  const tierOptions = useTierOptions(presetTierLabel)
  // A new rate starts on the ladder's own "standard" rung — 'standard' itself
  // may not exist once the agency has reshaped its tiers.
  const defaultTier = defaultTierKey(tierOptions.map(o => o.value))
  const tierLabel = useTierLabel()
  const mealTypeLabel = useVocabLabel('meal_type')
  const cuisineTypeLabel = useVocabLabel('cuisine_type')
  const restaurantTypeLabel = useVocabLabel('restaurant_type')
  const dietaryLabel = useVocabLabel('dietary_option')
  const mealTypeOptions = useVocabOptions('meal_type', optionsFromLabels(MEAL_TYPES))
  const cuisineOptions = useVocabOptions('cuisine_type', optionsFromLabels(CUISINE_TYPES))
  const restaurantTypeOptions = useVocabOptions('restaurant_type', optionsFromLabels(RESTAURANT_TYPES))
  const dietaryOptions = useVocabOptions('dietary_option', optionsFromLabels(DIETARY_OPTIONS))
  const searchParams = useSearchParams()
  const initialSupplierId = searchParams.get('supplier_id') || ''

  // Currency conversion
  const { currency, formatWithConversion, rateCurrency } = useCurrency()
  const formatRate = (amount: number) => formatWithConversion(amount, rateCurrency)

  const [rates, setRates] = useState<MealRate[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedMealType, setSelectedMealType] = useState('')
  const [selectedCuisine, setSelectedCuisine] = useState('')
  const [selectedTier, setSelectedTier] = useState('')
  const [selectedSupplier, setSelectedSupplier] = useState(initialSupplierId)
  const [showInactive, setShowInactive] = useState(false)

  // UI State
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<MealRate | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'compact'>('table')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  // Delete Confirmation Modal
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Toast/Notification
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
    let code = 'MEAL-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const [formData, setFormData] = useState({
    service_code: '',
    restaurant_name: '',
    meal_type: '',
    cuisine_type: '',
    restaurant_type: '',
    city: '',
    base_rate_eur: 0,
    base_rate_non_eur: 0,
    rate_currency: '',
    season: '',
    rate_valid_from: today,
    rate_valid_to: nextYear,
    supplier_id: '',
    supplier_name: '',
    tier: defaultTier,
    meal_category: '',
    dietary_options: [] as string[],
    per_person_rate: true,
    notes: '',
    is_active: true,
    is_preferred: false
  })

  // Fetch rates
  const fetchRates = async () => {
    try {
      // Every rate, inactive ones too: "Show inactive" filters on this page.
      // The fetch ran once, active only, so an inactive rate could never be
      // found again to reactivate — and Total always equalled Active.
      const response = await fetch('/api/rates/meals')
      const data = await response.json()

      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching meal rates:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch suppliers (restaurants)
  const fetchSuppliers = async () => {
    try {
      const response = await fetch('/api/suppliers?type=restaurant')
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
  }, [searchTerm, selectedCity, selectedMealType, selectedCuisine, selectedTier, selectedSupplier, showInactive, itemsPerPage])

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
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

  const toggleDietaryOption = (option: string) => {
    setFormData(prev => ({
      ...prev,
      dietary_options: prev.dietary_options.includes(option)
        ? prev.dietary_options.filter(o => o !== option)
        : [...prev.dietary_options, option]
    }))
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setError(null)
    setFormData({
      service_code: generateServiceCode(),
      restaurant_name: '',
      meal_type: '',
      cuisine_type: '',
      restaurant_type: '',
      city: '',
      base_rate_eur: 0,
      base_rate_non_eur: 0,
      rate_currency: '',
      season: '',
      rate_valid_from: today,
      rate_valid_to: nextYear,
      supplier_id: selectedSupplier || '',
      supplier_name: '',
      tier: defaultTier,
      meal_category: '',
      dietary_options: [],
      per_person_rate: true,
      notes: '',
      is_active: true,
      is_preferred: false
    })
    setShowModal(true)
  }

  // Duplicate: open the ADD form pre-filled from this row. The identity
  // field is cleared so the save creates a new record; everything else is
  // there to change. Operator request 2026-09-02 — most rates are entered as
  // near-copies of an existing one.
  const handleClone = (rate: MealRate) => {
    handleEdit(rate)
    setEditingRate(null)
    setFormData(prev => ({ ...prev, service_code: '' }))
  }

  const handleEdit = (rate: MealRate) => {
    setEditingRate(rate)
    setError(null)
    setFormData({
      service_code: rate.service_code || '',
      restaurant_name: rate.restaurant_name || '',
      // Stored as keys since 2026-09; a row that still holds the word opens
      // under the matching key.
      meal_type: slugifyKey(rate.meal_type || ''),
      cuisine_type: slugifyKey(rate.cuisine_type || ''),
      restaurant_type: slugifyKey(rate.restaurant_type || ''),
      city: rate.city || '',
      base_rate_eur: rate.base_rate_eur || 0,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      rate_currency: rate.rate_currency || '',
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      supplier_id: rate.supplier_id || '',
      supplier_name: rate.supplier_name || '',
      // Case-normalised, but NOT filtered to the presets: a rate filed under an
      // agency-added tier must open under that tier, not as 'standard'.
      tier: (rate.tier || '').trim().toLowerCase() || 'standard',
      meal_category: rate.meal_category || '',
      dietary_options: (rate.dietary_options || []).map((d: string) => slugifyKey(d)),
      per_person_rate: rate.per_person_rate !== false,
      notes: rate.notes || '',
      is_active: rate.is_active,
      is_preferred: rate.is_preferred || false
    })
    setShowModal(true)
  }

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault()
    if (saving) return  // Prevent double-submit

    // This handler can also be called from a button click, so the form is only
    // checked when there is one. See lib/form-guard.ts for why the browser's
    // own message is not enough inside a modal.
    const invalid = firstInvalidMessage(e?.currentTarget)
    if (invalid) {
      setError(invalid)
      return
    }

    setSaving(true)
    try {
      const url = editingRate
        ? `/api/rates/meals/${editingRate.id}`
        : '/api/rates/meals'

      const method = editingRate ? 'PUT' : 'POST'

      // Only send fields that the DB expects
      const payload = {
        service_code: formData.service_code,
        restaurant_name: formData.restaurant_name,
        meal_type: formData.meal_type || null,
        cuisine_type: formData.cuisine_type || null,
        restaurant_type: formData.restaurant_type || null,
        city: formData.city || null,
        base_rate_eur: parseFloat(String(formData.base_rate_eur)) || 0,
        // One price. A meal costs what a meal costs — the EU/non-EU split is
        // real only for hotels and cruises (operator, 2026-08-30).
        base_rate_non_eur: parseFloat(String(formData.base_rate_eur)) || 0,
        ...rateCurrencyPatch(formData.rate_currency, editingRate?.rate_currency),
        season: formData.season || null,
        rate_valid_from: formData.rate_valid_from || null,
        rate_valid_to: formData.rate_valid_to || null,
        supplier_id: formData.supplier_id || null,
        supplier_name: formData.supplier_name || null,
        tier: formData.tier || null,
        meal_category: formData.meal_category || null,
        dietary_options: formData.dietary_options || [],
        per_person_rate: formData.per_person_rate,
        notes: formData.notes || null,
        is_active: formData.is_active,
        is_preferred: formData.is_preferred,
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        const errorMsg = data.error || 'Failed to save rate'
        console.error('Save meal rate failed:', { status: response.status, error: errorMsg, payload })
        showNotification('error', 'Error', errorMsg)
        setError(errorMsg)
        return
      }

      showNotification('success', 'Success', editingRate ? 'Meal rate updated successfully!' : 'Meal rate created successfully!')
      setShowModal(false)
      setError(null)
      fetchRates()
    } catch (error: any) {
      console.error('Error saving rate:', error)
      const errorMsg = error?.message || 'Failed to save rate. Please try again.'
      showNotification('error', 'Error', errorMsg)
      setError(errorMsg)
    } finally {
      setSaving(false)
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
      const response = await fetch(`/api/rates/meals/${deleteModal.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        showNotification('success', 'Deleted', `"${deleteModal.name}" has been deleted successfully.`)
        fetchRates()
      } else {
        showNotification('error', 'Cannot Delete', data.error || 'Failed to delete rate')
      }
    } catch (error) {
      console.error('Error deleting rate:', error)
      showNotification('error', 'Error', 'Failed to delete rate. Please try again.')
    } finally {
      setIsDeleting(false)
      setDeleteModal(null)
    }
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' ||
      rate.restaurant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCity = selectedCity === '' || rate.city === selectedCity
    const matchesMealType = selectedMealType === '' || slugifyKey(rate.meal_type || '') === selectedMealType
    const matchesCuisine = selectedCuisine === '' || slugifyKey(rate.cuisine_type || '') === selectedCuisine
    const matchesTier = selectedTier === '' || (rate.tier || '').toLowerCase() === selectedTier.toLowerCase()
    const matchesSupplier = selectedSupplier === '' || rate.supplier_id === selectedSupplier
    const matchesActive = showInactive || rate.is_active

    return matchesSearch && matchesCity && matchesMealType && matchesCuisine && matchesTier && matchesSupplier && matchesActive
  })

  // Pagination
  const totalPages = Math.ceil(filteredRates.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRates = filteredRates.slice(startIndex, startIndex + itemsPerPage)

  // Stats
  const activeRates = rates.filter(r => r.is_active).length
  const linkedRates = rates.filter(r => r.supplier_id).length
  const avgRate = averageRatesByCurrency(rates, r => r.base_rate_eur, r => r.rate_currency)
  const uniqueCities = [...new Set(rates.map(r => r.city).filter(Boolean))].length

  // Get tier badge
  const getTierBadge = (tier: string | undefined) => {
    const key = (tier || '').trim().toLowerCase() || 'standard'
    const tierConfig = TIERS.find(t => t.value === key)
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tierConfig?.color ?? CUSTOM_TIER_COLOR}`}>
        {tierLabel(key, tierConfig?.label ?? key)}
      </span>
    )
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
          <p className="text-sm text-gray-600">{tCommon('loading')}</p>
        </div>
      </div>
    )
  }

  const handleBulkDelete = async () => {
    await bulkDeleteByIds([...bulk.selected], id => `/api/rates/meals/${id}`)
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
                {tCommon('gotIt')}
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('deleteRate')}</h3>
              <p className="text-sm text-gray-600 mb-1">
                {tCommon('confirmDelete')}
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-4">
                "{deleteModal.name}"
              </p>
              <p className="text-xs text-gray-500 mb-6">
                {tCommon('deleteWarning')}
              </p>
              <div className="flex items-center gap-3 w-full">
                <button
                  onClick={() => setDeleteModal(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      {tCommon('deleting')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      {tCommon('delete')}
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
          <div className="p-2 bg-orange-100 rounded-lg">
            <Utensils className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {t('title')}
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
            </h1>
            <p className="text-sm text-gray-600">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BulkRateImportExport tableName="meal_rates" onImportComplete={fetchRates} />
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('addRate')}
          </button>
          <Link
            href="/suppliers?type=restaurant"
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50"
          >
            <Utensils className="w-4 h-4" />
            {t('restaurants')}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Utensils className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{rates.length}</p>
          <p className="text-xs text-gray-600">{t('totalRates')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Check className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{activeRates}</p>
          <p className="text-xs text-gray-600">{t('active')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{linkedRates}</p>
          <p className="text-xs text-gray-600">{t('linked')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400 font-bold">{currency}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatRateAverages(avgRate, formatRate)}</p>
          <p className="text-xs text-gray-600">{t('avgRate')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{uniqueCities}</p>
          <p className="text-xs text-gray-600">{t('cities')}</p>
        </div>
      </div>

      {/* Filters */}
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

          {/* Meal Type Filter */}
          <select
            value={selectedMealType}
            onChange={(e) => setSelectedMealType(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allMealTypes')}</option>
            {mealTypeOptions.map(o => (
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

          {/* Tier Filter */}
          <select
            value={selectedTier}
            onChange={(e) => setSelectedTier(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allTiers')}</option>
            {tierOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
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
            {showInactive ? tCommon('showAll') : tCommon('activeOnly')}
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
            {tCommon('showing')} <span className="font-semibold">{paginatedRates.length}</span> {tCommon('of')}{' '}
            <span className="font-semibold">{filteredRates.length}</span> {tCommon('rates')}
          </p>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} {tCommon('perPage')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rates Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paginatedRates.length === 0 ? (
          <div className="p-12 text-center">
            <Utensils className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('noRatesFound')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchTerm || selectedCity || selectedMealType || selectedTier
                ? tCommon('adjustFilters')
                : t('getStarted')}
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
            <BulkDeleteBar count={bulk.selected.size} label="meal rates" onDelete={handleBulkDelete} onClear={bulk.clear} />
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="select all" checked={paginatedRates.length > 0 && bulk.selected.size === paginatedRates.length} onChange={() => bulk.toggleAll(paginatedRates.map(r => r.id))} /></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('restaurant')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('mealType')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{tCommon('city')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{tCommon('tier')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{tCommon('eurRate')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{tCommon('status')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2"><input type="checkbox" aria-label="select row" checked={bulk.has(rate.id)} onChange={() => bulk.toggle(rate.id)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Utensils className="w-4 h-4 text-orange-500" />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-semibold text-gray-900">{rate.restaurant_name}</span>
                            {rate.is_preferred && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                          </div>
                          <p className="text-xs text-gray-500">{rate.service_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {rate.meal_type ? (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                          {mealTypeLabel(rate.meal_type, rate.meal_type)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{rate.city || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {getTierBadge(rate.tier)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">{formatRateInRowCurrency(rate.base_rate_eur, rate, formatRate)}</span>
                      {rate.rate_currency && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold">{rate.rate_currency}</span>}
                      {rate.per_person_rate && <span className="text-xs text-gray-400">/pp</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rate.is_active ? tCommon('active') : tCommon('inactive')}
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
                          onClick={() => confirmDelete(rate.id, rate.restaurant_name)}
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
                    <Utensils className="w-5 h-5 text-orange-500" />
                    <span className="font-semibold text-gray-900">{rate.restaurant_name}</span>
                    {rate.is_preferred && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? tCommon('active') : tCommon('inactive')}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  {rate.meal_type && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                      {mealTypeLabel(rate.meal_type, rate.meal_type)}
                    </span>
                  )}
                  {getTierBadge(rate.tier)}
                </div>

                <div className="space-y-1 text-sm text-gray-600 mb-3">
                  <p><span className="text-gray-400">{tCommon('city')}:</span> {rate.city || '—'}</p>
                  <p><span className="text-gray-400">{t('cuisineType')}:</span> {rate.cuisine_type ? cuisineTypeLabel(rate.cuisine_type, rate.cuisine_type) : '—'}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">{tCommon('eurRate')} {rate.per_person_rate && `(${t('perPerson')})`}</p>
                    <p className="text-lg font-bold text-green-600">{formatRateInRowCurrency(rate.base_rate_eur, rate, formatRate)}</p>
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
                      onClick={() => confirmDelete(rate.id, rate.restaurant_name)}
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
                  <Utensils className="w-4 h-4 text-orange-500" />
                  <span className="font-medium text-gray-900">{rate.restaurant_name}</span>
                  {rate.is_preferred && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                  <span className="text-sm text-gray-500">{rate.city || '—'}</span>
                  {rate.meal_type && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                      {mealTypeLabel(rate.meal_type, rate.meal_type)}
                    </span>
                  )}
                  {getTierBadge(rate.tier)}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-green-600">{formatRateInRowCurrency(rate.base_rate_eur, rate, formatRate)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? tCommon('active') : tCommon('inactive')}
                  </span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleClone(rate)} className="p-1 text-gray-500 hover:text-primary-600 rounded" title={tCommon('duplicate')} aria-label={tCommon('duplicate')}>
                      <Copy className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEdit(rate)} className="p-1 text-gray-400 hover:text-primary-600">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => confirmDelete(rate.id, rate.restaurant_name)} className="p-1 text-gray-400 hover:text-red-600">
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
              {tCommon('page')} <span className="font-semibold">{currentPage}</span> {tCommon('of')} <span className="font-semibold">{totalPages}</span>
              <span className="text-gray-400 ml-2">({filteredRates.length} {tCommon('total')})</span>
            </p>
            <div className="flex items-center gap-1">
              {/* First Page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                {tCommon('first')}
              </button>
              
              {/* Previous */}
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Page Numbers */}
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

              {/* Next */}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Last Page */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                {tCommon('last')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showModal && (
        <RateFormModal
          formId="meal-rate-form"
          title={editingRate ? t('editRate') : t('addRate')}
          code={formData.service_code}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          after={editingRate ? <RateAuditLog tableName="meal_rates" recordId={editingRate.id} /> : undefined}
          summary={[
            formData.restaurant_name || null,
            mealTypeOptions.find(o => o.value === formData.meal_type)?.label,
            Number(formData.base_rate_eur) > 0
              ? `${formatMoney(Number(formData.base_rate_eur), formData.rate_currency || rateCurrency)}${formData.per_person_rate ? ` ${tCommon('perPerson')}` : ''}`
              : null,
            formData.rate_valid_from && formData.rate_valid_to ? `${shortDate(formData.rate_valid_from)} – ${shortDate(formData.rate_valid_to)}` : null,
          ].filter(Boolean).join(' · ')}
          active={{ checked: formData.is_active, onChange: v => setFormData(prev => ({ ...prev, is_active: v })), label: tCommon('formActive') }}
          submitLabel={saving ? tCommon('saving') : (editingRate ? tCommon('updateRate') : tCommon('createRate'))}
          cancelLabel={tCommon('cancel')}
        >
          <FormSection title={t('restaurantMealDetails')}>
            <Field
              label={t('supplierRestaurant')}
              required
              htmlFor="ml-supplier"
              hint={<>{t('linkToRestaurant')} <a href="/suppliers?type=restaurant" className="text-primary-600 hover:underline">{t('manageRestaurants')}</a></>}
            >
              <select
                id="ml-supplier"
                required
                value={formData.supplier_id}
                onChange={(e) => handleSupplierChange(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>{t('selectSupplierOptional')}</option>
                <option value={NO_SUPPLIER_SENTINEL}>{tCommon('noSupplierDirect')}</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} {supplier.city && `(${supplier.city})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('restaurantName')} required htmlFor="ml-restaurant">
              <input id="ml-restaurant" type="text" name="restaurant_name" value={formData.restaurant_name} onChange={handleChange} required placeholder="e.g., Naguib Mahfouz Café" className={inputClass} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('mealType')} htmlFor="ml-meal-type">
                <select id="ml-meal-type" name="meal_type" value={formData.meal_type} onChange={handleChange} className={inputClass}>
                  <option value="">{t('selectMealType')}</option>
                  {mealTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={t('cuisineType')} htmlFor="ml-cuisine">
                <select id="ml-cuisine" name="cuisine_type" value={formData.cuisine_type} onChange={handleChange} className={inputClass}>
                  <option value="">{t('selectCuisine')}</option>
                  {cuisineOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={t('restaurantType')} htmlFor="ml-restaurant-type">
                <select id="ml-restaurant-type" name="restaurant_type" value={formData.restaurant_type} onChange={handleChange} className={inputClass}>
                  <option value="">{t('selectType')}</option>
                  {restaurantTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label={tCommon('city')} htmlFor="ml-city">
                <select id="ml-city" name="city" value={formData.city} onChange={handleChange} className={inputClass}>
                  <option value="">{tCommon('selectCity')}</option>
                  <CityOptions />
                </select>
              </Field>
              <Field label={tCommon('tier')} htmlFor="ml-tier">
                <select id="ml-tier" name="tier" value={formData.tier} onChange={handleChange} className={inputClass}>
                  {tierOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title={t('dietaryOptions')}>
            <div className="flex flex-wrap gap-2">
              {dietaryOptions.map(o => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={formData.dietary_options.includes(o.value)}
                  onClick={() => toggleDietaryOption(o.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors ${
                    formData.dietary_options.includes(o.value)
                      ? 'border-[#647C47] bg-[#647C47]/10 text-[#4a5c35]'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </FormSection>

          <FormSection title={tCommon('pricing')}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={tCommon('eurRate')} required htmlFor="ml-rate">
                <MoneyInput
                  id="ml-rate"
                  name="base_rate_eur"
                  value={formData.base_rate_eur}
                  onChange={handleChange}
                  currency={formData.rate_currency || rateCurrency}
                  unit={formData.per_person_rate ? tCommon('perPerson') : undefined}
                  required
                />
              </Field>
              <CurrencyPicker id="ml-currency" value={formData.rate_currency} onChange={v => setFormData(prev => ({ ...prev, rate_currency: v }))} orgCurrency={rateCurrency} />
            </div>
            <SwitchField id="ml-per-person" checked={formData.per_person_rate} onChange={v => setFormData(prev => ({ ...prev, per_person_rate: v }))} label={t('perPersonRate')} />
          </FormSection>

          <FormSection title={tCommon('validityPeriod')}>
            <ValidityFields idPrefix="ml" from={formData.rate_valid_from} to={formData.rate_valid_to} onChange={handleChange} fromLabel={tCommon('validFrom')} toLabel={tCommon('validTo')} />
          </FormSection>

          <Field label={tCommon('notes')} htmlFor="ml-notes">
            <textarea id="ml-notes" name="notes" value={formData.notes} onChange={handleChange} rows={2} className={inputClass} />
          </Field>

          <div className="flex flex-col gap-1">
            <label htmlFor="ml-preferred" className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-800">
              <input
                id="ml-preferred"
                type="checkbox"
                checked={formData.is_preferred}
                onChange={(e) => setFormData(prev => ({ ...prev, is_preferred: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-amber-500"
              />
              <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
              {t('preferredRestaurant')}
            </label>
            <p className="ml-6 text-xs leading-snug text-gray-500">{t('preferredRestaurantHint')}</p>
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </RateFormModal>
      )}
    </div>
  )
}