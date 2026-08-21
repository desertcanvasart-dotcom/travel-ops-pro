'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatMoney, formatTotals } from '@/lib/currency-totals'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Eye,
  BarChart3,
  PieChart,
  Calendar,
  Download,
  FileText
} from 'lucide-react'
import { exportFinanceCSV, exportFinancePDF } from '@/lib/finance-export'

interface TripPnL {
  itinerary_id: string
  itinerary_code: string
  trip_name: string
  client_name: string
  start_date: string
  end_date: string
  status: string
  currency: string
  quoted_amount: number
  total_revenue: number
  total_paid: number
  total_expenses: number
  expenses_paid: number
  expenses_pending: number
  gross_profit: number
  profit_margin: number
  expense_breakdown: Record<string, number>
  invoice_count: number
  expense_count: number
  // Agent commissions come out of the margin — see the API's header comment.
  agent_commissions: number
  agent_commissions_paid: number
  supplier_commissions_receivable: number
  commission_count: number
  net_profit: number
  net_margin: number
  // Realized = money that actually moved; no pricing estimates in it.
  realized_revenue: number
  realized_cost: number
  realized_profit: number
  realized_margin: number
  realized_basis: string
}

interface Summary {
  total_trips: number
  /** Set only when every trip shares one currency; null when they do not. */
  currency?: string | null
  mixed_currency?: boolean
  /** The real per-currency breakdown, which the flat totals below cannot be. */
  by_currency?: Record<string, Record<string, number>>
  total_revenue: number
  total_expenses: number
  total_profit: number
  average_margin: number
  total_agent_commissions: number
  total_net_profit: number
  average_net_margin: number
  total_realized_revenue: number
  total_realized_cost: number
  total_realized_profit: number
  average_realized_margin: number
  profitable_trips: number
  loss_trips: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  quoted: { label: 'Quoted', color: 'text-amber-600', bg: 'bg-amber-100' },
  sent: { label: 'Sent', color: 'text-blue-600', bg: 'bg-blue-100' },
  confirmed: { label: 'Confirmed', color: 'text-green-600', bg: 'bg-green-100' },
  completed: { label: 'Completed', color: 'text-purple-600', bg: 'bg-purple-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-100' }
}

const CATEGORY_LABELS: Record<string, string> = {
  guide: 'Tour Guide',
  driver: 'Driver',
  hotel: 'Hotel',
  transportation: 'Transportation',
  entrance: 'Entrance Fees',
  meal: 'Meals',
  airport_staff: 'Airport Assistant',
  hotel_staff: 'Hotel Assistant',
  ground_handler: 'Ground Handler',
  tipping: 'Tipping',
  permits: 'Permits',
  toll: 'Toll Fees',
  parking: 'Parking',
  fuel: 'Fuel',
  other: 'Other'
}

const ITEMS_PER_PAGE = 15

