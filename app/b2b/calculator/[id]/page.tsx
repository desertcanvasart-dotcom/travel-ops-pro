'use client'

import React, { useState, useEffect, Fragment } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Calculator, Download, Users, Calendar, Globe, Loader2, FileSpreadsheet, TrendingUp, AlertCircle, UserPlus, Save, X, CheckCircle2, Building2, User, Mail, Phone, FileText, ChevronDown, ChevronUp, Pencil, Plane, Ship, MapPin, Plus, RotateCcw, Tag } from 'lucide-react'

// ============================================
// B2B TOUR PRICE CALCULATOR PAGE
// File: app/b2b/calculator/[id]/page.tsx
//
// Updated: Added +0/+1 Tour Leader toggle
// Updated: Added Single Supplement display
// Updated: Added Save Quote functionality
// Updated: Collapsible day-grouped cost breakdown
// Updated: Single supplement in rate sheet + CSV
// Updated: Dynamic pax range for rate sheet
// ============================================

interface PricingResult {
  variation_id: string
  variation_name: string
  template_name: string
  num_pax: number
  num_paying_pax?: number
  tour_leader_included?: boolean
  tour_leader_cost?: number
  travel_date: string
  season: string
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
    day_number: number | null
    pricing_note?: string
    is_optional?: boolean
  }>
  subtotal_cost: number
  total_cost: number
  margin_percent: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  single_supplement?: number
  currency: string
}

interface RateSheetRow {
  pax: number
  total_cost: number
  margin_amount: number
  selling_price: number
  price_per_person: number
  single_supplement?: number
}

interface Partner {
  id: string
  company_name: string
  partner_code: string
}

interface SavedQuote {
  id: string
  quote_number: string
}

interface TemplateItineraryDay {
  day: number
  title: string
  description: string
  meals: string[]
  city: string
  overnight_city: string | null
  is_cruise_day: boolean
  attractions: string[]
  accommodation_type: string // 'hotel' | 'cruise' | 'none'
  services: {
    airport_arrival: boolean
    airport_departure: boolean
    hotel_checkin: boolean
    hotel_checkout: boolean
    guide_required: boolean
  }
}

