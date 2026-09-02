'use client'

import { todayLocal } from '@/lib/today'
import { useCompanyInfo } from '@/lib/use-company-info'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useParams } from 'next/navigation'
import WhatsAppButton from '@/app/components/whatsapp/whatsapp-button'
import Link from 'next/link'
import { ArrowLeft, Download, Eye, Edit2, Plus, X, Loader2, Copy, Check, Languages, ChevronDown } from 'lucide-react'
import { generateContractPDF } from '@/lib/contract-pdf-generator'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import PDFPreviewModal from '@/app/components/PDFPreviewModal'

// The columns /api/itineraries/[id] actually returns. The prefill used to read
// num_travelers, tour_name and parsed_data.duration — none of which exist on
// an itinerary — so every contract opened as "Custom Egypt Tour", duration
// "N/A", with the traveller count blank (operator, 2 Sep, ITN-26-009).
interface Itinerary {
  id: string
  itinerary_code: string
  client_name: string
  client_email: string
  client_phone?: string
  num_adults?: number | null
  num_children?: number | null
  num_infants?: number | null
  num_travelers?: number | null
  start_date: string
  end_date: string
  total_days?: number | null
  total_cost: number
  trip_name?: string | null
  destinations?: string | string[] | null
  deposit_amount?: number | null
  inclusions?: string[] | null
  exclusions?: string[] | null
}

/** "8 days / 7 nights" from the trip's own day count, or from its dates. */
function describeDuration(itin: Itinerary): string {
  let days = Number(itin.total_days) || 0
  if (!days && itin.start_date && itin.end_date) {
    const a = new Date(itin.start_date + 'T00:00:00Z').getTime()
    const b = new Date(itin.end_date + 'T00:00:00Z').getTime()
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) days = Math.round((b - a) / 86400000) + 1
  }
  if (!days) return ''
  const nights = Math.max(0, days - 1)
  return `${days} ${days === 1 ? 'day' : 'days'} / ${nights} ${nights === 1 ? 'night' : 'nights'}`
}

/** The party, counted from the itinerary's own fields. */
function countTravellers(itin: Itinerary): number {
  const n = (Number(itin.num_adults) || 0) + (Number(itin.num_children) || 0) + (Number(itin.num_infants) || 0)
  return n || Number(itin.num_travelers) || 0
}

/** Destinations as one line, whatever shape the column holds. */
function describeDestinations(d: Itinerary['destinations']): string {
  if (Array.isArray(d)) return d.filter(Boolean).join(', ')
  return (d ?? '').toString().trim()
}

interface ContractData {
  contractNumber: string
  contractDate: string
  serviceProvider: string
  providerWebsite: string
  providerLocation: string
  clientName: string
  clientEmail: string
  numTravelers: number
  tourPackage: string
  startDate: string
  endDate: string
  duration: string
  destinations: string
  totalCost: number
  depositPercentage: number
  paymentTerms: string
  inclusions: string[]
  exclusions: string[]
  cancellation45Days: string
  cancellation44to30Days: string
  cancellation29to15Days: string
  cancellation14to0Days: string
  flightCancellation: string
  noShowPolicy: string
  forceMajeure: string
  specialNotes: string
}

