'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Send, Mail, MessageSquare, Printer, CheckCircle, Eye } from 'lucide-react'
import { generateSupplierDocumentPDF } from '@/lib/supplier-document-pdf'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import PDFPreviewModal from '@/app/components/PDFPreviewModal'

interface SupplierDocument {
  id: string
  document_type: string
  document_number: string
  supplier_name: string
  supplier_contact_name?: string
  supplier_contact_email?: string
  supplier_contact_phone?: string
  supplier_whatsapp?: string
  supplier_address?: string
  client_name: string
  client_nationality?: string
  num_adults: number
  num_children: number
  city?: string
  service_date?: string
  check_in?: string
  check_out?: string
  pickup_time?: string
  pickup_location?: string
  dropoff_location?: string
  services: any[]
  currency: string
  total_cost: number
  payment_terms?: string
  special_requests?: string
  internal_notes?: string
  status: string
  created_at: string
  itinerary?: {
    id: string
    itinerary_code: string
    trip_name: string
  }
}

export default function SupplierDocumentViewPage() {
  const t = useTranslations('supplierDocumentDetail')
  const tVoucher = useTranslations('pdf.voucher')
  const tBrand = useTranslations('pdf')
  const currentLocale = useLocale()

  // Caller-side builder for the voucher PDF labels — pulls from i18n so a
  // JA operator gets a Japanese voucher even though the generator itself is
  // a pure utility.
  const buildVoucherLabels = () => ({
    brand: 'TRAVEL2EGYPT',                                  // brand mark stays Latin
    tagline: tBrand('voucher.supplier') === 'サプライヤー' ? 'エジプトへの架け橋' : 'Your Gateway to Egypt',
    documentNumber: tVoucher('documentNumber'),
    issueDate: tVoucher('issueDate'),
    supplier: tVoucher('supplier'),
    supplierUpper: tVoucher('supplier').toUpperCase(),
    guestInformation: tVoucher('clientName').toUpperCase(),
    pax: tVoucher('paxUnit'),
    nationality: tVoucher('nationality'),
    // Japanese counters (名), composed naturally: '大人2名、子供1名'.
    paxComposition: (adults: number, children: number) => {
      const a = tVoucher('adultsCount', { count: adults })
      return children > 0 ? `${a}${tVoucher('paxJoin')}${tVoucher('childrenCount', { count: children })}` : a
    },
    driverTBA: tVoucher('driverTBA'),
    paymentTBC: tVoucher('paymentTBC'),
    paymentTermsByKey: {
      prepaid: tVoucher('paymentPrepaid'),
      credit: tVoucher('paymentCredit'),
      on_service: tVoucher('paymentOnService'),
      commission: tVoucher('paymentCommission'),
    } as Record<string, string>,
    vehicleTypes: {
      sedan: tVoucher('vehicleSedan'),
      suv: tVoucher('vehicleSuv'),
      minivan: tVoucher('vehicleMinivan'),
      van: tVoucher('vehicleVan'),
      minibus: tVoucher('vehicleMinibus'),
      bus: tVoucher('vehicleBus'),
      luxury_sedan: tVoucher('vehicleLuxurySedan'),
      luxury_van: tVoucher('vehicleLuxuryVan'),
    } as Record<string, string>,
    generatedOn: (datetime: string) => tVoucher('generatedOn', { datetime }),
    checkIn: tVoucher('checkIn').toUpperCase(),
    checkOut: tVoucher('checkOut').toUpperCase(),
    duration: tVoucher('tourDuration').toUpperCase(),
    nights: (n: number) => tVoucher('nights', { count: n }),
    serviceDate: tVoucher('serviceDate').toUpperCase(),
    pickupTime: currentLocale === 'ja' ? 'お迎え時間' : 'PICKUP TIME',
    from: currentLocale === 'ja' ? '出発:' : 'FROM:',
    to: currentLocale === 'ja' ? '到着:' : 'TO:',
    service: tVoucher('service').toUpperCase(),
    vehicleType: tVoucher('vehicleType').toUpperCase(),
    driver: currentLocale === 'ja' ? 'ドライバー' : 'DRIVER',
    servicesItems: tVoucher('items').toUpperCase(),
    description: currentLocale === 'ja' ? '内容' : 'Description',
    qty: currentLocale === 'ja' ? '数量' : 'Qty',
    amount: tBrand('amount'),
    specialRequests: currentLocale === 'ja' ? '特別なご要望' : 'SPECIAL REQUESTS',
    paymentTerms: currentLocale === 'ja' ? 'お支払い条件' : 'PAYMENT TERMS',
    totalAmount: tBrand('total').toUpperCase(),
    total: tBrand('total'),
    authorizedBy: currentLocale === 'ja' ? 'Travel2Egyptが承認' : 'Authorized by Travel2Egypt',
    supplierConfirmationStamp: currentLocale === 'ja' ? 'サプライヤー確認 & 押印' : 'Supplier Confirmation & Stamp',
    footerContact: 'Travel2Egypt | www.travel2egypt.com | reservations@travel2egypt.com | +20 100 XXX XXXX',
    documentTitle: {
      hotel_voucher: tVoucher('hotelVoucher').toUpperCase(),
      service_order: tVoucher('serviceOrder').toUpperCase(),
      transport_voucher: tVoucher('transportVoucher').toUpperCase(),
      activity_voucher: tVoucher('activityVoucher').toUpperCase(),
      guide_assignment: tVoucher('guideAssignment').toUpperCase(),
      cruise_voucher: tVoucher('cruiseVoucher').toUpperCase(),
      entrance_fees: currentLocale === 'ja' ? '入場料注文書' : 'ENTRANCE FEES ORDER',
    },
  })

  const pdfOptions = () => ({
    locale: (currentLocale === 'ja' ? 'ja' : 'en') as 'en' | 'ja',
    labels: buildVoucherLabels(),
  })
  const dialog = useConfirmDialog()
  const params = useParams()
  const router = useRouter()
  const [document, setDocument] = useState<SupplierDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null)
  const [showPdfPreview, setShowPdfPreview] = useState(false)

  const DOCUMENT_TITLES: Record<string, string> = {
    hotel_voucher: t('documentTypes.hotelVoucher'),
    service_order: t('documentTypes.serviceOrder'),
    transport_voucher: t('documentTypes.transportVoucher'),
    activity_voucher: t('documentTypes.activityVoucher'),
    guide_assignment: t('documentTypes.guideAssignment'),
    cruise_voucher: t('documentTypes.cruiseVoucher')
  }

  useEffect(() => {
    if (params.id) {
      fetchDocument()
    }
  }, [params.id])

  const fetchDocument = async () => {
    try {
      const response = await fetch(`/api/supplier-documents/${params.id}`)
      const result = await response.json()
      
      if (result.success) {
        setDocument(result.data)
      } else {
        setError(t('documentNotFound'))
      }
    } catch (err) {
      setError(t('errorLoadingDocument'))
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!document) return

    const pdf = await generateSupplierDocumentPDF(document, pdfOptions())
    const filename = `${document.document_number}_${document.supplier_name.replace(/\s+/g, '_')}.pdf`
    pdf.save(filename)
  }

  const handlePrint = async () => {
    if (!document) return

    const pdf = await generateSupplierDocumentPDF(document, pdfOptions())
    const pdfBlob = pdf.output('blob')
    const pdfUrl = URL.createObjectURL(pdfBlob)

    const printWindow = window.open(pdfUrl, '_blank')
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print()
      }
    }
  }

  const handlePreviewPDF = async () => {
    if (!document) return

    const pdf = await generateSupplierDocumentPDF(document, pdfOptions())
    const blob = pdf.output('blob')
    setPdfPreviewBlob(blob)
    setShowPdfPreview(true)
  }

  const handleSendEmail = async () => {
    if (!document || !document.supplier_contact_email) {
      await dialog.alert(t('error'), t('supplierEmailNotAvailable'), 'warning')
      return
    }

    setActionLoading('email')
    try {
      const pdf = await generateSupplierDocumentPDF(document, pdfOptions())
      const pdfBase64 = pdf.output('datauristring').split(',')[1]

      const response = await fetch('/api/send-supplier-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          supplierEmail: document.supplier_contact_email,
          supplierName: document.supplier_name,
          documentNumber: document.document_number,
          documentType: DOCUMENT_TITLES[document.document_type],
          clientName: document.client_name,
          pdfBase64
        })
      })

      if (response.ok) {
        // Update status to sent
        await fetch(`/api/supplier-documents/${document.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'sent', sent_via: 'email' })
        })

        setActionSuccess(t('emailSentSuccessfully'))
        fetchDocument()
        setTimeout(() => setActionSuccess(null), 5000)
      } else {
        await dialog.alert(t('error'), t('failedToSendEmail'), 'warning')
      }
    } catch (error) {
      console.error('Error sending email:', error)
      await dialog.alert(t('error'), t('failedToSendEmail'), 'warning')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSendWhatsApp = async () => {
    if (!document) return

    const whatsappNumber = document.supplier_whatsapp || document.supplier_contact_phone
    if (!whatsappNumber) {
      await dialog.alert(t('error'), t('supplierPhoneNotAvailable'), 'warning')
      return
    }

    setActionLoading('whatsapp')
    try {
      const pdf = await generateSupplierDocumentPDF(document, pdfOptions())
      const pdfBase64 = pdf.output('datauristring').split(',')[1]

      const response = await fetch('/api/whatsapp/send-supplier-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          supplierPhone: whatsappNumber,
          supplierName: document.supplier_contact_name || document.supplier_name,
          documentNumber: document.document_number,
          documentType: DOCUMENT_TITLES[document.document_type],
          clientName: document.client_name,
          serviceDate: document.check_in || document.service_date || null,
          pdfBase64
        })
      })

      if (response.ok) {
        // Update status to sent
        await fetch(`/api/supplier-documents/${document.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'sent', sent_via: 'whatsapp' })
        })

        setActionSuccess(t('whatsappSentSuccessfully'))
        fetchDocument()
        setTimeout(() => setActionSuccess(null), 5000)
      } else {
        const errorData = await response.json().catch(() => null)
        await dialog.alert(t('error'), errorData?.error || t('failedToSendWhatsApp'), 'warning')
      }
    } catch (error) {
      console.error('Error sending WhatsApp:', error)
      await dialog.alert(t('error'), t('failedToSendWhatsApp'), 'warning')
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkConfirmed = async () => {
    if (!document) return

    setActionLoading('confirm')
    try {
      await fetch(`/api/supplier-documents/${document.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed' })
      })

      setActionSuccess(t('markedAsConfirmed'))
      fetchDocument()
      setTimeout(() => setActionSuccess(null), 5000)
    } catch (error) {
      await dialog.alert(t('error'), t('failedToUpdateStatus'), 'warning')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">{t('loadingDocument')}</p>
        </div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Link href="/documents/supplier" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            ← {t('backToDocuments')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/documents/supplier"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{document.document_number}</h1>
                <p className="text-sm text-gray-500">{DOCUMENT_TITLES[document.document_type]} • {document.supplier_name}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handlePreviewPDF}
                className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm font-medium flex items-center gap-1.5"
              >
                <Eye className="w-4 h-4" />
                {t('preview') || 'Preview'}
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                {t('downloadPDF')}
              </button>
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                {t('print')}
              </button>
              {document.supplier_contact_email && (
                <button
                  onClick={handleSendEmail}
                  disabled={actionLoading === 'email'}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {actionLoading === 'email' ? t('sending') : t('email')}
                </button>
              )}
              {(document.supplier_whatsapp || document.supplier_contact_phone) && (
                <button
                  onClick={handleSendWhatsApp}
                  disabled={actionLoading === 'whatsapp'}
                  className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <MessageSquare className="w-4 h-4" />
                  {actionLoading === 'whatsapp' ? t('sending') : t('whatsapp')}
                </button>
              )}
              {document.status === 'sent' && (
                <button
                  onClick={handleMarkConfirmed}
                  disabled={actionLoading === 'confirm'}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('markConfirmed')}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Success Message */}
      {actionSuccess && (
        <div className="container mx-auto px-4 pt-4">
          <div className="bg-green-50 border border-green-200 p-3 rounded-md">
            <p className="text-sm text-green-700 font-medium">{actionSuccess}</p>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {/* Document Preview Card */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Header Section */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-primary-600">TRAVEL2EGYPT</h2>
                  <p className="text-sm text-gray-500 mt-1">{DOCUMENT_TITLES[document.document_type]}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">{document.document_number}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(document.created_at).toLocaleDateString()}
                  </p>
                  <span className={`inline-block mt-2 px-2 py-1 rounded text-xs font-medium ${
                    document.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    document.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                    document.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {document.status.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Supplier Info */}
            <div className="p-6 bg-gray-50 border-b border-gray-200">
              <p className="text-xs text-gray-500 mb-1">{t('to')}:</p>
              <p className="text-lg font-semibold text-gray-900">{document.supplier_name}</p>
              {document.supplier_address && (
                <p className="text-sm text-gray-600">{document.supplier_address}</p>
              )}
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                {document.supplier_contact_phone && (
                  <span>📞 {document.supplier_contact_phone}</span>
                )}
                {document.supplier_contact_email && (
                  <span>✉️ {document.supplier_contact_email}</span>
                )}
              </div>
            </div>

            {/* Guest Info */}
            <div className="p-6 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('guestName')}</p>
                  <p className="text-lg font-semibold text-gray-900">{document.client_name}</p>
                  {document.client_nationality && (
                    <p className="text-sm text-gray-600">{t('nationality')}: {document.client_nationality}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">{t('pax')}</p>
                  <p className="text-2xl font-bold text-primary-600">
                    {document.num_adults + (document.num_children || 0)}
                  </p>
                  <p className="text-sm text-gray-600">
                    {document.num_adults} {document.num_adults !== 1 ? t('adults') : t('adult')}
                    {document.num_children > 0 && `, ${document.num_children} ${document.num_children !== 1 ? t('children') : t('child')}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="p-6 border-b border-gray-200">
              {document.check_in ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-primary-50 p-4 rounded-lg">
                    <p className="text-xs text-primary-600 font-medium mb-1">{t('checkIn')}</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {new Date(document.check_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="bg-primary-50 p-4 rounded-lg">
                    <p className="text-xs text-primary-600 font-medium mb-1">{t('checkOut')}</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {document.check_out && new Date(document.check_out).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-500 font-medium mb-1">{t('serviceDate')}</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {document.service_date && new Date(document.service_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  {document.pickup_time && (
                    <p className="text-sm text-gray-600 mt-1">{t('pickup')}: {document.pickup_time}</p>
                  )}
                </div>
              )}
            </div>

            {/* Services */}
            {document.services && document.services.length > 0 && (
              <div className="p-6 border-b border-gray-200">
                <p className="text-xs text-gray-500 font-medium mb-3">{t('servicesIncluded')}</p>
                <div className="space-y-2">
                  {document.services.map((service, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                        <p className="text-xs text-gray-500">
                          {service.date && new Date(service.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {service.city && ` • ${service.city}`}
                        </p>
                      </div>
                      <p className="text-sm text-gray-600">x{service.quantity || 1}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Special Requests */}
            {document.special_requests && (
              <div className="p-6 border-b border-gray-200 bg-amber-50">
                <p className="text-xs text-amber-700 font-medium mb-1">{t('specialRequests')}</p>
                <p className="text-sm text-gray-700">{document.special_requests}</p>
              </div>
            )}

            {/* Payment & Total */}
            <div className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500 mb-1">{t('paymentTerms')}</p>
                  <p className="text-sm font-medium text-gray-900">
                    {document.payment_terms?.replace('_', ' ').toUpperCase() || t('asAgreed')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">{t('total')}</p>
                  <p className="text-2xl font-bold text-primary-600">
                    {document.currency} {document.total_cost.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Itinerary Link */}
          {document.itinerary && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">{t('linkedItinerary')}</p>
              <Link
                href={`/itineraries/${document.itinerary.id}`}
                className="text-primary-600 hover:text-primary-700 font-medium"
              >
                {document.itinerary.itinerary_code} - {document.itinerary.trip_name}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* PDF Preview Modal */}
      <PDFPreviewModal
        pdfBlob={pdfPreviewBlob}
        filename={document ? `${document.document_number}_${document.supplier_name.replace(/\s+/g, '_')}.pdf` : 'supplier-document.pdf'}
        isOpen={showPdfPreview}
        onClose={() => {
          setShowPdfPreview(false)
          setPdfPreviewBlob(null)
        }}
        title="Supplier Document Preview"
      />
    </div>
  )
}