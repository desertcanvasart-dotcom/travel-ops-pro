'use client'

// ============================================
// TOUR DETAIL PAGE WITH DYNAMIC PRICING & MULTILINGUAL
// File: app/tours/[code]/page.tsx
// ============================================

import { todayLocal } from '@/lib/today'
import { useCompanyInfo } from '@/lib/use-company-info'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCurrency } from '@/app/contexts/PreferencesContext'
import { LanguageTabs, CreateVersionPrompt } from '@/components/multilingual'
import type { Language } from '@/types/multilingual'
import {
  ArrowLeft,
  Calendar,
  Users,
  Tag,
  Check,
  X,
  Plus,
  Star,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  ExternalLink,
  Calculator,
  TrendingUp,
  AlertCircle
} from 'lucide-react'

interface TourDetail {
  // null for programmes without variations (imported catalogue) — those price
  // template-direct instead.
  variation_id: string | null
  template_id: string
  template_name: string
  template_code: string
  category_name: string
  destination_name: string
  duration_days: number
  duration_nights: number
  short_description: string
  long_description: string
  highlights: string[]
  variation_name: string | null
  variation_code: string | null
  tier: string
  group_type: string
  min_pax: number
  max_pax: number
  inclusions: string[]
  exclusions: string[]
  optional_extras: string[]
  guide_type: string
  guide_languages: string[]
  vehicle_type: string
  daily_itinerary: Array<{
    day_number: number
    day_title: string
    day_description: string
    city: string
    overnight_city: string
    breakfast_included: boolean
    lunch_included: boolean
    dinner_included: boolean
    is_cruise_day?: boolean
  }>
}

interface PricingResult {
  variation_id: string
  variation_name: string
  template_name: string
  num_pax: number
  travel_date: string
  season_uplift?: {
    season_name: string
    percent: number
    amount: number
    base: number
  } | null
  is_eur_passport: boolean
  services: Array<{
    service_id: string
    service_name: string
    service_category: string
    rate_type: string | null
    rate_source: string
    quantity_mode: string
    quantity: number
    unit_cost: number
    line_total: number
  }>
  optional_services: Array<{
    service_id: string
    service_name: string
    service_category: string
    line_total: number
  }>
  subtotal_cost: number
  optional_total: number
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  currency: string
}

interface VersionData {
  variation_id: string
  template_id: string
  variation_versions: Array<{
    id: string
    language: Language
    variation_name: string
    inclusions: string[]
    exclusions: string[]
    optional_extras: string[]
  }>
  template_versions: Array<{
    id: string
    language: Language
    template_name: string
    short_description: string
    long_description: string
    highlights: string[]
    main_attractions: string[]
    best_for: string[]
    inclusions: string[]
    exclusions: string[]
  }>
  available_languages: Language[]
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', EGP: 'E£', JPY: '¥' }

/** Today on the operator's own calendar, as the value a date input wants.
 *  Built from local parts, not toISOString() — that returns UTC, which in
 *  Cairo or Tokyo names yesterday for part of every evening. */
function todayLocalISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function TourDetailPage() {
  // Whoever runs this install — not whoever wrote it.
  const company = useCompanyInfo()
  const params = useParams()
  const t = useTranslations('tours')
  // Engine prices are EUR; render them in the preferred currency.
  const { formatWithConversion, currency, rateCurrency } = useCurrency()
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency
  const [tour, setTour] = useState<TourDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDays, setExpandedDays] = useState<number[]>([1])

  // Multilingual state
  const [activeLanguage, setActiveLanguage] = useState<Language>('en')
  const [versions, setVersions] = useState<VersionData | null>(null)
  const [translating, setTranslating] = useState(false)

