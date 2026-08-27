'use client'

import { useEffect, useState, useMemo } from 'react'
import CityOptions from '@/app/components/CityOptions'
import { firstInvalidMessage } from '@/lib/form-guard'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import { useTranslations } from 'next-intl'
import RateAuditLog from '@/app/components/RateAuditLog'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import GuideLanguagesEditor from '@/components/rates/GuideLanguagesEditor'
import { NO_SUPPLIER_SENTINEL } from '@/lib/suppliers/supplier-field-constants'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  Globe,
  MapPin,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Table2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react'
import { useCurrency } from '@/app/contexts/PreferencesContext'

// Egyptian cities

const LANGUAGES = [
  'English', 'French', 'German', 'Spanish', 'Italian',
  'Russian', 'Chinese', 'Japanese', 'Portuguese', 'Dutch', 'Polish'
]

const GUIDE_TYPES = [
  { value: 'licensed', label: 'Licensed Guide' },
  { value: 'egyptologist', label: 'Egyptologist' },
  { value: 'local', label: 'Local Guide' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'driver_guide', label: 'Driver Guide' }
]

const TOUR_DURATIONS = [
  { value: 'half_day', label: 'Half Day (4h)' },
  { value: 'full_day', label: 'Full Day (8h)' },
  { value: 'extended', label: 'Extended (10h+)' },
  { value: 'hourly', label: 'Hourly' }
]

interface Guide {
  id: string
  name: string
  email?: string
  phone?: string
  languages?: string[]
  city?: string
  tier?: string
  is_preferred?: boolean
}

interface GuideRate {
  id: string
  service_code: string
  guide_language: string
  guide_type: string
  city?: string
  tour_duration: string
  base_rate_eur: number
  base_rate_non_eur: number
  rate_currency?: string | null
  season?: string
  rate_valid_from?: string
  rate_valid_to?: string
  supplier_id?: string
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function GuideRatesContent() {
  const t = useTranslations('rates.guides')
  const tCommon = useTranslations('rates.common')
  const searchParams = useSearchParams()
  const initialSupplierId = searchParams.get('supplier_id') || ''

  // Currency conversion
  const { currency, formatWithConversion, convertCurrency, rateCurrency } = useCurrency()

  // Helper to format rate from EUR to user's preferred currency
  const formatRate = (eurAmount: number) => {
    return formatWithConversion(eurAmount, rateCurrency)
  }

  const [rates, setRates] = useState<GuideRate[]>([])
  const [guides, setGuides] = useState<Guide[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('')
  const [selectedGuide, setSelectedGuide] = useState(initialSupplierId)
  const [selectedGuideType, setSelectedGuideType] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // UI State
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<GuideRate | null>(null)
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
  const today = new Date().toISOString().split('T')[0]
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Generate service code
  const generateServiceCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'GD-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const [formData, setFormData] = useState({
    service_code: '',
    guide_language: 'English',
    guide_type: 'licensed',
    city: '',
    tour_duration: 'full_day',
    base_rate_eur: 0,
    base_rate_non_eur: 0,
    rate_currency: '',
    season: '',
    rate_valid_from: today,
    rate_valid_to: nextYear,
    supplier_id: '',
    notes: '',
    is_active: true
  })

