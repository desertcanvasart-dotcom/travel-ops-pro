'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, Edit, Trash2, FileText, Calendar, DollarSign, CreditCard } from 'lucide-react'

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
  created_at: string
}

export default function PaymentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('payments.detail')
  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    if (params.id) {
      fetchPayment(params.id as string)
    }
  }, [params.id])

  const fetchPayment = async (id: string) => {
    try {
      const response = await fetch(`/api/payments/${id}`)
      const data = await response.json()
      
      if (data.success) {
        setPayment(data.data)
      }
    } catch (error) {
      console.error('Error fetching payment:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      setTimeout(() => setDeleteConfirm(false), 3000)
      return
    }

    try {
      const response = await fetch(`/api/payments/${params.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        router.push('/payments')
      } else {
        alert('Failed to delete payment: ' + data.error)
      }
    } catch (error) {
      console.error('Error deleting payment:', error)
      alert('Failed to delete payment')
    }
  }

  const getStatusColor = (status: string) => {
    const colors: any = {
      completed: 'bg-success/10 text-success',
      pending: 'bg-orange-100 text-orange-700',
      deposit_received: 'bg-blue-100 text-blue-700',
      partially_paid: 'bg-purple-100 text-purple-700',
      partially_refunded: 'bg-yellow-100 text-yellow-700',
      failed: 'bg-danger/10 text-danger',
      refunded: 'bg-gray-100 text-gray-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  const getPaymentTypeLabel = (type: string) => {
    return t(`types.${type}` as any)
  }

  const getPaymentStatusLabel = (status: string) => {
    return t(`statuses.${status}` as any)
  }

  const getPaymentMethodLabel = (method: string) => {
    return t(`methods.${method}` as any)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">{t('loading')}</p>
        </div>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-3">{t('paymentNotFound')}</h1>
          <Link href="/payments" className="text-sm text-primary-600 hover:text-primary-700">
            ← {t('backToPayments')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
            <p className="text-sm text-gray-600 mt-1">{t('subtitle')}</p>
          </div>
          <Link
            href="/payments"
            className="bg-gray-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToPayments')}
          </Link>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Header Section - White background with colored text */}
          <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-gray-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                  <h2 className="text-2xl font-bold text-gray-900">
                    {payment.currency} {payment.amount.toFixed(2)}
                  </h2>
                </div>
                <p className="text-sm text-gray-600">
                  {getPaymentTypeLabel(payment.payment_type)} {t('payment')}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-lg text-sm ${getStatusColor(payment.payment_status)} font-semibold capitalize`}>
                {getPaymentStatusLabel(payment.payment_status)}
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Client Info */}
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary-600" />
                  {t('clientItinerary')}
                </h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600">{t('clientName')}</label>
                    <p className="text-sm font-medium text-gray-900">{payment.client_name}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{t('itineraryCode')}</label>
                    <Link
                      href={`/itineraries/${payment.itinerary_id}`}
                      className="text-sm font-mono text-primary-600 hover:text-primary-700 block"
                    >
                      {payment.itinerary_code}
                    </Link>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary-600" />
                  {t('paymentInformation')}
                </h3>
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600">{t('paymentMethod')}</label>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {getPaymentMethodLabel(payment.payment_method)}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{t('transactionReference')}</label>
                    <p className="text-sm font-mono text-gray-900">
                      {payment.transaction_reference || t('notAvailable')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="border-t border-gray-200 pt-4 mb-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-primary-600" />
                {t('dates')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-600">{t('paymentDate')}</label>
                  <p className="text-sm font-medium text-gray-900">
                    {payment.payment_date
                      ? new Date(payment.payment_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })
                      : t('notSet')
                    }
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-600">{t('dueDate')}</label>
                  <p className="text-sm font-medium text-gray-900">
                    {payment.due_date
                      ? new Date(payment.due_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })
                      : t('notSet')
                    }
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-600">{t('createdAt')}</label>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(payment.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Notes */}
            {payment.notes && (
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-base font-semibold text-gray-900 mb-2">{t('notes')}</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{payment.notes}</p>
              </div>
            )}
          </div>
          
          {/* Actions Footer */}
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <button
              onClick={handleDelete}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                deleteConfirm
                  ? 'bg-danger text-white hover:bg-danger/90'
                  : 'bg-danger/10 text-danger hover:bg-danger/20'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              {deleteConfirm ? t('clickToConfirm') : t('deletePayment')}
            </button>

            <div className="flex items-center gap-2">
              <Link
                href={`/documents/receipt/${payment.id}`}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {t('viewReceipt')}
              </Link>

              <Link
                href={`/documents/invoice/${payment.id}`}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {t('viewInvoice')}
              </Link>

              <Link
                href={`/payments/${payment.id}/edit`}
                className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 font-medium flex items-center gap-2"
              >
                <Edit className="w-4 h-4" />
                {t('editPayment')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}