  // Pricing state
  const [selectedPax, setSelectedPax] = useState(2)
  const [travelDate, setTravelDate] = useState(() => {
    const date = new Date()
    date.setDate(date.getDate() + 14)
    return date.toISOString().split('T')[0]
  })
  const [isEurPassport, setIsEurPassport] = useState(true)
  const [pricing, setPricing] = useState<PricingResult | null>(null)
  // 日程表 generation dialog — departure-specific facts, all optional
  const [showNitteiDialog, setShowNitteiDialog] = useState(false)
  // 作成日 starts at today — the common case — but stays editable so a
  // departure's paperwork can be re-issued carrying its original date.
  const [nittei, setNittei] = useState({
    departure_date: '',
    created_date: todayLocalISO(),
    cairo_guide: '',
    south_guide: '',
    author: '',
  })
  const [pricingLoading, setPricingLoading] = useState(false)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  // Fetch tour and versions on load
  useEffect(() => {
    if (params.code) {
      fetchTourDetail(params.code as string)
      fetchVersions(params.code as string)
    }
  }, [params.code])

  // Calculate price when tour loads or params change. Programmes without
  // variations (imported catalogue) price template-direct at the default tier.
  useEffect(() => {
    if (tour?.variation_id || tour?.template_id) {
      calculatePrice()
    }
  }, [tour?.variation_id, tour?.template_id, selectedPax, travelDate, isEurPassport])

  const fetchTourDetail = async (code: string) => {
    try {
      const response = await fetch(`/api/tours/${code}`)
      const data = await response.json()

      if (data.success) {
        setTour(data.data)
      } else {
        setError('Tour not found')
      }
    } catch (err) {
      setError('Error loading tour details')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchVersions = async (code: string) => {
    try {
      const response = await fetch(`/api/tours/${code}/versions`)
      const data = await response.json()
      if (data.success) {
        setVersions(data.data)
      }
    } catch (err) {
      console.error('Error fetching versions:', err)
    }
  }

  const calculatePrice = async () => {
    if (!tour?.variation_id && !tour?.template_id) return

    setPricingLoading(true)
    setPricingError(null)

    try {
      const response = await fetch('/api/b2b/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(tour.variation_id
            ? { variation_id: tour.variation_id }
            : { template_id: tour.template_id, tier: tour.tier || 'standard' }),
          num_pax: selectedPax,
          travel_date: travelDate,
          is_eur_passport: isEurPassport,
          margin_percent: 0,
          include_optionals: false
        })
      })

      const data = await response.json()

