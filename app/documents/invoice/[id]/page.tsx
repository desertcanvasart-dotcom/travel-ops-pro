'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'

interface Payment {
  id: string
  itinerary_id: string
  itinerary_code: string
  client_name: string
  client_email: string
  payment_type: string
  amount: number
  currency: string
  payment_method: string
  payment_status: string
  transaction_reference: string
  payment_date: string
  created_at: string
  notes: string
}

export default function InvoicePage() {
  const params = useParams()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)

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

  const downloadPDF = async () => {
    try {
      const response = await fetch(`/api/documents/invoice/${params.id}`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice-${payment?.itinerary_code}-${payment?.transaction_reference || params.id}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      alert('Failed to download invoice')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading invoice...</p>
        </div>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-3">Payment Not Found</h1>
          <Link href="/payments" className="text-sm text-primary-600 hover:text-primary-700">
            ← Back to Payments
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/payments"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Payments
          </Link>
          <button
            onClick={downloadPDF}
            className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center gap-2 font-medium"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </button>
        </div>

        {/* Invoice Preview */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-primary-600 mb-2">INVOICE</h1>
              <p className="text-sm text-gray-600">Invoice #{payment.transaction_reference || payment.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-gray-900">Autoura</h2>
              <p className="text-sm text-gray-600">Travel2Egypt</p>
              <p className="text-sm text-gray-600">Cairo, Egypt</p>
              <p className="text-sm text-gray-600">info@travel2egypt.com</p>
            </div>
          </div>

          {/* Bill To */}
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-600 uppercase mb-2">Bill To</h3>
            <p className="text-base font-semibold text-gray-900">{payment.client_name}</p>
            {payment.client_email && (
              <p className="text-sm text-gray-600">{payment.client_email}</p>
            )}
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div>
              <p className="text-xs text-gray-600 mb-1">Invoice Date</p>
              <p className="text-sm font-semibold text-gray-900">
                {new Date(payment.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Payment Date</p>
              <p className="text-sm font-semibold text-gray-900">
                {payment.payment_date 
                  ? new Date(payment.payment_date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : 'Pending'
                }
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 mb-1">Itinerary</p>
              <p className="text-sm font-semibold text-gray-900 font-mono">{payment.itinerary_code}</p>
            </div>
          </div>

          {/* Line Items */}
          <div className="mb-8">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-2 text-xs font-semibold text-gray-600 uppercase">Description</th>
                  <th className="text-center py-2 text-xs font-semibold text-gray-600 uppercase">Payment Type</th>
                  <th className="text-center py-2 text-xs font-semibold text-gray-600 uppercase">Method</th>
                  <th className="text-right py-2 text-xs font-semibold text-gray-600 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="py-3 text-sm text-gray-900">
                    Payment for {payment.itinerary_code}
                    {payment.notes && (
                      <p className="text-xs text-gray-600 mt-1">{payment.notes}</p>
                    )}
                  </td>
                  <td className="py-3 text-center text-sm text-gray-900 capitalize">
                    {payment.payment_type.replace('_', ' ')}
                  </td>
                  <td className="py-3 text-center text-sm text-gray-900 capitalize">
                    {payment.payment_method.replace('_', ' ')}
                  </td>
                  <td className="py-3 text-right text-sm font-semibold text-gray-900">
                    {payment.currency} {payment.amount.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-2 border-b border-gray-200 text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold text-gray-900">
                  {payment.currency} {payment.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-2 bg-primary-50 px-3 mt-2 rounded-lg">
                <span className="text-base font-semibold text-gray-900">Total:</span>
                <span className="text-xl font-bold text-primary-600">
                  {payment.currency} {payment.amount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-success/10 text-success rounded-lg text-sm">
              <span className="font-semibold">Payment Status:</span>
              <span className="capitalize">{payment.payment_status.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Terms & Conditions</h4>
            <p className="text-xs text-gray-600">
              Payment is due within 30 days of invoice date. Late payments may incur additional fees.
              All services are subject to our standard terms and conditions.
            </p>
          </div>

          {/* Thank You */}
          <div className="text-center mt-8 pt-6 border-t border-gray-200">
            <p className="text-base font-semibold text-gray-900">Thank you for your business!</p>
            <p className="text-sm text-gray-600 mt-2">For questions, contact us at info@travel2egypt.com</p>
          </div>
        </div>
      </div>
    </div>
  )
}