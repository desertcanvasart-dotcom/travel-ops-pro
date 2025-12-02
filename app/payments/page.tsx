'use client'

import { useEffect, useState } from 'react'
import { 
  DollarSign, 
  TrendingUp, 
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  FileText,
  ExternalLink
} from 'lucide-react'
import Link from 'next/link'

interface Payment {
  id: string
  invoice_id: string
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  transaction_reference: string | null
  notes: string | null
  created_at: string
  // Joined from invoice
  invoice_number: string
  client_name: string
  client_email: string
  invoice_total: number
  invoice_status: string
}

interface PaymentStats {
  totalReceived: number
  pendingPayments: number
  overduePayments: number
  thisMonthRevenue: number
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<PaymentStats>({
    totalReceived: 0,
    pendingPayments: 0,
    overduePayments: 0,
    thisMonthRevenue: 0
  })
  
  const [methodFilter, setMethodFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchPayments()
    fetchStats()
  }, [])

  useEffect(() => {
    filterPayments()
  }, [payments, methodFilter, searchQuery])

  const fetchPayments = async () => {
    try {
      const response = await fetch('/api/payments')
      const data = await response.json()
      
      if (response.ok) {
        // Handle both old format (data.success/data.data) and new format (direct array)
        const paymentsData = data.success ? data.data : (Array.isArray(data) ? data : [])
        setPayments(paymentsData)
      }
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/invoices')
      if (response.ok) {
        const invoices = await response.json()
        
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        
        // Total received from all invoices
        const totalReceived = invoices.reduce((sum: number, inv: any) => sum + Number(inv.amount_paid || 0), 0)
        
        // Pending = balance due on sent/partial invoices
        const pendingPayments = invoices
          .filter((inv: any) => ['sent', 'partial', 'viewed'].includes(inv.status))
          .reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0)
        
        // Overdue
        const overduePayments = invoices
          .filter((inv: any) => {
            if (inv.status === 'paid' || inv.status === 'cancelled') return false
            if (!inv.due_date) return false
            return new Date(inv.due_date) < now && Number(inv.balance_due) > 0
          })
          .reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0)
        
        // This month - sum of payments made this month
        const thisMonthRevenue = payments
          .filter(p => p.payment_date && new Date(p.payment_date) >= startOfMonth)
          .reduce((sum, p) => sum + Number(p.amount), 0)
        
        setStats({
          totalReceived,
          pendingPayments,
          overduePayments,
          thisMonthRevenue
        })
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const filterPayments = () => {
    let filtered = payments

    if (methodFilter !== 'all') {
      filtered = filtered.filter(p => p.payment_method === methodFilter)
    }

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.transaction_reference?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredPayments(filtered)
  }

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      bank_transfer: 'Bank Transfer',
      credit_card: 'Credit Card',
      cash: 'Cash',
      paypal: 'PayPal',
      wise: 'Wise',
      airwallex: 'Airwallex',
      stripe: 'Stripe'
    }
    return labels[method] || method
  }

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
    return symbols[currency] || currency
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading payments...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Tracking</h1>
          <p className="text-sm text-gray-600 mt-1">All payments received against invoices</p>
        </div>
        <Link
          href="/invoices"
          className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center gap-2 font-medium"
        >
          <FileText className="w-4 h-4" />
          View Invoices
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Total Received</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            €{stats.totalReceived.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">All time payments</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Pending Payments</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            €{stats.pendingPayments.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Outstanding balance</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Overdue</h3>
          <p className="text-2xl font-bold text-red-600 mt-1">
            €{stats.overduePayments.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Past due date</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">This Month</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            €{stats.thisMonthRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Revenue this month</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by client, invoice #, or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Methods</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="credit_card">Credit Card</option>
          <option value="cash">Cash</option>
          <option value="paypal">PayPal</option>
          <option value="wise">Wise</option>
          <option value="airwallex">Airwallex</option>
          <option value="stripe">Stripe</option>
        </select>
      </div>

      <div className="text-xs text-gray-600">
        Showing <span className="font-bold">{filteredPayments.length}</span> of {payments.length} payments
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {payment.payment_date 
                      ? new Date(payment.payment_date).toLocaleDateString()
                      : '-'
                    }
                  </td>
                  <td className="px-4 py-3">
                    <Link 
                      href={`/invoices/${payment.invoice_id}`}
                      className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {payment.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{payment.client_name}</div>
                    <div className="text-xs text-gray-500">{payment.client_email}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-green-600">
                      {getCurrencySymbol(payment.currency)}{Number(payment.amount).toLocaleString()}
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
                        href={`/invoices/${payment.invoice_id}`}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="View Invoice"
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
            <p className="text-base font-medium text-gray-900">No payments found</p>
            <p className="mt-2 text-sm text-gray-600">
              Payments are recorded against invoices.{' '}
              <Link href="/invoices" className="text-primary-600 hover:underline">
                View invoices
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}