      if (data.success) {
        setPricing(data.data)
      } else {
        setPricingError(data.error || 'Failed to calculate price')
      }
    } catch (err) {
      setPricingError('Error calculating price')
      console.error(err)
    } finally {
      setPricingLoading(false)
    }
  }

  // Handle copy & translate
  const handleCopyTranslate = useCallback(async () => {
    if (!params.code) {
      console.error('No tour code available')
      return
    }

    console.log('Starting copy-translate for language:', activeLanguage)
    setTranslating(true)
    try {
      const response = await fetch(`/api/tours/${params.code}/versions/copy-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLanguage: activeLanguage })
      })

      const data = await response.json()
      console.log('Copy-translate response:', data)

      if (data.success) {
        // Refresh versions
        await fetchVersions(params.code as string)
        // Show success message
        alert(activeLanguage === 'ja' ? '翻訳が完了しました' : 'Translation completed successfully')
      } else {
        console.error('Translation failed:', data.error)
        alert(data.error || (activeLanguage === 'ja' ? '翻訳に失敗しました' : 'Failed to translate'))
      }
    } catch (err) {
      console.error('Error in copy-translate:', err)
      alert(activeLanguage === 'ja' ? '翻訳中にエラーが発生しました' : 'Error during translation')
    } finally {
      setTranslating(false)
    }
  }, [params.code, activeLanguage])

  const toggleDay = (dayNumber: number) => {
    setExpandedDays(prev =>
      prev.includes(dayNumber)
        ? prev.filter(d => d !== dayNumber)
        : [...prev, dayNumber]
    )
  }

  // Get versioned content based on active language
  const getVersionedContent = useCallback(() => {
    if (!tour || !versions) return tour

    // Find variation version for active language
    const varVersion = versions.variation_versions?.find(v => v.language === activeLanguage)
    // Find template version for active language
    const tmpVersion = versions.template_versions?.find(v => v.language === activeLanguage)

    return {
      ...tour,
      // Template content (from version if available)
      template_name: tmpVersion?.template_name || tour.template_name,
      short_description: tmpVersion?.short_description || tour.short_description,
      long_description: tmpVersion?.long_description || tour.long_description,
      highlights: tmpVersion?.highlights || tour.highlights,
      // Variation content (from version if available, with fallback to template version)
      variation_name: varVersion?.variation_name || tour.variation_name,
      inclusions: varVersion?.inclusions?.length ? varVersion.inclusions : (tmpVersion?.inclusions?.length ? tmpVersion.inclusions : tour.inclusions),
      exclusions: varVersion?.exclusions?.length ? varVersion.exclusions : (tmpVersion?.exclusions?.length ? tmpVersion.exclusions : tour.exclusions),
      optional_extras: varVersion?.optional_extras || tour.optional_extras
    }
  }, [tour, versions, activeLanguage])

  // Check if current language has a version
  const hasVersionForLanguage = useCallback((lang: Language) => {
    if (!versions) return false
    const hasVarVersion = versions.variation_versions?.some(v => v.language === lang)
    const hasTmpVersion = versions.template_versions?.some(v => v.language === lang)
    return hasVarVersion || hasTmpVersion
  }, [versions])

  const getTierStyle = (tier: string) => {
    const styles: Record<string, { bg: string; text: string; icon: string }> = {
      budget: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: '💰' },
      standard: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: '💎' },
      luxury: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: '👑' }
    }
    return styles[tier] || styles.standard
  }

  const getGroupTypeStyle = (type: string) => {
    return type === 'private'
      ? { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700', icon: '🔒', label: 'Private' }
      : { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-700', icon: '👥', label: 'Shared' }
  }

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      transportation: '🚗',
      guide: '👨‍🏫',
      activity: '🎫',
      meal: '🍽️',
      accommodation: '🏨',
      cruise: '🚢',
      entrance: '🎟️',
      transfer: '✈️'
    }
    return icons[category] || '📋'
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#647C47] animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">{t('detail.loading')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !tour) {
    return (
      <div className="p-6">
        <Link
          href="/tours"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{t('detail.backToTours')}</span>
        </Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <p className="text-sm font-medium text-red-800 mb-1">{t('detail.tourNotFound')}</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  const versionedTour = getVersionedContent() || tour
  const tierStyle = getTierStyle(tour.tier)
  const groupStyle = getGroupTypeStyle(tour.group_type)
  const showCreatePrompt = !hasVersionForLanguage(activeLanguage)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link
            href="/tours"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{versionedTour.template_name}</h1>
            <p className="text-sm text-gray-500">{tour.destination_name} • {tour.duration_days} {tour.duration_days === 1 ? 'day' : 'days'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* The office's own 日程表 document — blank template or a filled
              departure, chosen in a small dialog. */}
          <button
            onClick={() => setShowNitteiDialog(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#647C47] text-white hover:bg-[#4a5c35] transition-colors"
          >
            {t('detail.itineraryDoc')}
          </button>
          <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tierStyle.bg} ${tierStyle.text}`}>
            {tierStyle.icon} {tour.tier.charAt(0).toUpperCase() + tour.tier.slice(1)}
          </span>
          <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${groupStyle.bg} ${groupStyle.text}`}>
            {groupStyle.icon} {groupStyle.label}
          </span>
        </div>
      </div>

      {/* Language Tabs */}
      <div className="mb-6">
        <LanguageTabs
          activeLanguage={activeLanguage}
          onLanguageChange={setActiveLanguage}
          availableLanguages={versions?.available_languages || ['en']}
          onCreateVersion={(lang) => setActiveLanguage(lang)}
        />

        {/* Create Version Prompt */}
        {showCreatePrompt && (
          <div className="mt-4">
            <CreateVersionPrompt
              entityType="tour"
              language={activeLanguage}
              onCreateFromScratch={handleCopyTranslate}
              onCopyAndTranslate={handleCopyTranslate}
              isLoading={translating}
            />
          </div>
        )}
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-[#647C47]" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('detail.duration')}</p>
          <p className="text-lg font-semibold text-gray-900">
            {tour.duration_days}D{tour.duration_nights > 0 && `/${tour.duration_nights}N`}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-[#647C47]" />
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('detail.groupSize')}</p>
          <p className="text-lg font-semibold text-gray-900">{tour.min_pax}-{tour.max_pax} {t('detail.pax')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-4 w-4 text-[#647C47]" />
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('detail.category')}</p>
          <p className="text-lg font-semibold text-gray-900 truncate">{tour.category_name || t('detail.uncategorized')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-[#647C47]" />
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('detail.languages')}</p>
          <p className="text-lg font-semibold text-gray-900 truncate">
            {tour.guide_languages?.length > 0 ? tour.guide_languages.join(', ') : 'English'}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[#647C47]">{currencySymbol}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('detail.from')}</p>
          <p className="text-lg font-semibold text-[#647C47]">
            {pricingLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : pricing ? (
              formatWithConversion(pricing.price_per_person, rateCurrency)
            ) : (
              'N/A'
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('detail.aboutThisTour')}</h2>
            <p className="text-gray-600 text-sm leading-relaxed">
              {versionedTour.long_description || versionedTour.short_description}
            </p>

            {versionedTour.highlights && versionedTour.highlights.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  {t('detail.highlights')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {versionedTour.highlights.map((highlight, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-[#647C47] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-600">{highlight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Daily Itinerary */}
          {tour.daily_itinerary && tour.daily_itinerary.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-[#647C47]" />
                {t('detail.dailyItinerary')}
              </h2>
              <div className="space-y-3">
                {tour.daily_itinerary.map((day) => (
                  <div
                    key={day.day_number}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleDay(day.day_number)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
                          <span className="text-sm font-bold text-[#647C47]">{day.day_number}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-gray-900">{day.day_title}</p>
                          <p className="text-xs text-gray-500">{day.city}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
                          {day.is_cruise_day && (
                            <span title="Cruise transport package day">🚢</span>
                          )}
                          {day.breakfast_included && <span>🍳</span>}
                          {day.lunch_included && <span>🍽️</span>}
                          {day.dinner_included && <span>🌙</span>}
                        </div>
                        {expandedDays.includes(day.day_number) ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </button>
                    {expandedDays.includes(day.day_number) && (
                      <div className="px-4 pb-4 pt-0">
                        <div className="pl-13 ml-[52px] border-l-2 border-[#647C47]/20 pl-4">
                          <p className="text-sm text-gray-600">{day.day_description}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
                            {day.breakfast_included && (
                              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded">🍳 {t('detail.breakfast')}</span>
                            )}
                            {day.lunch_included && (
                              <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded">🍽️ {t('detail.lunch')}</span>
                            )}
                            {day.dinner_included && (
                              <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded">🌙 {t('detail.dinner')}</span>
                            )}
                            {day.overnight_city && (
                              <span className="px-2 py-1 bg-slate-50 text-slate-700 rounded">🏨 {day.overnight_city}</span>
                            )}
                            {day.is_cruise_day && (
                              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">🚢 Cruise Transport Package</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inclusions & Exclusions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {versionedTour.inclusions && versionedTour.inclusions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  {t('detail.whatsIncluded')}
                </h3>
                <ul className="space-y-2">
                  {versionedTour.inclusions.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {versionedTour.exclusions && versionedTour.exclusions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                    <X className="h-3.5 w-3.5 text-red-600" />
                  </div>
                  {t('detail.notIncluded')}
                </h3>
                <ul className="space-y-2">
                  {versionedTour.exclusions.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                      <X className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Optional Extras */}
          {versionedTour.optional_extras && versionedTour.optional_extras.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-[#647C47]/10 rounded-full flex items-center justify-center">
                  <Plus className="h-3.5 w-3.5 text-[#647C47]" />
                </div>
                {t('detail.optionalExtras')}
              </h3>
              <ul className="space-y-2">
                {versionedTour.optional_extras.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                    <Plus className="h-4 w-4 text-[#647C47] mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar - Dynamic Pricing Calculator */}
        <div className="space-y-6 sticky top-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-[#647C47]" />
              {t('detail.calculateYourPrice')}
            </h3>

            {/* Number of Travelers */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('detail.numberOfTravelers')}
              </label>
              <select
                value={selectedPax}
                onChange={(e) => setSelectedPax(Number(e.target.value))}
                title={t('detail.numberOfTravelers')}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white"
              >
                {Array.from({ length: tour.max_pax }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? t('detail.person') : t('detail.people')}
                  </option>
                ))}
              </select>
            </div>

            {/* Travel Date */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('detail.travelDate')}
              </label>
              <input
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                min={todayLocal()}
                title={t('detail.travelDate')}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none"
              />
            </div>

            {/* Passport Type */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('detail.passportType')}
              </label>
              <select
                value={isEurPassport ? 'eur' : 'non-eur'}
                onChange={(e) => setIsEurPassport(e.target.value === 'eur')}
                title={t('detail.passportType')}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#647C47] focus:border-[#647C47] outline-none bg-white"
              >
                <option value="eur">{t('detail.europeanPassport')}</option>
                <option value="non-eur">{t('detail.nonEuropeanPassport')}</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">{t('detail.affectsEntranceFees')}</p>
            </div>

            {/* Pricing Result */}
            {pricingLoading ? (
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-4 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[#647C47] mr-2" />
                <span className="text-sm text-gray-600">{t('detail.calculating')}</span>
              </div>
            ) : pricingError ? (
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-4">
                <div className="flex items-center gap-2 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {pricingError}
                </div>
              </div>
            ) : pricing ? (
              <>
                <div className="bg-[#647C47]/5 border border-[#647C47]/20 p-4 rounded-lg mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-500">{t('detail.pricePerPerson')}</p>
                    {pricing.season_uplift && pricing.season_uplift.percent > 0 && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#647C47]/15 text-[#4a5c35]">
                        {t('detail.seasonBadge', {
                          season: pricing.season_uplift.season_name,
                          percent: pricing.season_uplift.percent,
                        })}
                      </span>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-[#647C47]">
                    {formatWithConversion(pricing.price_per_person, rateCurrency)}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#647C47]/20">
                    <span className="text-sm text-gray-600">{t('detail.totalFor')} {selectedPax} {selectedPax === 1 ? t('detail.person') : t('detail.people')}</span>
                    <span className="text-lg font-semibold text-gray-900">{formatWithConversion(pricing.selling_price, rateCurrency)}</span>
                  </div>
                </div>

                {/* Toggle Breakdown */}
                <button
                  type="button"
                  onClick={() => setShowBreakdown(!showBreakdown)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg mb-4"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    {t('detail.viewPriceBreakdown')}
                  </span>
                  {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {/* Price Breakdown */}
                {showBreakdown && pricing.services.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                    <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">{t('detail.servicesIncluded')}</h4>
                    <div className="space-y-2">
                      {pricing.services.map((service, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-gray-600">
                            <span>{getCategoryIcon(service.service_category)}</span>
                            <span className="truncate max-w-[180px]">{service.service_name}</span>
                          </span>
                          <span className="text-gray-900 font-medium">{formatWithConversion(service.line_total, rateCurrency)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-sm font-medium">
                      <span className="text-gray-700">{t('detail.subtotal')}</span>
                      <span className="text-gray-900">{formatWithConversion(pricing.subtotal_cost, rateCurrency)}</span>
                    </div>
                  </div>
                )}

                {/* Optional Services */}
                {showBreakdown && pricing.optional_services && pricing.optional_services.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <h4 className="text-xs font-semibold text-amber-700 mb-3 uppercase tracking-wide">{t('detail.availableAddOns')}</h4>
                    <div className="space-y-2">
                      {pricing.optional_services.map((service, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-amber-800">{service.service_name}</span>
                          <span className="text-amber-900 font-medium">+{formatWithConversion(service.line_total, rateCurrency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-lg mb-4 text-center">
                <p className="text-sm text-gray-500">{t('detail.selectOptionsToCalculate')}</p>
              </div>
            )}

            <button type="button" className="w-full bg-[#647C47] text-white py-3 rounded-lg hover:bg-[#4a5c35] transition-colors font-medium text-sm">
              {t('detail.requestThisTour')}
            </button>

            <p className="text-xs text-gray-400 text-center mt-3">
              {t('detail.pricesCalculatedDynamically')}
            </p>
          </div>

          {/* Tour Info */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('detail.tourInformation')}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{t('detail.code')}</span>
                <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{tour.variation_code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('detail.category')}</span>
                <span className="text-gray-900">{tour.category_name || t('detail.uncategorized')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('detail.duration')}</span>
                <span className="text-gray-900">
                  {tour.duration_days} {t('detail.days')}
                  {tour.duration_nights > 0 && ` / ${tour.duration_nights} N`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('detail.type')}</span>
                <span className="text-gray-900">
                  {tour.group_type === 'private' ? `🔒 ${t('detail.private')}` : `👥 ${t('detail.shared')}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('detail.guide')}</span>
                <span className="text-gray-900 capitalize">{tour.guide_type?.replace('_', ' ') || 'Specialist'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">{t('detail.languages')}</span>
                <span className="text-gray-900">{tour.guide_languages?.join(', ') || 'English'}</span>
              </div>
            </div>
          </div>

          {/* Contact Card */}
          <div className="bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('detail.needHelp')}</h3>
            <p className="text-xs text-gray-500 mb-4">
              {t('detail.contactUsForCustom')}
            </p>
            <div className="space-y-2 text-sm">
              {company?.email && (
                <a href={`mailto:${company.email}`} className="flex items-center gap-2 text-gray-600 hover:text-[#647C47]">
                  <Mail className="h-4 w-4" />
                  {company.email}
                </a>
              )}
              {company?.phone && (
                <a href={`tel:${company.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-gray-600 hover:text-[#647C47]">
                  <Phone className="h-4 w-4" />
                  {company.phone}
                </a>
              )}
              {company?.website && (
                <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-gray-600 hover:text-[#647C47]">
                  <ExternalLink className="h-4 w-4" />
                  {company.website}
                </a>
              )}
              </div>
          </div>
        </div>
      </div>

      {showNitteiDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowNitteiDialog(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">{t('detail.nitteiTitle')}</h3>
              <p className="text-xs text-gray-500 mt-1">{t('detail.nitteiHint')}</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('detail.departureDate')}</label>
                <input type="date" value={nittei.departure_date}
                  onChange={e => setNittei(prev => ({ ...prev, departure_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('detail.cairoGuide')}</label>
                  <input value={nittei.cairo_guide}
                    onChange={e => setNittei(prev => ({ ...prev, cairo_guide: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('detail.southGuide')}</label>
                  <input value={nittei.south_guide}
                    onChange={e => setNittei(prev => ({ ...prev, south_guide: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              {/* 作成者 and 作成日 sit side by side on the document, so they do
                  here too. The date defaults to today and is only changed when
                  re-issuing older paperwork. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('detail.docAuthor')}</label>
                  <input value={nittei.author}
                    onChange={e => setNittei(prev => ({ ...prev, author: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('detail.docCreated')}</label>
                  <input type="date" value={nittei.created_date}
                    onChange={e => setNittei(prev => ({ ...prev, created_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-200">
              {(() => {
                const qs = new URLSearchParams({ template_id: tour.template_id })
                if (nittei.departure_date) qs.set('departure_date', nittei.departure_date)
                if (nittei.created_date) qs.set('created_date', nittei.created_date)
                if (nittei.cairo_guide) qs.set('cairo_guide', nittei.cairo_guide)
                if (nittei.south_guide) qs.set('south_guide', nittei.south_guide)
                if (nittei.author) qs.set('author', nittei.author)
                const base = `/api/documents/program-itinerary?${qs.toString()}`
                return (
                  <>
                    <a href={`${base}&format=pdf`} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-center px-4 py-2 bg-[#647C47] text-white rounded-lg text-sm font-medium hover:bg-[#4a5c35]">
                      {t('detail.itineraryPdf')}
                    </a>
                    <a href={`${base}&format=html&print=1`} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-center px-4 py-2 border border-[#647C47] text-[#647C47] rounded-lg text-sm font-medium hover:bg-[#647C47]/10">
                      {t('detail.printItinerary')}
                    </a>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
