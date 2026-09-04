'use client'

import { useEffect, useState } from 'react'
import { firstInvalidMessage } from '@/lib/form-guard'
import RateCurrencyField, { rateCurrencyPatch, formatRateInRowCurrency } from '@/app/components/RateCurrencyField'
import SupplierPicker from '@/components/rates/SupplierPicker'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Copy, Plane, Plus, Search, Edit, Trash2, X, Check, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { useBulkSelect, BulkDeleteBar, bulkDeleteByIds } from '@/components/rates/BulkDelete'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import RateAuditLog from '@/app/components/RateAuditLog'
import BulkRateImportExport from '@/app/components/BulkRateImportExport'
import { averageRatesByCurrency, formatRateAverages } from '@/lib/currency-totals'

// ============================================
// CONSTANTS
// ============================================

const AIRPORTS = [
  { code: 'CAI', name: 'Cairo International' },
  { code: 'LXR', name: 'Luxor International' },
  { code: 'ASW', name: 'Aswan International' },
  { code: 'HRG', name: 'Hurghada International' },
  { code: 'SSH', name: 'Sharm El-Sheikh' }
]
const SERVICE_TYPES = ['meet_greet', 'customs_assist', 'full_service', 'vip_service']
const DIRECTIONS = ['arrival', 'departure', 'both']
const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

// ============================================
// INTERFACES
// ============================================

