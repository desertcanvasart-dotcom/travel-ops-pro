'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Users,
  MapPin,
  CreditCard,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Phone,
  Mail,
  Building2,
  Truck,
  User,
  Utensils,
  Ticket,
  Ship,
  Plane,
  MoreHorizontal,
  Plus,
  DollarSign,
  Receipt,
  RefreshCw,
  X
} from 'lucide-react'
import {
  BookingWithDetails,
  BookingSupplierStatus,
  BookingPayment,
  BOOKING_STATUS_CONFIG,
  SUPPLIER_STATUS_CONFIG,
  PAYMENT_STATUS_CONFIG,
  SupplierConfirmationStatus
} from '@/types/bookings'
import GenerateDocumentsButton from '@/app/components/GenerateDocumentsButton'
import { SUPPLIER_TYPE_GROUPS, supplierTypeLabel } from '@/lib/supplier-types'
import SupplierPicker from '@/components/rates/SupplierPicker'
import AddExpenseFromItinerary from '@/components/AddExpenseFromItinerary'
import PassengerManifest from '@/components/PassengerManifest'
import SendConfirmationButton from '@/components/SendConfirmationButton'
import PortalLinkCard from '@/app/components/PortalLinkCard'
import InsuranceCard from '@/app/components/InsuranceCard'