// Inline attraction input sub-component
function AttractionInput({ onAdd, placeholder }: { onAdd: (name: string) => void; placeholder: string }) {
  const [value, setValue] = useState('')
  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value.trim())
      setValue('')
    }
  }
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
        placeholder={placeholder}
        className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
      />
      <button
        onClick={handleAdd}
        disabled={!value.trim()}
        className="px-3 py-1.5 bg-[#b8c9a8] text-[#4a5c35] rounded-lg text-sm hover:bg-[#a0b88e] disabled:opacity-50"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function TourPriceCalculator() {
  const t = useTranslations('b2bCalculator')
  const params = useParams()
  const variationId = params?.id as string

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PricingResult | null>(null)
  const [rateSheet, setRateSheet] = useState<RateSheetRow[]>([])
  const [generatingSheet, setGeneratingSheet] = useState(false)

  // Form state
  const [numPax, setNumPax] = useState(2)
  const [travelDate, setTravelDate] = useState(new Date().toISOString().split('T')[0])
  const [isEurPassport, setIsEurPassport] = useState(true)
  const [marginPercent, setMarginPercent] = useState(25)
  const [includeOptionals, setIncludeOptionals] = useState(false)
  const [tourLeaderIncluded, setTourLeaderIncluded] = useState(false)

  // Rate sheet range
  const [paxFrom, setPaxFrom] = useState(1)
  const [paxTo, setPaxTo] = useState(10)

  // Cost breakdown day grouping
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set())
  const [allDaysExpanded, setAllDaysExpanded] = useState(true)

  // Save Quote state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedQuote, setSavedQuote] = useState<SavedQuote | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [quoteForm, setQuoteForm] = useState({
    partner_id: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_nationality: '',
    notes: ''
  })

  // Itinerary editor state
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState<string>('')
  const [editableDays, setEditableDays] = useState<TemplateItineraryDay[]>([])
  const [originalDays, setOriginalDays] = useState<TemplateItineraryDay[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [savingItinerary, setSavingItinerary] = useState(false)
  const [loadingItinerary, setLoadingItinerary] = useState(true)
  const [itineraryExpanded, setItineraryExpanded] = useState(true)
  const [expandedEditorDays, setExpandedEditorDays] = useState<Set<number>>(new Set())

  // Fetch partners and template on mount
  useEffect(() => {
    fetchPartners()
    fetchTemplateItinerary()
  }, [])

  const fetchPartners = async () => {
    try {
      const res = await fetch('/api/b2b/partners?active_only=true')
      const data = await res.json()
      if (data.success) {
        setPartners(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch partners:', err)
    }
  }

  const fetchTemplateItinerary = async () => {
    setLoadingItinerary(true)
    try {
      const res = await fetch(`/api/b2b/calculator-init?variation_id=${variationId}`)
      const data = await res.json()
      if (data.success) {
        setTemplateId(data.template_id)
        setTemplateName(data.template_name || '')
        // Ensure each day has the full enriched structure
        const days: TemplateItineraryDay[] = (data.itinerary || []).map((d: any, i: number) => ({
          day: d.day || i + 1,
          title: d.title || `Day ${i + 1}`,
          description: d.description || '',
          meals: Array.isArray(d.meals) ? d.meals : [],
          city: d.city || '',
          overnight_city: d.overnight_city || null,
          is_cruise_day: d.is_cruise_day || false,
          attractions: Array.isArray(d.attractions) ? d.attractions : [],
          accommodation_type: d.accommodation_type || 'hotel',
          services: {
            airport_arrival: d.services?.airport_arrival || false,
            airport_departure: d.services?.airport_departure || false,
            hotel_checkin: d.services?.hotel_checkin || false,
            hotel_checkout: d.services?.hotel_checkout || false,
            guide_required: d.services?.guide_required || false,
          }
        }))
        setEditableDays(days)
        setOriginalDays(JSON.parse(JSON.stringify(days)))
      }
    } catch (err) {
      console.error('Failed to fetch template itinerary:', err)
    } finally {
      setLoadingItinerary(false)
    }
  }

  // ----- Itinerary Editor Handlers -----

  const toggleEditorDay = (day: number) => {
    setExpandedEditorDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const updateDay = (dayIndex: number, field: string, value: any) => {
    setEditableDays(prev => {
      const updated = [...prev]
      updated[dayIndex] = { ...updated[dayIndex], [field]: value }
      return updated
    })
    setHasUnsavedChanges(true)
  }

  const updateDayService = (dayIndex: number, serviceField: string, value: boolean) => {
    setEditableDays(prev => {
      const updated = [...prev]
      updated[dayIndex] = {
        ...updated[dayIndex],
        services: { ...updated[dayIndex].services, [serviceField]: value }
      }
      return updated
    })
    setHasUnsavedChanges(true)
  }

  const toggleMeal = (dayIndex: number, meal: string) => {
    setEditableDays(prev => {
      const updated = [...prev]
      const meals = [...(updated[dayIndex].meals || [])]
      const idx = meals.indexOf(meal)
      if (idx >= 0) meals.splice(idx, 1)
      else meals.push(meal)
      updated[dayIndex] = { ...updated[dayIndex], meals }
      return updated
    })
    setHasUnsavedChanges(true)
  }

  const addAttraction = (dayIndex: number, attraction: string) => {
    if (!attraction.trim()) return
    setEditableDays(prev => {
      const updated = [...prev]
      const attractions = [...(updated[dayIndex].attractions || []), attraction.trim()]
      updated[dayIndex] = { ...updated[dayIndex], attractions }
      return updated
    })
    setHasUnsavedChanges(true)
  }

  const removeAttraction = (dayIndex: number, attrIndex: number) => {
    setEditableDays(prev => {
      const updated = [...prev]
      const attractions = [...(updated[dayIndex].attractions || [])]
      attractions.splice(attrIndex, 1)
      updated[dayIndex] = { ...updated[dayIndex], attractions }
      return updated
    })
    setHasUnsavedChanges(true)
  }

  const saveItineraryChanges = async () => {
    if (!templateId) return
    setSavingItinerary(true)
    try {
      const res = await fetch('/api/b2b/update-template-itinerary', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, itinerary: editableDays })
      })
      const data = await res.json()
      if (data.success) {
        setOriginalDays(JSON.parse(JSON.stringify(editableDays)))
        setHasUnsavedChanges(false)
      } else {
        setError(data.error || t('failedToSaveItinerary'))
      }
    } catch {
      setError(t('failedToSaveItinerary'))
    } finally {
      setSavingItinerary(false)
    }
  }

  const resetItineraryChanges = () => {
    setEditableDays(JSON.parse(JSON.stringify(originalDays)))
    setHasUnsavedChanges(false)
  }

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  const toggleAllDays = () => {
    if (allDaysExpanded) {
      setExpandedDays(new Set())
      setAllDaysExpanded(false)
    } else if (result) {
      const allDays = [...new Set(result.services.map(s => s.day_number ?? -1))]
      setExpandedDays(new Set(allDays))
      setAllDaysExpanded(true)
    }
  }

  const calculatePrice = async () => {
    // Auto-save itinerary changes before pricing
    if (hasUnsavedChanges && templateId) {
      await saveItineraryChanges()
    }
    setLoading(true)
    setError(null)
    setSavedQuote(null)
    try {
      const res = await fetch('/api/b2b/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variation_id: variationId,
          num_pax: numPax,
          travel_date: travelDate,
          is_eur_passport: isEurPassport,
          margin_percent: marginPercent,
          include_optionals: includeOptionals,
          tour_leader_included: tourLeaderIncluded
        })
      })
      const data = await res.json()
      if (data.success) {
        setResult(data.data)
        // Initialize all days as expanded
        const dayNumbers = [...new Set<number>((data.data.services || []).map((s: any) => s.day_number ?? -1))]
        setExpandedDays(new Set(dayNumbers))
        setAllDaysExpanded(true)
      }
      else setError(data.error || t('failedToCalculate'))
    } catch (err) {
      setError(t('failedToCalculate'))
    } finally {
      setLoading(false)
    }
  }

  const generateRateSheet = async () => {
    // Auto-save itinerary changes before generating rate sheet
    if (hasUnsavedChanges && templateId) {
      await saveItineraryChanges()
    }
    setGeneratingSheet(true)
    try {
      const res = await fetch('/api/b2b/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variation_id: variationId,
          num_pax: 2,
          travel_date: travelDate,
          is_eur_passport: isEurPassport,
          margin_percent: marginPercent,
          tour_leader_included: tourLeaderIncluded
        })
      })
      const data = await res.json()

      if (data.success && data.data.pax_pricing_table) {
        const singleSupplement = data.data.single_supplement ?? 0
        const sheet: RateSheetRow[] = data.data.pax_pricing_table
          .filter((row: any) => row.numPax >= paxFrom && row.numPax <= paxTo)
          .map((row: any) => {
            const pricing = tourLeaderIncluded ? row.withLeader : row.withoutLeader
            return {
              pax: row.numPax,
              total_cost: pricing.totalCost,
              margin_amount: pricing.marginAmount,
              selling_price: pricing.sellingPrice,
              price_per_person: pricing.pricePerPerson,
              single_supplement: singleSupplement
            }
          })
        setRateSheet(sheet)
      } else {
        setError(data.error || t('failedToGenerateSheet'))
      }
    } catch (err) {
      setError(t('failedToGenerateSheet'))
    } finally {
      setGeneratingSheet(false)
    }
  }

  const handleSaveQuote = async () => {
    if (!result) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/b2b/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variation_id: variationId,
          partner_id: quoteForm.partner_id || null,
          client_name: quoteForm.client_name || null,
          client_email: quoteForm.client_email || null,
          client_phone: quoteForm.client_phone || null,
          client_nationality: quoteForm.client_nationality || null,
          travel_date: travelDate,
          num_adults: numPax,
          num_children: 0,
          services_snapshot: result.services,
          total_cost: result.total_cost,
          margin_percent: result.margin_percent,
          margin_amount: result.margin_amount,
          selling_price: result.selling_price,
          price_per_person: result.price_per_person,
          tour_leader_included: tourLeaderIncluded,
          tour_leader_cost: result.tour_leader_cost || null,
          single_supplement: result.single_supplement || null,
          is_eur_passport: isEurPassport,
          season: result.season,
          notes: quoteForm.notes || null
        })
      })

      const data = await res.json()

      if (data.success) {
        setSavedQuote({
          id: data.data.id,
          quote_number: data.data.quote_number
        })
        setShowSaveModal(false)
        // Reset form
        setQuoteForm({
          partner_id: '',
          client_name: '',
          client_email: '',
          client_phone: '',
          client_nationality: '',
          notes: ''
        })
      } else {
        setError(data.error || t('failedToSaveQuote'))
      }
    } catch (err) {
      setError(t('failedToSaveQuote'))
    } finally {
      setSaving(false)
    }
  }

  const exportToCSV = () => {
    if (rateSheet.length === 0) return
    const tourLeaderSuffix = tourLeaderIncluded ? ' (+1 TL)' : ' (+0)'
    const headers = ['Passengers', 'Total Cost (\u20AC)', 'Margin (\u20AC)', 'Selling Price (\u20AC)', 'Per Person (\u20AC)', 'Single Supplement (\u20AC)']
    const rows = rateSheet.map(row => [
      row.pax,
      row.total_cost.toFixed(2),
      row.margin_amount.toFixed(2),
      row.selling_price.toFixed(2),
      row.price_per_person.toFixed(2),
      (row.single_supplement || 0).toFixed(2)
    ])
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rate-sheet-${result?.variation_name || 'tour'}${tourLeaderSuffix}-${travelDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getSeasonBadge = (season: string) => {
    const styles: Record<string, string> = {
      low: 'bg-green-100 text-green-700',
      high: 'bg-amber-100 text-amber-700',
      peak: 'bg-red-100 text-red-700'
    }
    return styles[season] || 'bg-gray-100 text-gray-700'
  }

  // Group services by day for cost breakdown
  const groupedServices = result ? (() => {
    const grouped: Record<number, typeof result.services> = {}
    for (const svc of result.services) {
      const key = svc.day_number ?? -1
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(svc)
    }
    return Object.entries(grouped)
      .map(([k, v]) => ({ dayNum: Number(k), services: v }))
      .sort((a, b) => {
        if (a.dayNum === -1) return 1
        if (b.dayNum === -1) return -1
        return a.dayNum - b.dayNum
      })
  })() : []

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/tours/manage" className="p-2 hover:bg-gray-200 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-[#647C47]" /> {t('title')}
            </h1>
            <p className="text-sm text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        <Link
          href="/b2b/quotes"
          className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
        >
          <FileText className="w-4 h-4" />
          {t('viewSavedQuotes')}
        </Link>
      </div>

      {/* Success Message */}
      {savedQuote && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">{t('quoteSavedSuccess')}</p>
              <p className="text-sm text-green-600">{t('reference')}: <span className="font-mono font-bold">{savedQuote.quote_number}</span></p>
            </div>
          </div>
          <Link
            href={`/b2b/quotes/${savedQuote.id}`}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            {t('viewQuote')}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calculator Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">{t('calculatePrice')}</h2>
            <div className="space-y-4">
              {/* Number of Passengers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Users className="w-4 h-4 inline mr-1" />{t('numberOfPassengers')}
                </label>
                <input
                  type="number"
                  value={numPax}
                  onChange={(e) => setNumPax(parseInt(e.target.value) || 1)}
                  min="1"
                  max="50"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none"
                />
              </div>

              {/* Tour Leader Toggle (+0/+1) */}
              <div className="bg-gray-50 rounded-lg p-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <UserPlus className="w-4 h-4 inline mr-1" />{t('tourLeader')}
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTourLeaderIncluded(false)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !tourLeaderIncluded
                        ? 'bg-[#647C47] text-white'
                        : 'bg-white border text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t('noTourLeader')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTourLeaderIncluded(true)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      tourLeaderIncluded
                        ? 'bg-[#647C47] text-white'
                        : 'bg-white border text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t('withTourLeader')}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {tourLeaderIncluded
                    ? t('tourLeaderCostDistributed')
                    : t('standardCalculation')}
                </p>
              </div>

              {/* Travel Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />{t('travelDate')}
                </label>
                <input
                  type="date"
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none"
                />
              </div>

              {/* Passport Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Globe className="w-4 h-4 inline mr-1" />{t('passportType')}
                </label>
                <select
                  value={isEurPassport ? 'eur' : 'non-eur'}
                  onChange={(e) => setIsEurPassport(e.target.value === 'eur')}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="eur">{t('europeanPassport')}</option>
                  <option value="non-eur">{t('nonEuropeanPassport')}</option>
                </select>
              </div>

              {/* Profit Margin */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <TrendingUp className="w-4 h-4 inline mr-1" />{t('profitMargin')}
                </label>
                <input
                  type="number"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(parseFloat(e.target.value) || 0)}
                  min="0"
                  max="100"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none"
                />
              </div>

              {/* Include Optionals */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOptionals}
                  onChange={(e) => setIncludeOptionals(e.target.checked)}
                  className="w-4 h-4 text-[#647C47] rounded"
                />
                <span className="text-sm">{t('includeOptionalExtras')}</span>
              </label>

              {/* Calculate Button */}
              <button
                onClick={calculatePrice}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium disabled:opacity-50"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('calculating')}</>
                ) : (
                  <><Calculator className="w-4 h-4" />{t('calculatePriceBtn')}</>
                )}
              </button>

              {/* Rate Sheet Range & Generate */}
              <div className="border-t pt-4 mt-2 space-y-3">
                <p className="text-sm font-medium text-gray-700">{t('rateSheetRange')}</p>
                <div className="flex gap-3 items-center">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">{t('paxFrom')}</label>
                    <input
                      type="number"
                      value={paxFrom}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(40, parseInt(e.target.value) || 1))
                        setPaxFrom(val)
                        if (val > paxTo) setPaxTo(val)
                      }}
                      min={1}
                      max={40}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none text-sm"
                    />
                  </div>
                  <span className="text-gray-400 pt-5">&mdash;</span>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">{t('paxTo')}</label>
                    <input
                      type="number"
                      value={paxTo}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(40, parseInt(e.target.value) || 1))
                        setPaxTo(val)
                        if (val < paxFrom) setPaxFrom(val)
                      }}
                      min={1}
                      max={40}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={generateRateSheet}
                  disabled={generatingSheet}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
                >
                  {generatingSheet ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />{t('generating')}</>
                  ) : (
                    <><FileSpreadsheet className="w-4 h-4" />{t('generateRateSheetDynamic', { from: paxFrom, to: paxTo })}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">

          {/* ============================================ */}
          {/* ITINERARY EDITOR SECTION                     */}
          {/* ============================================ */}
          <div className="bg-white rounded-lg shadow-sm border">
            {/* Collapsible header */}
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setItineraryExpanded(!itineraryExpanded)}
            >
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-[#647C47]" />
                <h2 className="text-lg font-semibold">{t('editItinerary')}</h2>
                <span className="text-sm text-gray-500">
                  ({editableDays.length} {editableDays.length === 1 ? t('dayLabel') : t('daysLabel')})
                </span>
                {hasUnsavedChanges && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                    {t('unsavedChanges')}
                  </span>
                )}
              </div>
              {itineraryExpanded
                ? <ChevronUp className="w-5 h-5 text-gray-400" />
                : <ChevronDown className="w-5 h-5 text-gray-400" />
              }
            </div>

            {itineraryExpanded && (
              <div className="px-4 pb-4 space-y-3">
                {loadingItinerary ? (
                  <div className="flex items-center justify-center py-8 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    <span className="text-sm">{t('loadingItinerary')}</span>
                  </div>
                ) : editableDays.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {t('noItineraryData')}
                  </div>
                ) : (
                  <>
                    {/* Day cards accordion */}
                    {editableDays.map((day, index) => (
                      <div key={day.day} className="border border-gray-200 rounded-lg overflow-hidden">
                        {/* Day header (collapsed) */}
                        <div
                          className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => toggleEditorDay(day.day)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center w-7 h-7 bg-[#647C47] text-white rounded-full text-sm font-bold">
                              {day.day}
                            </span>
                            <div>
                              <span className="font-medium text-gray-900">{day.title || `Day ${day.day}`}</span>
                              <span className="ml-2 text-sm text-gray-500">{day.city}</span>
                              {day.overnight_city && day.overnight_city !== day.city && (
                                <span className="ml-1 text-xs text-gray-400">→ {t('overnightIn')} {day.overnight_city}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {day.services?.airport_arrival && <span title={t('airportArrival')}><Plane className="w-3.5 h-3.5 text-blue-500" /></span>}
                            {day.services?.airport_departure && <span title={t('airportDeparture')}><Plane className="w-3.5 h-3.5 text-orange-500 rotate-45" /></span>}
                            {day.services?.guide_required && <span title={t('guideRequired')}><User className="w-3.5 h-3.5 text-green-600" /></span>}
                            {day.is_cruise_day && <span title={t('cruiseDay')}><Ship className="w-3.5 h-3.5 text-blue-600" /></span>}
                            {(day.attractions || []).length > 0 && (
                              <span className="text-xs text-gray-400 ml-1">{(day.attractions || []).length} <Tag className="w-3 h-3 inline" /></span>
                            )}
                            {expandedEditorDays.has(day.day)
                              ? <ChevronUp className="w-4 h-4 text-gray-400 ml-1" />
                              : <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
                            }
                          </div>
                        </div>

                        {/* Day body (expanded) */}
                        {expandedEditorDays.has(day.day) && (
                          <div className="p-4 space-y-4 bg-white">
                            {/* Row 1: Title (full width) */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">{t('dayTitle')}</label>
                              <input
                                type="text"
                                value={day.title}
                                onChange={(e) => updateDay(index, 'title', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none text-sm"
                              />
                            </div>

                            {/* Row 2: City + Overnight City */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  <MapPin className="w-3 h-3 inline mr-1" />{t('city')}
                                </label>
                                <input
                                  type="text"
                                  value={day.city}
                                  onChange={(e) => updateDay(index, 'city', e.target.value)}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  <MapPin className="w-3 h-3 inline mr-1" />{t('overnightCity')}
                                </label>
                                <input
                                  type="text"
                                  value={day.overnight_city || ''}
                                  onChange={(e) => updateDay(index, 'overnight_city', e.target.value || null)}
                                  placeholder={day.city}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none text-sm"
                                />
                              </div>
                            </div>

                            {/* Row 3: Accommodation Type + Cruise Day */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{t('accommodationType')}</label>
                                <select
                                  value={day.accommodation_type || 'hotel'}
                                  onChange={(e) => {
                                    updateDay(index, 'accommodation_type', e.target.value)
                                    // Couple with cruise day flag
                                    if (e.target.value === 'cruise') {
                                      updateDay(index, 'is_cruise_day', true)
                                    }
                                  }}
                                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none text-sm bg-white"
                                >
                                  <option value="hotel">{t('hotel')}</option>
                                  <option value="cruise">{t('cruise')}</option>
                                  <option value="none">{t('noAccommodation')}</option>
                                </select>
                              </div>
                              <div className="flex items-center pt-5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={day.is_cruise_day}
                                    onChange={(e) => {
                                      updateDay(index, 'is_cruise_day', e.target.checked)
                                      if (e.target.checked) {
                                        updateDay(index, 'accommodation_type', 'cruise')
                                      }
                                    }}
                                    className="w-4 h-4 text-[#647C47] rounded border-gray-300 focus:ring-[#647C47]"
                                  />
                                  <Ship className="w-4 h-4 text-blue-600" />
                                  <span className="text-sm">{t('cruiseDay')}</span>
                                </label>
                              </div>
                            </div>

                            {/* Row 4: Meals */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-2">{t('mealsLabel')}</label>
                              <div className="flex gap-4">
                                {['breakfast', 'lunch', 'dinner'].map(meal => (
                                  <label key={meal} className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={(day.meals || []).includes(meal)}
                                      onChange={() => toggleMeal(index, meal)}
                                      className="w-4 h-4 text-[#647C47] rounded border-gray-300 focus:ring-[#647C47]"
                                    />
                                    <span className="text-sm capitalize">{t(meal)}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Row 5: Services */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-2">{t('servicesLabel')}</label>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {([
                                  { key: 'airport_arrival', label: t('airportArrival'), icon: Plane },
                                  { key: 'airport_departure', label: t('airportDeparture'), icon: Plane },
                                  { key: 'hotel_checkin', label: t('hotelCheckin'), icon: Building2 },
                                  { key: 'hotel_checkout', label: t('hotelCheckout'), icon: Building2 },
                                  { key: 'guide_required', label: t('guideRequired'), icon: User },
                                ] as const).map(svc => (
                                  <label key={svc.key} className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={(day.services as any)?.[svc.key] || false}
                                      onChange={(e) => updateDayService(index, svc.key, e.target.checked)}
                                      className="w-4 h-4 text-[#647C47] rounded border-gray-300 focus:ring-[#647C47]"
                                    />
                                    <svc.icon className="w-3 h-3 text-gray-400" />
                                    <span className="text-xs">{svc.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Row 6: Attractions */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-2">
                                <Tag className="w-3 h-3 inline mr-1" />
                                {t('attractions')} ({(day.attractions || []).length})
                              </label>
                              {(day.attractions || []).length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {(day.attractions || []).map((attr, ai) => (
                                    <span key={ai} className="inline-flex items-center gap-1 px-2 py-1 bg-[#b8c9a8]/30 text-[#4a5c35] text-xs rounded-full">
                                      {attr}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); removeAttraction(index, ai) }}
                                        className="hover:text-red-600 ml-0.5"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <AttractionInput
                                onAdd={(name) => addAttraction(index, name)}
                                placeholder={t('addAttractionPlaceholder')}
                              />
                            </div>

                            {/* Row 7: Description (collapsible) */}
                            <details className="text-sm">
                              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">{t('descriptionToggle')}</summary>
                              <textarea
                                value={day.description || ''}
                                onChange={(e) => updateDay(index, 'description', e.target.value)}
                                rows={3}
                                className="w-full mt-2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#647C47] outline-none text-sm resize-none"
                                placeholder={t('descriptionPlaceholder')}
                              />
                            </details>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Action buttons */}
                    <div className="flex gap-3 pt-3 border-t">
                      <button
                        onClick={saveItineraryChanges}
                        disabled={!hasUnsavedChanges || savingItinerary}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium disabled:opacity-50 transition-colors"
                      >
                        {savingItinerary ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />{t('savingChanges')}</>
                        ) : (
                          <><Save className="w-4 h-4" />{t('saveChanges')}</>
                        )}
                      </button>
                      <button
                        onClick={resetItineraryChanges}
                        disabled={!hasUnsavedChanges}
                        className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {t('resetChanges')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Pricing Result */}
          {result && (
            <>
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{result.template_name}</h2>
                    <p className="text-sm text-gray-500">{result.variation_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.tour_leader_included && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {t('tourLeaderBadge')}
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getSeasonBadge(result.season)}`}>
                      {result.season.charAt(0).toUpperCase() + result.season.slice(1)} {t('season')}
                    </span>
                  </div>
                </div>

                {result.tour_leader_included && result.num_paying_pax && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                    <strong>{t('group')}:</strong> {t('totalPax', { total: result.num_pax, paying: result.num_paying_pax })}
                    {result.tour_leader_cost && (
                      <span className="ml-2">&bull; <strong>{t('tlCost')}:</strong> &euro;{result.tour_leader_cost.toFixed(2)}</span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('totalCost')}</p>
                    <p className="text-xl font-bold">&euro;{result.total_cost.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('margin')} ({result.margin_percent}%)</p>
                    <p className="text-xl font-bold text-green-600">&euro;{result.margin_amount.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#647C47]/10 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('sellingPrice')}</p>
                    <p className="text-xl font-bold text-[#647C47]">&euro;{result.selling_price.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#647C47]/10 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('perPerson')}</p>
                    <p className="text-xl font-bold text-[#647C47]">&euro;{result.price_per_person.toFixed(2)}</p>
                  </div>
                </div>

                {/* Single Supplement Display */}
                {result.single_supplement && result.single_supplement > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-amber-800">
                        {t('singleSupplement')}
                      </span>
                      <span className="text-lg font-bold text-amber-700">
                        &euro;{result.single_supplement.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">
                      {t('singleSupplementNote')}
                    </p>
                  </div>
                )}

                {/* Save Quote Button */}
                <div className="mt-4 pt-4 border-t">
                  <button
                    onClick={() => setShowSaveModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    <Save className="w-4 h-4" />
                    {t('saveAsQuote')}
                  </button>
                </div>
              </div>

              {/* Cost Breakdown Table - Grouped by Day */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold">{t('costBreakdown')}</h3>
                  <button
                    onClick={toggleAllDays}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    {allDaysExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {allDaysExpanded ? t('collapseAll') : t('expandAll')}
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600">{t('tableService')}</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-600">{t('tableSource')}</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-600">{t('tableMode')}</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">{t('tableQty')}</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">{t('tableUnit')}</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-600">{t('tableTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedServices.map(({ dayNum, services: daySvcs }) => {
                      const dayTotal = daySvcs.reduce((sum, s) => sum + s.line_total, 0)
                      const isExpanded = expandedDays.has(dayNum)
                      const dayLabel = dayNum === -1 ? t('generalServices') : t('dayNumber', { day: dayNum })

                      return (
                        <Fragment key={dayNum}>
                          {/* Day header row */}
                          <tr
                            className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
                            onClick={() => toggleDay(dayNum)}
                          >
                            <td colSpan={5} className="px-4 py-2 font-medium text-gray-800">
                              <div className="flex items-center gap-2">
                                {isExpanded
                                  ? <ChevronUp className="w-4 h-4 text-gray-500" />
                                  : <ChevronDown className="w-4 h-4 text-gray-500" />
                                }
                                {dayLabel}
                                <span className="text-xs text-gray-500 font-normal">
                                  ({daySvcs.length} {daySvcs.length === 1 ? t('service') : t('services')})
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-gray-700">
                              &euro;{dayTotal.toFixed(2)}
                            </td>
                          </tr>
                          {/* Individual service rows */}
                          {isExpanded && daySvcs.map((service, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 border-b border-gray-100">
                              <td className="px-4 py-2 pl-10">
                                <div>{service.service_name}</div>
                                {service.pricing_note && (
                                  <div className="text-xs text-gray-400 mt-0.5">{service.pricing_note}</div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded text-xs ${
                                  service.rate_source === 'stored'
                                    ? 'bg-gray-100'
                                    : service.rate_source === 'manual'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {service.rate_type || service.rate_source}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center text-gray-500">{service.quantity_mode}</td>
                              <td className="px-4 py-2 text-right">{service.quantity}</td>
                              <td className="px-4 py-2 text-right">&euro;{service.unit_cost.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-medium">&euro;{service.line_total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-medium">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right">{t('subtotal')}:</td>
                      <td className="px-4 py-2 text-right">&euro;{result.subtotal_cost.toFixed(2)}</td>
                    </tr>
                    {result.tour_leader_included && result.tour_leader_cost && (
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-right text-blue-600">{t('tourLeaderCost')}:</td>
                        <td className="px-4 py-2 text-right text-blue-600">&euro;{result.tour_leader_cost.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right text-green-600">{t('margin')} ({result.margin_percent}%):</td>
                      <td className="px-4 py-2 text-right text-green-600">&euro;{result.margin_amount.toFixed(2)}</td>
                    </tr>
                    <tr className="text-lg">
                      <td colSpan={5} className="px-4 py-2 text-right text-[#647C47]">{t('total')}:</td>
                      <td className="px-4 py-2 text-right text-[#647C47]">&euro;{result.selling_price.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          {/* Rate Sheet */}
          {rateSheet.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold">{t('rateSheet')}</h3>
                  {tourLeaderIncluded && (
                    <p className="text-xs text-blue-600">{t('tourLeaderIncludedNote')}</p>
                  )}
                </div>
                <button
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                >
                  <Download className="w-4 h-4" />{t('exportCsv')}
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-center font-medium text-gray-600">{t('tablePax')}</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">{t('tableCost')}</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">{t('tableMargin')}</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">{t('tableSelling')}</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">{t('tablePerPerson')}</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">{t('tableSingleSupp')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rateSheet.map((row) => (
                    <tr key={row.pax} className={`hover:bg-gray-50 ${row.pax === numPax ? 'bg-[#647C47]/5' : ''}`}>
                      <td className="px-4 py-2 text-center font-medium">
                        {row.pax}
                        {tourLeaderIncluded && <span className="text-xs text-blue-500 ml-1">(+1)</span>}
                      </td>
                      <td className="px-4 py-2 text-right">&euro;{row.total_cost.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-green-600">&euro;{row.margin_amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium">&euro;{row.selling_price.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-[#647C47]">&euro;{row.price_per_person.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-amber-600">
                        {row.single_supplement != null ? `\u20AC${row.single_supplement.toFixed(2)}` : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Save Quote Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Save className="w-5 h-5 text-[#647C47]" />
                {t('saveQuote')}
              </h2>
              <button onClick={() => setShowSaveModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Partner Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Building2 className="w-4 h-4 inline mr-1" />{t('partnerOptional')}
                </label>
                <select
                  value={quoteForm.partner_id}
                  onChange={(e) => setQuoteForm({ ...quoteForm, partner_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-2 focus:ring-[#647C47] outline-none"
                >
                  <option value="">{t('noPartnerDirect')}</option>
                  {partners.map(partner => (
                    <option key={partner.id} value={partner.id}>
                      {partner.company_name} ({partner.partner_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">{t('clientDetailsOptional')}</p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">
                      <User className="w-3 h-3 inline mr-1" />{t('clientName')}
                    </label>
                    <input
                      type="text"
                      value={quoteForm.client_name}
                      onChange={(e) => setQuoteForm({ ...quoteForm, client_name: e.target.value })}
                      placeholder={t('clientNamePlaceholder')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      <Mail className="w-3 h-3 inline mr-1" />{t('email')}
                    </label>
                    <input
                      type="email"
                      value={quoteForm.client_email}
                      onChange={(e) => setQuoteForm({ ...quoteForm, client_email: e.target.value })}
                      placeholder={t('emailPlaceholder')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">
                      <Phone className="w-3 h-3 inline mr-1" />{t('phone')}
                    </label>
                    <input
                      type="tel"
                      value={quoteForm.client_phone}
                      onChange={(e) => setQuoteForm({ ...quoteForm, client_phone: e.target.value })}
                      placeholder={t('phonePlaceholder')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs text-gray-600 mb-1">
                      <Globe className="w-3 h-3 inline mr-1" />{t('nationality')}
                    </label>
                    <input
                      type="text"
                      value={quoteForm.client_nationality}
                      onChange={(e) => setQuoteForm({ ...quoteForm, client_nationality: e.target.value })}
                      placeholder={t('nationalityPlaceholder')}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">{t('notes')}</label>
                <textarea
                  value={quoteForm.notes}
                  onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })}
                  placeholder={t('notesPlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-[#647C47] outline-none resize-none"
                />
              </div>

              {/* Quote Summary */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">{t('summaryTour')}:</span>
                  <span className="font-medium">{result?.template_name}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">{t('summaryPax')}:</span>
                  <span className="font-medium">{numPax} {tourLeaderIncluded ? '(+1 TL)' : ''}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">{t('summaryTravelDate')}:</span>
                  <span className="font-medium">{travelDate}</span>
                </div>
                <div className="flex justify-between pt-2 border-t mt-2">
                  <span className="text-gray-600">{t('summarySellingPrice')}:</span>
                  <span className="font-bold text-[#647C47]">&euro;{result?.selling_price.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-white font-medium"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSaveQuote}
                disabled={saving}
                className="flex-1 px-4 py-2 text-sm bg-[#647C47] text-white rounded-lg hover:bg-[#4a5c35] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('saving')}</>
                ) : (
                  <><Save className="w-4 h-4" />{t('saveQuote')}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