interface AirportStaffRate {
  supplier_id?: string | null
  id: string
  service_code: string
  airport_code: string
  service_type: string
  direction: 'arrival' | 'departure' | 'both'
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
// HELPER FUNCTIONS
// ============================================

function getAirportName(code: string): string {
  return AIRPORTS.find(a => a.code === code)?.name || code
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
  const t = useTranslations('rates.airportServices')
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
            className="px-2 py-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-sky-600 bg-white"
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
                    ? 'bg-sky-600 text-white'
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

export default function AirportServicesPage() {
  const t = useTranslations('rates.airportServices')
  const tCommon = useTranslations('rates.common')
  const dialog = useConfirmDialog()
  const { formatWithConversion, rateCurrency } = useCurrency()
  const formatRate = (amount: number) => formatWithConversion(amount, rateCurrency)

  const [rates, setRates] = useState<AirportStaffRate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedAirport, setSelectedAirport] = useState('all')
  const [selectedService, setSelectedService] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRate, setEditingRate] = useState<AirportStaffRate | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)

  const [formData, setFormData] = useState({
    service_code: '',
    airport_code: 'CAI',
    service_type: 'meet_greet',
    direction: 'arrival' as 'arrival' | 'departure' | 'both',
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
      const response = await fetch('/api/rates/airport-services')
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
  }, [searchTerm, selectedAirport, selectedService, showInactive, itemsPerPage])

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
    return `AIR-${formData.airport_code}-${svc}-${formData.direction.substring(0, 3).toUpperCase()}`
  }

  const handleAddNew = () => {
    setEditingRate(null)
    setFormData({
      service_code: '',
      airport_code: 'CAI',
      service_type: 'meet_greet',
      direction: 'arrival',
      rate_eur: '' as number | '',
      rate_currency: '',
      description: '',
      notes: '',
      supplier_id: '',
      is_active: true
    })
    setShowModal(true)
  }

  // Duplicate: open the ADD form pre-filled from this row. The identity
  // field is cleared so the save creates a new record; everything else is
  // there to change. Operator request 2026-09-02 — most rates are entered as
  // near-copies of an existing one.
  const handleClone = (rate: AirportStaffRate) => {
    handleEdit(rate)
    setEditingRate(null)
    setFormData(prev => ({ ...prev, service_code: '' }))
  }

  const handleEdit = (rate: AirportStaffRate) => {
    setEditingRate(rate)
    setFormData({
      service_code: rate.service_code,
      airport_code: rate.airport_code,
      service_type: rate.service_type,
      direction: rate.direction,
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
      const url = editingRate ? `/api/rates/airport-services/${editingRate.id}` : '/api/rates/airport-services'
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

  const handleDelete = async (rate: AirportStaffRate) => {
    const serviceName = t(`serviceTypes.${rate.service_type}`)
    const airportName = getAirportName(rate.airport_code)

    const confirmed = await dialog.confirmDelete(t('deleteModal.title'),
      t('deleteModal.confirmText', { service: serviceName, airport: airportName, direction: t(`directions.${rate.direction}`) })
    )

    if (!confirmed) return

    try {
      const response = await fetch(`/api/rates/airport-services/${rate.id}`, { method: 'DELETE' })
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
      rate.airport_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getAirportName(rate.airport_code).toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.service_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rate.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesAirport = selectedAirport === 'all' || rate.airport_code === selectedAirport
    const matchesService = selectedService === 'all' || rate.service_type === selectedService
    const matchesActive = showInactive || rate.is_active
    return matchesSearch && matchesAirport && matchesService && matchesActive
  })

  // Pagination calculations
  const totalItems = filteredRates.length
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)
  const paginatedRates = filteredRates.slice(startIndex, endIndex)

  // Stats
  const uniqueAirports = new Set(rates.map(r => r.airport_code)).size
  const stats = {
    total: rates.length,
    active: rates.filter(r => r.is_active).length,
    airports: uniqueAirports,
    vipServices: rates.filter(r => r.service_type === 'vip_service').length,
    // Average across PRICED rows only. Summing unpriced rows and dividing by
    // every row reports an average nobody charges — and after the rate_eur
    // column became nullable, `sum + null` would quietly count them as 0.
    avgRate: averageRatesByCurrency(rates, r => r.rate_eur, r => r.rate_currency)
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
          <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  const handleBulkDelete = async () => {
    await bulkDeleteByIds([...bulk.selected], id => `/api/rates/airport-services/${id}`)
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
            <Plane className="w-5 h-5 text-sky-600" />
            <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
            <div className="w-1.5 h-1.5 rounded-full bg-sky-600" />
          </div>
          <div className="flex items-center gap-2">
            <BulkRateImportExport tableName="airport_staff_rates" onImportComplete={fetchRates} />
            <button type="button" onClick={handleAddNew} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-medium">
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
            <p className="text-xs text-gray-600">{t('stats.airports')}</p>
            <p className="text-2xl font-bold text-sky-600">{stats.airports}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{t('stats.vipServices')}</p>
            <p className="text-2xl font-bold text-amber-600">{stats.vipServices}</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-md border">
            <p className="text-xs text-gray-600">{tCommon('avgRate')}</p>
            <p className="text-2xl font-bold text-green-600">{formatRateAverages(stats.avgRate, formatRate)}</p>
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
                className="w-full pl-3 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600 focus:border-transparent"
              />
            </div>
            <select
              value={selectedAirport}
              onChange={(e) => setSelectedAirport(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
              title={t('filters.allAirports')}
            >
              <option value="all">{t('filters.allAirports')}</option>
              {AIRPORTS.map(a => (
                <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
              ))}
            </select>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
              title={t('filters.allServices')}
            >
              <option value="all">{t('filters.allServices')}</option>
              {SERVICE_TYPES.map(s => (
                <option key={s} value={s}>{t(`serviceTypes.${s}`)}</option>
              ))}
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
            <BulkDeleteBar count={bulk.selected.size} label="airport service rates" onDelete={handleBulkDelete} onClear={bulk.clear} />
            <table className="w-full">
              <thead className="bg-sky-50 border-b border-sky-100">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="select all" checked={paginatedRates.length > 0 && bulk.selected.size === paginatedRates.length} onChange={() => bulk.toggleAll(paginatedRates.map(r => r.id))} /></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-sky-800">{t('table.airport')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-sky-800">{t('table.service')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-sky-800">{t('table.direction')}</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-sky-800">{t('table.rate')}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-sky-800">{t('table.description')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-sky-800">{tCommon('status')}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-sky-800">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedRates.map((rate, idx) => (
                  <tr key={rate.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-sky-50 transition-colors`}>
                    <td className="px-3 py-2"><input type="checkbox" aria-label="select row" checked={bulk.has(rate.id)} onChange={() => bulk.toggle(rate.id)} /></td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{rate.airport_code}</p>
                      <p className="text-xs text-gray-500">{getAirportName(rate.airport_code)}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rate.service_type === 'vip_service' ? 'bg-amber-100 text-amber-800' :
                        rate.service_type === 'full_service' ? 'bg-blue-100 text-blue-800' :
                        rate.service_type === 'customs_assist' ? 'bg-purple-100 text-purple-800' :
                        'bg-sky-100 text-sky-800'
                      }`}>
                        {t(`serviceTypes.${rate.service_type}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rate.direction === 'both' ? 'bg-green-100 text-green-800' :
                        rate.direction === 'arrival' ? 'bg-blue-100 text-blue-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {t(`directions.${rate.direction}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {rate.rate_eur == null || rate.rate_eur <= 0 ? (
                        // Printing "€0" for a row the engine treats as unpriced
                        // is how two rate rows sat inert for months.
                        <span className="text-gray-400 font-normal italic">{tCommon('notPriced')}</span>
                      ) : (
                        <>
                          {formatRateInRowCurrency(rate.rate_eur, rate, formatRate)}
                          {rate.rate_currency && (
                            <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold align-middle">{rate.rate_currency}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">
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
                        <button type="button" onClick={() => handleClone(rate)} className="p-1 text-gray-500 hover:text-primary-600 rounded" title={tCommon('duplicate')} aria-label={tCommon('duplicate')}>
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(rate)}
                          className="p-1 text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded"
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
                      <Plane className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">{t('emptyState.noRatesFound')}</p>
                      <button type="button" onClick={handleAddNew} className="mt-2 text-sm text-sky-600 hover:underline">
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
                onChange={(supplier_id) => setFormData(prev => ({ ...prev, supplier_id }))}
                preferredType="airport_assistant"
                preferredLabel="Airport Assistants"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.airport')} *</label>
                  <select
                    name="airport_code"
                    value={formData.airport_code}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                    title={t('form.airport')}
                  >
                    {AIRPORTS.map(a => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.serviceType')} *</label>
                  <select
                    name="service_type"
                    value={formData.service_type}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                    title={t('form.serviceType')}
                  >
                    {SERVICE_TYPES.map(s => (
                      <option key={s} value={s}>{t(`serviceTypes.${s}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.direction')} *</label>
                  <select
                    name="direction"
                    value={formData.direction}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                    title={t('form.direction')}
                  >
                    {DIRECTIONS.map(d => (
                      <option key={d} value={d}>{t(`directions.${d}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.rateEur')} *</label>
                  <input
                    type="number"
                    name="rate_eur"
                    value={formData.rate_eur}
                    onChange={handleChange}
                    min="0.01"
                    step="0.01"
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                    title={t('form.rateEur')}
                  />
                </div>
              </div>
              <RateCurrencyField
                value={formData.rate_currency}
                onChange={v => setFormData(prev => ({ ...prev, rate_currency: v }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('form.description')}</label>
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600 font-mono"
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-600"
                  placeholder={t('form.notesPlaceholder')}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleCheckbox}
                  className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                />
                <span className="text-sm text-gray-700">{tCommon('active')}</span>
              </label>
              {/* Audit Log */}
              {editingRate && (
                <RateAuditLog tableName="airport_staff_rates" recordId={editingRate.id} />
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
                  className="flex-1 px-3 py-2 text-sm bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-medium flex items-center justify-center gap-2"
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