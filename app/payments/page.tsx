'use client'

import { useEffect, useState } from 'react'
import { 
  DollarSign, 
  TrendingUp, 
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Search
} from 'lucide-react'
import Link from 'next/link'

interface Payment {
  id: string
  itinerary_id: string
  itinerary_code: string
  client_name: string
  payment_type: string
  amount: number
  currency: string
  payment_method: string
  payment_status: string
  transaction_reference: string
  payment_date: string
  due_date: string
  notes: string
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
  
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchPayments()
  }, [])

  useEffect(() => {
    filterPayments()
  }, [payments, statusFilter, searchQuery])

  const fetchPayments = async () => {
    try {
      const response = await fetch('/api/payments')
      const data = await response.json()
      
      if (data.success) {
        setPayments(data.data)
        calculateStats(data.data)
      }
    } catch (error) {
      console.error('Error fetching payments:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (paymentsData: Payment[]) => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    
    // Count completed, deposit_received, and partially_paid as received
    const receivedStatuses = ['completed', 'deposit_received', 'partially_paid']
    
    const totalReceived = paymentsData
      .filter(p => receivedStatuses.includes(p.payment_status))
      .reduce((sum, p) => sum + p.amount, 0)
    
    const pendingPayments = paymentsData
      .filter(p => p.payment_status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0)
    
    const overduePayments = paymentsData
      .filter(p => p.payment_status === 'pending' && p.due_date && new Date(p.due_date) < now)
      .reduce((sum, p) => sum + p.amount, 0)
    
    const thisMonthRevenue = paymentsData
      .filter(p => receivedStatuses.includes(p.payment_status) && p.payment_date && new Date(p.payment_date) >= startOfMonth)
      .reduce((sum, p) => sum + p.amount, 0)
  
    setStats({
      totalReceived,
      pendingPayments,
      overduePayments,
      thisMonthRevenue
    })
  }

  const filterPayments = () => {
    let filtered = payments

    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.payment_status === statusFilter)
    }

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.client_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.itinerary_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.transaction_reference?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredPayments(filtered)
  }

  const getStatusColor = (status: string) => {
    const colors: any = {
      completed: 'bg-success/10 text-success',
      pending: 'bg-orange-100 text-orange-700',
      failed: 'bg-danger/10 text-danger',
      refunded: 'bg-gray-100 text-gray-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  const getPaymentTypeLabel = (type: string) => {
    const labels: any = {
      deposit: 'Deposit',
      installment: 'Installment',
      final: 'Final Payment',
      full: 'Full Payment'
    }
    return labels[type] || type
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
          <p className="text-sm text-gray-600 mt-1">Manage payments and cash flow</p>
        </div>
        <Link
          href="/payments/record"
          className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center gap-2 font-medium"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-success" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Total Received</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            €{stats.totalReceived.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">All completed payments</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Pending Payments</h3>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            €{stats.pendingPayments.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">Awaiting payment</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-gray-400" />
            <div className="w-1.5 h-1.5 rounded-full bg-danger" />
          </div>
          <h3 className="text-xs text-gray-600 font-medium">Overdue</h3>
          <p className="text-2xl font-bold text-danger mt-1">
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
            placeholder="Search by client, itinerary code, or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
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
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Itinerary</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
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
                    <div className="text-sm font-medium text-gray-900">{payment.client_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-mono text-primary-600">{payment.itinerary_code}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {getPaymentTypeLabel(payment.payment_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-bold text-gray-900">
                      {payment.currency} {payment.amount.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                    {payment.payment_method?.replace('_', ' ') || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(payment.payment_status)}`}>
                      {payment.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center">
                      <Link
                        href={`/payments/${payment.id}`}
                        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                      >
                        View
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
            <p className="mt-2 text-sm text-gray-600">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  )
}