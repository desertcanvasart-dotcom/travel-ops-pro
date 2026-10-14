'use client'

import { todayLocal } from '@/lib/today'
import {
  Users, UserPlus, Search, Filter, Star, TrendingUp, Calendar,
  Phone, Mail, MessageSquare, AlertCircle, CheckCircle, Clock,
  Trash2, SlidersHorizontal, X, Globe, Smartphone
} from 'lucide-react'

import { useState, useEffect, useRef } from 'react'
import { type CurrencyTotals } from '@/lib/currency-totals'
import { collectedTotals, formatMoneyTotals, invoicedTotals } from '@/lib/clients/stats'
import { CLIENT_STATUSES, clientStatusClass } from '@/lib/clients/status'
import { attachedKinds, requestDeleteClient, requestMarkInactive } from '@/lib/clients/delete-client'
import type { ClientAttachments } from '@/lib/clients/delete-guard'
import { useRole } from '@/hooks/useRole'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useConfirmDialog } from '@/components/ConfirmDialog'

// One row of GET /api/clients.
interface ClientSummary {
  id: string
  client_code: string
  first_name: string
  last_name: string
  email: string | null
  phone?: string | null
  nationality?: string
  client_type: string
  vip_status: boolean
  status: string
  lead_source?: string
  total_bookings_count: number
  total_revenue_generated: number
  /** Invoiced per currency (invoices not draft or cancelled). */
  revenue_by_currency?: Record<string, number> | null
  /** Paid against those invoices, per currency. */
  collected_by_currency?: Record<string, number> | null
  /** Which currency the single total_revenue_generated figure is in. */
  revenue_currency?: string | null
  last_contacted_at?: string
  created_at: string
}

interface DeleteModalState {
  isOpen: boolean
  clientId: string
  clientName: string
  /** Set when the server refused because something is attached. */
  blocked: ClientAttachments | null
}

const PAGE_SIZE = 50

const LEAD_SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬', color: 'bg-green-100 text-green-700' },
  { value: 'email', label: 'Email', icon: '✉️', color: 'bg-blue-100 text-blue-700' },
  { value: 'website', label: 'Website', icon: '🌐', color: 'bg-purple-100 text-purple-700' },
  { value: 'referral', label: 'Referral', icon: '👥', color: 'bg-orange-100 text-orange-700' },
  { value: 'phone', label: 'Phone', icon: '📞', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'social_media', label: 'Social Media', icon: '📱', color: 'bg-pink-100 text-pink-700' },
  { value: 'trade_show', label: 'Trade Show', icon: '🎪', color: 'bg-amber-100 text-amber-700' },
  { value: 'other', label: 'Other', icon: '➕', color: 'bg-gray-100 text-gray-700' }
]