  // Fetch rates
  const fetchRates = async () => {
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.append('active_only', 'true')

      const response = await fetch(`/api/rates/guides?${params}`)
      const data = await response.json()

      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching guide rates:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch the guide roster from suppliers(type='guide').
  // Was previously fetching from the separate `guides` table — the picker
  // wrote guides.id into guide_rates.supplier_id, and most of those ids
  // didn't exist in suppliers, so the FK rejected. Reading from suppliers
  // matches the other 5 rate forms and guarantees the FK passes.
  // suppliers.languages is edited HERE (GuideLanguagesEditor, shown when a
  // guide is selected) since the supplier form stopped collecting it.
  const fetchGuides = async () => {
    try {
      const response = await fetch('/api/suppliers?type=guide&status=active')
      const data = await response.json()
      if (Array.isArray(data)) {
        setGuides(data)
      } else if (data.success && data.data) {
        setGuides(data.data)
      }
    } catch (error) {
      console.error('Error fetching guides (suppliers):', error)
    }
  }

  useEffect(() => {
    setMounted(true)
    fetchRates()
    fetchGuides()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedCity, selectedLanguage, selectedGuide, selectedGuideType, showInactive, itemsPerPage])

  // Filter the supplier-guides by the form's city.
  const filteredGuidesForDropdown = useMemo(() => {
    return guides.filter(guide => {
      if (formData.city && guide.city && guide.city !== formData.city) {
        return false
      }
      return true
    })
  }, [guides, formData.city])

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleGuideChange = (guideId: string) => {
    const guide = guides.find(g => g.id === guideId)
    setFormData(prev => ({
      ...prev,
      supplier_id: guideId,
      city: guide?.city || prev.city
    }))
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: generateServiceCode(),
      guide_language: 'English',
      guide_type: 'licensed',
      city: '',
      tour_duration: 'full_day',
      base_rate_eur: 0,
      base_rate_non_eur: 0,
      rate_currency: '',
      season: '',
      rate_valid_from: today,
      rate_valid_to: nextYear,
      supplier_id: selectedGuide || '',
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: GuideRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code || '',
      guide_language: rate.guide_language || 'English',
      guide_type: rate.guide_type || 'licensed',
      city: rate.city || '',
      tour_duration: rate.tour_duration || 'full_day',
      base_rate_eur: rate.base_rate_eur || 0,
      base_rate_non_eur: rate.base_rate_non_eur || 0,
      rate_currency: rate.rate_currency || '',
      season: rate.season || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      supplier_id: rate.supplier_id || '',
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

    try {
      const url = editingRate
        ? `/api/rates/guides/${editingRate.id}`
        : '/api/rates/guides'

      const method = editingRate ? 'PUT' : 'POST'

      const { rate_currency: pickedCurrency, ...restFormData } = formData
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...restFormData, ...rateCurrencyPatch(pickedCurrency, editingRate?.rate_currency) })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        showNotification('error', t('notifications.error'), data.error || t('notifications.failedToSave'))
        return
      }

