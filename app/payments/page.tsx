'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  FileText,
  ExternalLink,
  Plus,
  MapPin,
  Download
} from 'lucide-react'
import Link from 'next/link'
import { exportFinanceCSV, exportFinancePDF } from '@/lib/finance-export'

interface UnifiedPayment {
  id: string
  source: 'invoice' | 'itinerary'
  source_id: string
  source_reference: string
  client_name: string
  client_email?: string
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference: string | null
  notes: string | null
  created_at: string
}

interface PaymentStats {
  totalReceived: number
  pendingPayments: number
  overduePayments: number
  thisMonthRevenue: number
}

export default function PaymentsPage() {
  const t = useTranslations('payments')
  const [payments, setPayments] = useState<UnifiedPayment[]>([])
  const [filteredPayments, setFilteredPayments] = useState<UnifiedPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PaymentStats>({
    totalReceived: 0,
    pendingPayments: 0,
    overduePayments: 0,
    thisMonthRevenue: 0
  })

  const [methodFilter, setMethodFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchAllPayments()
  }, [])

  useEffect(() => {
    filterPayments()
  }, [payments, methodFilter, sourceFilter, searchQuery])

  const fetchAllPayments = async () => {
    setLoading(true)
    try {
      // Fetch from both sources in parallel. High explicit limits: the stats
      // cards (total received / pending / overdue) sum across all rows, so we
      // request the API's max rather than the default page of 100. Invoices
      // come with their payments embedded (?include=payments) to avoid a
      // per-invoice request waterfall.
      const [itineraryPaymentsRes, invoicesRes] = await Promise.all([
        fetch('/api/payments?limit=1000'),
        fetch('/api/invoices?include=payments&limit=1000')
      ])

      const allPayments: UnifiedPayment[] = []
      let totalReceived = 0
      let pendingPayments = 0
      let overduePayments = 0

      // Process itinerary payments
      if (itineraryPaymentsRes.ok) {
        const itineraryData = await itineraryPaymentsRes.json()
        const itineraryPayments = itineraryData.success ? itineraryData.data : (Array.isArray(itineraryData) ? itineraryData : [])

        itineraryPayments.forEach((p: any) => {
          allPayments.push({
            id: p.id,
            source: 'itinerary',
            source_id: p.itinerary_id,
            source_reference: p.itinerary_code || p.itineraries?.itinerary_code || 'N/A',
            client_name: p.client_name || p.itineraries?.client_name || 'Unknown',
            client_email: undefined,
            amount: Number(p.amount) || 0,
            currency: p.currency || 'EUR',
            payment_method: p.payment_method || 'unknown',
            payment_date: p.payment_date,
            transaction_reference: p.transaction_reference,
            notes: p.notes,
            created_at: p.created_at
          })
          totalReceived += Number(p.amount) || 0
        })
      }

      // Process invoice payments
      if (invoicesRes.ok) {
        const invoices = await invoicesRes.json()
        const now = new Date()

        for (const invoice of invoices) {
          // Track pending and overdue from invoices
          if (['sent', 'partial', 'viewed'].includes(invoice.status)) {
            pendingPayments += Number(invoice.balance_due) || 0
          }

          if (invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.due_date) {
            const dueDate = new Date(invoice.due_date)
            if (dueDate < now && Number(invoice.balance_due) > 0) {
              overduePayments += Number(invoice.balance_due) || 0
            }
          }

          // Payments come embedded on the invoice (?include=payments) — no
          // per-invoice fetch needed
          const invoicePayments = invoice.invoice_payments
          if (Array.isArray(invoicePayments)) {
            invoicePayments.forEach((p: any) => {
              allPayments.push({
                id: p.id,
                source: 'invoice',
                source_id: invoice.id,
                source_reference: invoice.invoice_number,
                client_name: invoice.client_name || 'Unknown',
                client_email: invoice.client_email,
                amount: Number(p.amount) || 0,
                currency: p.currency || invoice.currency || 'EUR',
                payment_method: p.payment_method || 'unknown',
                payment_date: p.payment_date,
                transaction_reference: p.transaction_reference,
                notes: p.notes,
                created_at: p.created_at
              })
              totalReceived += Number(p.amount) || 0
            })
          }
        }
      }

      // Sort all payments by date (newest first)
      allPayments.sort((a, b) => {
        const dateA = new Date(a.payment_date || a.created_at)
        const dateB = new Date(b.payment_date || b.created_at)
        return dateB.getTime() - dateA.getTime()
      })

      // Calculate this month's revenue
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const thisMonthRevenue = allPayments
        .filter(p => p.payment_date && new Date(p.payment_date) >= startOfMonth)
        .reduce((sum, p) => sum + p.amount, 0)

      setPayments(allPayments)
      setStats({
        totalReceived,
        pendingPayments,
        overduePayments,
        thisMonthRevenue
      })

    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }

  const filterPayments = () => {
    let filtered = payments

    if (methodFilter !== 'all') {
      filtered = filtered.filter(p => p.payment_method === methodFilter)
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(p => p.source === sourceFilter)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(p =>
        p.client_name?.toLowerCase().includes(query) ||
        p.source_reference?.toLowerCase().includes(query) ||
        p.transaction_reference?.toLowerCase().includes(query)
      )
    }

    setFilteredPayments(filtered)
  }

  const getMethodLabel = (method: string) => {
    const methodKeys: Record<string, string> = {
      bank_transfer: 'bankTransfer',
      credit_card: 'creditCard',
      cash: 'cash',
      paypal: 'paypal',
      wise: 'wise',
      airwallex: 'airwallex',
      stripe: 'stripe',
      tab: 'tab'
    }
    const key = methodKeys[method]
    return key ? t(key) : method
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
    return symbols[currency] || currency
  }

  const getSourceLink = (payment: UnifiedPayment) => {
    if (payment.source === 'invoice') {
      return `/invoices/${payment.source_id}`
    }
    return `/itineraries/${payment.source_id}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">{t('loadingPayments')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('paymentTracking')}</h1>
          <p className="text-sm text-gray-600 mt-1">{t('allPaymentsDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const cols = [
                { key: 'payment_date', label: 'Date' },
                { key: 'source', label: 'Source' },
                { key: 'source_reference', label: 'Reference' },
                { key: 'client_name', label: 'Client' },
                { key: 'amount', label: 'Amount', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'payment_method', label: 'Method' },
                { key: 'transaction_reference', label: 'Txn Ref' },
              ]
              exportFinanceCSV(filteredPayments as unknown as Record<string, unknown>[], cols, 'payments')
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={() => {
              const cols = [
                { key: 'payment_date', label: 'Date' },
                { key: 'source', label: 'Source' },
                { key: 'source_reference', label: 'Reference' },
                { key: 'client_name', label: 'Client' },
                { key: 'amount', label: 'Amount', align: 'right' as const, format: (v: unknown) => typeof v === 'number' ? v.toFixed(2) : String(v ?? '') },
                { key: 'payment_method', label: 'Method' },
                { key: 'transaction_reference', label: 'Txn Ref' },
              ]
              exportFinancePDF({
                title: 'Payments Report',
                summary: [
                  { label: 'Total Received', value: `€${stats.totalReceived.toLocaleString()}` },
                  { label: 'Pending', value: `€${stats.pendingPayments.toLocaleString()}` },
                  { label: 'Overdue', value: `€${stats.overduePayments.toLocaleString()}` },
                  { label: 'This Month', value: `€${stats.thisMonthRevenue.toLocaleString()}` },
                ],
                data: filteredPayments as unknown as Record<string, unknown>[],
                columns: cols,
                filename: 'payments',
              })
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            PDF
          </button>
          <Link
            href="/payments/new"
            className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center gap-2 font-medium"
          >
            <Plus className="w-4 h-4" />
            {t('addPayment')}
          </Link>
          <Link
            href="/invoices"
            className="bg-gray-100 text-gray-700 px-3 py-1.5 text-sm rounded-lg hover:bg-gray-200 flex items-center gap-2 font-medium"
          >
            <FileText className="w-4 h-4" />
            {t('viewInvoices')}
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">{t('totalReceived')}</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            €{stats.totalReceived.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">{t('allTimePayments')}</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">{t('pendingPayments')}</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            €{stats.pendingPayments.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">{t('outstandingBalance')}</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">{t('overdue')}</h3>
          <p className="text-2xl font-bold text-red-600 mt-1">
            €{stats.overduePayments.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">{t('pastDueDate')}</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">{t('thisMonth')}</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            €{stats.thisMonthRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">{t('revenueThisMonth')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            placeholder={t('searchPaymentsPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">{t('allSources')}</option>
          <option value="invoice">{t('invoicePayments')}</option>
          <option value="itinerary">{t('itineraryPayments')}</option>
        </select>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">{t('allMethods')}</option>
          <option value="bank_transfer">{t('bankTransfer')}</option>
          <option value="credit_card">{t('creditCard')}</option>
          <option value="cash">{t('cash')}</option>
          <option value="paypal">{t('paypal')}</option>
          <option value="wise">{t('wise')}</option>
          <option value="airwallex">{t('airwallex')}</option>
          <option value="stripe">{t('stripe')}</option>
          <option value="tab">{t('tab')}</option>
        </select>
      </div>

      <div className="text-xs text-gray-600">
        {t('showingOfPayments', { count: filteredPayments.length, total: payments.length })}
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('date')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('source')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('reference')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('client')}</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{t('amount')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('method')}</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('txnRef')}</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPayments.map((payment) => (
                <tr key={`${payment.source}-${payment.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {payment.payment_date
                      ? new Date(payment.payment_date).toLocaleDateString()
                      : '-'
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      payment.source === 'invoice'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {payment.source === 'invoice' ? (
                        <FileText className="w-3 h-3" />
                      ) : (
                        <MapPin className="w-3 h-3" />
                      )}
                      {payment.source === 'invoice' ? t('invoice') : t('itinerary')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={getSourceLink(payment)}
                      className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {payment.source_reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{payment.client_name}</div>
                    {payment.client_email && (
                      <div className="text-xs text-gray-500">{payment.client_email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-green-600">
                      {getCurrencySymbol(payment.currency)}{payment.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {getMethodLabel(payment.payment_method)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                    {payment.transaction_reference || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center">
                      <Link
                        href={getSourceLink(payment)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title={payment.source === 'invoice' ? t('invoice') : t('itinerary')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredPayments.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-base font-medium text-gray-900">{t('noPaymentsFound')}</p>
            <p className="mt-2 text-sm text-gray-600">
              <Link href="/payments/new" className="text-primary-600 hover:underline">
                {t('recordFirstPayment')}
              </Link>
              {' '}{t('orCreateInvoice')}{' '}
              <Link href="/invoices" className="text-primary-600 hover:underline">
                {t('invoice')}
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