type TabType = 'overview' | 'suppliers' | 'payments' | 'passengers' | 'notes'

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const t = useTranslations('bookings')
  const tCommon = useTranslations('common')

  const [booking, setBooking] = useState<BookingWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [updating, setUpdating] = useState(false)

  // Every invoice raised for this booking's trip, with the payments recorded
  // against them. A trip normally has two — a deposit and a final — so showing
  // only the first would hide half the money.
  const [tripInvoices, setTripInvoices] = useState<any[]>([])
  const linkedInvoice = tripInvoices[0] || null

  // Payments live on the INVOICE (invoice_payments); booking_payments is a
  // separate, older table that is empty in practice. The tab listed only the
  // latter, so a paid invoice showed "no payments yet". Both are merged here.
  const tripPayments = [
    ...tripInvoices.flatMap((inv: any) =>
      (inv.invoice_payments || []).map((p: any) => ({
        ...p,
        payment_type: p.payment_type || 'payment',
        currency: p.currency || inv.currency,
        invoice_number: inv.invoice_number,
      }))
    ),
    ...((booking?.payments || []) as any[]),
  ].sort((a, b) => String(b.payment_date || '').localeCompare(String(a.payment_date || '')))

  // Supplier modal state
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [supplierForm, setSupplierForm] = useState({
    supplier_type: 'hotel',
    supplier_id: '',
    supplier_name: '',
    service_description: '',
    service_date: '',
    quoted_cost: ''
  })

  useEffect(() => {
    fetchBooking()
  }, [resolvedParams.id])

  const fetchBooking = async () => {
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}`)
      const data = await response.json()

      if (data.success) {
        setBooking(data.data)

        // Fetch this trip's invoices, with their payments embedded.
        // This read used to look for `invoiceData.invoices` — a key the API has
        // never returned; it responds with a bare array. So no invoice was ever
        // found, and the Payments tab said "Invoice Required" on bookings that
        // had been invoiced and paid.
        if (data.data.itinerary_id) {
          const invoiceRes = await fetch(`/api/invoices?itineraryId=${data.data.itinerary_id}&include=payments`)
          const invoiceData = await invoiceRes.json()
          const list = Array.isArray(invoiceData) ? invoiceData : (invoiceData.data || invoiceData.invoices || [])
          setTripInvoices(list)
        } else {
          setTripInvoices([])
        }
      }
    } catch (error) {
      console.error('Error fetching booking:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateSupplierStatus = async (supplierId: string, status: SupplierConfirmationStatus, confirmationNumber?: string) => {
    setUpdating(true)
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: supplierId,
          status,
          confirmation_number: confirmationNumber
        })
      })

      if (response.ok) {
        fetchBooking()
      }
    } catch (error) {
      console.error('Error updating supplier:', error)
    } finally {
      setUpdating(false)
    }
  }

  const updateBookingStatus = async (newStatus: string) => {
    setUpdating(true)
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        fetchBooking()
      }
    } catch (error) {
      console.error('Error updating status:', error)
    } finally {
      setUpdating(false)
    }
  }

  const syncSuppliers = async () => {
    setSyncing(true)
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}/sync-suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()
      if (data.success) {
        // Show message about what was synced
        if (data.data?.added === 0) {
          alert(data.message || 'No new services found to sync')
        } else {
          alert(`Synced ${data.data?.added} supplier(s) from itinerary`)
        }
        fetchBooking()
      } else {
        alert(`Sync failed: ${data.error || 'Unknown error'}`)
        console.error('Sync error:', data.error)
      }
    } catch (error) {
      console.error('Error syncing suppliers:', error)
      alert('Error syncing suppliers. Check console for details.')
    } finally {
      setSyncing(false)
    }
  }

  // The Notes tab rendered both fields as text with nothing to edit them —
  // the columns and the PUT endpoint have always been there.
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState({ special_requests: '', operational_notes: '' })
  const [savingNotes, setSavingNotes] = useState(false)

  const startEditingNotes = () => {
    setNotesDraft({
      special_requests: booking?.special_requests || '',
      operational_notes: booking?.operational_notes || '',
    })
    setEditingNotes(true)
  }

  const saveNotes = async () => {
    setSavingNotes(true)
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          special_requests: notesDraft.special_requests.trim() || null,
          operational_notes: notesDraft.operational_notes.trim() || null,
        }),
      })
      if (response.ok) {
        setEditingNotes(false)
        fetchBooking()
      }
    } finally {
      setSavingNotes(false)
    }
  }

  const addSupplier = async () => {
    if (!supplierForm.supplier_name) return

    setUpdating(true)
    try {
      const response = await fetch(`/api/bookings/${resolvedParams.id}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_type: supplierForm.supplier_type,
          supplier_id: supplierForm.supplier_id || null,
          supplier_name: supplierForm.supplier_name,
          service_description: supplierForm.service_description || null,
          service_date: supplierForm.service_date || null,
          quoted_cost: supplierForm.quoted_cost ? parseFloat(supplierForm.quoted_cost) : null
        })
      })

      if (response.ok) {
        setShowSupplierModal(false)
        setSupplierForm({
          supplier_type: 'hotel',
          supplier_id: '',
          supplier_name: '',
          service_description: '',
          service_date: '',
          quoted_cost: ''
        })
        fetchBooking()
      }
    } catch (error) {
      console.error('Error adding supplier:', error)
    } finally {
      setUpdating(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  }

  const formatCurrency = (amount: number, currency = 'EUR') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2
    }).format(amount)
  }

  const getSupplierIcon = (type: string) => {
    switch (type) {
      case 'hotel': return <Building2 className="w-4 h-4" />
      case 'guide': return <User className="w-4 h-4" />
      case 'transport': return <Truck className="w-4 h-4" />
      case 'restaurant': return <Utensils className="w-4 h-4" />
      case 'entrance': return <Ticket className="w-4 h-4" />
      case 'cruise': return <Ship className="w-4 h-4" />
      case 'flight': return <Plane className="w-4 h-4" />
      default: return <MoreHorizontal className="w-4 h-4" />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#647C47]" />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">{t('bookingNotFound')}</p>
          <Link href="/bookings" className="text-[#647C47] hover:underline mt-2 inline-block">
            {t('detail.backToList')}
          </Link>
        </div>
      </div>
    )
  }

  // A status outside the config vocabulary used to take the WHOLE page down
  // with "cannot read properties of undefined". Nothing in the database
  // constrains these columns, so one unexpected value — from an import, a
  // migration, or another service — white-screened a booking rather than
  // showing an unfamiliar label.
  const UNKNOWN = { label: booking.status ?? 'Unknown', color: 'text-gray-600', bgColor: 'bg-gray-100' }
  const statusConfig = BOOKING_STATUS_CONFIG[booking.status] ?? UNKNOWN
  const paymentStatusConfig =
    PAYMENT_STATUS_CONFIG[booking.payment_status] ??
    { ...UNKNOWN, label: booking.payment_status ?? 'Unknown' }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header - Two Row Layout */}
      <div className="bg-white rounded-xl shadow-sm border mb-6 p-4">
        {/* Row 1: Booking Info & Status */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <Link href="/bookings" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-gray-900">{booking.booking_code}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-sm text-gray-500">{booking.client_name} - {booking.trip_name}</p>
            </div>
          </div>

          {/* Status Dropdown */}
          <select
            value={booking.status}
            onChange={(e) => updateBookingStatus(e.target.value)}
            disabled={updating}
            title={t('fields.status')}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          >
            <option value="pending">{t('status.pending')}</option>
            <option value="supplier_confirmed">{t('status.supplier_confirmed')}</option>
            <option value="payment_received">{t('status.payment_received')}</option>
            <option value="ready">{t('status.ready')}</option>
            <option value="in_progress">{t('status.in_progress')}</option>
            <option value="completed">{t('status.completed')}</option>
            <option value="cancelled">{t('status.cancelled')}</option>
          </select>
        </div>

        {/* Row 2: Action Buttons */}
        {booking.itinerary && (
          <div className="pt-4 flex flex-wrap items-center gap-3">
            {/* Primary Actions - Filled */}
            <Link
              href={`/invoices?itineraryId=${booking.itinerary.id}`}
              className="px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors flex items-center gap-2"
            >
              <Receipt className="w-4 h-4" />
              {t('actions.invoice')}
            </Link>

            <GenerateDocumentsButton
              itineraryId={booking.itinerary.id}
              itineraryCode={booking.itinerary.itinerary_code}
            />

            <AddExpenseFromItinerary
              itineraryId={booking.itinerary.id}
              itineraryCode={booking.itinerary.itinerary_code}
              clientName={booking.client_name}
            />

            {/* Secondary Actions - Outlined */}
            <Link
              href={`/documents/contract/${booking.itinerary.id}`}
              className="px-4 py-2 text-sm font-medium border border-[#647C47] text-[#647C47] rounded-lg hover:bg-[#e8ede3] transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {t('actions.contract')}
            </Link>

            <Link
              href={`/itineraries/${booking.itinerary.id}`}
              className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {t('actions.viewItinerary')}
            </Link>

            <SendConfirmationButton bookingId={resolvedParams.id} />
          </div>
        )}
      </div>

      {/* The traveller's own link — mint, copy, revoke. */}
      <PortalLinkCard bookingId={resolvedParams.id} />
      <InsuranceCard bookingId={resolvedParams.id} />

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border mb-6">
        <div className="border-b flex">
          {(['overview', 'suppliers', 'payments', 'passengers', 'notes'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#647C47] text-[#647C47]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Client Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {t('detail.clientInfo')}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{booking.client_name}</span>
                  </div>
                  {booking.client_email && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span>{booking.client_email}</span>
                    </div>
                  )}
                  {booking.client_phone && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{booking.client_phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trip Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {t('detail.tripDetails')}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>{formatDate(booking.start_date)} - {formatDate(booking.end_date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span>{booking.num_adults} adults{booking.num_children > 0 && `, ${booking.num_children} children`}</span>
                  </div>
                  {booking.tier && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Briefcase className="w-4 h-4 text-gray-400" />
                      <span className="capitalize">{booking.tier} tier</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {t('detail.paymentSummary')}
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('fields.totalCost')}</span>
                    <span className="font-bold">{formatCurrency(booking.total_cost, booking.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('fields.depositAmount')}</span>
                    <span className={booking.deposit_paid ? 'text-green-600' : 'text-gray-600'}>
                      {formatCurrency(booking.deposit_amount, booking.currency)}
                      {booking.deposit_paid && <CheckCircle2 className="w-4 h-4 inline ml-1" />}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{t('fields.balanceDue')}</span>
                    <span className="font-medium">{formatCurrency(booking.balance_due, booking.currency)}</span>
                  </div>
                  <div className="pt-2 border-t">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${paymentStatusConfig.bgColor} ${paymentStatusConfig.color}`}>
                      {paymentStatusConfig.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Supplier Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  {t('detail.supplierConfirmations')}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total Suppliers</span>
                    <span className="font-medium">{booking.supplier_summary?.total || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Confirmed</span>
                    <span className="text-green-600 font-medium">{booking.supplier_summary?.confirmed || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Pending</span>
                    <span className="text-amber-600 font-medium">{booking.supplier_summary?.pending || 0}</span>
                  </div>
                  {booking.supplier_summary?.total === booking.supplier_summary?.confirmed && (booking.supplier_summary?.total ?? 0) > 0 && (
                    <div className="pt-2 border-t">
                      <span className="text-green-600 text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        {t('messages.allSuppliersConfirmed')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Suppliers Tab */}
          {activeTab === 'suppliers' && (
            <div>
              {/* Action buttons */}
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-gray-900">{t('tabs.suppliers')}</h3>
                <div className="flex gap-2">
                  {booking.itinerary && (
                    <button
                      type="button"
                      onClick={syncSuppliers}
                      disabled={syncing}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : t('actions.syncFromItinerary')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSupplierModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    {t('actions.addSupplier')}
                  </button>
                </div>
              </div>

              {!booking.suppliers || booking.suppliers.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                  <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-2">{t('messages.noSuppliersYet')}</p>
                  <p className="text-gray-400 text-sm mb-4 max-w-md mx-auto">
                    {t('messages.syncSuppliersHint')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                    {booking.itinerary && (
                      <>
                        <button
                          type="button"
                          onClick={syncSuppliers}
                          disabled={syncing}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#e8ede3] text-[#4f6238] rounded-lg hover:bg-[#d9e2cf] text-sm disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                          {syncing ? 'Syncing...' : t('actions.syncFromItinerary')}
                        </button>
                        <Link
                          href={`/itineraries/${booking.itinerary.id}/edit`}
                          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                        >
                          <FileText className="w-4 h-4" />
                          {t('actions.editItinerary')}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conf #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {booking.suppliers.map((supplier) => {
                      const supplierStatusConfig = SUPPLIER_STATUS_CONFIG[supplier.status]
                      return (
                        <tr key={supplier.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {getSupplierIcon(supplier.supplier_type)}
                              <span className="text-sm">{supplierTypeLabel(supplier.supplier_type)}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{supplier.supplier_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {supplier.service_date ? formatDate(supplier.service_date) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${supplierStatusConfig.bgColor} ${supplierStatusConfig.color}`}>
                              {supplierStatusConfig.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                            {supplier.confirmation_number || '-'}
                          </td>
                          <td className="px-4 py-3">
                            {supplier.status !== 'confirmed' && (
                              <button
                                type="button"
                                onClick={() => {
                                  const confNum = prompt('Enter confirmation number (optional):')
                                  updateSupplierStatus(supplier.id, 'confirmed', confNum || undefined)
                                }}
                                disabled={updating}
                                className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
                              >
                                {t('actions.markSupplierConfirmed')}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <div>
              {/* Invoice Required Check */}
              {!linkedInvoice ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                  <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-900 font-medium mb-2">{t('messages.invoiceRequiredTitle')}</p>
                  <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
                    {t('messages.invoiceRequiredDescription')}
                  </p>
                  {booking.itinerary && (
                    <Link
                      href={`/invoices?itineraryId=${booking.itinerary.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] text-sm font-medium"
                    >
                      <Receipt className="w-4 h-4" />
                      {t('actions.createInvoice')}
                    </Link>
                  )}
                </div>
              ) : (
                <>
                  <div className="mb-6 space-y-2">
                    {/* What has been billed and what is settled — an invoice
                        marked paid without an itemised payment row still has to
                        show as money received. */}
                    {tripInvoices.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3 min-w-0">
                          <Link href={`/invoices/${inv.id}`} className="text-sm font-medium text-[#647C47] hover:underline flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" />
                            {inv.invoice_number}
                          </Link>
                          <span className="text-xs text-gray-500 capitalize">{inv.invoice_type || 'standard'}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 capitalize">{inv.status}</span>
                        </div>
                        <div className="text-sm text-gray-700 whitespace-nowrap">
                          {formatCurrency(Number(inv.amount_paid) || 0, inv.currency)}
                          <span className="text-gray-400"> paid of </span>
                          {formatCurrency(Number(inv.total_amount) || 0, inv.currency)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900">Payment History</h3>
                    </div>
                    <Link
                      href={`/invoices/${linkedInvoice.id}#payments`}
                      className="flex items-center gap-2 px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      {t('actions.recordPayment')}
                    </Link>
                  </div>

                  {tripPayments.length === 0 ? (
                    <div className="text-center py-12">
                      <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">{t('messages.noPaymentsYet')}</p>
                      <p className="text-gray-400 text-sm mt-2">{t('messages.paymentsLinkedToInvoice')}</p>
                    </div>
                  ) : (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tripPayments.map((payment: any) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(payment.payment_date)}</td>
                        <td className="px-4 py-3">
                          <span className="capitalize text-sm">{payment.payment_type}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                          {payment.payment_method?.replace('_', ' ') || '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${
                          payment.payment_type === 'refund' ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {payment.payment_type === 'refund' ? '-' : '+'}
                          {formatCurrency(payment.amount, payment.currency)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                          {payment.transaction_reference || '-'}
                          {payment.invoice_number && (
                            <span className="ml-2 text-xs text-gray-400 font-sans">{payment.invoice_number}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-medium">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right">Total Received:</td>
                      <td className="px-4 py-3 text-right text-green-600">
                        {formatCurrency(
                          tripPayments.reduce((sum: number, p: any) => sum + (p.payment_type === 'refund' ? -Number(p.amount || 0) : Number(p.amount || 0)), 0),
                          tripPayments[0]?.currency || booking.currency
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                  )}
                </>
              )}
            </div>
          )}

          {/* Notes Tab */}
          {activeTab === 'passengers' && (
            <PassengerManifest bookingId={resolvedParams.id} />
          )}

          {activeTab === 'notes' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="lg:col-span-2 flex justify-end">
                {editingNotes ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingNotes(false)}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      {tCommon('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={saveNotes}
                      disabled={savingNotes}
                      className="px-4 py-1.5 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
                    >
                      {savingNotes ? tCommon('saving') : tCommon('save')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startEditingNotes}
                    className="px-4 py-1.5 text-sm font-medium border border-[#647C47] text-[#647C47] rounded-lg hover:bg-[#e8ede3]"
                  >
                    {tCommon('edit')}
                  </button>
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-3">{t('fields.specialRequests')}</h3>
                {editingNotes ? (
                  <textarea
                    value={notesDraft.special_requests}
                    onChange={(e) => setNotesDraft(prev => ({ ...prev, special_requests: e.target.value }))}
                    rows={6}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                    placeholder="What the client has asked for — dietary needs, room preferences, anything the trip must respect."
                  />
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 min-h-32">
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {booking.special_requests || 'No special requests recorded.'}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-3">{t('fields.operationalNotes')}</h3>
                {editingNotes ? (
                  <textarea
                    value={notesDraft.operational_notes}
                    onChange={(e) => setNotesDraft(prev => ({ ...prev, operational_notes: e.target.value }))}
                    rows={6}
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#647C47]"
                    placeholder="For the team running the trip — pickup quirks, who to call, what went wrong last time."
                  />
                ) : (
                  <div className="bg-gray-50 rounded-lg p-4 min-h-32">
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {booking.operational_notes || 'No operational notes.'}
                    </p>
                  </div>
                )}
              </div>
              {booking.emergency_contact && (
                <div className="lg:col-span-2">
                  <h3 className="font-medium text-gray-900 mb-3">{t('fields.emergencyContact')}</h3>
                  <div className="bg-amber-50 rounded-lg p-4 flex items-center gap-4">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-800">{booking.emergency_contact}</p>
                      {booking.emergency_phone && (
                        <p className="text-sm text-amber-600">{booking.emergency_phone}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('actions.addSupplier')}</h2>
              <button type="button" onClick={() => setShowSupplierModal(false)} className="p-1 hover:bg-gray-100 rounded" title="Close">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('fields.supplierType')}</label>
                <select
                  value={supplierForm.supplier_type}
                  onChange={(e) => setSupplierForm({ ...supplierForm, supplier_type: e.target.value })}
                  title={t('fields.supplierType')}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  {SUPPLIER_TYPE_GROUPS.map(({ group, options }) => (
                    <optgroup key={group} label={group}>
                      {options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {/* Choosing from the roster records WHICH supplier, not just a
                  name typed twice — booking_supplier_status has carried a
                  supplier_id all along and this modal never set it. The name
                  stays editable for a one-off nobody has on file yet. */}
              <SupplierPicker
                value={supplierForm.supplier_id}
                onChange={(supplier_id, supplier) => setSupplierForm(prev => ({
                  ...prev,
                  supplier_id,
                  supplier_name: supplier?.name || prev.supplier_name,
                }))}
                preferredType={supplierForm.supplier_type}
                preferredLabel={supplierTypeLabel(supplierForm.supplier_type)}
                label={t('fields.supplierName')}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('fields.supplierName')} *</label>
                <input
                  type="text"
                  value={supplierForm.supplier_name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, supplier_name: e.target.value, supplier_id: '' })}
                  placeholder="e.g., Marriott Mena House"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('fields.serviceDescription')}</label>
                <input
                  type="text"
                  value={supplierForm.service_description}
                  onChange={(e) => setSupplierForm({ ...supplierForm, service_description: e.target.value })}
                  placeholder="e.g., 2 nights deluxe room"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="supplier_service_date" className="block text-sm font-medium text-gray-700 mb-1">{t('fields.serviceDate')}</label>
                  <input
                    id="supplier_service_date"
                    type="date"
                    value={supplierForm.service_date}
                    onChange={(e) => setSupplierForm({ ...supplierForm, service_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('fields.quotedCost')}</label>
                  <input
                    type="number"
                    value={supplierForm.quoted_cost}
                    onChange={(e) => setSupplierForm({ ...supplierForm, quoted_cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex gap-3 justify-end rounded-b-lg">
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addSupplier}
                disabled={!supplierForm.supplier_name || updating}
                className="px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] disabled:opacity-50"
              >
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : t('actions.addSupplier')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