export default function ClientsPage() {
  const t = useTranslations('clients')
  const tCommon = useTranslations('common')
  const dialog = useConfirmDialog()
  // The database lets managers and admins delete a client; an agent would be
  // refused by the server, so the button is not offered.
  const canDelete = useRole().canAccess(['admin', 'manager'])
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    clientId: '',
    clientName: '',
    blocked: null
  })
  const [deleting, setDeleting] = useState(false)

  // Enhanced Filters
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    clientType: 'all',
    leadSource: 'all',
    vipOnly: false,
    sortBy: 'recent',
    dateFrom: '',
    dateTo: ''
  })

  // Stats: counts and money for the whole company, from the server
  const [stats, setStats] = useState({
    total: 0,
    byStatus: { lead: 0, prospect: 0, customer: 0, inactive: 0 } as Record<string, number>,
    vip: 0,
    newThisMonth: 0,
    invoiced: {} as CurrencyTotals,
    collected: {} as CurrencyTotals
  })

  // Debounced copy of the search text so typing doesn't fire a query per
  // keystroke; other filter changes (dropdowns/toggles) still apply instantly.
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(filters.search), 300)
    return () => clearTimeout(handle)
  }, [filters.search])

  // Monotonic request sequence so a slow, out-of-order response can't
  // overwrite the results of a newer fetch.
  const fetchSeqRef = useRef(0)

  useEffect(() => {
    fetchClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    debouncedSearch,
    filters.status,
    filters.clientType,
    filters.leadSource,
    filters.vipOnly,
    filters.sortBy,
    filters.dateFrom,
    filters.dateTo,
    page
  ])

  // Stats are independent of the list filters — fetch once on mount and
  // re-fetch explicitly after mutations (e.g. delete) that change them.
  useEffect(() => {
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The list is the server's: it filters, orders, pages and counts the ACTIVE
  // company's clients (GET /api/clients). The page used to read a database view
  // from the browser — every company the person belongs to at once, 200 rows
  // at most, with nothing to say the rest existed.
  const fetchClients = async () => {
    const seq = ++fetchSeqRef.current
    try {
      setLoading(true)
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort: filters.sortBy })
      if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim())
      if (filters.status !== 'all') qs.set('status', filters.status)
      if (filters.clientType !== 'all') qs.set('client_type', filters.clientType)
      if (filters.leadSource !== 'all') qs.set('lead_source', filters.leadSource)
      if (filters.vipOnly) qs.set('vip', '1')
      if (filters.dateFrom) qs.set('date_from', filters.dateFrom)
      if (filters.dateTo) qs.set('date_to', filters.dateTo)

      const res = await fetch(`/api/clients?${qs}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()

      // A newer fetch started while this one was in flight — drop this
      // response so it can't overwrite fresher results.
      if (seq !== fetchSeqRef.current) return

      setClients(body.clients || [])
      setTotal(body.total ?? 0)
    } catch (error) {
      if (seq !== fetchSeqRef.current) return
      console.error('Error fetching clients:', error)
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false)
    }
  }

  const openDeleteModal = (clientId: string, clientName: string) => {
    setDeleteModal({
      isOpen: true,
      clientId,
      clientName,
      blocked: null
    })
  }

  const closeDeleteModal = () => {
    setDeleteModal({
      isOpen: false,
      clientId: '',
      clientName: '',
      blocked: null
    })
  }

  const afterClientChange = () => {
    closeDeleteModal()
    fetchClients()
    fetchStats() // deletion / status change moves the counts and the money
  }

  const confirmDelete = async () => {
    if (!deleteModal.clientId) return

    try {
      setDeleting(true)
      const outcome = await requestDeleteClient(deleteModal.clientId)
      if (outcome.ok) {
        afterClientChange()
        return
      }
      // Something is attached: say what, and offer "Mark inactive" instead.
      if (outcome.blocked) {
        setDeleteModal(prev => ({ ...prev, blocked: outcome.counts }))
        return
      }
      throw new Error(outcome.message)
    } catch (error: any) {
      console.error('Error deleting client:', error)
      await dialog.alert(t('error'), error.message || t('failedToDelete'), 'warning')
    } finally {
      setDeleting(false)
    }
  }

  const markInactive = async () => {
    try {
      setDeleting(true)
      const outcome = await requestMarkInactive(deleteModal.clientId)
      if (!outcome.ok) throw new Error(outcome.message)
      afterClientChange()
    } catch (error: any) {
      await dialog.alert(t('error'), error.message || t('failedToUpdate'), 'warning')
    } finally {
      setDeleting(false)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/clients/stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setStats(await res.json())
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setPage(1)
    setFilters({
      search: '',
      status: 'all',
      clientType: 'all',
      leadSource: 'all',
      vipOnly: false,
      sortBy: 'recent',
      dateFrom: '',
      dateTo: ''
    })
  }

  const hasActiveFilters = 
    filters.search || 
    filters.status !== 'all' || 
    filters.clientType !== 'all' || 
    filters.leadSource !== 'all' ||
    filters.vipOnly || 
    filters.dateFrom || 
    filters.dateTo ||
    filters.sortBy !== 'recent'

  const getStatusColor = clientStatusClass
  const statusText = (status: string) =>
    (CLIENT_STATUSES as readonly string[]).includes(status) ? t(`status_${status}`) : status

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'individual': return 'bg-purple-100 text-purple-800'
      case 'family': return 'bg-pink-100 text-pink-800'
      case 'group': return 'bg-orange-100 text-orange-800'
      case 'corporate': return 'bg-primary-100 text-primary-800'
      case 'agent': return 'bg-indigo-100 text-indigo-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getLeadSourceConfig = (source: string | undefined) => {
    return LEAD_SOURCES.find(s => s.value === source) || null
  }

  const getLeadSourceLabel = (source: string | undefined): string => {
    const labels: Record<string, string> = {
      whatsapp: t('leadSourceWhatsApp'),
      email: t('leadSourceEmail'),
      website: t('leadSourceWebsite'),
      referral: t('leadSourceReferral'),
      phone: t('leadSourcePhone'),
      social_media: t('leadSourceSocialMedia'),
      trade_show: t('leadSourceTradeShow'),
      other: t('leadSourceOther')
    }
    return source ? labels[source] || source : ''
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {deleteModal.blocked ? t('deleteBlockedTitle') : t('deleteConfirmTitle')}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {deleteModal.blocked ? deleteModal.clientName : t('deleteConfirmSubtitle')}
                  </p>
                </div>
              </div>

              {deleteModal.blocked ? (
                <>
                  <p className="text-sm text-gray-700 mb-3">{t('deleteBlockedBody')}</p>
                  <ul className="text-sm text-gray-800 space-y-1 ml-4 list-disc mb-4">
                    {attachedKinds(deleteModal.blocked).map(([kind, count]) => (
                      <li key={kind}>{t(`attached.${kind}`, { count })}</li>
                    ))}
                  </ul>
                  <p className="text-sm text-gray-600 mb-6">{t('deleteBlockedHint')}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700 mb-4">
                    {t('deleteConfirmMessage')} <strong>{deleteModal.clientName}</strong>?
                  </p>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-red-800 font-medium mb-2">{t('deleteAlsoDeletes')}</p>
                    <ul className="text-sm text-red-700 space-y-1 ml-4 list-disc">
                      <li>{t('deleteItemNotes')}</li>
                      <li>{t('deleteItemCommunications')}</li>
                      <li>{t('deleteItemFollowups')}</li>
                      <li>{t('deleteItemPreferences')}</li>
                    </ul>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deleting}
                  className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                >
                  {tCommon('cancel')}
                </button>
                {deleteModal.blocked ? (
                  <button
                    type="button"
                    onClick={markInactive}
                    disabled={deleting}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {deleting ? tCommon('loading') : t('markInactive')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => confirmDelete()}
                    disabled={deleting}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        {tCommon('loading')}
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        {t('deleteClient')}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-400" />
                {t('title')}
              </h1>
              {/* Was {t('searchPlaceholder')} — the search box's own
                  placeholder ("Search clients...") rendered as the page
                  subtitle, which read as a second, dead search control
                  beside Add Client (audit AUT-L01). */}
              <p className="mt-1 text-xs text-gray-500">
                {t('subtitle')}
              </p>
            </div>
            <Link
              href="/clients/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              {t('addClient')}
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          {[
            { label: t('title'), value: stats.total, dot: 'bg-primary-600', icon: Users },
            { label: t('statsLeads'), value: stats.byStatus.lead ?? 0, dot: 'bg-amber-500', icon: Clock },
            { label: t('statsProspects'), value: stats.byStatus.prospect ?? 0, dot: 'bg-blue-500', icon: TrendingUp },
            { label: t('statsCustomers'), value: stats.byStatus.customer ?? 0, dot: 'bg-green-600', icon: CheckCircle },
            { label: t('statsInactive'), value: stats.byStatus.inactive ?? 0, dot: 'bg-gray-400', icon: X },
            { label: t('statsVipClients'), value: stats.vip, dot: 'bg-yellow-500', icon: Star },
            { label: t('statsNewThisMonth'), value: stats.newThisMonth, dot: 'bg-blue-600', icon: Calendar },
          ].map(({ label, value, dot, icon: Icon }) => (
            <div key={label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-gray-400" />
                  <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                </div>
              </div>
              <p className="text-xs text-gray-600">{label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            </div>
          ))}

          {/* Money, per currency: what was invoiced, and what has been paid against it */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-purple-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">{t('statsInvoiced')}</p>
            <p className="text-lg font-bold text-gray-900 mt-1 break-words">
              {formatMoneyTotals(stats.invoiced)}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gray-400" />
                <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
              </div>
            </div>
            <p className="text-xs text-gray-600">{t('statsCollected')}</p>
            <p className="text-lg font-bold text-gray-900 mt-1 break-words">
              {formatMoneyTotals(stats.collected)}
            </p>
          </div>
        </div>

        {/* Enhanced Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4">
          {/* Search Bar - Always Visible */}
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder={t('searchByNameEmailPhone')}
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  className="w-full pl-3 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-colors shadow-sm ${
                  showFilters || hasActiveFilters
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {t('filters')}
                {hasActiveFilters && (
                  <span className="bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {[filters.status !== 'all', filters.clientType !== 'all', filters.leadSource !== 'all', filters.vipOnly, filters.dateFrom, filters.dateTo, filters.sortBy !== 'recent'].filter(Boolean).length}
                  </span>
                )}
              </button>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  {t('clearFilters')}
                </button>
              )}
            </div>
          </div>

          {/* Advanced Filters - Collapsible */}
          {showFilters && (
            <div className="px-4 pb-4 border-t border-gray-200 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('filterStatus')}
                  </label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
                  >
                    <option value="all">{t('filterAllStatuses')}</option>
                    {CLIENT_STATUSES.map(status => (
                      <option key={status} value={status}>{t(`status_${status}`)}</option>
                    ))}
                  </select>
                </div>

                {/* Client Type Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('filterClientType')}
                  </label>
                  <select
                    value={filters.clientType}
                    onChange={(e) => handleFilterChange('clientType', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
                  >
                    <option value="all">{t('filterAllTypes')}</option>
                    <option value="individual">{t('clientTypeIndividual')}</option>
                    <option value="family">{t('clientTypeFamily')}</option>
                    <option value="corporate">{t('clientTypeCorporate')}</option>
                    <option value="agent">{t('clientTypeAgent')}</option>
                    <option value="group">{t('clientTypeGroup')}</option>
                  </select>
                </div>

                {/* Lead Source Filter */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('filterLeadSource')}
                  </label>
                  <select
                    value={filters.leadSource}
                    onChange={(e) => handleFilterChange('leadSource', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
                  >
                    <option value="all">{t('filterAllSources')}</option>
                    <option value="whatsapp">💬 {t('leadSourceWhatsApp')}</option>
                    <option value="email">✉️ {t('leadSourceEmail')}</option>
                    <option value="website">🌐 {t('leadSourceWebsite')}</option>
                    <option value="referral">👥 {t('leadSourceReferral')}</option>
                    <option value="phone">📞 {t('leadSourcePhone')}</option>
                    <option value="social_media">📱 {t('leadSourceSocialMedia')}</option>
                    <option value="trade_show">🎪 {t('leadSourceTradeShow')}</option>
                    <option value="other">➕ {t('leadSourceOther')}</option>
                  </select>
                </div>

                {/* Sort By */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('filterSortBy')}
                  </label>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white shadow-sm"
                  >
                    <option value="recent">{t('sortMostRecent')}</option>
                    <option value="oldest">{t('sortOldestFirst')}</option>
                    <option value="name">{t('sortNameAZ')}</option>
                    <option value="name_desc">{t('sortNameZA')}</option>
                    <option value="revenue">{t('sortRevenueHighLow')}</option>
                    <option value="revenue_asc">{t('sortRevenueLowHigh')}</option>
                    <option value="bookings">{t('sortBookingsMost')}</option>
                  </select>
                </div>

                {/* VIP Toggle */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('filterVipClients')}
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2.5 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 shadow-sm">
                    <input
                      type="checkbox"
                      checked={filters.vipOnly}
                      onChange={(e) => handleFilterChange('vipOnly', e.target.checked)}
                      className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                    />
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-700">{t('filterVipOnly')}</span>
                  </label>
                </div>
              </div>

              {/* Date Range */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('filterMemberSinceFrom')}
                  </label>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    {t('filterMemberSinceTo')}
                  </label>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    max={todayLocal()}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Clients Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-3 text-sm text-gray-600">{t('loadingClients')}</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 mb-2">{t('noClientsFound')}</h3>
              <p className="text-sm text-gray-600 mb-4">
                {hasActiveFilters
                  ? t('noClientsFilterHint')
                  : t('noClientsStartHint')}
              </p>
              {hasActiveFilters ? (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 shadow-sm"
                >
                  <X className="w-4 h-4" />
                  {t('clearFilters')}
                </button>
              ) : (
                <Link
                  href="/clients/new"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 shadow-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  {t('addFirstClient')}
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tableHeaderClient')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tableHeaderContact')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tableHeaderTypeStatus')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tableHeaderLeadSource')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tableHeaderBookings')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tableHeaderRevenue')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('tableHeaderActions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client) => {
                    const leadSourceConfig = getLeadSourceConfig(client.lead_source)
                    return (
                      <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center">
                              <span className="text-primary-600 font-semibold text-xs">
                                {client.first_name?.[0]}{client.last_name?.[0]}
                              </span>
                            </div>
                            <div className="ml-3">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/clients/${client.id}`}
                                  className="text-sm font-medium text-gray-900 hover:text-primary-600"
                                >
                                  {client.first_name} {client.last_name}
                                </Link>
                                {client.vip_status && (
                                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                )}
                              </div>
                              <div className="text-xs text-gray-500">{client.client_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{client.email}</div>
                          {client.phone && (
                            <div className="text-xs text-gray-500">{client.phone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getTypeColor(client.client_type)}`}>
                              {client.client_type}
                            </span>
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(client.status)}`}>
                              {statusText(client.status)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {leadSourceConfig ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${leadSourceConfig.color}`}>
                              <span>{leadSourceConfig.icon}</span>
                              {getLeadSourceLabel(client.lead_source)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <div className="font-semibold">{client.total_bookings_count}</div>
                          <div className="text-xs text-gray-500">{t('bookings')}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="font-semibold text-green-600">
                            {formatMoneyTotals(invoicedTotals(client))}
                          </div>
                          {Object.keys(collectedTotals(client)).length > 0 && (
                            <div className="text-xs text-gray-500">
                              {t('collectedLabel', { amount: formatMoneyTotals(collectedTotals(client)) })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/clients/${client.id}`}
                              className="text-primary-600 hover:text-primary-800 font-medium"
                            >
                              {tCommon('view')}
                            </Link>
                            <span className="text-gray-300">|</span>
                            <Link
                              href={`/clients/${client.id}/edit`}
                              className="text-gray-600 hover:text-gray-800 font-medium"
                            >
                              {tCommon('edit')}
                            </Link>
                            {canDelete && (
                              <>
                                <span className="text-gray-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => openDeleteModal(client.id, `${client.first_name} ${client.last_name}`)}
                                  className="text-red-600 hover:text-red-800 font-medium"
                                >
                                  {tCommon('delete')}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Results Count and paging: the server's exact count, not the rows loaded */}
        {!loading && clients.length > 0 && (
          <div className="mt-3 flex items-center justify-center gap-4 text-xs text-gray-600">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              {tCommon('previous')}
            </button>
            <span>
              {t('showingRange', {
                from: (page - 1) * PAGE_SIZE + 1,
                to: (page - 1) * PAGE_SIZE + clients.length,
                total
              })}
              {hasActiveFilters && ` ${t('filtered')}`}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => p + 1)}
              disabled={page * PAGE_SIZE >= total}
              className="px-3 py-1.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              {tCommon('next')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}