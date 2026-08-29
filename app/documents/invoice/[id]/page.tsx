'use client'

import { useEffect, useState } from 'react'
import { useCompanyInfo } from '@/lib/use-company-info'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2, FileText, Calendar, CreditCard, Eye } from 'lucide-react'
import { generateInvoicePDF, downloadInvoicePDF } from '@/lib/invoice-pdf-generator'
import { fetchCompanyInfo } from '@/lib/company-info-client'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import PDFPreviewModal from '@/app/components/PDFPreviewModal'

interface Payment {
  id: string
  itinerary_id: string
  itinerary_code: string
  client_name: string
  client_email?: string
  payment_type: string
  amount: number
  currency: string
  payment_method: string
  payment_status: string
  transaction_reference: string
  payment_date: string
  due_date?: string
  notes: string
  created_at: string
}

export default function InvoicePage() {
  // The operator's own letterhead — the PDF already used it; the preview did not.
  const company = useCompanyInfo()
  const t = useTranslations('invoice')
  const dialog = useConfirmDialog()
  const params = useParams()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null)
  const [showPdfPreview, setShowPdfPreview] = useState(false)

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

  const buildInvoiceData = (p: Payment) => {
    const invoiceNumber = `INV-${p.itinerary_code}-${p.id.slice(0, 4).toUpperCase()}`
    return {
      id: p.id,
      invoice_number: invoiceNumber,
      invoice_type: p.payment_type === 'deposit' ? 'deposit' as const :
                    p.payment_type === 'final' ? 'final' as const :
                    'standard' as const,
      deposit_percent: p.payment_type === 'deposit' ? 30 : undefined,
      parent_invoice_id: null,
      client_name: p.client_name,
      client_email: p.client_email || '',
      line_items: [{
        description: `Payment for ${p.itinerary_code}`,
        quantity: 1,
        unit_price: p.amount,
        amount: p.amount
      }],
      subtotal: p.amount,
      tax_rate: 0,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: p.amount,
      currency: p.currency,
      amount_paid: p.payment_status === 'completed' ? p.amount : 0,
      balance_due: p.payment_status === 'completed' ? 0 : p.amount,
      status: p.payment_status === 'completed' ? 'paid' : 'sent',
      issue_date: p.created_at,
      due_date: p.due_date || p.payment_date || new Date().toISOString(),
      notes: p.notes,
      payment_terms: '30% deposit required to confirm booking. Balance due upon arrival.',
      payment_instructions: 'Payment accepted via bank transfer or credit card.'
    }
  }

  const handlePreviewPDF = async () => {
    if (!payment) return

    setDownloading(true)
    try {
      const invoiceData = buildInvoiceData(payment)
      const doc = generateInvoicePDF(invoiceData, await fetchCompanyInfo())
      const blob = doc.output('blob')
      setPdfPreviewBlob(blob)
      setShowPdfPreview(true)
    } catch (error) {
      console.error('Error generating PDF:', error)
      dialog.alert(t('error'), t('failedToDownloadInvoice'), 'warning')
    } finally {
      setDownloading(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-green-100 text-green-700',
      paid: 'bg-green-100 text-green-700',
      pending: 'bg-orange-100 text-orange-700',
      sent: 'bg-blue-100 text-blue-700',
      draft: 'bg-gray-100 text-gray-700',
      overdue: 'bg-red-100 text-red-700'
    }
    return colors[status] || 'bg-gray-100 text-gray-700'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">{t('loadingInvoice')}</p>
        </div>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-3">{t('invoiceNotFound')}</h1>
          <Link href="/payments" className="text-sm text-primary-600 hover:text-primary-700">
            ← {t('backToPayments')}
          </Link>
        </div>
      </div>
    )
  }

  const invoiceNumber = `INV-${payment.itinerary_code}-${payment.id.slice(0, 4).toUpperCase()}`
  const isPaid = payment.payment_status === 'completed'

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/payments"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToPayments')}
          </Link>
          <button
            onClick={handlePreviewPDF}
            disabled={downloading}
            className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center gap-2 font-medium disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            {downloading ? t('generating') : t('previewPDF')}
          </button>
        </div>

        {/* Invoice Preview */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-gray-200">
            <div>
              <h1 className="text-3xl font-bold text-primary-600 mb-1">{t('invoice')}</h1>
              <p className="text-sm text-gray-600 font-mono">{invoiceNumber}</p>
            </div>
            <div className="text-right">
              {company?.name && <p className="text-lg font-bold text-gray-900">{company.name}</p>}
              <p className="text-xs text-gray-500">Cairo, Egypt</p>
              {company?.email && <p className="text-xs text-gray-500">{company.email}</p>}
            </div>
          </div>

          {/* Bill To & Invoice Info */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{t('billTo')}</p>
              <p className="text-base font-semibold text-gray-900">{payment.client_name}</p>
              {payment.client_email && (
                <p className="text-sm text-gray-600">{payment.client_email}</p>
              )}
            </div>
            <div className="text-right">
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500">{t('invoiceDate')}</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(payment.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('itinerary')}</p>
                  <p className="text-sm font-mono text-gray-900">{payment.itinerary_code}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">{t('status')}</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${getStatusColor(payment.payment_status)}`}>
                    {isPaid ? t('paid') : payment.payment_status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="mb-8">
            <div className="bg-primary-600 text-white rounded-t-lg px-4 py-3">
              <div className="grid grid-cols-12 gap-4 text-xs font-semibold uppercase">
                <div className="col-span-6">{t('description')}</div>
                <div className="col-span-2 text-center">{t('type')}</div>
                <div className="col-span-2 text-center">{t('method')}</div>
                <div className="col-span-2 text-right">{t('amount')}</div>
              </div>
            </div>
            <div className="border-x border-b border-gray-200 rounded-b-lg">
              <div className="grid grid-cols-12 gap-4 px-4 py-4 text-sm">
                <div className="col-span-6">
                  <p className="font-medium text-gray-900">{t('paymentFor')} {payment.itinerary_code}</p>
                  {payment.notes && (
                    <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>
                  )}
                </div>
                <div className="col-span-2 text-center capitalize text-gray-700">
                  {payment.payment_type.replace('_', ' ')}
                </div>
                <div className="col-span-2 text-center capitalize text-gray-700">
                  {payment.payment_method.replace('_', ' ')}
                </div>
                <div className="col-span-2 text-right font-semibold text-gray-900">
                  {payment.currency} {payment.amount.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-gray-600">{t('subtotal')}</span>
                <span className="text-sm font-medium text-gray-900">
                  {payment.currency} {payment.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-3 bg-gray-50 px-3 rounded-lg mt-2">
                <span className="text-base font-bold text-gray-900">{t('total')}</span>
                <span className="text-xl font-bold text-primary-600">
                  {payment.currency} {payment.amount.toFixed(2)}
                </span>
              </div>
              {isPaid && (
                <div className="mt-3 text-center">
                  <span className="inline-block bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold">
                    ✓ {t('paidInFull')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Terms */}
          <div className="border-t border-gray-200 pt-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">{t('paymentTerms')}</h4>
            <p className="text-xs text-gray-600">
              {t('paymentTermsText')}
            </p>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-base font-semibold text-gray-900 mb-1">
              {t('thankYou')}
            </p>
            <p className="text-xs text-gray-500">
              {t('forQuestions')}
            </p>
          </div>
        </div>
      </div>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        pdfBlob={pdfPreviewBlob}
        isOpen={showPdfPreview}
        onClose={() => {
          setShowPdfPreview(false)
          setPdfPreviewBlob(null)
        }}
        title={`Invoice ${payment ? `INV-${payment.itinerary_code}-${payment.id.slice(0, 4).toUpperCase()}` : ''}`}
        filename={`Invoice-INV-${payment?.itinerary_code}-${payment?.id.slice(0, 4).toUpperCase()}.pdf`}
      />
    </div>
  )
}