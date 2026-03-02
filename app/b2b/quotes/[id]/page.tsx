'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  ArrowLeft, FileText, Download, Send, Calendar, Users,
  Building2, Loader2, Globe, Mail, Phone, User, Clock, CheckCircle2,
  XCircle, TrendingUp, Eye, ArrowRightCircle
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { LanguageTabs, CreateVersionPrompt } from '@/components/multilingual'
import type { Language } from '@/types/multilingual'

// ============================================
// B2B QUOTE DETAIL PAGE
// File: app/b2b/quotes/[id]/page.tsx
// ============================================

interface Quote {
  id: string
  quote_number: string
  variation_id: string | null
  itinerary_id: string | null
  trip_name: string | null
  source: string | null
  partner_id: string | null
  client_name: string | null
  client_email: string | null
  client_phone: string | null
  client_nationality: string | null
  travel_date: string | null
  num_adults: number
  num_children: number
  tour_leader_included: boolean
  tour_leader_cost: number | null
  single_supplement: number | null
  is_eur_passport: boolean
  season: string | null
  services_snapshot: any[]
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  currency: string
  status: string
  converted_to_itinerary_id: string | null
  valid_until: string
  notes: string | null
  created_at: string
  tour_variations: {
    variation_name: string
    variation_code: string
    tier: string
    inclusions: string[]
    exclusions: string[]
    tour_templates: {
      template_name: string
      template_code: string
      duration_days: number
      duration_nights: number
      short_description: string
    }
  } | null
  b2b_partners: {
    company_name: string
    partner_code: string
    contact_name: string | null
    email: string | null
  } | null
  itineraries: {
    id: string
    trip_name: string
    itinerary_code: string
    total_days: number
    tier: string
    start_date: string
    end_date: string
  } | null
  available_languages: Language[]
  versions: Record<string, {
    id: string
    title: string
    notes: string | null
    terms_conditions: string | null
    special_requests: string | null
  }>
}