export default function ProfitLossPage() {
  const t = useTranslations('profitLoss')
  const [data, setData] = useState<TripPnL[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<'profit_margin' | 'gross_profit' | 'start_date'>('start_date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchAbortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(async () => {
    // Cancel any in-flight fetch so a slow response for a previous filter set
    // can't overwrite results for the current filters.
    fetchAbortRef.current?.abort()
    const controller = new AbortController()
    fetchAbortRef.current = controller
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (startDate) params.append('startDate', startDate)
      if (endDate) params.append('endDate', endDate)

      const response = await fetch(`/api/profit-loss?${params}`, { signal: controller.signal })
      if (response.ok) {
        const result = await response.json()
        if (controller.signal.aborted) return
        if (result.success) {
          setData(result.data)
          setSummary(result.summary)
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return // superseded by a newer fetch / unmount
      console.error('Error fetching P&L data:', error)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [statusFilter, startDate, endDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Abort any in-flight fetch on unmount.
  useEffect(() => () => fetchAbortRef.current?.abort(), [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, startDate, endDate, sortField, sortOrder])

  const filteredData = data
    .filter(trip => {
      const matchesSearch = 
        trip.itinerary_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.trip_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trip.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesSearch
    })
    .sort((a, b) => {
      let aVal: number, bVal: number
      switch (sortField) {
        // Sorted on NET, matching what the table shows. Ranking by gross would
        // put a trip whose entire margin goes to an agent above one that keeps
        // less headline profit but all of it.
        case 'profit_margin':
          aVal = a.net_margin
          bVal = b.net_margin
          break
        case 'gross_profit':
          aVal = a.net_profit
          bVal = b.net_profit
          break
        case 'start_date':
        default:
          aVal = new Date(a.start_date).getTime()
          bVal = new Date(b.start_date).getTime()
      }
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
    })

  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE)
  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  /**
   * A summary figure in the currency it is actually in.
   *
   * The API already does the hard part: `currency` is set only when every trip
   * shares one, and `by_currency` holds the real breakdown otherwise. Its own
   * comment says the flat totals are authoritative ONLY when mixed_currency is
   * false — so on a mixed page this renders "¥879,917 + €1,200" from the
   * breakdown instead of a merged number the page had no right to print.
   */
  /**
   * A margin across two currencies is not a smaller or larger margin — it is
   * not a margin at all: the ratio's numerator and denominator are different
   * money. Per-trip margins in the table below stay meaningful, because each
   * trip has one currency.
   */
  const summaryPercent = (value: number) =>
    summary?.mixed_currency ? '—' : `${value.toFixed(1)}%`

  const summaryMoney = (field: string, flat: number) => {
    if (!summary) return ''
    if (summary.mixed_currency && summary.by_currency) {
      const totals = Object.fromEntries(
        Object.entries(summary.by_currency).map(([code, bucket]: [string, any]) => [code, Number(bucket?.[field]) || 0])
      )
      return formatTotals(totals)
    }
    return formatMoney(flat, summary.currency || 'EUR')
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£', JPY: '¥' }
    return symbols[currency] || currency
  }

  const getProfitColor = (profit: number) => {
    if (profit > 0) return 'text-green-600'
    if (profit < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getProfitBg = (profit: number) => {
    if (profit > 0) return 'bg-green-50'
    if (profit < 0) return 'bg-red-50'
    return 'bg-gray-50'
  }

  const getMarginColor = (margin: number) => {
    if (margin >= 30) return 'text-green-600 bg-green-100'
    if (margin >= 15) return 'text-yellow-600 bg-yellow-100'
    if (margin >= 0) return 'text-orange-600 bg-orange-100'
    return 'text-red-600 bg-red-100'
  }

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
  }

  const hasActiveFilters = statusFilter || startDate || endDate

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            📊
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{t('title')}</h1>
            <p className="text-sm text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const cols = [
                { key: 'itinerary_code', label: 'Trip' },
                { key: 'client_name', label: 'Client' },
                { key: 'start_date', label: 'Date' },
                { key: 'total_revenue', label: 'Revenue', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'total_expenses', label: 'Expenses', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'gross_profit', label: 'Gross Profit', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'agent_commissions', label: 'Agent Commission', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'net_profit', label: 'Net Profit', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'net_margin', label: 'Net Margin %', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(1) + '%' : String(v ?? '') },
                { key: 'realized_revenue', label: 'Cash In', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'realized_cost', label: 'Cash Out', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'realized_profit', label: 'Realized', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'status', label: 'Status' },
              ]
              exportFinanceCSV(filteredData as unknown as Record<string, unknown>[], cols, 'profit-and-loss')
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={() => {
              const cols = [
                { key: 'itinerary_code', label: 'Trip' },
                { key: 'client_name', label: 'Client' },
                { key: 'start_date', label: 'Date' },
                { key: 'total_revenue', label: 'Revenue', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'total_expenses', label: 'Expenses', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'gross_profit', label: 'Gross Profit', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'agent_commissions', label: 'Agent Commission', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'net_profit', label: 'Net Profit', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'net_margin', label: 'Net Margin %', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(1) + '%' : String(v ?? '') },
                { key: 'realized_revenue', label: 'Cash In', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'realized_cost', label: 'Cash Out', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'realized_profit', label: 'Realized', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'status', label: 'Status' },
              ]
              exportFinancePDF({
                title: 'Profit & Loss Report',
                summary: summary ? [
                  { label: 'Total Trips', value: String(summary.total_trips) },
                  { label: 'Total Revenue', value: summaryMoney('revenue', summary.total_revenue) },
                  { label: 'Total Expenses', value: summaryMoney('total_expenses', summary.total_expenses) },
                  { label: 'Gross Profit', value: summaryMoney('profit', summary.total_profit) },
                  { label: 'Agent Commission', value: summaryMoney('agent_commissions', summary.total_agent_commissions) },
                  { label: 'Net Profit', value: summaryMoney('net_profit', summary.total_net_profit) },
                  { label: 'Avg Net Margin', value: summaryPercent(summary.average_net_margin) },
                  { label: 'Realized Profit', value: summaryMoney('realized_profit', summary.total_realized_profit) },
                  { label: 'Avg Margin', value: summaryPercent(summary.average_margin) },
                ] : [],
                data: filteredData as unknown as Record<string, unknown>[],
                columns: cols,
                filename: 'profit-and-loss',
                orientation: 'landscape',
              })
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🎯</span>
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">{t('summary.totalTrips')}</p>
            <p className="text-xl font-semibold text-gray-900 truncate">{summary.total_trips}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💰</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">{t('summary.totalRevenue')}</p>
            <p className="text-lg font-semibold text-blue-600 truncate" title={summaryMoney('revenue', summary.total_revenue)}>{summaryMoney('revenue', summary.total_revenue)}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💸</span>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">{t('summary.totalExpenses')}</p>
            <p className="text-lg font-semibold text-red-600 truncate" title={summaryMoney('total_expenses', summary.total_expenses)}>{summaryMoney('total_expenses', summary.total_expenses)}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📈</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">{t('summary.grossProfit')}</p>
            <p className={`text-lg font-semibold truncate ${getProfitColor(summary.total_profit)}`} title={summaryMoney('profit', summary.total_profit)}>
              {summaryMoney('profit', summary.total_profit)}
            </p>
            {summary.total_agent_commissions > 0 && (
              <p className="text-[11px] text-gray-500 mt-0.5">
                before {summaryMoney('agent_commissions', summary.total_agent_commissions)} agent commission
              </p>
            )}
          </div>

          {/* Net of agent commission — the margin the business actually keeps.
              Shown next to gross rather than replacing it, so the difference the
              agent takes is visible instead of silently baked in. */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🤝</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Net of commission</p>
            <p className={`text-lg font-semibold truncate ${getProfitColor(summary.total_net_profit)}`} title={summaryMoney('net_profit', summary.total_net_profit)}>
              {summaryMoney('net_profit', summary.total_net_profit)}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">{summaryPercent(summary.average_net_margin)} margin</p>
          </div>

          {/* Realized — cash that actually moved. Deliberately separate from the
              accrued figures above, which include supplier_cost (an estimate). */}
          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🏦</span>
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1" title={'Payments received minus expenses and commissions actually paid. Excludes supplier_cost, which is an estimate rather than a payment.'}>
              Realized
            </p>
            <p className={`text-lg font-semibold truncate ${getProfitColor(summary.total_realized_profit)}`}>
              {summaryMoney('realized_profit', summary.total_realized_profit)}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {summaryMoney('realized_revenue', summary.total_realized_revenue)} in · {summaryMoney('realized_cost', summary.total_realized_cost)} out
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📊</span>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">{t('summary.avgMargin')}</p>
            <p className="text-xl font-semibold text-purple-600 truncate">{summaryPercent(summary.average_margin)}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✅</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">{t('summary.profitable')}</p>
            <p className="text-xl font-semibold text-emerald-600 truncate">{summary.profitable_trips}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚠️</span>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">{t('summary.lossMaking')}</p>
            <p className="text-xl font-semibold text-orange-600 truncate">{summary.loss_trips}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder={t('search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as any)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
          >
            <option value="start_date">{t('sort.byDate')}</option>
            <option value="gross_profit">{t('sort.byProfit')}</option>
            <option value="profit_margin">{t('sort.byMargin')}</option>
          </select>

          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            title={sortOrder === 'asc' ? t('sort.ascending') : t('sort.descending')}
          >
            {sortOrder === 'asc' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
              hasActiveFilters 
                ? 'border-[#647C47] text-[#647C47] bg-[#647C47]/5' 
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            {t('filters')}
            {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[#647C47]"></span>}
          </button>

          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700">
              {t('clear')}
            </button>
          )}
        </div>
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('filterLabels.tripStatus')}</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">{t('filterLabels.allStatuses')}</option>
                <option value="draft">{t('status.draft')}</option>
                <option value="sent">{t('status.sent')}</option>
                <option value="confirmed">{t('status.confirmed')}</option>
                <option value="completed">{t('status.completed')}</option>
                <option value="cancelled">{t('status.cancelled')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('filterLabels.fromDate')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('filterLabels.toDate')}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">{t('table.trip')}</th>
              <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">{t('table.date')}</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">{t('table.revenue')}</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">{t('table.expenses')}</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">{t('table.profit')}</th>
              <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">{t('table.margin')}</th>
              <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">{t('table.status')}</th>
              <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                  {t('noTripsFound')}
                </td>
              </tr>
            ) : (
              paginatedData.map((trip) => {
                const statusConfig = STATUS_CONFIG[trip.status] || STATUS_CONFIG.draft
                const statusLabel = t(`status.${trip.status}` as any) || t('status.draft')
                const revenue = trip.total_revenue > 0 ? trip.total_revenue : trip.quoted_amount
                return (
                  <tr key={trip.itinerary_id} className={`hover:bg-gray-50 ${getProfitBg(trip.net_profit)}`}>
                    <td className="px-4 py-3">
                      <div>
                        <Link 
                          href={`/profit-loss/${trip.itinerary_id}`}
                          className="text-sm font-medium text-gray-900 hover:text-[#647C47]"
                        >
                          {trip.itinerary_code}
                        </Link>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{trip.client_name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-600">
                        {new Date(trip.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-xs text-gray-400">
                        {trip.end_date && `to ${new Date(trip.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {getCurrencySymbol(trip.currency)}{revenue.toLocaleString()}
                      </div>
                      {trip.invoice_count > 0 && (
                        <div className="text-xs text-gray-500">
                          {trip.invoice_count} {trip.invoice_count === 1 ? t('invoice') : t('invoices')}
                        </div>
                      )}
                      {trip.total_revenue === 0 && (
                        <div className="text-xs text-gray-400 italic">{t('quoted')}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {getCurrencySymbol(trip.currency)}{trip.total_expenses.toLocaleString()}
                      </div>
                      {trip.expense_count > 0 && (
                        <div className="text-xs text-gray-500">
                          {trip.expense_count} {trip.expense_count === 1 ? t('expense') : t('expenses')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className={`text-sm font-semibold ${getProfitColor(trip.net_profit)}`}>
                        {trip.net_profit >= 0 ? '+' : ''}{getCurrencySymbol(trip.currency)}{Math.round(trip.net_profit).toLocaleString()}
                      </div>
                      {/* Only shown when an agent actually takes a cut, so the
                          row stays quiet on directly-sold trips. */}
                      {trip.agent_commissions > 0 && (
                        <div className="text-xs text-amber-600" title="Agent commission deducted from gross profit">
                          −{getCurrencySymbol(trip.currency)}{Math.round(trip.agent_commissions).toLocaleString()} commission
                        </div>
                      )}
                      {trip.realized_revenue > 0 && (
                        <div className="text-xs text-gray-500" title={trip.realized_basis}>
                          {getCurrencySymbol(trip.currency)}{Math.round(trip.realized_profit).toLocaleString()} realized
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getMarginColor(trip.net_margin)}`}>
                        {trip.net_margin >= 0 ? '+' : ''}{trip.net_margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/profit-loss/${trip.itinerary_id}`}
                          className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                          title={t('actions.viewDetails')}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/itineraries/${trip.itinerary_id}`}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title={t('actions.viewItinerary')}
                        >
                          <Calendar className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {t('pagination.showing')} {((currentPage - 1) * ITEMS_PER_PAGE) + 1} {t('pagination.to')} {Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} {t('pagination.of')} {filteredData.length} {t('pagination.trips')}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum
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
                  className={`w-8 h-8 text-sm rounded-lg ${
                    currentPage === pageNum
                      ? 'bg-[#647C47] text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">{t('footer')}</p>
      </div>
    </div>
  )
}