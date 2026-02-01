'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Calculator, Download, Users, Calendar, Globe, Loader2, FileSpreadsheet, TrendingUp, AlertCircle, UserPlus, Save, X, CheckCircle2, Building2, User, Mail, Phone, FileText } from 'lucide-react'

// ============================================
// B2B TOUR PRICE CALCULATOR PAGE
// File: app/b2b/calculator/[id]/page.tsx
// 
// Updated: Added +0/+1 Tour Leader toggle
// Updated: Added Single Supplement display
// Updated: Added Save Quote functionality
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

  // Fetch partners on mount
  useEffect(() => {
    fetchPartners()
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

  const calculatePrice = async () => {
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
      if (data.success) setResult(data.data)
      else setError(data.error || t('failedToCalculate'))
    } catch (err) {
      setError(t('failedToCalculate'))
    } finally {
      setLoading(false)
    }
  }

  const generateRateSheet = async () => {
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
        const sheet: RateSheetRow[] = data.data.pax_pricing_table
          .filter((row: any) => row.numPax <= 10)
          .map((row: any) => {
            const pricing = tourLeaderIncluded ? row.withLeader : row.withoutLeader
            return {
              pax: row.numPax,
              total_cost: pricing.totalCost,
              margin_amount: pricing.marginAmount,
              selling_price: pricing.sellingPrice,
              price_per_person: pricing.pricePerPerson
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
    const headers = ['Passengers', 'Total Cost (€)', 'Margin (€)', 'Selling Price (€)', 'Per Person (€)']
    const rows = rateSheet.map(row => [
      row.pax,
      row.total_cost.toFixed(2),
      row.margin_amount.toFixed(2),
      row.selling_price.toFixed(2),
      row.price_per_person.toFixed(2)
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

              {/* Generate Rate Sheet Button */}
              <button
                onClick={generateRateSheet}
                disabled={generatingSheet}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
              >
                {generatingSheet ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{t('generating')}</>
                ) : (
                  <><FileSpreadsheet className="w-4 h-4" />{t('generateRateSheet')}</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
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
                      <span className="ml-2">• <strong>{t('tlCost')}:</strong> €{result.tour_leader_cost.toFixed(2)}</span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('totalCost')}</p>
                    <p className="text-xl font-bold">€{result.total_cost.toFixed(2)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('margin')} ({result.margin_percent}%)</p>
                    <p className="text-xl font-bold text-green-600">€{result.margin_amount.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#647C47]/10 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('sellingPrice')}</p>
                    <p className="text-xl font-bold text-[#647C47]">€{result.selling_price.toFixed(2)}</p>
                  </div>
                  <div className="bg-[#647C47]/10 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">{t('perPerson')}</p>
                    <p className="text-xl font-bold text-[#647C47]">€{result.price_per_person.toFixed(2)}</p>
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
                        €{result.single_supplement.toFixed(2)}
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

              {/* Cost Breakdown Table */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h3 className="text-base font-semibold mb-4">{t('costBreakdown')}</h3>
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
                  <tbody className="divide-y">
                    {result.services.map((service, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{service.service_name}</td>
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
                        <td className="px-4 py-2 text-right">€{service.unit_cost.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right font-medium">€{service.line_total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-medium">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right">{t('subtotal')}:</td>
                      <td className="px-4 py-2 text-right">€{result.subtotal_cost.toFixed(2)}</td>
                    </tr>
                    {result.tour_leader_included && result.tour_leader_cost && (
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-right text-blue-600">{t('tourLeaderCost')}:</td>
                        <td className="px-4 py-2 text-right text-blue-600">€{result.tour_leader_cost.toFixed(2)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right text-green-600">{t('margin')} ({result.margin_percent}%):</td>
                      <td className="px-4 py-2 text-right text-green-600">€{result.margin_amount.toFixed(2)}</td>
                    </tr>
                    <tr className="text-lg">
                      <td colSpan={5} className="px-4 py-2 text-right text-[#647C47]">{t('total')}:</td>
                      <td className="px-4 py-2 text-right text-[#647C47]">€{result.selling_price.toFixed(2)}</td>
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
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rateSheet.map((row) => (
                    <tr key={row.pax} className={`hover:bg-gray-50 ${row.pax === numPax ? 'bg-[#647C47]/5' : ''}`}>
                      <td className="px-4 py-2 text-center font-medium">
                        {row.pax}
                        {tourLeaderIncluded && <span className="text-xs text-blue-500 ml-1">(+1)</span>}
                      </td>
                      <td className="px-4 py-2 text-right">€{row.total_cost.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right text-green-600">€{row.margin_amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-medium">€{row.selling_price.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-bold text-[#647C47]">€{row.price_per_person.toFixed(2)}</td>
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
                  <span className="font-bold text-[#647C47]">€{result?.selling_price.toFixed(2)}</span>
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