export default function QuoteDetailPage() {
  const params = useParams()
  const quoteId = params?.id as string
  const t = useTranslations('b2bQuotes')

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [converting, setConverting] = useState(false)
  const [activeLanguage, setActiveLanguage] = useState<Language>('en')
  const router = useRouter()

  useEffect(() => {
    if (quoteId) fetchQuote()
  }, [quoteId])

  const fetchQuote = async () => {
    try {
      const res = await fetch(`/api/b2b/quotes/${quoteId}`)
      const data = await res.json()
      if (data.success) {
        setQuote(data.data)
      } else {
        setError(data.error || t('quoteNotFound'))
      }
    } catch (err) {
      setError(t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (newStatus: string) => {
    if (!quote) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/b2b/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      const data = await res.json()
      if (data.success) {
        setQuote({ ...quote, status: newStatus })
      }
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setUpdating(false)
    }
  }

  const convertToItinerary = async () => {
    if (!quote) return
    setConverting(true)
    try {
      const res = await fetch(`/api/b2b/quotes/${quoteId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success) {
        // Refresh quote to reflect "converted" status
        await fetchQuote()
        // Navigate to the new/updated itinerary
        router.push(`/itineraries/${data.data.itinerary_id}`)
      } else {
        console.error('Convert failed:', data.error)
        alert(data.error || t('convertFailed'))
      }
    } catch (err) {
      console.error('Failed to convert quote:', err)
      alert(t('convertFailed'))
    } finally {
      setConverting(false)
    }
  }

  const handleCreateVersion = async (lang: Language) => {
    if (!quote) return
    try {
      const res = await fetch(`/api/b2b/quotes/${quoteId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang })
      })
      const data = await res.json()
      if (data.success) {
        // Refresh quote to get the new version
        fetchQuote()
      }
    } catch (err) {
      console.error('Failed to create version:', err)
    }
  }

  const handleCopyAndTranslate = async (lang: Language) => {
    if (!quote) return
    try {
      const res = await fetch(`/api/b2b/quotes/${quoteId}/versions/copy-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage: lang })
      })
      const data = await res.json()
      if (data.success) {
        // Refresh quote to get the new version
        fetchQuote()
        setActiveLanguage(lang)
      }
    } catch (err) {
      console.error('Failed to copy and translate:', err)
    }
  }

  // Get versioned content helper
  const getVersionedNotes = () => {
    if (!quote) return null
    const version = quote.versions?.[activeLanguage]
    return version?.notes || quote.notes
  }

  const formatDate = (dateStr: string, format: 'short' | 'long' = 'short') => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    if (format === 'long') {
      return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    }
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock, label: t('statusDraft') },
      sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send, label: t('statusSent') },
      accepted: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2, label: t('statusAccepted') },
      rejected: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: t('statusRejected') },
      converted: { bg: 'bg-purple-100', text: 'text-purple-700', icon: ArrowRightCircle, label: t('statusConverted') },
    }
    const style = styles[status] || styles.draft
    const Icon = style.icon
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${style.bg} ${style.text}`}>
        <Icon className="w-4 h-4" />
        {style.label}
      </span>
    )
  }

  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      draft: t('statusDraft'),
      sent: t('statusSent'),
      accepted: t('statusAccepted'),
      rejected: t('statusRejected'),
      converted: t('statusConverted'),
    }
    return labels[status] || status
  }

  const getTierLabel = (tier: string): string => {
    const labels: Record<string, string> = {
      budget: t('tierBudget'),
      standard: t('tierStandard'),
      luxury: t('tierLuxury'),
    }
    return labels[tier] || tier
  }

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      budget: 'bg-emerald-100 text-emerald-700',
      standard: 'bg-blue-100 text-blue-700',
      luxury: 'bg-amber-100 text-amber-700',
    }
    return styles[tier] || 'bg-gray-100 text-gray-700'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#647C47]" />
      </div>
    )
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Link href="/b2b/quotes" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" />{t('backToQuotes')}
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-red-800 font-medium">{t('quoteNotFound')}</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  const template = quote.tour_variations?.tour_templates
  const variation = quote.tour_variations
  const partner = quote.b2b_partners
  const itinerarySource = quote.itineraries
  const services = quote.services_snapshot || []

  // Derive display values from either template or itinerary
  const displayName = template?.template_name || quote.trip_name || itinerarySource?.trip_name || t('tourPackage')
  const displaySubtitle = variation?.variation_name || (quote.source === 'whatsapp_b2b' ? '📱 WhatsApp Parsed' : '')
  const displayTier = variation?.tier || itinerarySource?.tier || null
  // Calculate duration from services snapshot as last resort
  const snapshotMaxDay = services.length > 0 ? Math.max(...services.map((s: any) => s.day_number || 0)) : 0
  const displayDurationDays = template?.duration_days || itinerarySource?.total_days || (snapshotMaxDay > 0 ? snapshotMaxDay : null)
  const displayDurationNights = template?.duration_nights || (displayDurationDays ? displayDurationDays - 1 : null)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/b2b/quotes" className="p-2 hover:bg-gray-200 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-3">
              <FileText className="w-5 h-5 text-[#647C47]" />
              {quote.quote_number}
              {getStatusBadge(quote.status)}
            </h1>
            <p className="text-sm text-gray-500">{t('created')} {formatDate(quote.created_at, 'long')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {itinerarySource && (
            <Link
              href={`/itineraries/${itinerarySource.id}`}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              <Eye className="w-4 h-4" />View Itinerary
            </Link>
          )}
          <a
            href={`/api/b2b/quotes/${quote.id}/pdf`}
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            <Download className="w-4 h-4" />{t('downloadPdf')}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tour Info */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{displayName}</h2>
                <p className="text-sm text-gray-500">{displaySubtitle}</p>
              </div>
              {displayTier && (
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getTierBadge(displayTier)}`}>
                  {displayTier.charAt(0).toUpperCase() + displayTier.slice(1)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{t('duration')}</p>
                <p className="text-sm font-semibold">{displayDurationDays || '-'}D / {displayDurationNights || '-'}N</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{t('travelers')}</p>
                <p className="text-sm font-semibold">{quote.num_adults} pax{quote.tour_leader_included && <span className="text-blue-600"> (+1 TL)</span>}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{t('travelDate')}</p>
                <p className="text-sm font-semibold">{quote.travel_date ? formatDate(quote.travel_date) : t('tbd')}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{t('season')}</p>
                <p className="text-sm font-semibold">{quote.season ? quote.season.charAt(0).toUpperCase() + quote.season.slice(1) : '-'}</p>
              </div>
            </div>
          </div>

          {/* Services Table */}
          {services.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-base font-semibold mb-4">{t('servicesIncluded')}</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">{t('serviceColumn')}</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">{t('qtyColumn')}</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">{t('unitColumn')}</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">{t('totalColumn')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {services.map((service: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{service.service_name || t('serviceColumn')}</td>
                      <td className="px-4 py-2 text-right">{service.quantity || 1}</td>
                      <td className="px-4 py-2 text-right">€{(service.unit_cost || 0).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium">€{(service.line_total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes with Language Tabs */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">{t('notes')}</h3>
              <LanguageTabs
                availableLanguages={quote.available_languages || []}
                activeLanguage={activeLanguage}
                onLanguageChange={setActiveLanguage}
              />
            </div>
            {quote.versions?.[activeLanguage] ? (
              <div className="text-sm text-gray-600">
                {getVersionedNotes() || <span className="text-gray-400 italic">{t('noNotes')}</span>}
              </div>
            ) : (
              <CreateVersionPrompt
                entityType="quote"
                language={activeLanguage}
                onCreateFromScratch={() => handleCreateVersion(activeLanguage)}
                onCopyAndTranslate={() => handleCopyAndTranslate(activeLanguage)}
              />
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pricing */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#647C47]" />{t('pricing')}
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('subtotal')}</span>
                <span>€{quote.total_cost?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{t('margin')} ({quote.margin_percent}%)</span>
                <span className="text-green-600">€{quote.margin_amount?.toFixed(2)}</span>
              </div>
              {quote.tour_leader_included && quote.tour_leader_cost && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('tourLeaderCost')}</span>
                  <span className="text-blue-600">€{quote.tour_leader_cost.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-3 border-t">
                <div className="flex justify-between">
                  <span className="font-medium">{t('sellingPrice')}</span>
                  <span className="text-xl font-bold text-[#647C47]">€{quote.selling_price?.toFixed(2)}</span>
                </div>
                <p className="text-xs text-gray-500 text-right mt-1">€{quote.price_per_person?.toFixed(2)} {t('perPersonLong')}</p>
              </div>
              {quote.single_supplement && quote.single_supplement > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-800">{t('singleSupplement')}</span>
                    <span className="font-medium text-amber-700">€{quote.single_supplement.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Client / Partner */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4">{t('clientDetails')}</h3>
            {quote.client_name ? (
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" />{quote.client_name}</p>
                {quote.client_email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" />{quote.client_email}</p>}
                {quote.client_phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" />{quote.client_phone}</p>}
                {quote.client_nationality && <p className="flex items-center gap-2"><Globe className="w-4 h-4 text-gray-400" />{quote.client_nationality}</p>}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">{t('noClientDetails')}</p>
            )}

            {partner && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-gray-500 mb-2">{t('partner')}</p>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  {partner.company_name}
                </p>
                <p className="text-xs text-gray-500 ml-6">{partner.partner_code}</p>
              </div>
            )}
          </div>

          {/* Status Actions */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-base font-semibold mb-4">{t('updateStatus')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {['draft', 'sent', 'accepted', 'rejected'].map((status) => (
                <button
                  key={status}
                  onClick={() => updateStatus(status)}
                  disabled={updating || quote.status === status || quote.status === 'converted'}
                  className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                    quote.status === status
                      ? 'bg-[#647C47] text-white'
                      : 'border hover:bg-gray-50 disabled:opacity-50'
                  }`}
                >
                  {getStatusLabel(status)}
                </button>
              ))}
            </div>
          </div>

          {/* Convert to Itinerary — visible when accepted */}
          {quote.status === 'accepted' && (
            <div className="bg-green-50 rounded-lg border border-green-200 p-6">
              <h3 className="text-base font-semibold mb-2 text-green-900">{t('readyToConvert')}</h3>
              <p className="text-sm text-green-700 mb-4">{t('convertDescription')}</p>
              <button
                onClick={convertToItinerary}
                disabled={converting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium text-sm transition-colors disabled:opacity-50"
              >
                {converting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('converting')}</>
                ) : (
                  <><ArrowRightCircle className="w-4 h-4" />{t('convertToItinerary')}</>
                )}
              </button>
            </div>
          )}

          {/* Converted — show link to itinerary */}
          {quote.status === 'converted' && quote.converted_to_itinerary_id && (
            <div className="bg-purple-50 rounded-lg border border-purple-200 p-6">
              <h3 className="text-base font-semibold mb-2 text-purple-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />{t('quoteConverted')}
              </h3>
              <p className="text-sm text-purple-700 mb-4">{t('convertedDescription')}</p>
              <Link
                href={`/itineraries/${quote.converted_to_itinerary_id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm transition-colors"
              >
                <Eye className="w-4 h-4" />{t('viewItinerary')}
              </Link>
            </div>
          )}

          {/* Validity */}
          <div className="bg-gray-50 rounded-lg border p-4">
            <p className="text-xs text-gray-500">{t('validUntil')}</p>
            <p className="text-sm font-medium flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              {formatDate(quote.valid_until, 'long')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}