export default function ContractPage() {
  const t = useTranslations('contract')
  const dialog = useConfirmDialog()
  const params = useParams()
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(true)
  const [saving, setSaving] = useState(false)

  const company = useCompanyInfo()
  const [contractData, setContractData] = useState<ContractData>({
    contractNumber: '',
    contractDate: todayLocal(),
    // Filled from the operator's own profile once it loads — see the effect
    // below. Blank until then, never another agency's name.
    serviceProvider: '',
    providerWebsite: '',
    providerLocation: 'Cairo, Egypt',
    clientName: '',
    clientEmail: '',
    numTravelers: 2,
    tourPackage: '',
    startDate: '',
    endDate: '',
    duration: '',
    destinations: '',
    totalCost: 0,
    depositPercentage: 10,
    paymentTerms: 'A 10% deposit is required at the time of booking to secure the reservation. The remaining balance is to be paid in cash upon arrival in Egypt.',
    inclusions: [
      t('defaultInclusions.privateTransport'),
      t('defaultInclusions.guiding'),
      t('defaultInclusions.entranceFees'),
      t('defaultInclusions.accommodation'),
      t('defaultInclusions.domesticFlights'),
      t('defaultInclusions.meals'),
      t('defaultInclusions.tips'),
      t('defaultInclusions.taxes')
    ],
    exclusions: [
      t('defaultExclusions.internationalFlights'),
      t('defaultExclusions.unspecifiedMeals'),
      t('defaultExclusions.gratuities'),
      t('defaultExclusions.insurance'),
      t('defaultExclusions.personalExpenses'),
      t('defaultExclusions.visaFees'),
      t('defaultExclusions.optionalActivities')
    ],
    cancellation45Days: 'Cancellations received 45 days before travel date are totally refundable.',
    cancellation44to30Days: 'Cancellations received 44 days to 30 days before travel date are subject to 15% cancellation fees.',
    cancellation29to15Days: 'Cancellations received 29 days to 15 days before travel date are subject to 40% cancellation fees.',
    cancellation14to0Days: 'Cancellations received 14 days to 0 days before travel date are subject to 100% cancellation fees.',
    flightCancellation: 'Any ticket cancellation (domestic and/or international) will be subject to a 50% fee from the flight price from day 1 of booking.',
    noShowPolicy: 'Clients who fail to show up for departure without prior notification will forfeit 100% of the tour cost.',
    forceMajeure: 'In case of cancellation due to force majeure events (natural disasters, political unrest, pandemic restrictions, etc.), the operator will work with clients to reschedule or provide credit for future travel, subject to supplier policies.',
    specialNotes: 'Safety & Comfort: Meet & assist at all airports, trusted vetted teams, 24/7 WhatsApp support.\nPractical: Bottled water provided daily, restaurants chosen for cleanliness and hygiene.'
  })

  // The contract names the service provider. That must be whoever runs this
  // install, so it is filled in when their profile arrives rather than baked in.
  useEffect(() => {
    if (!company) return
    setContractData(prev => ({
      ...prev,
      serviceProvider: prev.serviceProvider || company.name || '',
      providerWebsite: prev.providerWebsite || company.website || '',
    }))
  }, [company])

  // PDF Preview state
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null)
  const [showPdfPreview, setShowPdfPreview] = useState(false)

  // Copy & Translate state
  const [copied, setCopied] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)
  const [targetLanguage, setTargetLanguage] = useState<string | null>(null)

  const SUPPORTED_LANGUAGES = [
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'it', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  ]

  useEffect(() => {
    if (params.id) {
      fetchItinerary(params.id as string)
    }
  }, [params.id])

  // The operator's payment rule — deposit %, days to pay it, days before
  // departure for the balance — is set in Settings. The contract used to open
  // on a 10% deposit "in cash upon arrival", which is nobody's terms here.
  useEffect(() => {
    let alive = true
    fetch('/api/settings/payment-terms')
      .then(r => r.json())
      .then(j => {
        if (!alive || !j?.success) return
        const rule = { ...(j.defaults ?? {}), ...Object.fromEntries(Object.entries(j.terms ?? {}).filter(([, v]) => v != null)) }
        const pct = Number(rule.deposit_percent)
        const dueDays = Number(rule.deposit_due_days)
        const beforeDays = Number(rule.balance_due_days_before_departure)
        if (!Number.isFinite(pct)) return
        setContractData(prev => ({
          ...prev,
          depositPercentage: pct,
          paymentTerms: t('paymentTermsFromRule', { percent: pct, dueDays, beforeDays }),
        }))
      })
      .catch(() => { /* the editable default stays */ })
    return () => { alive = false }
  }, [t])

  const fetchItinerary = async (id: string) => {
    try {
      const response = await fetch(`/api/itineraries/${id}`)
      const data = await response.json()
      
      if (data.success) {
        const itin = data.data
        setItinerary(itin)
        
        setContractData(prev => ({
          ...prev,
          contractNumber: `TC-${new Date().getFullYear()}-${itin.itinerary_code || itin.id.slice(0, 8).toUpperCase()}`,
          clientName: itin.client_name,
          clientEmail: itin.client_email || '',
          numTravelers: countTravellers(itin) || prev.numTravelers,
          // The trip's own name; a blank stays blank rather than a made-up one.
          tourPackage: itin.trip_name || '',
          startDate: itin.start_date,
          endDate: itin.end_date,
          duration: describeDuration(itin),
          // Cities from the record. Nothing invented: three cities the trip
          // may never visit is not a default, it is a wrong contract.
          destinations: describeDestinations(itin.destinations),
          totalCost: itin.total_cost,
          ...(itin.inclusions?.length > 0 && { inclusions: itin.inclusions }),
          ...(itin.exclusions?.length > 0 && { exclusions: itin.exclusions })
        }))
      }
    } catch (error) {
      console.error('Error fetching itinerary:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof ContractData, value: any) => {
    setContractData(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayChange = (field: 'inclusions' | 'exclusions', index: number, value: string) => {
    setContractData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => i === index ? value : item)
    }))
  }

  const addArrayItem = (field: 'inclusions' | 'exclusions') => {
    setContractData(prev => ({
      ...prev,
      [field]: [...prev[field], '']
    }))
  }

  const removeArrayItem = (field: 'inclusions' | 'exclusions', index: number) => {
    setContractData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }))
  }

  const buildContractPDFData = () => ({
    contractNumber: contractData.contractNumber,
    contractDate: contractData.contractDate,
    clientName: contractData.clientName,
    clientEmail: contractData.clientEmail,
    numTravelers: contractData.numTravelers,
    tourName: contractData.tourPackage,
    startDate: contractData.startDate,
    endDate: contractData.endDate,
    destinations: contractData.destinations,
    totalCost: contractData.totalCost,
    currency: 'USD',
    inclusions: contractData.inclusions,
    exclusions: contractData.exclusions,
  })

  const handlePreviewPDF = async () => {
    setSaving(true)
    try {
      const pdfBytes = await generateContractPDF(buildContractPDFData())
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })
      setPdfPreviewBlob(blob)
      setShowPdfPreview(true)
    } catch (error) {
      console.error('Error generating PDF:', error)
      dialog.alert(t('error'), t('failedToDownloadContract'), 'warning')
    } finally {
      setSaving(false)
    }
  }

  // Generate contract text for copying
  const generateContractText = () => {
    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    }

    return `TRAVEL SERVICE CONTRACT
Contract Number: ${contractData.contractNumber}
Date: ${formatDate(contractData.contractDate)}

═══════════════════════════════════════════

PARTIES

Service Provider:
${contractData.serviceProvider}
Website: ${contractData.providerWebsite}
Location: ${contractData.providerLocation}

Client:
Name: ${contractData.clientName}
Email: ${contractData.clientEmail}
Number of Travelers: ${contractData.numTravelers}

═══════════════════════════════════════════

TOUR DETAILS

Tour Package: ${contractData.tourPackage}
Start Date: ${formatDate(contractData.startDate)}
End Date: ${formatDate(contractData.endDate)}
Duration: ${contractData.duration}
Destinations: ${contractData.destinations}

═══════════════════════════════════════════

FINANCIAL TERMS

Total Package Price: USD $${contractData.totalCost.toLocaleString()}
(USD $${(contractData.totalCost / contractData.numTravelers).toFixed(2)} per person × ${contractData.numTravelers} travelers)

Payment Terms:
${contractData.paymentTerms}

═══════════════════════════════════════════

WHAT'S INCLUDED

${contractData.inclusions.map(item => `• ${item}`).join('\n')}

WHAT'S NOT INCLUDED

${contractData.exclusions.map(item => `• ${item}`).join('\n')}

═══════════════════════════════════════════

CANCELLATION POLICY

• ${contractData.cancellation45Days}
• ${contractData.cancellation44to30Days}
• ${contractData.cancellation29to15Days}
• ${contractData.cancellation14to0Days}

Flight Cancellation: ${contractData.flightCancellation}
No-Show Policy: ${contractData.noShowPolicy}
Force Majeure: ${contractData.forceMajeure}

═══════════════════════════════════════════

SPECIAL NOTES

${contractData.specialNotes}

═══════════════════════════════════════════

This contract is governed by the laws of Egypt.
`
  }

  const handleCopyContract = async () => {
    try {
      const text = generateContractText()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Error copying contract:', error)
      dialog.alert(t('error'), 'Failed to copy contract', 'warning')
    }
  }

  const handleTranslate = async (langCode: string) => {
    setTranslating(true)
    setTargetLanguage(langCode)
    setShowLanguageDropdown(false)

    try {
      // Translate key text fields
      const fieldsToTranslate = [
        { key: 'paymentTerms', value: contractData.paymentTerms },
        { key: 'specialNotes', value: contractData.specialNotes },
        { key: 'cancellation45Days', value: contractData.cancellation45Days },
        { key: 'cancellation44to30Days', value: contractData.cancellation44to30Days },
        { key: 'cancellation29to15Days', value: contractData.cancellation29to15Days },
        { key: 'cancellation14to0Days', value: contractData.cancellation14to0Days },
        { key: 'flightCancellation', value: contractData.flightCancellation },
        { key: 'noShowPolicy', value: contractData.noShowPolicy },
        { key: 'forceMajeure', value: contractData.forceMajeure },
      ]

      const translatedFields: Partial<ContractData> = {}

      for (const field of fieldsToTranslate) {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: field.value,
            targetLanguage: langCode,
            action: 'fromEnglish'
          })
        })
        const data = await response.json()
        if (data.success) {
          translatedFields[field.key as keyof ContractData] = data.data.translatedText
        }
      }

      // Translate inclusions
      const translatedInclusions = await Promise.all(
        contractData.inclusions.map(async (item) => {
          const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: item, targetLanguage: langCode, action: 'fromEnglish' })
          })
          const data = await response.json()
          return data.success ? data.data.translatedText : item
        })
      )

      // Translate exclusions
      const translatedExclusions = await Promise.all(
        contractData.exclusions.map(async (item) => {
          const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: item, targetLanguage: langCode, action: 'fromEnglish' })
          })
          const data = await response.json()
          return data.success ? data.data.translatedText : item
        })
      )

      setContractData(prev => ({
        ...prev,
        ...translatedFields,
        inclusions: translatedInclusions,
        exclusions: translatedExclusions
      }))

      const langName = SUPPORTED_LANGUAGES.find(l => l.code === langCode)?.name || langCode
      dialog.alert(t('success'), `Contract translated to ${langName}`, 'success')
    } catch (error) {
      console.error('Error translating contract:', error)
      dialog.alert(t('error'), 'Failed to translate contract', 'warning')
    } finally {
      setTranslating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-500">{t('loadingContract')}</p>
        </div>
      </div>
    )
  }

  if (!itinerary) {
    return (
      <div className="p-4 lg:p-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-3">{t('itineraryNotFound')}</h1>
          <Link href="/itineraries" className="text-primary-600 hover:text-primary-700 text-sm">
            ← {t('backToItineraries')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        
        {/* COMPACT HEADER */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/itineraries"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToItineraries')}
          </Link>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium"
            >
              {editMode ? <Eye className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
              {editMode ? t('preview') : t('edit')}
            </button>

            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopyContract}
              className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium"
              title="Copy contract to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {/* Translate Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                disabled={translating}
                className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
              >
                {translating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Translating...
                  </>
                ) : (
                  <>
                    <Languages className="w-4 h-4" />
                    Translate
                    <ChevronDown className="w-3 h-3" />
                  </>
                )}
              </button>

              {showLanguageDropdown && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <button
                      type="button"
                      key={lang.code}
                      onClick={() => handleTranslate(lang.code)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                        targetLanguage === lang.code ? 'bg-blue-50 text-blue-700' : ''
                      }`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.name}</span>
                      {targetLanguage === lang.code && <Check className="w-4 h-4 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handlePreviewPDF}
              disabled={saving}
              className="bg-primary-600 text-white px-3 py-1.5 rounded-md hover:bg-primary-700 flex items-center gap-1.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('generating')}
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  {t('previewPDF')}
                </>
              )}
            </button>

            {itinerary?.client_phone && !editMode && (
              <WhatsAppButton
                itineraryId={params.id as string}
                type="contract"
                clientPhone={itinerary.client_phone}
                clientName={itinerary.client_name}
                onSuccess={() => {
                  dialog.alert(t('success'), t('contractSentViaWhatsApp'), 'success')
                }}
              />
            )}
          </div>
        </div>

        {/* COMPACT CONTRACT FORM/PREVIEW */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-6">
          
          {/* Title */}
          <div className="text-center border-b border-gray-200 pb-4">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">{t('travelContract')}</h1>
            {editMode ? (
              <div className="space-y-2 max-w-2xl mx-auto">
                <div className="flex items-center gap-3">
                  <label className="font-medium text-gray-700 w-32 text-right text-sm">{t('contractNumber')}:</label>
                  <input
                    type="text"
                    value={contractData.contractNumber}
                    onChange={(e) => handleChange('contractNumber', e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="font-medium text-gray-700 w-32 text-right text-sm">{t('contractDate')}:</label>
                  <input
                    type="date"
                    value={contractData.contractDate}
                    onChange={(e) => handleChange('contractDate', e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-0.5 text-xs text-gray-600">
                <p><strong>{t('contractNumber')}:</strong> {contractData.contractNumber}</p>
                <p><strong>{t('date')}:</strong> {new Date(contractData.contractDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            )}
          </div>

          {/* Parties */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('parties')}</h2>

            {editMode ? (
              <>
                <div className="mb-4 space-y-2">
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{t('serviceProvider')}:</h3>
                  <input
                    type="text"
                    value={contractData.serviceProvider}
                    onChange={(e) => handleChange('serviceProvider', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder={t('companyName')}
                  />
                  {company && !contractData.serviceProvider && (
                    <p className="text-xs text-amber-700 mt-1">{t('companyNameMissing')}</p>
                  )}
                  <input
                    type="text"
                    value={contractData.providerWebsite}
                    onChange={(e) => handleChange('providerWebsite', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder={t('website')}
                  />
                  <input
                    type="text"
                    value={contractData.providerLocation}
                    onChange={(e) => handleChange('providerLocation', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder={t('location')}
                  />
                </div>

                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{t('clients')}:</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600">{t('primaryTravelerName')}</label>
                      <input
                        type="text"
                        value={contractData.clientName}
                        onChange={(e) => handleChange('clientName', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">{t('email')}</label>
                      <input
                        type="email"
                        value={contractData.clientEmail}
                        onChange={(e) => handleChange('clientEmail', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                  </div>
                  <div className="w-40">
                    <label className="text-xs text-gray-600">{t('numberOfTravelers')}</label>
                    <input
                      type="number"
                      value={contractData.numTravelers || ''}
                      onChange={(e) => handleChange('numTravelers', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                      min="1"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">{t('serviceProvider')}:</h3>
                  <p className="text-sm text-gray-700">{contractData.serviceProvider}</p>
                  <p className="text-gray-600 text-xs">{t('website')}: {contractData.providerWebsite}</p>
                  <p className="text-gray-600 text-xs">{contractData.providerLocation}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm">{t('clients')}:</h3>
                  <p className="text-sm text-gray-700"><strong>{t('primaryTraveler')}:</strong> {contractData.clientName}</p>
                  {contractData.clientEmail && (
                    <p className="text-gray-600 text-xs">{contractData.clientEmail}</p>
                  )}
                  <p className="text-sm text-gray-700 mt-1"><strong>{t('numberOfTravelers')}:</strong> {contractData.numTravelers} {contractData.numTravelers === 1 ? t('person') : t('persons')}</p>
                </div>
              </>
            )}
          </div>

          {/* Tour Details */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('tourDetails')}</h2>
            {editMode ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600">{t('tourPackageName')}</label>
                  <input
                    type="text"
                    value={contractData.tourPackage}
                    onChange={(e) => handleChange('tourPackage', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">{t('startDate')}</label>
                    <input
                      type="date"
                      value={contractData.startDate}
                      onChange={(e) => handleChange('startDate', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">{t('endDate')}</label>
                    <input
                      type="date"
                      value={contractData.endDate}
                      onChange={(e) => handleChange('endDate', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-600">{t('duration')}</label>
                  <input
                    type="text"
                    value={contractData.duration}
                    onChange={(e) => handleChange('duration', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder={t('durationPlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">{t('destinations')}</label>
                  <input
                    type="text"
                    value={contractData.destinations}
                    onChange={(e) => handleChange('destinations', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    placeholder={t('destinationsPlaceholder')}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-sm text-gray-700">
                <p><strong>{t('tourPackage')}:</strong> {contractData.tourPackage}</p>
                <p><strong>{t('tourStartDate')}:</strong> {new Date(contractData.startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><strong>{t('tourEndDate')}:</strong> {new Date(contractData.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><strong>{t('totalDuration')}:</strong> {contractData.duration}</p>
                <p><strong>{t('destinations')}:</strong> {contractData.destinations}</p>
              </div>
            )}
          </div>

          {/* Financial Terms */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('financialTerms')}</h2>
            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-600">{t('totalPackagePrice')}</label>
                  <input
                    type="number"
                    value={contractData.totalCost}
                    onChange={(e) => handleChange('totalCost', parseFloat(e.target.value))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">{t('depositPercentage')}</label>
                  <input
                    type="number"
                    value={contractData.depositPercentage}
                    onChange={(e) => handleChange('depositPercentage', parseInt(e.target.value))}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    min="0"
                    max="100"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">{t('paymentTerms')}</label>
                  <textarea
                    value={contractData.paymentTerms}
                    onChange={(e) => handleChange('paymentTerms', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                    rows={2}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="bg-primary-50 border border-primary-200 rounded-md p-4 mb-3">
                  <p className="text-lg font-bold text-gray-900">
                    {t('totalPackagePrice')}: <span className="text-primary-600">USD ${contractData.totalCost.toLocaleString()}</span>
                  </p>
                  <p className="text-gray-600 text-xs mt-1">
                    (USD ${(contractData.totalCost / contractData.numTravelers).toFixed(2)} {t('perPerson')} × {contractData.numTravelers} {contractData.numTravelers === 1 ? t('traveler') : t('travelers')})
                  </p>
                </div>

                <h3 className="font-semibold text-gray-900 mb-2 text-sm">{t('paymentSchedule')}</h3>
                <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-700">
                  <p>{contractData.paymentTerms}</p>
                </div>
              </>
            )}
          </div>

          {/* Inclusions */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('inclusions')}</h2>
            <h3 className="font-semibold text-gray-900 mb-2 text-sm">{t('whatsIncluded')}</h3>
            {editMode ? (
              <div className="space-y-1.5">
                {contractData.inclusions.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleArrayChange('inclusions', index, e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                    />
                    <button
                      onClick={() => removeArrayItem('inclusions', index)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                      title={t('remove')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addArrayItem('inclusions')}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {t('addItem')}
                </button>
              </div>
            ) : (
              <ul className="list-disc pl-5 space-y-1 text-gray-700 text-xs">
                {contractData.inclusions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}

            <h3 className="font-semibold text-gray-900 mb-2 mt-4 text-sm">{t('whatsNotIncluded')}</h3>
            {editMode ? (
              <div className="space-y-1.5">
                {contractData.exclusions.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleArrayChange('exclusions', index, e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs"
                    />
                    <button
                      onClick={() => removeArrayItem('exclusions', index)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                      title={t('remove')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addArrayItem('exclusions')}
                  className="px-3 py-1.5 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-xs flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {t('addItem')}
                </button>
              </div>
            ) : (
              <ul className="list-disc pl-5 space-y-1 text-gray-700 text-xs">
                {contractData.exclusions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Cancellation Policy */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('cancellationPolicy')}</h2>

            {editMode ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-600 font-medium">{t('cancellation45DaysBefore')}</label>
                  <textarea
                    value={contractData.cancellation45Days}
                    onChange={(e) => handleChange('cancellation45Days', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600 font-medium">{t('cancellation44to30DaysBefore')}</label>
                  <textarea
                    value={contractData.cancellation44to30Days}
                    onChange={(e) => handleChange('cancellation44to30Days', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label className="text-xs text-gray-600 font-medium">{t('cancellation29to15DaysBefore')}</label>
                  <textarea
                    value={contractData.cancellation29to15Days}
                    onChange={(e) => handleChange('cancellation29to15Days', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600 font-medium">{t('cancellation14to0DaysBefore')}</label>
                  <textarea
                    value={contractData.cancellation14to0Days}
                    onChange={(e) => handleChange('cancellation14to0Days', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600 font-medium">{t('flightCancellation')}</label>
                  <textarea
                    value={contractData.flightCancellation}
                    onChange={(e) => handleChange('flightCancellation', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600 font-medium">{t('noShowPolicy')}</label>
                  <textarea
                    value={contractData.noShowPolicy}
                    onChange={(e) => handleChange('noShowPolicy', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600 font-medium">{t('forceMajeure')}</label>
                  <textarea
                    value={contractData.forceMajeure}
                    onChange={(e) => handleChange('forceMajeure', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{t('standardCancellationPolicy')}</h3>
                  <div className="bg-gray-50 rounded-md p-3 space-y-1 text-xs text-gray-700">
                    <p>{t('cancellationChargesApply')}</p>
                    <p>• {t('domesticTicketsNonRefundable')}</p>
                    <p>• {contractData.cancellation45Days}</p>
                    <p>• {contractData.cancellation44to30Days}</p>
                    <p>• {contractData.cancellation29to15Days}</p>
                    <p>• {contractData.cancellation14to0Days}</p>
                    <p>• {t('cancellationFeesAccommodationOnly')}</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{t('flightCancellationPolicy')}</h3>
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-md p-3">
                    {contractData.flightCancellation}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{t('noShowPolicy')}</h3>
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-md p-3">
                    {contractData.noShowPolicy}
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{t('forceMajeure')}</h3>
                  <p className="text-xs text-gray-700 bg-gray-50 rounded-md p-3">
                    {contractData.forceMajeure}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Terms & Conditions */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('termsAndConditions')}</h2>

            <div className="space-y-3 text-xs">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{t('terms.bookingConfirmation.title')}</h3>
                <p className="text-gray-700">
                  {t('terms.bookingConfirmation.text', { serviceProvider: contractData.serviceProvider })}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{t('terms.travelDocuments.title')}</h3>
                <p className="text-gray-700">
                  {t('terms.travelDocuments.text')}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{t('terms.healthAndSafety.title')}</h3>
                <div className="text-gray-700 space-y-0.5">
                  <p>• {t('terms.healthAndSafety.point1')}</p>
                  <p>• {t('terms.healthAndSafety.point2')}</p>
                  <p>• {t('terms.healthAndSafety.point3')}</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{t('terms.changesToItinerary.title')}</h3>
                <p className="text-gray-700">
                  {t('terms.changesToItinerary.text', { serviceProvider: contractData.serviceProvider })}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{t('terms.liabilityLimitations.title')}</h3>
                <p className="text-gray-700">
                  {t('terms.liabilityLimitations.text', { serviceProvider: contractData.serviceProvider })}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{t('terms.disputeResolution.title')}</h3>
                <p className="text-gray-700">
                  {t('terms.disputeResolution.text')}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">{t('terms.dataProtection.title')}</h3>
                <p className="text-gray-700">
                  {t('terms.dataProtection.text')}
                </p>
              </div>
            </div>
          </div>

          {/* Special Notes */}
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('specialNotes')}</h2>

            {editMode ? (
              <div>
                <label className="text-xs text-gray-600">{t('specialNotesSafetyInfo')}</label>
                <textarea
                  value={contractData.specialNotes}
                  onChange={(e) => handleChange('specialNotes', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-xs mt-1"
                  rows={5}
                  placeholder={t('specialNotesPlaceholder')}
                />
              </div>
            ) : (
              <div className="text-xs text-gray-700 whitespace-pre-line bg-gray-50 rounded-md p-3">
                {contractData.specialNotes}
              </div>
            )}
          </div>

          {/* Signatures */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">{t('signatures')}</h2>
            <p className="text-xs text-gray-700 mb-6">
              {t('signaturesAcknowledgement')}
            </p>

            <div className="space-y-6">
              <div>
                <p className="font-semibold text-gray-900 mb-3 text-sm">{contractData.serviceProvider}</p>
                <div className="border-b border-gray-300 w-80 mb-1.5"></div>
                <p className="text-xs text-gray-600">{t('date')}: _______________</p>
              </div>

              <div>
                <p className="font-semibold text-gray-900 mb-3 text-sm">{t('clientAcceptance')}:</p>
                <div className="mb-5">
                  <p className="text-xs text-gray-700 mb-1.5">{contractData.clientName}</p>
                  <div className="border-b border-gray-300 w-80 mb-1.5"></div>
                  <p className="text-xs text-gray-600">{t('date')}: _______________</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-gray-200">
              <p className="font-semibold text-gray-900 mb-1 text-sm">{t('contractEffectiveDate')}:</p>
              <p className="text-xs text-gray-700">{t('uponReceiptSignedContract')}</p>

              <p className="font-semibold text-gray-900 mb-1 mt-3 text-sm">{t('contractExpiration')}:</p>
              <p className="text-xs text-gray-700">{new Date(contractData.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} ({t('completionOfTourServices')})</p>

              <p className="text-xs text-gray-500 italic mt-5">
                {t('contractGovernedByEgyptianLaw')}
              </p>
            </div>
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
        title={`Contract ${contractData.contractNumber}`}
        filename={`contract-${contractData.contractNumber}.pdf`}
      />
    </div>
  )
}