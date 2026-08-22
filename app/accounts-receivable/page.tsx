'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { formatMoney, formatTotals, type CurrencyTotals } from '@/lib/currency-totals'
import Link from 'next/link'
import {
  Search,
  DollarSign,
  Clock,
  AlertTriangle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Send,
  Eye,
  User,
  FileText,
  Calendar,
  Mail,
  Phone,
  ExternalLink,
  TrendingUp,
  CheckCircle,
  Download
} from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { exportFinanceCSV, exportFinancePDF } from '@/lib/finance-export'

interface AgingBucket {
  current: number
  days30: number
  days60: number
  days90Plus: number
}

interface ClientReceivable {
  client_id: string
  client_name: string
  client_email: string
  currency: string
  total_invoiced: number
  total_paid: number
  total_outstanding: number
  invoice_count: number
  oldest_invoice_date: string
  aging: AgingBucket
  invoices: Invoice[]
}

interface Invoice {
  currency: string
  id: string
  invoice_number: string
  client_id: string
  client_name: string
  client_email: string
  total_amount: number
  amount_paid: number
  balance_due: number
  status: string
  issue_date: string
  due_date: string
  days_past_due: number
  aging_bucket: string
  is_overdue: boolean
}

interface AgingTotals {
  current: CurrencyTotals
  days30: CurrencyTotals
  days60: CurrencyTotals
  days90Plus: CurrencyTotals
}

interface Summary {
  // Per currency: an operator billing in yen and euro is owed two amounts, not
  // one sum. The tiles render "¥879,917" or "¥879,917 + €1,200".
  total_outstanding: CurrencyTotals
  total_invoiced: CurrencyTotals
  total_paid: CurrencyTotals
  client_count: number
  invoice_count: number
  aging: AgingTotals
  overdue_count: number
  overdue_amount: CurrencyTotals
}

const ITEMS_PER_PAGE = 15

