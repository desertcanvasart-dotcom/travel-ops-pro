'use client'

import { useEffect, useState } from 'react'
import CityOptions from '@/app/components/CityOptions'
import { firstInvalidMessage } from '@/lib/form-guard'
import RateCurrencyField, { rateCurrencyPatch } from '@/app/components/RateCurrencyField'
import SupplierPicker from '@/components/rates/SupplierPicker'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  ConciergeBell, Plus, Search, Edit, Trash2, X, Check, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import RateAuditLog from '@/app/components/RateAuditLog'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'

// ============================================
// CONSTANTS
// ============================================

const SERVICE_TYPES = ['porter', 'checkin_assist', 'full_service', 'concierge']
const HOTEL_CATEGORIES = ['budget', 'standard', 'deluxe', 'luxury', 'all']
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface HotelStaffRate {
  supplier_id?: string | null
  id: string
  service_code: string
  service_type: string
  hotel_category: 'budget' | 'standard' | 'deluxe' | 'luxury' | 'all'
  destination: string | null
  /** null = not priced yet. Never 0 to mean unknown — see 20260821_staff_rates_unpriced.sql. */
  rate_eur: number | null
  rate_currency?: string | null
  description: string | null
  notes: string | null
  is_active: boolean
}

interface Toast { 
  id: string
  type: 'success' | 'error'
  message: string 
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
  onItemsPerPageChange
}: {
  currentPage: number
  totalPages: number
  totalItems: number
  startIndex: number
  endIndex: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (items: number) => void
}) {
  const t = useTranslations('rates.hotelServices')
  const tCommon = useTranslations('rates.common')

  const goToPage = (page: number) => {
    onPageChange(Math.max(1, Math.min(page, totalPages)))
  }


  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{tCommon('show')}</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-rose-600 bg-white"
          >
            {ITEMS_PER_PAGE_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">{tCommon('perPage')}</span>
        </div>
        <span className="text-sm text-gray-500">
          {t('pagination.showingRange', { start: startIndex + 1, end: endIndex, total: totalItems })}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={tCommon('firstPage')}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={tCommon('previousPage')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Page numbers */}
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
                    ? 'bg-rose-600 text-white'
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
          title={tCommon('nextPage')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => goToPage(totalPages)}
          disabled={currentPage === totalPages}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title={tCommon('lastPage')}
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

export default function HotelServicesPage() {
  const t = useTranslations('rates.hotelServices')
  const tCommon = useTranslations('rates.common')
  const dialog = useConfirmDialog()
  const { formatWithConversion, rateCurrency } = useCurrency()
  const formatRate = (amount: number) => formatWithConversion(amount, rateCurrency)

  const [rates, setRates] = useState<HotelStaffRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedService, setSelectedService] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedDestination, setSelectedDestination] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<HotelStaffRate | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const [formData, setFormData] = useState({
    service_code: '',
    service_type: 'porter',
    hotel_category: 'all' as 'budget' | 'standard' | 'deluxe' | 'luxury' | 'all',
    destination: '' as string,
    rate_eur: '' as number | '',
    rate_currency: '',
    description: '',
    notes: '',
    supplier_id: '',
    is_active: true
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const fetchRates = async () => {
    try {
      const response = await fetch('/api/rates/hotel-services')
      const data = await response.json()
      if (data.success) setRates(data.data)
    } catch (error) {
      showToast('error', t('errors.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRates() }, [])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedService, selectedCategory, selectedDestination, showInactive, itemsPerPage])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      // A cleared number box is '' (not priced), never 0 — zero is the
      // value that made two rate rows inert. See usableRate().
      [name]: type === 'number' ? (value === '' ? '' : parseFloat(value)) : value
    }))
  }

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }))
  }

  const generateCode = () => {
    const svc = formData.service_type.replace('_', '').toUpperCase().substring(0, 6)
    const cat = formData.hotel_category.toUpperCase().substring(0, 3)
    const dest = formData.destination ? `-${formData.destination.toUpperCase().substring(0, 3)}` : ''
    return `HOTEL-${svc}-${cat}${dest}`
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: '',
      service_type: 'porter',
      hotel_category: 'all',
      destination: '',
      rate_eur: '' as number | '',
      rate_currency: '',
      description: '',
      notes: '',
      supplier_id: '',
      is_active: true
    })
    setShowModal(true)
  }

  const handleEdit = (rate: HotelStaffRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code,
      service_type: rate.service_type,
      hotel_category: rate.hotel_category,
      destination: rate.destination || '',
      // An unpriced row must open with an empty box. Showing 0 invites the
      // operator to save it back as 0, which is how these rows persist.
      rate_eur: rate.rate_eur ?? '',
      rate_currency: rate.rate_currency || '',
      description: rate.description || '',
      notes: rate.notes || '',
      supplier_id: rate.supplier_id || '',
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
      showToast('error', invalid)
      return
    }
    const { rate_currency: pickedCurrency, ...restFormData } = formData
    const submitData = {
      ...restFormData,
      service_code: formData.service_code || generateCode(),
      // Empty means NOT PRICED. Sending 0 would store a rate that can never
      // charge and reads as a price on screen — see 20260821_staff_rates_unpriced.sql.
      rate_eur: formData.rate_eur === '' ? null : Number(formData.rate_eur),
      ...rateCurrencyPatch(pickedCurrency, editingRate?.rate_currency),
    }

    try {
      const url = editingRate ? `/api/rates/hotel-services/${editingRate.id}` : '/api/rates/hotel-services'
      const response = await fetch(url, {
        method: editingRate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      })
      const data = await response.json()
      
      if (data.success) {
        showToast('success', editingRate ? t('notifications.rateUpdated') : t('notifications.rateCreated'))
        setShowModal(false)
        fetchRates()
      } else {
        showToast('error', data.error || t('errors.failedToSave'))
      }
    } catch (error) {
      showToast('error', t('errors.failedToSave'))
    }
  }

  const handleDelete = async (rate: HotelStaffRate) => {
    const serviceName = t(`serviceTypes.${rate.service_type}`)
    const categoryName = t(`hotelCategories.${rate.hotel_category}`)

    const confirmed = await dialog.confirmDelete(t('deleteModal.title'),
      t('deleteModal.confirmText', { service: serviceName, category: categoryName })
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/rates/hotel-services/${rate.id}`, { method: 'DELETE' })
      const data = await response.json()

      if (data.success) {
        showToast('success', t('notifications.rateDeleted'))
        fetchRates()
      } else {
        await dialog.alert(tCommon('error'), data.error || t('errors.failedToDelete'), 'warning')
      }
    } catch {
      await dialog.alert(tCommon('error'), t('errors.failedToDelete'), 'warning')
    }
  }

  const filteredRates = rates.filter(rate => {
    const matchesSearch = searchTerm === '' || 
      rate.service_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.hotel_category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesService = selectedService === 'all' || rate.service_type === selectedService
    const matchesCategory = selectedCategory === 'all' || rate.hotel_category === selectedCategory
    const matchesDestination = selectedDestination === 'all' || (rate.destination || '') === selectedDestination
    const matchesActive = showInactive || rate.is_active
    return matchesSearch && matchesService && matchesCategory && matchesDestination && matchesActive
  })

  // Pagination calculations
  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  // Stats
  const stats = {
    total: rates.length,
    active: rates.filter(r => r.is_active).length,
    porter: rates.filter(r => r.service_type === 'porter').length,
    concierge: rates.filter(r => r.service_type === 'concierge').length,
    // Average across PRICED rows only. Summing unpriced rows and dividing by
    // every row reports an average nobody charges — and after the rate_eur
    // column became nullable, `sum + null` would quietly count them as 0.
    avgRate: (() => {
      const priced = rates.map(r => r.rate_eur).filter((v): v is number => v != null && v > 0)
      return priced.length > 0
        ? Math.round(priced.reduce((sum, v) => sum + v, 0) / priced.length)
        : 0
    })()
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
          <div className="w-8 h-8 border-4 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  const handleBulkDelete = async () => {
    await bulkDeleteByIds([...bulk.selected], id => `/api/rates/hotel-services/${id}`)
    bulk.clear()
    fetchRates()
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
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ConciergeBell className="w-5 h-5 text-rose-600" />
            <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
            <div className="w-1.5 h-1.5 rounded-full bg-rose-600" />
          </div>
          <div className="flex items-center gap-2">
            <BulkRateImportExport tableName="hotel_staff_rates" onImportComplete={fetchRates} />
            <button type="button" onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">
              <Plus className="w-4 h-4" /> {tCommon('addRate')}
            </button>
            <Link href="/rates" className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
              ← {t('ratesHub')}
            </Link>
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
            <p className="text-xs text-gray-600">{tCommon('active')}</p>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{t('stats.porterServices')}</p>
            <p className="text-2xl font-bold text-rose-600">{stats.porter}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{t('stats.conciergeServices')}</p>
            <p className="text-2xl font-bold text-amber-600">{stats.concierge}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{tCommon('avgRate')}</p>
            <p className="text-2xl font-bold text-green-600">{formatRate(stats.avgRate)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md border p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 focus:border-transparent"
              />
            </div>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
              title={t('filters.allServices')}
            >
              <option value="all">{t('filters.allServices')}</option>
              {SERVICE_TYPES.map(s => (
                <option key={s} value={s}>{t(`serviceTypes.${s}`)}</option>
              ))}
            </select>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
              title={t('filters.allCategories')}
            >
              <option value="all">{t('filters.allCategories')}</option>
              {HOTEL_CATEGORIES.map(c => (
                <option key={c} value={c}>{t(`hotelCategories.${c}`)}</option>
              ))}
            </select>
            <select
              value={selectedDestination}
              onChange={(e) => setSelectedDestination(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
              title={t('filters.allDestinations')}
            >
              <option value="all">{t('filters.allDestinations')}</option>
              <CityOptions />
            </select>
            <button
              type="button"
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium ${
                showInactive ? 'bg-gray-100 text-gray-700' : 'bg-green-50 text-green-700 border border-green-200'
              }`}
            >
              {showInactive ? t('filters.showAll') : t('filters.activeOnly')}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {t('filters.showing', { filtered: filteredRates.length, total: rates.length })}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div className="overflow-x-auto">
            <BulkDeleteBar count={bulk.selected.size} label="hotel service rates" onDelete={handleBulkDelete} onClear={bulk.clear} />
            <table className="w-full">
              <thead className="bg-rose-50 border-b border-rose-100">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="select all" checked={paginatedRates.length > 0 && bulk.selected.size === paginatedRates.length} onChange={() => bulk.toggleAll(paginatedRates.map(r => r.id))} /></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-rose-800">{t('table.serviceType')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-rose-800">{t('table.hotelCategory')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-rose-800">{t('table.destination')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-rose-800">{t('table.rate')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-rose-800">{t('table.description')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-rose-800">{tCommon('status')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-rose-800">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate, idx) => (
                  <tr key={rate.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-rose-50 transition-colors`}>
                    <td className="px-3 py-2"><input type="checkbox" aria-label="select row" checked={bulk.has(rate.id)} onChange={() => bulk.toggle(rate.id)} /></td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rate.service_type === 'concierge' ? 'bg-amber-100 text-amber-800' :
                        rate.service_type === 'full_service' ? 'bg-blue-100 text-blue-800' :
                        rate.service_type === 'checkin_assist' ? 'bg-purple-100 text-purple-800' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        {t(`serviceTypes.${rate.service_type}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rate.hotel_category === 'luxury' ? 'bg-amber-100 text-amber-800' :
                        rate.hotel_category === 'deluxe' ? 'bg-violet-100 text-violet-800' :
                        rate.hotel_category === 'standard' ? 'bg-blue-100 text-blue-800' :
                        rate.hotel_category === 'budget' ? 'bg-gray-100 text-gray-700' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {t(`hotelCategories.${rate.hotel_category}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {rate.destination || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {rate.rate_eur == null || rate.rate_eur <= 0 ? (
                        // Printing "€0" for a row the engine treats as unpriced
                        // is how two rate rows sat inert for months.
                        <span className="text-gray-400 font-normal italic">{tCommon('notPriced')}</span>
                      ) : (
                        <>
                          {formatRate(rate.rate_eur)}
                          {rate.rate_currency && (
                            <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold align-middle">{rate.rate_currency}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[250px] truncate">
                      {rate.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        rate.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {rate.is_active ? tCommon('active') : tCommon('inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(rate)}
                          className="p-1 text-gray-500 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title={tCommon('editRate')}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(rate)}
                          className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title={tCommon('deleteRate')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedRates.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <ConciergeBell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">{t('emptyState.noRatesFound')}</p>
                      <button type="button" onClick={handleAddNew} className="mt-2 text-sm text-rose-600 hover:underline">
                        {t('emptyState.addFirstRate')}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
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
            />
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{editingRate ? t('modal.editTitle') : t('modal.addTitle')}</h2>
              <button type="button" onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded" title={tCommon('cancel')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <form noValidate onSubmit={handleSubmit} className="p-4 space-y-4">
              <SupplierPicker
                value={formData.supplier_id}
                onChange={(supplier_id: string) => setFormData(prev => ({ ...prev, supplier_id }))}
                preferredType="hotel_assistant"
                preferredLabel="Hotel Assistants"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.serviceType')} *</label>
                  <select
                    name="service_type"
                    value={formData.service_type}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
                    title={t('form.serviceType')}
                  >
                    {SERVICE_TYPES.map(s => (
                      <option key={s} value={s}>{t(`serviceTypes.${s}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.hotelCategory')} *</label>
                  <select
                    name="hotel_category"
                    value={formData.hotel_category}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
                    title={t('form.hotelCategory')}
                  >
                    {HOTEL_CATEGORIES.map(c => (
                      <option key={c} value={c}>{t(`hotelCategories.${c}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.destination')}</label>
                <select
                  name="destination"
                  value={formData.destination}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
                  title={t('form.destination')}
                >
                  <option value="">{t('form.allDestinations')}</option>
                  <CityOptions />
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.rateEur', { currency: rateCurrency })} *</label>
                <input
                  type="number"
                  name="rate_eur"
                  value={formData.rate_eur}
                  onChange={handleChange}
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
                  title={t('form.rateEur', { currency: rateCurrency })}
                />
              </div>
              <RateCurrencyField
                value={formData.rate_currency}
                onChange={v => setFormData(prev => ({ ...prev, rate_currency: v }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.description')}</label>
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
                  placeholder={t('form.descriptionPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.serviceCode')}</label>
                <input
                  type="text"
                  name="service_code"
                  value={formData.service_code}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600 font-mono"
                  placeholder={t('form.serviceCodePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.notes')}</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-600"
                  placeholder={t('form.notesPlaceholder')}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleCheckbox}
                  className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500"
                />
                <span className="text-sm text-gray-700">{tCommon('active')}</span>
              </label>
              {/* Audit Log */}
              {editingRate && (
                <RateAuditLog tableName="hotel_staff_rates" recordId={editingRate.id} />
              )}

              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  {editingRate ? tCommon('update') : tCommon('create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}