      if (data.data) {
        showNotification('success', tCommon('success'), editingRate ? t('notifications.rateUpdated') : t('notifications.rateCreated'))
        setShowModal(false)
        fetchRates()
      } else {
        showNotification('error', t('notifications.error'), tCommon('noDataReturned'))
      }
    } catch (error) {
      console.error('Error saving rate:', error)
      showNotification('error', t('notifications.error'), t('notifications.failedToSave'))
    }
  }

  // Open delete confirmation modal
  const confirmDelete = (id: string, language: string) => {
    setDeleteModal({ show: true, id, name: language })
  }

  // Actually perform delete
  const handleDelete = async () => {
    if (!deleteModal) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/rates/guides/${deleteModal.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        showNotification('success', tCommon('deleted'), t('notifications.rateDeleted', { name: deleteModal.name }))
        fetchRates()
      } else {
        showNotification('error', t('notifications.cannotDelete'), data.error || t('notifications.failedToDelete'))
      }
    } catch (error) {
      console.error('Error deleting rate:', error)
      showNotification('error', t('notifications.error'), t('notifications.failedToDelete'))
    } finally {
      setIsDeleting(false)
      setDeleteModal(null)
    }
  }

  // Filter rates
  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' ||
      rate.guide_language.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.city?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesCity = selectedCity === '' || rate.city === selectedCity
    const matchesLanguage = selectedLanguage === '' || rate.guide_language === selectedLanguage
    const matchesGuide = selectedGuide === '' || rate.supplier_id === selectedGuide
    const matchesGuideType = selectedGuideType === '' || rate.guide_type === selectedGuideType
    const matchesActive = showInactive || rate.is_active

    return matchesSearch && matchesCity && matchesLanguage && matchesGuide && matchesGuideType && matchesActive
  })

  // Pagination
  const totalPages = Math.ceil(filteredRates.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRates = filteredRates.slice(startIndex, startIndex + itemsPerPage)

  // Stats
  const activeRates = rates.filter(r => r.is_active).length
  const linkedRates = rates.filter(r => r.supplier_id).length
  const avgRate = rates.length > 0
    ? (rates.reduce((sum, r) => sum + (r.base_rate_eur || 0), 0) / rates.filter(r => (r.base_rate_eur || 0) > 0).length || 0).toFixed(0)
    : '0'
  const uniqueCities = [...new Set(rates.map(r => r.city).filter(Boolean))].length

  // Get guide name by ID
  const getGuideName = (supplierId: string | undefined) => {
    if (!supplierId) return null
    const guide = guides.find(g => g.id === supplierId)
    return guide?.name || null
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
    await bulkDeleteByIds([...bulk.selected], id => `/api/rates/guides/${id}`)
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
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('deleteModal.title')}</h3>
              <p className="text-sm text-gray-600 mb-1">
                {t('deleteModal.confirmText')}
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-4">
                "{deleteModal.name}"
              </p>
              <p className="text-xs text-gray-500 mb-6">
                {t('deleteModal.warning')}
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
      <div className="flex items-center justify-between flex-wrap gap-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Users className="w-6 h-6 text-purple-600" />
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
          <BulkRateImportExport tableName="guide_rates" onImportComplete={fetchRates} />
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('addRate')}
          </button>
          <Link
            href="/suppliers?type=guide"
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50"
          >
            <Users className="w-4 h-4" />
            {t('viewGuides')}
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-gray-400" />
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
            <Users className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{linkedRates}</p>
          <p className="text-xs text-gray-600">{t('stats.linkedToGuide')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-gray-400 font-bold">{currency}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatRate(Number(avgRate))}</p>
          <p className="text-xs text-gray-600">{t('stats.avgDailyRate')}</p>
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

          {/* Guide Filter */}
          <select
            value={selectedGuide}
            onChange={(e) => setSelectedGuide(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allGuides')}</option>
            {guides.map(guide => (
              <option key={guide.id} value={guide.id}>{guide.name}</option>
            ))}
          </select>

          {/* Language Filter */}
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allLanguages')}</option>
            {LANGUAGES.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
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

          {/* Guide Type Filter */}
          <select
            value={selectedGuideType}
            onChange={(e) => setSelectedGuideType(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allTypes')}</option>
            {GUIDE_TYPES.map(type => (
              <option key={type.value} value={type.value}>{t(`guideTypes.${type.value}`)}</option>
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
            {showInactive ? t('showInactive') : t('hideInactive')}</button>

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

      {/* Languages of the selected guide — a supplier fact, priced here */}
      {selectedGuide && (() => {
        const guide = guides.find(g => g.id === selectedGuide)
        return guide ? (
          <GuideLanguagesEditor
            guide={guide}
            onSaved={(languages) => setGuides(prev => prev.map(g => (g.id === guide.id ? { ...g, languages } : g)))}
          />
        ) : null
      })()}

      {/* Rates Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paginatedRates.length === 0 ? (
          <div className="p-12 text-center">
            <Globe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('noRatesFound')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchTerm || selectedCity || selectedLanguage || selectedGuide || selectedGuideType
                ? t('tryAdjustingFilters')
                : t('noRatesDescription')}
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
            <BulkDeleteBar count={bulk.selected.size} label="guide rates" onDelete={handleBulkDelete} onClear={bulk.clear} />
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="select all" checked={paginatedRates.length > 0 && bulk.selected.size === paginatedRates.length} onChange={() => bulk.toggleAll(paginatedRates.map(r => r.id))} /></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('table.language')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('table.guide')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('table.type')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('table.city')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('table.duration')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('table.eurRate')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('table.nonEurRate')}</th>
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
                        <Globe className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-semibold text-gray-900">{rate.guide_language}</span>
                      </div>
                      <span className="text-xs text-gray-500">{rate.service_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      {rate.supplier_id ? (
                        <span className="text-sm text-purple-600 font-medium">
                          {getGuideName(rate.supplier_id)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">{tCommon('notLinked')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {t(`guideTypes.${rate.guide_type}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{rate.city || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {t(`tourDurations.${rate.tour_duration}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">{formatRate(rate.base_rate_eur)}{rate.rate_currency && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold align-middle">{rate.rate_currency}</span>}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-600">{formatRate(rate.base_rate_non_eur)}</span>
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
                        <button
                          onClick={() => handleEdit(rate)}
                          className="p-1.5 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(rate.id, rate.guide_language)}
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
                    <Globe className="w-5 h-5 text-purple-500" />
                    <span className="font-semibold text-gray-900">{rate.guide_language}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? tCommon('active') : tCommon('inactive')}
                  </span>
                </div>

                {rate.supplier_id && (
                  <p className="text-sm text-purple-600 font-medium mb-2">
                    <Users className="w-3 h-3 inline mr-1" />
                    {getGuideName(rate.supplier_id)}
                  </p>
                )}

                <div className="space-y-1 text-sm text-gray-600 mb-3">
                  <p><span className="text-gray-400">{t('table.type')}:</span> {t(`guideTypes.${rate.guide_type}`)}</p>
                  <p><span className="text-gray-400">{t('table.city')}:</span> {rate.city || '—'}</p>
                  <p><span className="text-gray-400">{t('table.duration')}:</span> {t(`tourDurations.${rate.tour_duration}`)}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">{t('table.eurRate')}</p>
                    <p className="text-lg font-bold text-green-600">{formatRate(rate.base_rate_eur)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(rate)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => confirmDelete(rate.id, rate.guide_language)}
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
                  <Globe className="w-4 h-4 text-purple-500" />
                  <span className="font-medium text-gray-900">{rate.guide_language}</span>
                  <span className="text-sm text-gray-500">{rate.city || '—'}</span>
                  {rate.supplier_id && (
                    <span className="text-sm text-purple-600">{getGuideName(rate.supplier_id)}</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-green-600">{formatRate(rate.base_rate_eur)}{rate.rate_currency && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold align-middle">{rate.rate_currency}</span>}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? tCommon('active') : tCommon('inactive')}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(rate)} className="p-1 text-gray-400 hover:text-primary-600">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => confirmDelete(rate.id, rate.guide_language)} className="p-1 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Enhanced Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <p className="text-sm text-gray-600">
              {t('pagination.page')} <span className="font-semibold">{currentPage}</span> {t('pagination.of')} <span className="font-semibold">{totalPages}</span>
              <span className="text-gray-400 ml-2">({filteredRates.length} {t('pagination.total')})</span>
            </p>
            <div className="flex items-center gap-1">
              {/* First Page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                {t('pagination.first')}</button>
              
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
                {t('pagination.last')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {editingRate ? t('editRate') : t('addGuideRate')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Basic Info */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-bold">1</span>
                  {t('form.basicInfo')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.serviceCode')}</label>
                    <input
                      type="text"
                      name="service_code"
                      value={formData.service_code}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.language')} *</label>
                    <select
                      name="guide_language"
                      value={formData.guide_language}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      {LANGUAGES.map(lang => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.guideType')} *</label>
                    <select
                      name="guide_type"
                      value={formData.guide_type}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      {GUIDE_TYPES.map(type => (
                        <option key={type.value} value={type.value}>{t(`guideTypes.${type.value}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.city')}</label>
                    <select
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">{t('form.selectCity')}</option>
                      <CityOptions />
                    </select>
                  </div>
                </div>
              </div>

              {/* Link to Guide */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                  {t('form.linkToGuide')}
                </h3>
                <select
                  required
                  name="supplier_id"
                  value={formData.supplier_id}
                  onChange={(e) => handleGuideChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                >
                  <option value="" disabled>{t('form.selectGuide')} {filteredGuidesForDropdown.length < guides.length ? `(${filteredGuidesForDropdown.length} matching)` : ''}</option>
                  <option value={NO_SUPPLIER_SENTINEL}>{tCommon('noSupplierDirect')}</option>
                  {filteredGuidesForDropdown.map(guide => (
                    <option key={guide.id} value={guide.id}>
                      {guide.name}
                    </option>
                  ))}
                </select>
                {filteredGuidesForDropdown.length === 0 && guides.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No guides match the selected city/language. Try changing the filters above.
                  </p>
                )}
              </div>

              {/* Duration & Rates */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">3</span>
                  {t('form.durationRates')}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.tourDuration')}</label>
                    <select
                      name="tour_duration"
                      value={formData.tour_duration}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      {TOUR_DURATIONS.map(dur => (
                        <option key={dur.value} value={dur.value}>{t(`tourDurations.${dur.value}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.eurRate')} *</label>
                    <input
                      type="number"
                      name="base_rate_eur"
                      value={formData.base_rate_eur}
                      onChange={handleChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.nonEurRate')}</label>
                    <input
                      type="number"
                      name="base_rate_non_eur"
                      value={formData.base_rate_non_eur}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <RateCurrencyField
                    value={formData.rate_currency}
                    onChange={v => setFormData(prev => ({ ...prev, rate_currency: v }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Validity */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">4</span>
                  {t('form.validityPeriod')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.validFrom')}</label>
                    <input
                      type="date"
                      name="rate_valid_from"
                      value={formData.rate_valid_from}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.validTo')}</label>
                    <input
                      type="date"
                      name="rate_valid_to"
                      value={formData.rate_valid_to}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Notes & Status */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.notes')}</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded"
                  />
                  <span className="text-sm font-medium text-gray-900">{t('form.activeBookings')}</span>
                </label>
              </div>
            </form>

            {/* Audit Log */}
            {editingRate && (
              <div className="px-4">
                <RateAuditLog tableName="guide_rates" recordId={editingRate.id} />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                {t('form.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingRate ? t('form.update') : t('form.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}