export default function AccountsReceivablePage() {
  const dialog = useConfirmDialog()
  const [clients, setClients] = useState<ClientReceivable[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [agingFilter, setAgingFilter] = useState('')
  const [viewMode, setViewMode] = useState<'clients' | 'invoices'>('clients')
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedClient, setExpandedClient] = useState<string | null>(null)
  const [sendingReminder, setSendingReminder] = useState<string | null>(null)

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
      if (agingFilter) params.append('aging', agingFilter)

      const response = await fetch(`/api/accounts-receivable?${params}`, { signal: controller.signal })
      if (response.ok) {
        const result = await response.json()
        if (controller.signal.aborted) return
        if (result.success) {
          setClients(result.data)
          setInvoices(result.invoices)
          setSummary(result.summary)
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') return // superseded by a newer fetch / unmount
      console.error('Error fetching AR data:', error)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [agingFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Abort any in-flight fetch on unmount.
  useEffect(() => () => fetchAbortRef.current?.abort(), [])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, agingFilter, viewMode])

  const handleSendReminder = async (invoice: Invoice) => {
    if (!invoice.client_email) {
      await dialog.alert('Missing Email', 'No email address for this client', 'warning')
      return
    }

    setSendingReminder(invoice.id)
    
    // In a real implementation, this would call an API to send the email
    // For now, we'll open the mailto link
    const subject = encodeURIComponent(`Payment Reminder: ${invoice.invoice_number}`)
    const body = encodeURIComponent(
      `Dear ${invoice.client_name},\n\n` +
      `This is a friendly reminder that invoice ${invoice.invoice_number} ` +
      `for ${formatMoney(Number(invoice.balance_due), invoice.currency)} is ${invoice.days_past_due > 0 ? `${invoice.days_past_due} days overdue` : 'due soon'}.\n\n` +
      `Original amount: ${formatMoney(Number(invoice.total_amount), invoice.currency)}\n` +
      `Amount paid: ${formatMoney(Number(invoice.amount_paid), invoice.currency)}\n` +
      `Balance due: ${formatMoney(Number(invoice.balance_due), invoice.currency)}\n` +
      `Due date: ${new Date(invoice.due_date).toLocaleDateString()}\n\n` +
      `Please arrange payment at your earliest convenience.\n\n` +
      `Best regards,\nTravel2Egypt`
    )
    
    window.open(`mailto:${invoice.client_email}?subject=${subject}&body=${body}`, '_blank')
    setSendingReminder(null)
  }

  // The currency this page is mostly denominated in — used for the proportional
  // aging bar, which needs ONE denominator and cannot mix currencies.
  const dominantCurrency = (t?: CurrencyTotals) =>
    Object.entries(t || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0] || 'EUR'
  const listCurrency = dominantCurrency(summary?.total_outstanding)
  const inList = (t?: CurrencyTotals) => (t?.[listCurrency] ?? 0)

  const getCurrencySymbol = (currency: string = 'EUR') => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£', JPY: '¥' }
    return symbols[currency] || currency
  }

  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case 'current': return 'text-green-600 bg-green-100'
      case 'overdue':
      case '30': return 'text-yellow-600 bg-yellow-100'
      case '60': return 'text-orange-600 bg-orange-100'
      case '90plus': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getAgingLabel = (bucket: string) => {
    switch (bucket) {
      case 'current': return 'Current'
      case 'overdue': return '1-30 Days'
      case '30': return '1-30 Days'
      case '60': return '31-60 Days'
      case '90plus': return '90+ Days'
      default: return bucket
    }
  }

  const filteredClients = clients.filter(client => {
    return client.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           client.client_email?.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const filteredInvoices = invoices.filter(invoice => {
    return invoice.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           invoice.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const displayData = viewMode === 'clients' ? filteredClients : filteredInvoices
  const totalPages = Math.ceil(displayData.length / ITEMS_PER_PAGE)
  const paginatedData = displayData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

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
            💳
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Accounts Receivable</h1>
            <p className="text-sm text-gray-500">Track outstanding client payments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const cols = [
                { key: 'client_name', label: 'Client' },
                { key: 'total_invoiced', label: 'Total Invoiced', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'total_paid', label: 'Total Paid', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'total_outstanding', label: 'Outstanding', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'invoice_count', label: 'Invoice Count', align: 'right' as const },
                { key: 'oldest_invoice_date', label: 'Oldest Invoice' },
              ]
              exportFinanceCSV(filteredClients as unknown as Record<string, unknown>[], cols, 'accounts-receivable')
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={() => {
              const cols = [
                { key: 'client_name', label: 'Client' },
                { key: 'total_invoiced', label: 'Total Invoiced', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'total_paid', label: 'Total Paid', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'total_outstanding', label: 'Outstanding', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'invoice_count', label: 'Invoice Count', align: 'right' as const },
                { key: 'oldest_invoice_date', label: 'Oldest Invoice' },
              ]
              exportFinancePDF({
                title: 'Accounts Receivable Report',
                summary: summary ? [
                  { label: 'Total Outstanding', value: formatTotals(summary.total_outstanding, { defaultCurrency: listCurrency }) },
                  { label: 'Client Count', value: String(summary.client_count) },
                  { label: 'Overdue Amount', value: formatTotals(summary.overdue_amount, { defaultCurrency: listCurrency }) },
                ] : [],
                data: filteredClients as unknown as Record<string, unknown>[],
                columns: cols,
                filename: 'accounts-receivable',
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💰</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Total Outstanding</p>
            <p className="text-2xl font-semibold text-blue-600">{formatTotals(summary.total_outstanding, { defaultCurrency: listCurrency })}</p>
            <p className="text-xs text-gray-400 mt-1">{summary.invoice_count} invoices</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⚠️</span>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Overdue</p>
            <p className="text-2xl font-semibold text-red-600">{formatTotals(summary.overdue_amount, { defaultCurrency: listCurrency })}</p>
            <p className="text-xs text-gray-400 mt-1">{summary.overdue_count} invoices</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✅</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">Current</p>
            <p className="text-2xl font-semibold text-green-600">{formatTotals(summary.aging.current, { defaultCurrency: listCurrency })}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📅</span>
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">1-30 Days</p>
            <p className="text-2xl font-semibold text-yellow-600">{formatTotals(summary.aging.days30, { defaultCurrency: listCurrency })}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⏰</span>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">31-60 Days</p>
            <p className="text-2xl font-semibold text-orange-600">{formatTotals(summary.aging.days60, { defaultCurrency: listCurrency })}</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🚨</span>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            </div>
            <p className="text-xs text-gray-500 mb-1">90+ Days</p>
            <p className="text-2xl font-semibold text-red-600">{formatTotals(summary.aging.days90Plus, { defaultCurrency: listCurrency })}</p>
          </div>
        </div>
      )}

      {/* Aging Report Visual */}
      {summary && inList(summary.total_outstanding) > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Aging Report</h3>
          <div className="flex h-8 rounded-lg overflow-hidden">
            {inList(summary.aging.current) > 0 && (
              <div 
                className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(inList(summary.aging.current) / inList(summary.total_outstanding)) * 100}%` }}
                title={`Current: ${formatMoney(inList(summary.aging.current), listCurrency)}`}
              >
                {((inList(summary.aging.current) / inList(summary.total_outstanding)) * 100).toFixed(0)}%
              </div>
            )}
            {inList(summary.aging.days30) > 0 && (
              <div 
                className="bg-yellow-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(inList(summary.aging.days30) / inList(summary.total_outstanding)) * 100}%` }}
                title={`1-30 Days: ${formatMoney(inList(summary.aging.days30), listCurrency)}`}
              >
                {((inList(summary.aging.days30) / inList(summary.total_outstanding)) * 100).toFixed(0)}%
              </div>
            )}
            {inList(summary.aging.days60) > 0 && (
              <div 
                className="bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(inList(summary.aging.days60) / inList(summary.total_outstanding)) * 100}%` }}
                title={`31-60 Days: ${formatMoney(inList(summary.aging.days60), listCurrency)}`}
              >
                {((inList(summary.aging.days60) / inList(summary.total_outstanding)) * 100).toFixed(0)}%
              </div>
            )}
            {inList(summary.aging.days90Plus) > 0 && (
              <div 
                className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                style={{ width: `${(inList(summary.aging.days90Plus) / inList(summary.total_outstanding)) * 100}%` }}
                title={`90+ Days: ${formatMoney(inList(summary.aging.days90Plus), listCurrency)}`}
              >
                {((inList(summary.aging.days90Plus) / inList(summary.total_outstanding)) * 100).toFixed(0)}%
              </div>
            )}
          </div>
          <div className="flex items-center gap-6 mt-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500"></div>
              <span className="text-gray-600">Current</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-yellow-500"></div>
              <span className="text-gray-600">1-30 Days</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-orange-500"></div>
              <span className="text-gray-600">31-60 Days</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500"></div>
              <span className="text-gray-600">90+ Days</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            placeholder={viewMode === 'clients' ? 'Search clients...' : 'Search invoices...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setViewMode('clients')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'clients' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Client
          </button>
          <button
            onClick={() => setViewMode('invoices')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              viewMode === 'invoices' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Invoice
          </button>
        </div>

        {/* Aging Filter */}
        <select
          value={agingFilter}
          onChange={(e) => setAgingFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
        >
          <option value="">All Aging</option>
          <option value="current">Current (Not Due)</option>
          <option value="30">1-30 Days Overdue</option>
          <option value="60">31-60 Days Overdue</option>
          <option value="90">90+ Days Overdue</option>
        </select>
      </div>

      {/* Client View */}
      {viewMode === 'clients' && (
        <div className="space-y-3">
          {(paginatedData as ClientReceivable[]).length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500">No outstanding receivables</p>
            </div>
          ) : (
            (paginatedData as ClientReceivable[]).map((client) => (
              <div key={client.client_id || client.client_name} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedClient(expandedClient === client.client_id ? null : client.client_id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">{client.client_name}</p>
                      <p className="text-xs text-gray-500">{client.client_email || 'No email'}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatMoney(client.total_outstanding, client.currency)}</p>
                      <p className="text-xs text-gray-500">{client.invoice_count} invoice{client.invoice_count !== 1 ? 's' : ''}</p>
                    </div>
                    
                    {/* Mini aging bars */}
                    <div className="hidden md:flex items-center gap-1">
                      {client.aging.current > 0 && (
                        <div className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
                          {formatMoney(client.aging.current, client.currency)}
                        </div>
                      )}
                      {client.aging.days30 > 0 && (
                        <div className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">
                          {formatMoney(client.aging.days30, client.currency)}
                        </div>
                      )}
                      {client.aging.days60 > 0 && (
                        <div className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded">
                          {formatMoney(client.aging.days60, client.currency)}
                        </div>
                      )}
                      {client.aging.days90Plus > 0 && (
                        <div className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                          {formatMoney(client.aging.days90Plus, client.currency)}
                        </div>
                      )}
                    </div>

                    <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${expandedClient === client.client_id ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {/* Expanded invoices */}
                {expandedClient === client.client_id && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    <div className="space-y-2">
                      {client.invoices.map((invoice: Invoice) => (
                        <div key={invoice.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <div>
                              <Link href={`/invoices/${invoice.id}`} className="text-sm font-medium text-gray-900 hover:text-[#647C47]">
                                {invoice.invoice_number}
                              </Link>
                              <p className="text-xs text-gray-500">
                                Due: {new Date(invoice.due_date).toLocaleDateString()}
                                {invoice.days_past_due > 0 && (
                                  <span className="text-red-500 ml-2">({invoice.days_past_due} days overdue)</span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">{formatMoney(Number(invoice.balance_due), invoice.currency)}</p>
                              <span className={`text-xs px-2 py-0.5 rounded ${getAgingColor(invoice.aging_bucket)}`}>
                                {getAgingLabel(invoice.aging_bucket)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSendReminder(invoice); }}
                                disabled={sendingReminder === invoice.id}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Send Reminder"
                              >
                                <Mail className="h-4 w-4" />
                              </button>
                              <Link
                                href={`/invoices/${invoice.id}`}
                                className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                                title="View Invoice"
                              >
                                <Eye className="h-4 w-4" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {client.client_id && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <Link
                          href={`/clients/${client.client_id}`}
                          className="text-sm text-[#647C47] hover:underline flex items-center gap-1"
                        >
                          View client profile
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Invoice View */}
      {viewMode === 'invoices' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Invoice</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Client</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Due Date</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Total</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Paid</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Balance</th>
                <th className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Aging</th>
                <th className="text-right text-xs font-semibold text-gray-600 uppercase tracking-wide px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(paginatedData as Invoice[]).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    No outstanding invoices
                  </td>
                </tr>
              ) : (
                (paginatedData as Invoice[]).map((invoice) => (
                  <tr key={invoice.id} className={`hover:bg-gray-50 ${invoice.is_overdue ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      <Link href={`/invoices/${invoice.id}`} className="text-sm font-medium text-gray-900 hover:text-[#647C47]">
                        {invoice.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-900">{invoice.client_name}</p>
                      {invoice.client_email && (
                        <p className="text-xs text-gray-500">{invoice.client_email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600">{new Date(invoice.due_date).toLocaleDateString()}</p>
                      {invoice.days_past_due > 0 && (
                        <p className="text-xs text-red-500">{invoice.days_past_due} days overdue</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-900">{formatMoney(Number(invoice.total_amount), invoice.currency)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-green-600">{formatMoney(Number(invoice.amount_paid), invoice.currency)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900">{formatMoney(Number(invoice.balance_due), invoice.currency)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getAgingColor(invoice.aging_bucket)}`}>
                        {getAgingLabel(invoice.aging_bucket)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleSendReminder(invoice)}
                          disabled={sendingReminder === invoice.id}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Send Reminder"
                        >
                          <Mail className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="p-1.5 text-gray-400 hover:text-[#647C47] hover:bg-gray-100 rounded transition-colors"
                          title="View Invoice"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, displayData.length)} of {displayData.length}
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
        <p className="text-xs text-gray-400">© 2024 Autoura Operations System</p>
      </div>
    </div>
  )
}