'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Briefcase,
  Search,
  Calendar,
  Users,
  ChevronRight,
  Loader2,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  PlayCircle,
  Filter
} from 'lucide-react'
import { Booking, BookingStatus, BOOKING_STATUS_CONFIG, statusChip } from '@/types/bookings'

export default function BookingsPage() {
  const t = useTranslations('bookings')

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    supplier_confirmed: 0,
    payment_received: 0,
    ready: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0
  })

  useEffect(() => {
    fetchBookings()
  }, [statusFilter])

  const fetchBookings = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }

      const response = await fetch(`/api/bookings?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setBookings(data.data || [])
        setSummary(data.summary || summary)
      }
    } catch (error) {
      console.error('Error fetching bookings:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredBookings = bookings.filter(booking => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      booking.booking_code.toLowerCase().includes(search) ||
      booking.client_name.toLowerCase().includes(search) ||
      booking.trip_name.toLowerCase().includes(search)
    )
  })

  const getStatusIcon = (status: BookingStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />
      case 'supplier_confirmed':
        return <CheckCircle2 className="w-4 h-4" />
      case 'payment_received':
        return <CheckCircle2 className="w-4 h-4" />
      case 'ready':
        return <CheckCircle2 className="w-4 h-4" />
      case 'in_progress':
        return <PlayCircle className="w-4 h-4" />
      case 'completed':
        return <CheckCircle2 className="w-4 h-4" />
      case 'cancelled':
        return <XCircle className="w-4 h-4" />
      default:
        return <AlertCircle className="w-4 h-4" />
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  const getDaysUntilStart = (startDate: string) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const diffTime = start.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-[#647C47]" />
            {t('title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
        <button
          onClick={() => setStatusFilter('all')}
          className={`bg-white rounded-lg p-4 border-2 transition-colors ${
            statusFilter === 'all' ? 'border-[#647C47]' : 'border-transparent'
          }`}
        >
          <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
          <p className="text-xs text-gray-500">{t('summary.total')}</p>
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`bg-white rounded-lg p-4 border-2 transition-colors ${
            statusFilter === 'pending' ? 'border-gray-400' : 'border-transparent'
          }`}
        >
          <p className="text-2xl font-bold text-gray-600">{summary.pending}</p>
          <p className="text-xs text-gray-500">{t('status.pending')}</p>
        </button>
        <button
          onClick={() => setStatusFilter('supplier_confirmed')}
          className={`bg-white rounded-lg p-4 border-2 transition-colors ${
            statusFilter === 'supplier_confirmed' ? 'border-blue-400' : 'border-transparent'
          }`}
        >
          <p className="text-2xl font-bold text-blue-600">{summary.supplier_confirmed}</p>
          <p className="text-xs text-gray-500">{t('status.supplier_confirmed')}</p>
        </button>
        <button
          onClick={() => setStatusFilter('ready')}
          className={`bg-white rounded-lg p-4 border-2 transition-colors ${
            statusFilter === 'ready' ? 'border-green-400' : 'border-transparent'
          }`}
        >
          <p className="text-2xl font-bold text-green-600">{summary.ready}</p>
          <p className="text-xs text-gray-500">{t('status.ready')}</p>
        </button>
        <button
          onClick={() => setStatusFilter('in_progress')}
          className={`bg-white rounded-lg p-4 border-2 transition-colors ${
            statusFilter === 'in_progress' ? 'border-purple-400' : 'border-transparent'
          }`}
        >
          <p className="text-2xl font-bold text-purple-600">{summary.in_progress}</p>
          <p className="text-xs text-gray-500">{t('status.in_progress')}</p>
        </button>
        <button
          onClick={() => setStatusFilter('completed')}
          className={`bg-white rounded-lg p-4 border-2 transition-colors ${
            statusFilter === 'completed' ? 'border-gray-400' : 'border-transparent'
          }`}
        >
          <p className="text-2xl font-bold text-gray-600">{summary.completed}</p>
          <p className="text-xs text-gray-500">{t('status.completed')}</p>
        </button>
        <button
          onClick={() => setStatusFilter('cancelled')}
          className={`bg-white rounded-lg p-4 border-2 transition-colors ${
            statusFilter === 'cancelled' ? 'border-red-400' : 'border-transparent'
          }`}
        >
          <p className="text-2xl font-bold text-red-600">{summary.cancelled}</p>
          <p className="text-xs text-gray-500">{t('status.cancelled')}</p>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-[#647C47] outline-none"
            >
              <option value="all">{t('filters.allStatuses')}</option>
              <option value="pending">{t('status.pending')}</option>
              <option value="supplier_confirmed">{t('status.supplier_confirmed')}</option>
              <option value="payment_received">{t('status.payment_received')}</option>
              <option value="ready">{t('status.ready')}</option>
              <option value="in_progress">{t('status.in_progress')}</option>
              <option value="completed">{t('status.completed')}</option>
              <option value="cancelled">{t('status.cancelled')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#647C47]" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">{t('noBookingsFound')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.bookingCode')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.client')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.tripName')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.dates')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('fields.passengers')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredBookings.map((booking) => {
                // Never index the config directly — an unfamiliar status must
                // show an unfamiliar label, not white-screen the list.
                const statusConfig = statusChip(booking.status, BOOKING_STATUS_CONFIG)
                const daysUntil = getDaysUntilStart(booking.start_date)

                return (
                  <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <span className="font-mono font-medium text-[#647C47]">{booking.booking_code}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{booking.client_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-gray-700">{booking.trip_name}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                          <span className="text-gray-700">{formatDate(booking.start_date)}</span>
                          {daysUntil >= 0 && daysUntil <= 7 && booking.status !== 'completed' && booking.status !== 'cancelled' && (
                            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                              daysUntil === 0 ? 'bg-red-100 text-red-700' :
                              daysUntil <= 3 ? 'bg-amber-100 text-amber-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {daysUntil === 0 ? 'Today' : `${daysUntil}d`}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-gray-700">
                        {booking.num_adults} {t('adults')}{booking.num_children > 0 && `, ${booking.num_children} ${t('children')}`}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                        {getStatusIcon(booking.status)}
                        {statusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/bookings/${booking.id}`}
                        className="flex items-center gap-1 text-[#647C47] hover:text-[#4a5c35] font-medium text-sm"
                      >
                        {t('actions.view')}
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
