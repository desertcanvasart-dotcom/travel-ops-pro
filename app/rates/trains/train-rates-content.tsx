'use client'

import { todayLocal } from '@/lib/today'
import { useEffect, useState } from 'react'
import { firstInvalidMessage } from '@/lib/form-guard'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import { formatRateInRowCurrency } from '@/app/components/RateCurrencyField'
import SupplierPicker from '@/components/rates/SupplierPicker'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import RateAuditLog from '@/app/components/RateAuditLog'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import {
  Train,
  Plus,
  Search,
  Edit,
  Trash2,
  X,
  Check,
  MapPin,
  Clock,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Table2,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import { averageRateInOneCurrency, formatRateAverage } from '@/lib/currency-totals'

// Egyptian cities with train stations
const TRAIN_CITIES = [
  'Alexandria', 'Aswan', 'Asyut', 'Beni Suef', 'Cairo', 'Damanhur',
  'Edfu', 'El Minya', 'Esna', 'Giza', 'Kom Ombo', 'Luxor',
  'Mansoura', 'Port Said', 'Qena', 'Sohag', 'Suez', 'Tanta', 'Zagazig'
]

const CLASS_TYPES = [
  'First Class',
  'Second Class AC',
  'Second Class',
  'Third Class',
  'Business Class'
]

interface TrainRate {
  id: string
  service_code: string
  origin_city: string
  destination_city: string
  class_type: string
  rate_eur: number
  rate_currency?: string | null
  duration_hours?: number
  rate_valid_from?: string
  rate_valid_to?: string
  operator_name?: string
  supplier_id?: string
  departure_times?: string
  description?: string
  notes?: string
  is_active: boolean
  created_at?: string
  updated_at?: string
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export default function TrainRatesContent() {
  const t = useTranslations('rates.trains')
  const tCommon = useTranslations('rates.common')
  const searchParams = useSearchParams()

  // Currency conversion
  const { currency, formatWithConversion, rateCurrency } = useCurrency()
  const formatRate = (amount: number) => formatWithConversion(amount, rateCurrency)

  const [rates, setRates] = useState<TrainRate[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrigin, setSelectedOrigin] = useState('')
  const [selectedDestination, setSelectedDestination] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // UI State
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<TrainRate | null>(null)
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
    let code = 'TRN-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const [trains, setTrains] = useState<{ id: string; name: string }[]>([])
  const [formData, setFormData] = useState({
    service_code: '',
    origin_city: '',
    destination_city: '',
    class_type: '',
    rate_eur: 0,
    rate_currency: '',
    duration_hours: '',
    rate_valid_from: today,
    rate_valid_to: nextYear,
    operator_name: '',
    departure_times: '',
    description: '',
    supplier_id: '',
    property_id: '',
    notes: '',
    is_active: true
  })

  // Fetch rates
  const fetchRates = async () => {
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.append('active_only', 'true')

      const response = await fetch(`/api/rates/trains?${params}`)
      const data = await response.json()

      if (data.success) {
        setRates(data.data)
      }
    } catch (error) {
      console.error('Error fetching train rates:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    fetchRates()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedOrigin, selectedDestination, selectedClass, showInactive, itemsPerPage])

  // Handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: generateServiceCode(),
      origin_city: '',
      destination_city: '',
      class_type: '',
      rate_eur: 0,
      rate_currency: '',
      duration_hours: '',
      rate_valid_from: today,
      rate_valid_to: nextYear,
      operator_name: '',
      departure_times: '',
      description: '',
      supplier_id: '',
    property_id: '',
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: TrainRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code || '',
      origin_city: rate.origin_city || '',
      destination_city: rate.destination_city || '',
      class_type: rate.class_type || '',
      rate_eur: rate.rate_eur || 0,
      rate_currency: rate.rate_currency || '',
      duration_hours: rate.duration_hours?.toString() || '',
      rate_valid_from: rate.rate_valid_from || today,
      rate_valid_to: rate.rate_valid_to || nextYear,
      operator_name: rate.operator_name || '',
      departure_times: rate.departure_times || '',
      description: rate.description || '',
      supplier_id: rate.supplier_id || '',
      property_id: (rate as { property_id?: string | null }).property_id || '',
      notes: rate.notes || '',
      is_active: rate.is_active
    })
    void loadTrains(rate.supplier_id || '')
    setShowModal(true)
  }

  // The supplier's trains, for the optional picker.
  const loadTrains = async (supplierId: string) => {
    if (!supplierId) { setTrains([]); return }
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/properties?type=train&active_only=true`)
      const data = await res.json().catch(() => ({}))
      setTrains(res.ok && data.success ? data.data : [])
    } catch { setTrains([]) }
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
        ? `/api/rates/trains/${editingRate.id}`
        : '/api/rates/trains'

      const method = editingRate ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((() => {
          const { rate_currency: pickedCurrency, ...rest } = formData
          return {
            ...rest,
            property_id: formData.property_id || null,
            duration_hours: formData.duration_hours ? parseFloat(formData.duration_hours) : null,
            ...rateCurrencyPatch(pickedCurrency, editingRate?.rate_currency),
          }
        })())
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        showNotification('error', 'Error', data.error || 'Failed to save rate')
        return
      }

      showNotification('success', 'Success', editingRate ? 'Train rate updated successfully!' : 'Train rate created successfully!')
      setShowModal(false)
      fetchRates()
    } catch (error) {
      console.error('Error saving rate:', error)
      showNotification('error', 'Error', 'Failed to save rate. Please try again.')
    }
  }

  // Open delete confirmation modal
  const confirmDelete = (id: string, route: string) => {
    setDeleteModal({ show: true, id, name: route })
  }

  // Actually perform delete
  const handleDelete = async () => {
    if (!deleteModal) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/rates/trains/${deleteModal.id}`, {
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
      rate.origin_city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.destination_city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesOrigin = selectedOrigin === '' || rate.origin_city === selectedOrigin
    const matchesDestination = selectedDestination === '' || rate.destination_city === selectedDestination
    const matchesClass = selectedClass === '' || rate.class_type === selectedClass
    const matchesActive = showInactive || rate.is_active

    return matchesSearch && matchesOrigin && matchesDestination && matchesClass && matchesActive
  })

  // Pagination
  const totalPages = Math.ceil(filteredRates.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedRates = filteredRates.slice(startIndex, startIndex + itemsPerPage)

  // Stats
  const activeRates = rates.filter(r => r.is_active).length
  const avgRate = averageRateInOneCurrency(rates, r => r.rate_eur, r => r.rate_currency)
  const uniqueRoutes = [...new Set(rates.map(r => `${r.origin_city}-${r.destination_city}`))].length

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
    await bulkDeleteByIds([...bulk.selected], id => `/api/rates/trains/${id}`)
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
                {t('notifications.gotIt')}
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Train className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              {t('title')}
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            </h1>
            <p className="text-sm text-gray-600">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BulkRateImportExport tableName="train_rates" onImportComplete={fetchRates} />
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
          >
            <Plus className="w-4 h-4" />
            {tCommon('addRate')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Train className="w-4 h-4 text-gray-400" />
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
            <span className="text-gray-400 font-bold">{currency}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatRateAverage(avgRate, formatRate)}</p>
          <p className="text-xs text-gray-600">{t('avgRate')}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{uniqueRoutes}</p>
          <p className="text-xs text-gray-600">{t('routes')}</p>
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

          {/* Origin Filter */}
          <select
            value={selectedOrigin}
            onChange={(e) => setSelectedOrigin(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allOrigins')}</option>
            {TRAIN_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>

          {/* Destination Filter */}
          <select
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allDestinations')}</option>
            {TRAIN_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>

          {/* Class Filter */}
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600"
          >
            <option value="">{t('allClasses')}</option>
            {CLASS_TYPES.map(cls => (
              <option key={cls} value={cls}>{cls}</option>
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
            {t('showing')} <span className="font-semibold">{paginatedRates.length}</span> {t('of')}{' '}
            <span className="font-semibold">{filteredRates.length}</span> {t('rates')}
          </p>
          <select
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} {t('perPage')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Rates Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paginatedRates.length === 0 ? (
          <div className="p-12 text-center">
            <Train className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('noRatesFound')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {searchTerm || selectedOrigin || selectedDestination || selectedClass
                ? t('adjustFilters')
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
            <BulkDeleteBar count={bulk.selected.size} label="train rates" onDelete={handleBulkDelete} onClear={bulk.clear} />
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="select all" checked={paginatedRates.length > 0 && bulk.selected.size === paginatedRates.length} onChange={() => bulk.toggleAll(paginatedRates.map(r => r.id))} /></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('route')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('class')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('duration')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">{t('operatorName')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">{t('rate')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('status')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2"><input type="checkbox" aria-label="select row" checked={bulk.has(rate.id)} onChange={() => bulk.toggle(rate.id)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Train className="w-4 h-4 text-emerald-500" />
                        <div>
                          <span className="text-sm font-semibold text-gray-900">
                            {rate.origin_city} <ArrowRight className="w-3 h-3 inline mx-1" /> {rate.destination_city}
                          </span>
                          <p className="text-xs text-gray-500">{rate.service_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                        {rate.class_type || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {rate.duration_hours ? (
                        <span className="text-sm text-gray-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {rate.duration_hours}h
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{rate.operator_name || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-green-600">{formatRateInRowCurrency(rate.rate_eur, rate, formatRate)}{rate.rate_currency && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold align-middle">{rate.rate_currency}</span>}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {rate.is_active ? t('active') : t('inactive')}
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
                          onClick={() => confirmDelete(rate.id, `${rate.origin_city} → ${rate.destination_city}`)}
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
                    <Train className="w-5 h-5 text-emerald-500" />
                    <span className="font-semibold text-gray-900">
                      {rate.origin_city} → {rate.destination_city}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? t('active') : t('inactive')}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                    {rate.class_type}
                  </span>
                  {rate.duration_hours && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {rate.duration_hours}h
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500">Rate</p>
                    <p className="text-lg font-bold text-green-600">{formatRateInRowCurrency(rate.rate_eur, rate, formatRate)}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(rate)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => confirmDelete(rate.id, `${rate.origin_city} → ${rate.destination_city}`)}
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
                  <Train className="w-4 h-4 text-emerald-500" />
                  <span className="font-medium text-gray-900">
                    {rate.origin_city} → {rate.destination_city}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                    {rate.class_type}
                  </span>
                  {rate.duration_hours && (
                    <span className="text-sm text-gray-500">{rate.duration_hours}h</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-green-600">{formatRateInRowCurrency(rate.rate_eur, rate, formatRate)}{rate.rate_currency && <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold align-middle">{rate.rate_currency}</span>}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {rate.is_active ? t('active') : t('inactive')}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => handleEdit(rate)} className="p-1 text-gray-400 hover:text-primary-600">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => confirmDelete(rate.id, `${rate.origin_city} → ${rate.destination_city}`)} className="p-1 text-gray-400 hover:text-red-600">
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
              {t('page')} <span className="font-semibold">{currentPage}</span> {t('of')} <span className="font-semibold">{totalPages}</span>
              <span className="text-gray-400 ml-2">({filteredRates.length} {t('total')})</span>
            </p>
            <div className="flex items-center gap-1">
              {/* First Page */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                {t('first')}
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
                {t('last')}
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
                {editingRate ? t('editRate') : t('addRate')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleSubmit} className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <SupplierPicker
                value={formData.supplier_id}
                onChange={(supplier_id, supplier) => {
                  // Keep the denormalized operator_name in step with the
                  // supplier rather than letting a second control disagree.
                  setFormData(prev => ({ ...prev, supplier_id, property_id: '', operator_name: supplier?.name ?? '' }))
                  void loadTrains(supplier_id)
                }}
                preferredType="train_operator"
                preferredLabel="Train Operators"
                className="mb-4"
              />
              {/* WHICH of the supplier's trains this rate prices
                  (supplier-HAS-properties, Phase 3). Always rendered, in three
                  states. Hiding it whenever the supplier had no loaded trains
                  meant an operator who had just added four of them opened this
                  form, saw nothing at all, and reasonably concluded the
                  properties had gone nowhere. */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.train')}</label>
                {!formData.supplier_id ? (
                  <p className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                    {t('form.trainPickSupplier')}
                  </p>
                ) : trains.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                    {t('form.trainNone')}
                  </p>
                ) : (
                  <select
                    value={formData.property_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, property_id: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  >
                    <option value="">{t('form.trainAny')}</option>
                    {trains.map(tr => (
                      <option key={tr.id} value={tr.id}>{tr.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {/* Route Info */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">1</span>
                  {t('form.routeDetails')}
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.operator')}</label>
                    {/* The operator IS the supplier. A hardcoded list used to
                        sit here, and it taught the wrong model: it offered
                        "Spanish Trains (Talgo)" as an OPERATOR when Talgo is
                        one of ENR's trains. Seven of the eight live rates were
                        filed against that string with no supplier at all, so
                        none of them could reach the operator's fleet. */}
                    <div className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
                      {formData.operator_name || t('form.operatorFromSupplier')}
                    </div>
                    {formData.operator_name && !formData.supplier_id && (
                      <p className="mt-1 text-xs text-amber-700">{t('form.operatorNotRecorded')}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.originCity')} *</label>
                    <select
                      name="origin_city"
                      value={formData.origin_city}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">{t('form.selectOrigin')}</option>
                      {TRAIN_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.destinationCity')} *</label>
                    <select
                      name="destination_city"
                      value={formData.destination_city}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">{t('form.selectDestination')}</option>
                      {TRAIN_CITIES.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.classType')} *</label>
                    <select
                      name="class_type"
                      value={formData.class_type}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    >
                      <option value="">{t('form.selectClass')}</option>
                      {CLASS_TYPES.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.duration')}</label>
                    <input
                      type="number"
                      name="duration_hours"
                      value={formData.duration_hours}
                      onChange={handleChange}
                      step="0.5"
                      min="0"
                      placeholder={t('form.durationPlaceholder')}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Departure Times */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.departureTimes')}</label>
                <input
                  type="text"
                  name="departure_times"
                  value={formData.departure_times}
                  onChange={handleChange}
                  placeholder={t('form.departureTimesPlaceholder')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>

              {/* Pricing */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">2</span>
                  {t('form.pricing')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.rate')} *</label>
                    <input
                      type="number"
                      name="rate_eur"
                      value={formData.rate_eur}
                      onChange={handleChange}
                      required
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
                  <span className="w-6 h-6 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-xs font-bold">3</span>
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
                  <span className="text-sm font-medium text-gray-900">{t('activeRate')}</span>
                </label>
              </div>
            </form>

            {/* Audit Log */}
            {editingRate && (
              <div className="px-4">
                <RateAuditLog tableName="train_rates" recordId={editingRate.id} />
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